// src/services/AIAgentDispatch.ts
import { AgentDispatchClient } from "livekit-server-sdk";
import { logger } from "../utils/logger.js";

const AGENT_NAME = "medical-ai"; // must exactly match the worker's agentName

const dispatchClient = new AgentDispatchClient(
  process.env.LIVEKIT_URL!,
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
);

export async function ensureAIAgentDispatched(roomName: string) {
  // Check LiveKit itself, not an in-memory Map — this stays correct across
  // restarts and multiple Express instances.
  const existing = await dispatchClient.listDispatch(roomName);
  if (existing.some((d) => d.agentName === AGENT_NAME)) {
    return;
  }

  await dispatchClient.createDispatch(roomName, AGENT_NAME, {
    metadata: JSON.stringify({ roomName }),
  });

  logger.info(`Dispatched AI agent to room ${roomName}`);
}