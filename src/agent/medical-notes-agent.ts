// src/agent/medical-notes-agent.ts
import { type JobContext, WorkerOptions, cli, defineAgent } from "@livekit/agents";
import { AudioStream, RoomEvent, TrackKind, type Track } from "@livekit/rtc-node";
import { SpeechClient } from "@google-cloud/speech";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION", reason);
});

// REMOVED: http.createServer listening on process.env.PORT (Express handles this)

// Replace: const speech = new SpeechClient();

let speechClient: SpeechClient | null = null;
function getSpeechClient() {
  if (!speechClient) {
    speechClient = new SpeechClient();
  }
  return speechClient;
}

function openRecognizeStream(identity: string) {
  return getSpeechClient()
    .streamingRecognize({
      config: {
        encoding: "LINEAR16" as const,
        sampleRateHertz: 48000,
        languageCode: "en-US",
        model: "medical_conversation",
        enableAutomaticPunctuation: true,
      },
      interimResults: true,
    })
    .on("error", (err) => console.error(`[agent] Google STT error (${identity})`, err))
    .on("data", (response) => {
      const result = response.results?.[0];
      const transcript = result?.alternatives?.[0]?.transcript;
      if (!transcript) return;
      console.log(`[${result.isFinal ? "FINAL" : "LIVE"}][${identity}] ${transcript}`);
    });
}
const STREAM_MAX_MS = 4 * 60 * 1000;



async function transcribeParticipant(track: Track, identity: string) {
  const audioStream = new AudioStream(track, { sampleRate: 48000, numChannels: 1 });

  let recognizeStream = openRecognizeStream(identity);
  let streamStartedAt = Date.now();

  for await (const frame of audioStream) {
    if (Date.now() - streamStartedAt > STREAM_MAX_MS) {
      recognizeStream.end();
      recognizeStream = openRecognizeStream(identity);
      streamStartedAt = Date.now();
    }
    const buffer = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
    recognizeStream.write(buffer);
  }

  recognizeStream.end();
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    console.log(`[agent] entry() for room ${ctx.room.name}`);

    ctx.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (publication.kind !== TrackKind.KIND_AUDIO) return;
      if (participant.identity === "medical-ai") return;

      console.log(`[agent] subscribed to audio from ${participant.identity}`);
      transcribeParticipant(track, participant.identity).catch((err) =>
        console.error(`[agent] transcription failed for ${participant.identity}`, err)
      );
    });

    await ctx.connect();
  },
});

try {
  await cli.runApp(
    new WorkerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: "medical-ai",
      apiKey: process.env.LIVEKIT_API_KEY!,
      apiSecret: process.env.LIVEKIT_API_SECRET!,
      wsURL: process.env.LIVEKIT_URL!,
      port: 8081, // Kept for LiveKit internal agent communication
    })
  );
} catch (err) {
  console.error("Worker crashed", err);
}