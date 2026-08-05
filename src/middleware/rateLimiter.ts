import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redisClient from "../config/redis/index.js";



export const getProfileLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests to fetch profiles. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
    }),
});


export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many login requests. Please try again later.",
    },
});

export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many registration attempts. Please try again later.",
    },
});

export const refreshLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many refresh requests.",
    },
});

export const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many password reset requests.",
    },
});

export const resetPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many password reset attempts.",
    },
});

export const verifyEmailLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many verification requests.",
    },
});

export const logoutLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many logout requests.",
    },
});




// --- Add these to your existing src/middleware/rateLimiter.ts, alongside
// the auth limiters already there (loginLimiter, registerLimiter, etc).
// Import { rateLimit } and { RedisStore } are already at the top of that
// file - no new imports needed.

export const scheduleMeetingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many meetings scheduled. Please try again later.",
    },
    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
    }),
});

export const listMeetingsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many requests. Please slow down.",
    },
    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
    }),
});

export const getMeetingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many requests. Please slow down.",
    },
    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
    }),
});

// Join endpoint - slightly tighter since a legitimate client only needs to
// call this once or twice per call (initial join + maybe a reconnect).
export const getMeetingTokenLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many join attempts. Please try again shortly.",
    },
    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
    }),
});

export const endMeetingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many requests. Please slow down.",
    },
    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
    }),
});



export const getSoapLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many SOAP note requests. Please slow down." },
    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
    }),
});

export const generateSoapLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // generation is expensive — tighter cap
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many generation requests. Please try again later." },
    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
    }),
});

export const publishSoapLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many publish requests. Please slow down." },
    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
    }),
});