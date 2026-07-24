// src/agent/medical-notes-agent.ts
import { type JobContext, WorkerOptions, cli, defineAgent, stt } from "@livekit/agents";
import { STT } from "@livekit/agents-plugin-deepgram";
import { AudioStream, RoomEvent, TrackKind } from "@livekit/rtc-node";
import { fileURLToPath } from "node:url";

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect(); // joins the room, subscribe-only — never publishes

    ctx.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (publication.kind !== TrackKind.KIND_AUDIO) return;

      const audioStream = new AudioStream(track);
      const sttStream = new STT({ sampleRate: 48000 }).stream();

      (async () => {
        for await (const frame of audioStream) sttStream.pushFrame(frame);
      })();

      (async () => {
        for await (const event of sttStream) {
          if (event.type === stt.SpeechEventType.FINAL_TRANSCRIPT) {
            const text = event.alternatives?.[0]?.text;
            console.log(`[${participant.identity}] ${text}`);
            // TODO: append to consultation notes, run through a summarizer, etc.
          }
        }
      })();
    });
  },
});

cli.runApp(new WorkerOptions({
  agent: fileURLToPath(import.meta.url),
  agentName: "medical-ai", // must match AGENT_NAME above
  apiKey: process.env.LIVEKIT_API_KEY,
  apiSecret: process.env.LIVEKIT_API_SECRET,
  wsURL: process.env.LIVEKIT_URL,
}));