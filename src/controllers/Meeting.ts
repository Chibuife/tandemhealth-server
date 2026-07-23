import type { Response } from "express";
import { MeetingRepository } from "../repositories/MeetingRepository.js";
import { createLiveKitToken } from "../config/livekit.js";
import { getSocketServer } from "../sockets/index.js";
import { logger } from "../utils/logger.js";
import type { AuthenticatedRequest } from "../middleware/authmiddleware.js";

// How early a participant is allowed to join before the scheduled start,
// same idea as Google Meet letting you in a few minutes early.
const JOIN_WINDOW_MINUTES_BEFORE = 10;

const isParticipant = (meeting: { hostId: string; participantId: string | null }, userId: string) =>
  meeting.hostId === userId || meeting.participantId === userId;

// req.params values can be typed as `string | string[]` (Express 5 allows
// repeated route params). Our routes only ever produce a single string, so
// normalize it once here rather than repeating the check everywhere.
const getSlugParam = (slug: string | string[]): string =>
  Array.isArray(slug) ? slug[0] : slug;

export const scheduleMeeting = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const {
      title,
      participantId,
      scheduledStart,
      scheduledEnd,
      reasonForVisit,
      priority,
      consultationType,
    } = req.body ?? {};

    if (!title || !scheduledStart || !scheduledEnd) {
      return res.status(400).json({
        message: "title, scheduledStart, and scheduledEnd are required",
      });
    }

    const start = new Date(scheduledStart);
    const end = new Date(scheduledEnd);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({
        message: "scheduledStart/scheduledEnd must be valid dates with end after start",
      });
    }

    if (priority && !["low", "medium", "high"].includes(priority)) {
      return res.status(400).json({ message: "priority must be low, medium, or high" });
    }

    const meeting = await MeetingRepository.create({
      title,
      hostId: req.user!.id,
      participantId,
      scheduledStart: start,
      scheduledEnd: end,
      reasonForVisit,
      priority,
      consultationType,
    });

    logger.info(`Consultation requested: ${meeting.slug} by ${req.user!.email}`);

    return res.status(201).json({
      meeting,
      joinLink: `${process.env.CLIENT_ORIGIN}/meet/${meeting.slug}`,
    });
  } catch (error) {
    logger.error("Failed to schedule meeting", error);
    return res.status(500).json({ message: "Failed to schedule meeting" });
  }
};

export const listConsultations = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const statusParam = req.query.status;
    const status = Array.isArray(statusParam) ? statusParam[0] : statusParam;

    const consultations = await MeetingRepository.listForDoctor(
      req.user!.id,
      status as any
    );

    return res.status(200).json({ consultations });
  } catch (error) {
    logger.error("Failed to list consultations", error);
    return res.status(500).json({ message: "Failed to list consultations" });
  }
};

export const acceptConsultation = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const id = getSlugParam(req.params.id);
    const meeting = await MeetingRepository.findById(id);

    if (!meeting) {
      return res.status(404).json({ message: "Consultation not found" });
    }

    if (meeting.participantId !== req.user!.id) {
      return res.status(403).json({ message: "Only the assigned doctor can respond to this request" });
    }

    if (meeting.status !== "pending") {
      return res.status(409).json({ message: `Consultation is already ${meeting.status}` });
    }

    const updated = await MeetingRepository.setStatusById(id, "accepted");

    try {
      if (meeting.participantId) {
        getSocketServer()
          .to(`user:${meeting.participantId}`)
          .emit("consultation:accepted", { id: meeting.id, slug: meeting.slug });
      }
    } catch (error) {
      logger.warn("Could not emit consultation:accepted", error);
    }

    return res.status(200).json({ meeting: updated });
  } catch (error) {
    logger.error("Failed to accept consultation", error);
    return res.status(500).json({ message: "Failed to accept consultation" });
  }
};

export const declineConsultation = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const id = getSlugParam(req.params.id);
    const meeting = await MeetingRepository.findById(id);

    if (!meeting) {
      return res.status(404).json({ message: "Consultation not found" });
    }

    if (meeting.hostId !== req.user!.id) {
      return res.status(403).json({ message: "Only the assigned doctor can respond to this request" });
    }

    if (meeting.status !== "pending") {
      return res.status(409).json({ message: `Consultation is already ${meeting.status}` });
    }

    const updated = await MeetingRepository.setStatusById(id, "declined");

    try {
      if (meeting.participantId) {
        getSocketServer()
          .to(`user:${meeting.participantId}`)
          .emit("consultation:declined", { id: meeting.id, slug: meeting.slug });
      }
    } catch (error) {
      logger.warn("Could not emit consultation:declined", error);
    }

    return res.status(200).json({ meeting: updated });
  } catch (error) {
    logger.error("Failed to decline consultation", error);
    return res.status(500).json({ message: "Failed to decline consultation" });
  }
};

export const listMyMeetings = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const meetings = await MeetingRepository.findUpcomingForUser(
      req.user!.id
    );

    return res.status(200).json({ meetings });
  } catch (error) {
    logger.error("Failed to list meetings", error);
    return res.status(500).json({ message: "Failed to list meetings" });
  }
};



export const getConsultationById = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const id = getSlugParam(req.params.id);
    const meeting = await MeetingRepository.findByIdWithParticipants(id);

    if (!meeting) {
      return res.status(404).json({ message: "Consultation not found" });
    }

    if (!isParticipant(meeting, req.user!.id)) {
      return res.status(403).json({ message: "You are not part of this consultation" });
    }

    return res.status(200).json({ consultation: meeting });
  } catch (error) {
    logger.error("Failed to fetch consultation", error);
    return res.status(500).json({ message: "Failed to fetch consultation" });
  }
};

export const getMeetingBySlug = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const meeting = await MeetingRepository.findBySlug(getSlugParam(req.params.slug));

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    if (!isParticipant(meeting, req.user!.id)) {
      return res.status(403).json({ message: "You are not part of this meeting" });
    }

    return res.status(200).json({ meeting });
  } catch (error) {
    logger.error("Failed to fetch meeting", error);
    return res.status(500).json({ message: "Failed to fetch meeting" });
  }
};

export const getMeetingToken = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const meeting = await MeetingRepository.findBySlug(getSlugParam(req.params.slug));

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }
    const role =
      req.body.role
    if (!isParticipant(meeting, req.user!.id)) {
      return res.status(403).json({ message: "You are not part of this meeting" });
    }

    if (meeting.status === "ended" || meeting.status === "cancelled") {
      return res.status(410).json({ message: `Meeting has been ${meeting.status}` });
    }

    const now = new Date();
    const earliestJoin = new Date(
      meeting.scheduledStart.getTime() - JOIN_WINDOW_MINUTES_BEFORE * 60_000
    );

    if (now < earliestJoin) {
      return res.status(403).json({
        message: `This meeting isn't open yet. You can join starting ${earliestJoin.toISOString()}`,
      });
    }

    if (now > meeting.scheduledEnd) {
      return res.status(403).json({ message: "This meeting's scheduled window has passed" });
    }

    if (meeting.status === "pending") {
      return res.status(403).json({ message: "This consultation hasn't been accepted yet" });
    }

    // if (meeting.status === "accepted") {
    //   await MeetingRepository.setStatus(meeting.slug, "live");
    // }

    // const token = await createLiveKitToken(
    //   meeting.slug,
    //   req.user!.id,
    //   req.user!.email
    // );
    console.log(req.body.role);
    const identity = `${req.user!.id}-${role}`;

    const token = await createLiveKitToken(
      meeting.slug,
      identity,
      req.user!.email
    );

    // Let the other participant's client know someone joined (e.g. to
    // show a "doctor has joined" toast in the waiting room). This is a
    // best-effort notification - if Socket.IO isn't ready or the emit
    // fails, the join itself should still succeed.
    try {
      getSocketServer()
        .to(`user:${req.user!.id === meeting.hostId ? meeting.participantId : meeting.hostId}`)
        .emit("meeting:participant-joined", { slug: meeting.slug, userId: req.user!.id });
    } catch (error) {
      logger.warn("Could not emit meeting:participant-joined", error);
    }

    return res.status(200).json({
      token,
      roomName: meeting.slug,
      livekitUrl: process.env.LIVEKIT_URL,
    });
  } catch (error) {
    logger.error("Failed to issue meeting token", error);
    return res.status(500).json({ message: "Failed to join meeting" });
  }
};

export const endMeeting = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const meeting = await MeetingRepository.findBySlug(getSlugParam(req.params.slug));

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    if (meeting.hostId !== req.user!.id) {
      return res.status(403).json({ message: "Only the host can end the meeting" });
    }

    const updated = await MeetingRepository.setStatus(meeting.slug, "ended");

    try {
      getSocketServer()
        .to(`user:${meeting.participantId}`)
        .emit("meeting:ended", { slug: meeting.slug });
    } catch (error) {
      logger.warn("Could not emit meeting:ended", error);
    }

    return res.status(200).json({ meeting: updated });
  } catch (error) {
    logger.error("Failed to end meeting", error);
    return res.status(500).json({ message: "Failed to end meeting" });
  }
};