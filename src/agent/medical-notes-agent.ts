// src/agent/medical-notes-agent.ts
import { type JobContext, WorkerOptions, cli, defineAgent } from "@livekit/agents";
import { AudioStream, RoomEvent, TrackKind, type Track } from "@livekit/rtc-node";
import { SpeechClient } from "@google-cloud/speech";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

console.log("========== AGENT STARTING ==========");

console.log("[BOOT] Loading .env...");
dotenv.config();
console.log("[BOOT] .env loaded");

console.log("[BOOT] Environment:");
console.log({
  LIVEKIT_URL: process.env.LIVEKIT_URL,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ? "✓ Present" : "✗ Missing",
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ? "✓ Present" : "✗ Missing",
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

process.on("uncaughtException", (err) => {
  console.error("[PROCESS] UNCAUGHT EXCEPTION");
  console.error(err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[PROCESS] UNHANDLED REJECTION");
  console.error(reason);
});

process.on("exit", (code) => {
  console.log(`[PROCESS] Exit with code ${code}`);
});

process.on("SIGINT", () => console.log("[PROCESS] SIGINT"));
process.on("SIGTERM", () => console.log("[PROCESS] SIGTERM"));

console.log("[BOOT] Creating SpeechClient...");

let speechClient: SpeechClient | null = null;

function getSpeechClient() {
  if (!speechClient) {
    console.log("[Speech] Creating new SpeechClient");
    speechClient = new SpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  }
  return speechClient;
}

function openRecognizeStream(identity: string) {
  console.log(`[Speech] Opening stream for ${identity}`);

  const stream = getSpeechClient().streamingRecognize({
    config: {
      encoding: "LINEAR16" as const,
      sampleRateHertz: 48000,
      languageCode: "en-US",
      model: "medical_conversation", // fall back to "latest_long" if this model isn't enabled on your project
      enableAutomaticPunctuation: true,
    },
    interimResults: true,
  });

  stream.on("error", (err) => {
    console.error(`[agent] Google STT error (${identity})`, err);
  });

  stream.on("data", (response) => {
    const result = response.results?.[0];
    const transcript = result?.alternatives?.[0]?.transcript;
    if (!transcript) return;
    console.log(`[${result.isFinal ? "FINAL" : "LIVE"}][${identity}] ${transcript}`);
  });

  return stream;
}

// Prevents the same participant being transcribed twice if TrackSubscribed
// ever fires more than once for them (reconnects, republished tracks, etc).
const activeTranscriptions = new Set<string>();

const STREAM_MAX_MS = 230_000; // rotate before Google's ~4-5 min hard limit
const MAX_CONSECUTIVE_FAILURES = 5;

async function transcribeParticipant(track: Track, identity: string) {
  if (activeTranscriptions.has(identity)) {
    console.log(`[agent] ${identity} is already being transcribed, skipping`);
    return;
  }
  activeTranscriptions.add(identity);

  console.log(`[Transcriber] Starting for ${identity}`);

  const audioStream = new AudioStream(track, { sampleRate: 48000, numChannels: 1 });

  let recognizeStream = openRecognizeStream(identity);
  let streamStartedAt = Date.now();
  let consecutiveFailures = 0;

  const reopenStream = () => {
    try {
      recognizeStream.end();
    } catch {
      // already dead — nothing to clean up
    }
    recognizeStream = openRecognizeStream(identity);
    streamStartedAt = Date.now();
  };

  try {
    for await (const frame of audioStream) {
      const scheduledRotation = Date.now() - streamStartedAt >= STREAM_MAX_MS;
      const streamIsDead = recognizeStream.destroyed || recognizeStream.writableEnded;

      if (streamIsDead) {
        consecutiveFailures++;
        if (consecutiveFailures > MAX_CONSECUTIVE_FAILURES) {
          console.error(
            `[agent] Giving up on STT for ${identity} after ${consecutiveFailures} consecutive failures — check the Google STT error above for the real cause`
          );
          break;
        }
        console.log(
          `[agent] Recreating destroyed stream for ${identity} (attempt ${consecutiveFailures})`
        );
        await new Promise((r) => setTimeout(r, 1000 * consecutiveFailures)); // backoff
        reopenStream();
      } else if (scheduledRotation) {
        console.log(`[agent] Rotating Google stream for ${identity}`);
        consecutiveFailures = 0; // scheduled rotation isn't a failure
        reopenStream();
      }

      const buffer = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);

      try {
        recognizeStream.write(buffer);
        consecutiveFailures = 0; // successful write — reset the counter
      } catch (err) {
        console.error(`[agent] write() failed for ${identity}`, err);
        // Let the next loop iteration's destroyed/writableEnded check handle recovery
      }
    }

    console.log(`[Transcriber] Audio stream ended for ${identity}`);
  } catch (err) {
    console.error(`[Transcriber] Failed for ${identity}`, err);
  } finally {
    try {
      recognizeStream.end();
    } catch {
      // already dead
    }
    activeTranscriptions.delete(identity);
    console.log(`[Transcriber] Closed stream for ${identity}`);
  }
}

console.log("[BOOT] Defining LiveKit agent...");

export default defineAgent({
  entry: async (ctx: JobContext) => {
    console.log("========== ENTRY ==========");
    console.log("[Agent] entry() called, room:", ctx.room.name);

    ctx.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.log("[Agent] TrackSubscribed", {
        participant: participant.identity,
        kind: publication.kind,
      });

      if (publication.kind !== TrackKind.KIND_AUDIO) {
        console.log("[Agent] Ignoring non-audio track");
        return;
      }

      if (participant.identity === "medical-ai") {
        console.log("[Agent] Ignoring self");
        return;
      }

      if (activeTranscriptions.has(participant.identity)) {
        console.log(`[Agent] Ignoring duplicate subscription for ${participant.identity}`);
        return;
      }

      console.log(`[Agent] Starting transcription for ${participant.identity}`);

      transcribeParticipant(track, participant.identity).catch((err) => {
        console.error(`[Agent] Transcription failed for ${participant.identity}`, err);
        activeTranscriptions.delete(participant.identity);
      });
    });

    console.log("[Agent] Connecting...");
    await ctx.connect();
    console.log("[Agent] Connected, waiting for participants...");
  },
});

console.log("[BOOT] Starting LiveKit worker...");

try {
  const options = new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "medical-ai",
    apiKey: process.env.LIVEKIT_API_KEY!,
    apiSecret: process.env.LIVEKIT_API_SECRET!,
    wsURL: process.env.LIVEKIT_URL!,
    port: 8081,
    initializeProcessTimeout: 30000,
    numIdleProcesses: 0,
  });

  console.log("[BOOT] Worker options created", {
    agent: options.agent,
    agentName: options.agentName,
    wsURL: options.wsURL,
    port: options.port,
  });

  console.log("[BOOT] Calling cli.runApp()");
  await cli.runApp(options);
  console.log("[BOOT] cli.runApp() returned");
} catch (err) {
  console.error("[BOOT] runApp failed", err);
}