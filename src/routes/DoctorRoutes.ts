import { Router } from "express";
import { listDoctors, getDoctorById } from "../controllers/DoctorController.js";
import { authenticateToken } from "../middleware/authmiddleware.js";

const router = Router();

router.get("/", authenticateToken, listDoctors);
router.get("/:id", authenticateToken, getDoctorById);

export default router;