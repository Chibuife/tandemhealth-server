import { randomBytes } from "node:crypto";
import { pool } from "../config/db/index.js";
import {
  Meeting,
  MeetingStatus,
  MeetingWithParticipants,
  ScheduleMeetingInput,
  mapRowToMeeting,
  mapRowToMeetingWithParticipants,
} from "../models/Meeting.js";

const generateSlug = () => randomBytes(6).toString("base64url"); // e.g. "k3f9zQ1a"

const JOINED_SELECT = `
  SELECT
    m.*,
    p.name  AS patient_name,
    p.email AS patient_email,
    h.name  AS host_name,
    h.email AS host_email
  FROM meetings m
  LEFT JOIN users p ON p.id = m.participant_id
  LEFT JOIN users h ON h.id = m.host_id
`;

export const MeetingRepository = {
  async create(input: ScheduleMeetingInput): Promise<Meeting> {
    // Retry once on the (extremely unlikely) chance of a slug collision.
    for (let attempt = 0; attempt < 2; attempt++) {
      const slug = generateSlug();

      try {
        const result = await pool.query(
          `INSERT INTO meetings
            (slug, title, patient_id, doctors_id, scheduled_start, scheduled_end,
             reason_for_visit, priority, consultation_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            slug,
            input.title,
            input.patientId,
            input.doctorsId,
            input.scheduledStart,
            input.scheduledEnd,
            input.reasonForVisit ?? null,
            input.priority ?? "medium",
            input.consultationType ?? "general",
          ]
        );

        return mapRowToMeeting(result.rows[0]);
      } catch (error: any) {
        if (error?.code === "23505" && attempt === 0) continue; // unique_violation on slug, retry
        throw error;
      }
    }

    throw new Error("Failed to generate a unique meeting slug");
  },

  async findBySlug(slug: string): Promise<Meeting | null> {
    const result = await pool.query(`SELECT * FROM meetings WHERE slug = $1`, [
      slug,
    ]);

    if (result.rowCount === 0) return null;

    return mapRowToMeeting(result.rows[0]);
  },

  async findByIdWithParticipants(id: string): Promise<MeetingWithParticipants | null> {
    const result = await pool.query(`${JOINED_SELECT} WHERE m.id = $1`, [id]);

    if (result.rowCount === 0) return null;

    return mapRowToMeetingWithParticipants(result.rows[0]);
  },

  async findById(id: string): Promise<Meeting | null> {
    const result = await pool.query(`SELECT * FROM meetings WHERE id = $1`, [
      id,
    ]);

    if (result.rowCount === 0) return null;

    return mapRowToMeeting(result.rows[0]);
  },



  async findUpcomingForUser(userId: string): Promise<Meeting[]> {
    const result = await pool.query(
      `SELECT * FROM meetings
       WHERE (patient_id = $1 OR doctor_id = $1)
       ORDER BY scheduled_start ASC`,
      [userId]
    );

    return result.rows.map(mapRowToMeeting);
  },

  /**
   * All consultations for a doctor (as host), optionally filtered by
   * status, joined with basic patient display info. This backs the
   * consultations list/dashboard view.
   */
  async listForDoctor(
    hostId: string,
    status?: MeetingStatus
  ): Promise<MeetingWithParticipants[]> {
    const params: any[] = [hostId];
    // let query = `${JOINED_SELECT} WHERE m.host_id = $1`;
    let query = `SELECT * FROM meetings WHERE m.host_id = $1`;

    // if (status) {
    //   params.push(status);
    //   query += ` AND m.status = $2`;
    // }

    query += ` ORDER BY m.scheduled_start ASC`;

    const result = await pool.query(query, params);

    return result.rows.map(mapRowToMeetingWithParticipants);
  },

  async findExpiredMeetings(): Promise<Meeting[]> {
    const result = await pool.query(
      `SELECT * FROM meetings
       WHERE status IN ('accepted', 'live')
         AND scheduled_end <= NOW()`
    );

    return result.rows.map(mapRowToMeeting);
  },

  /**
   * Pending requests nobody responded to before their window passed -
   * auto-decline these so they don't linger forever in the "pending" tab.
   */
  async findStalePendingRequests(): Promise<Meeting[]> {
    const result = await pool.query(
      `SELECT * FROM meetings
       WHERE status = 'pending'
         AND scheduled_end <= NOW()`
    );

    return result.rows.map(mapRowToMeeting);
  },

  async setStatus(slug: string, status: MeetingStatus): Promise<Meeting | null> {
    const result = await pool.query(
      `UPDATE meetings SET status = $2 WHERE slug = $1 RETURNING *`,
      [slug, status]
    );

    if (result.rowCount === 0) return null;

    return mapRowToMeeting(result.rows[0]);
  },

  async setStatusById(id: string, status: MeetingStatus): Promise<Meeting | null> {
    const result = await pool.query(
      `UPDATE meetings SET status = $2 WHERE id = $1 RETURNING *`,
      [id, status]
    );

    if (result.rowCount === 0) return null;

    return mapRowToMeeting(result.rows[0]);
  },
};