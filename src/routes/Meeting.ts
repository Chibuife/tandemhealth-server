import Router from "express";
import {
    scheduleMeeting,
    listMyMeetings,
    listConsultations,
    acceptConsultation,
    declineConsultation,
    getConsultationById,
    getMeetingBySlug,
    getMeetingToken,
    // sendMeetingMessage,
    endMeeting,
} from "../controllers/Meeting.js";
import { authenticateToken } from "../middleware/authmiddleware.js";
import {
    scheduleMeetingLimiter,
    listMeetingsLimiter,
    getMeetingLimiter,
    getMeetingTokenLimiter,
    endMeetingLimiter,
} from "../middleware/rateLimiter.js";

const router = Router();

router.post("/", authenticateToken, scheduleMeetingLimiter, scheduleMeeting);

router.get("/", authenticateToken, listMeetingsLimiter, listMyMeetings);

// Doctor-facing consultation request list, e.g. GET /meetings/requests?status=pending
router.get("/requests", authenticateToken, listMeetingsLimiter, listConsultations);

// Id-based fetch for the consultation detail page (must come before /:slug)
router.get("/id/:id", authenticateToken, getMeetingLimiter, getConsultationById);

router.post("/:id/accept", authenticateToken, endMeetingLimiter, acceptConsultation);
router.post("/:id/decline", authenticateToken, endMeetingLimiter, declineConsultation);

router.get("/:slug", authenticateToken, getMeetingLimiter, getMeetingBySlug);

router.post(
    "/:slug/token",
    authenticateToken,
    getMeetingTokenLimiter,
    getMeetingToken
);

// router.post("/:slug/messages", authenticateToken, sendMeetingMessage);

router.post("/:slug/end", authenticateToken, endMeetingLimiter, endMeeting);

export default router;