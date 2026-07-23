import type { Response } from "express";
import { UserRepository } from "../repositories/UserRepository.js";
import { logger } from "../utils/logger.js";
import type { AuthenticatedRequest } from "../middleware/authmiddleware.js";

export const listDoctors = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { specialty, search } = req.query;

    const doctors = await UserRepository.listDoctors({
      search: typeof search === "string" ? search : undefined,
    });

    return res.status(200).json({ doctors });
  } catch (error) {
    logger.error("Failed to list doctors", error);
    return res.status(500).json({ message: "Failed to list doctors" });
  }
};

export const getDoctorById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const doctor = await UserRepository.findDoctorById(id);

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    return res.status(200).json({ doctor });
  } catch (error) {
    logger.error("Failed to fetch doctor", error);
    return res.status(500).json({ message: "Failed to fetch doctor" });
  }
};