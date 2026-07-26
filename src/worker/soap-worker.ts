// src/worker/soap-worker.ts
import cron from 'node-cron';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { RoomServiceClient, DataPacket_Kind } from 'livekit-server-sdk';
import dotenv from 'dotenv';
import { connectToDatabase, pool } from '../config/db/index.js';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',          // free tier; swap to gemini-1.5-pro if needed
  generationConfig: {
    responseMimeType: 'application/json', // forces JSON output — no markdown fences
    temperature: 0.2,
  },
});

const roomService = new RoomServiceClient(
  process.env.LIVEKIT_URL!,
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
);

// ─── Core functions ───────────────────────────────────────────────────────────

async function getActiveRooms(): Promise<{ room_name: string }[]> {
  const { rows } = await pool.query<{ room_name: string }>(
    `SELECT DISTINCT room_name
     FROM transcripts
     WHERE processed = false`
  );
  return rows;
}

async function generateSoapForRoom(roomName: string) {
  // 1. Fetch unprocessed transcripts for this room
  const { rows: newTranscripts } = await pool.query<{
    id: string;
    role: string;
    transcript: string;
    timestamp: Date;
  }>(
    `SELECT id, role, transcript, timestamp
     FROM transcripts
     WHERE room_name = $1 AND processed = false
     ORDER BY timestamp ASC`,
    [roomName]
  );

  // 2. Nothing new — skip
  if (newTranscripts.length === 0) return;

  // 3. Load existing SOAP note for this room (if any)
  const { rows: existing } = await pool.query<{
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  }>(
    `SELECT subjective, objective, assessment, plan
     FROM soap_notes
     WHERE room_name = $1`,
    [roomName]
  );

  const currentSoap = existing[0] ?? {
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
  };

  // 4. Build prompt — only new lines + existing note (keeps token usage bounded)
  const newLines = newTranscripts
    .map((t) => `[${t.role.toUpperCase()}]: ${t.transcript}`)
    .join('\n');

  const prompt = `You are a clinical documentation assistant. Update the SOAP note below using the new transcript lines provided. Preserve existing content and add/refine based on new information only. Return valid JSON with keys: subjective, objective, assessment, plan.

EXISTING SOAP NOTE:
${JSON.stringify(currentSoap, null, 2)}

NEW TRANSCRIPT LINES:
${newLines}

Return ONLY a JSON object, no markdown, no explanation.`;

  // 5. Call Gemini
  let updatedSoap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    updatedSoap = JSON.parse(raw);
  } catch (err) {
    console.error('[worker] Gemini call or JSON parse failed:', err);
    return;
  }

  // 6. Upsert SOAP note — keyed on room_name
  await pool.query(
    `INSERT INTO soap_notes (room_name, subjective, objective, assessment, plan, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (room_name) DO UPDATE SET
       subjective = EXCLUDED.subjective,
       objective  = EXCLUDED.objective,
       assessment = EXCLUDED.assessment,
       plan       = EXCLUDED.plan,
       updated_at = NOW()`,
    [
      roomName,
      updatedSoap.subjective,
      updatedSoap.objective,
      updatedSoap.assessment,
      updatedSoap.plan,
    ]
  );

  // 7. Mark those transcripts as processed
  const ids = newTranscripts.map((t) => t.id);
  await pool.query(
    `UPDATE transcripts SET processed = true WHERE id = ANY($1::uuid[])`,
    [ids]
  );

  // 8. Broadcast updated SOAP note to the frontend via LiveKit data channel
  const payload = Buffer.from(
    JSON.stringify({
      type: 'soap_update',
      soap: updatedSoap,
      timestamp: Date.now(),
    })
  );

  try {
    await roomService.sendData(
      roomName,
      payload,
      DataPacket_Kind.RELIABLE,
      { topic: 'soap' }
    );
    console.log(`[worker] SOAP updated and broadcast for room: ${roomName}`);
  } catch (err) {
    console.warn(`[worker] Could not broadcast to room ${roomName}:`, err);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

cron.schedule('*/15 * * * * *', async () => {
  try {
    const rooms = await getActiveRooms();
    if (rooms.length === 0) return;

    console.log(`[worker] Processing ${rooms.length} active room(s)`);

    await Promise.allSettled(
      rooms.map((r) => generateSoapForRoom(r.room_name))
    );
  } catch (err) {
    console.error('[worker] Cron tick failed:', err);
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

await connectToDatabase();
console.log('[worker] SOAP worker started, running every 15 seconds');