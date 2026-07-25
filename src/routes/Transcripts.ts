// routes/transcripts.ts

import { Router } from "express";
import { pool } from "../config/db/index.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const {
      roomName,
      role,
      identity,
      text,
      timestamp,
      final,
      overlap,
    } = req.body;

    await pool.query(
      `
      INSERT INTO transcripts
      (
        room_name,
        role,
        identity,
        transcript,
        timestamp,
        final,
        overlap
      )
      VALUES
      ($1,$2,$3,$4,to_timestamp($5/1000.0),$6,$7)
      `,
      [
        roomName,
        role,
        identity,
        text,
        timestamp,
        final,
        overlap,
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
    });
  }
});

export default router;