import { Router, Request, Response } from "express";
import { pool } from "../config/db/index.js";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MeetingRepository } from "../repositories/MeetingRepository.js";
import { getSocketServer } from "../sockets/index.js";
import { logger } from "../utils/logger.js";
import { AuthenticatedRequest } from "../middleware/authmiddleware.js";

const router = Router();
const getSlugParam = (slug: string | string[]): string =>
  Array.isArray(slug) ? slug[0] : slug;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({
  model: 'gemini-3.6-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.2,
  },
});

// ─── GET /api/soap/:roomName ──────────────────────────────────────────────────
// Returns the last saved SOAP note for a room, or 404 if none exists yet.
// Called on page load so the doctor sees the last generated note on rejoin.

router.get('/:roomName', async (req: Request, res: Response) => {
  const { roomName } = req.params;

  try {
    const { rows } = await pool.query<{
      subjective: string;
      objective:  string;
      assessment: string;
      plan:       string;
      status:     string;
      updated_at: Date;
    }>(
      `SELECT subjective, objective, assessment, plan, status, updated_at
       FROM soap_notes
       WHERE room_name = $1`,
      [roomName]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No SOAP note found for this room' });
    }

    const row = rows[0];

    // plan is stored as newline-delimited string — return as array so the
    // frontend normalisePlan() doesn't need to do extra work.
    return res.json({
      subjective: row.subjective,
      objective:  row.objective,
      assessment: row.assessment,
      plan:       row.plan ? row.plan.split('\n').filter(Boolean) : [],
      status:     row.status,
      updated_at: row.updated_at,
    });
  } catch (err) {
    console.error('[soap] GET failed:', err);
    return res.status(500).json({ error: 'Failed to fetch SOAP note' });
  }
});

// ─── POST /api/soap/:roomName/generate ───────────────────────────────────────
// Generates (or regenerates) a SOAP note from the full transcript using Gemini.
// Saves the result and returns it. Called when the doctor clicks "Generate SOAP".

router.post('/:roomName/generate', async (req: Request, res: Response) => {
  const { roomName } = req.params;

  try {
    // Fetch ALL transcripts — doctor may regenerate mid-consultation or at end
    const { rows: transcripts } = await pool.query<{
      role:       string;
      transcript: string;
      timestamp:  Date;
    }>(
      `SELECT role, transcript, timestamp
       FROM transcripts
       WHERE room_name = $1
       ORDER BY timestamp ASC`,
      [roomName]
    );

    if (transcripts.length === 0) {
      return res.status(400).json({ error: 'No transcripts found for this room' });
    }

    // Load existing SOAP note so Gemini preserves prior content on re-generate
    const { rows: existing } = await pool.query<{
      subjective: string;
      objective:  string;
      assessment: string;
      plan:       string;
    }>(
      `SELECT subjective, objective, assessment, plan
       FROM soap_notes
       WHERE room_name = $1`,
      [roomName]
    );

    const currentSoap = existing[0] ?? {
      subjective: '',
      objective:  '',
      assessment: '',
      plan:       '',
    };

    const lines = transcripts
      .map((t) => `[${t.role.toUpperCase()}]: ${t.transcript}`)
      .join('\n');

    const prompt = `You are a clinical documentation assistant. Generate a SOAP note from the consultation transcript below. Return valid JSON with keys: subjective, objective, assessment, plan. The plan must be an array of strings (one action per item).

EXISTING SOAP NOTE (preserve and refine, do not discard):
${JSON.stringify(currentSoap, null, 2)}

FULL TRANSCRIPT:
${lines}

Return ONLY a JSON object, no markdown, no explanation.`;

    const result  = await model.generateContent(prompt);
    const raw     = result.response.text();
    const soap    = JSON.parse(raw);

    // Normalise plan to string for storage; returned as array to the client
    const planArray:  string[] = Array.isArray(soap.plan)
      ? soap.plan
      : String(soap.plan).split('\n').filter(Boolean);
    const planString: string   = planArray.join('\n');

    await pool.query(
      `INSERT INTO soap_notes (room_name, subjective, objective, assessment, plan, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'draft', NOW())
       ON CONFLICT (room_name) DO UPDATE SET
         subjective = EXCLUDED.subjective,
         objective  = EXCLUDED.objective,
         assessment = EXCLUDED.assessment,
         plan       = EXCLUDED.plan,
         status     = 'draft',
         updated_at = NOW()`,
      [roomName, soap.subjective, soap.objective, soap.assessment, planString]
    );

    return res.json({
      subjective: soap.subjective,
      objective:  soap.objective,
      assessment: soap.assessment,
      plan:       planArray,   // always an array to the frontend
      status:     'draft',
    });
  } catch (err) {
    console.error('[soap] Gemini failed:', err);
    return res.status(500).json({ error: 'Failed to generate SOAP note' });
  }
});


router.patch('/:slug/soap/publish', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const slug = getSlugParam(req.params.slug);
    const meeting = await MeetingRepository.findBySlug(slug);

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    if (meeting.doctorId !== req.user!.id) {
      return res.status(403).json({ message: "Only the doctor can publish the SOAP note" });
    }

    const { soap } = req.body;

    if (!soap) {
      return res.status(400).json({ message: "SOAP note is required" });
    }

    // ✅ Save the edited SOAP to the DB first
    await pool.query(
      `INSERT INTO soap_notes (room_name, subjective, objective, assessment, plan, status, published)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (room_name)
       DO UPDATE SET
         subjective = EXCLUDED.subjective,
         objective  = EXCLUDED.objective,
         assessment = EXCLUDED.assessment,
         plan       = EXCLUDED.plan,
         status     = EXCLUDED.status,
         published  = true,
         updated_at = NOW()`,
      [
        slug,
        soap.subjective,
        soap.objective,
        soap.assessment,
        JSON.stringify(soap.plan),  // store plan array as JSON
        soap.status ?? 'draft',
      ]
    );

    // ✅ Then emit the saved version to the patient
    getSocketServer()
      .to(`user:${meeting.patientId}`)
      .emit("consultation:soap-published", { slug, soap });

    return res.status(200).json({ message: "SOAP note saved and published to patient" });
  } catch (error) {
    logger.error("Failed to publish SOAP note", error);
    return res.status(500).json({ message: "Failed to publish SOAP note" });
  }
});

export default router;