import type { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../utils/logger.js";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

/**
 * With link-based scheduled meetings, Socket.IO no longer drives call
 * setup (no more invite/accept/reject) - that's replaced by both parties
 * navigating to the same /meet/:slug link at (or after) the scheduled
 * time. The socket layer now only carries lightweight presence events,
 * which the meeting controller emits directly (see meeting:participant-joined
 * and meeting:ended in controllers/meeting.ts).
 *
 * This file is kept as the place to add more presence/UX events later,
 * e.g. "meeting:participant-left" if you track LiveKit webhooks, or
 * typing indicators in an in-call chat.
 */
export const registerPresenceHandlers = (
  io: SocketIOServer,
  socket: AuthenticatedSocket
) => {
  socket.on("meeting:leave-room", ({ slug, otherUserId }: { slug: string; otherUserId: string }) => {
    logger.info(`${socket.userId} left meeting ${slug}`);

    io.to(`user:${otherUserId}`).emit("meeting:participant-left", {
      slug,
      userId: socket.userId,
    });
  });
};