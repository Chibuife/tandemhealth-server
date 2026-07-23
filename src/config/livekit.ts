import { AccessToken } from "livekit-server-sdk";

const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  throw new Error("LiveKit environment variables are not configured.");
}

/**
 * Generates a short-lived token that authorizes a single participant to
 * join a specific LiveKit room. This is what the frontend passes to the
 * livekit-client SDK to establish the WebRTC connection - the Express
 * server never touches media itself, only issues these tokens.
 */
export const createLiveKitToken = async (
  roomName: string,
  participantIdentity: string,
  participantName: string
): Promise<string> => {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: participantName,
    ttl: "10m", // room join grant expires quickly; the call itself isn't limited by this
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  return token.toJwt();
};