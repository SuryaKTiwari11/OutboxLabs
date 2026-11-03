// ─────────────────────────────────────────────────────────────
//  app.ts
//  Express application setup.
//  Separating app from index.ts makes testing easier.
// ─────────────────────────────────────────────────────────────

import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import passport from "passport";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { env } from "./config/env";
import { configurePassport } from "./config/passport";
import { emailQueue, indexingQueue, notificationQueue, dlqQueue, updateQueueMetrics } from "./queues/emailQueue";
import { emailRouter } from "./routes/emailRoutes";
import { authRouter } from "./routes/authRoutes";
import { slackRouter } from "./routes/slackRoutes";
import { senderRouter } from "./routes/senderRoutes";
import { errorHandler } from "./middleware/errorHandler";
import { bullBoardAuth } from "./middleware/auth";
import { register } from "./config/metrics";

export function createApp(): express.Application {
  const app = express();

  // ── Security headers ────────────────────────────────────────
  app.use(helmet());

  // ── CORS ─────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true, // Allow cookies
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
  );

  // ── Request logging ──────────────────────────────────────────
  app.use(morgan(env.isDevelopment() ? "dev" : "combined"));

  // ── Body parsing ─────────────────────────────────────────────
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // ── Passport (Google OAuth) ──────────────────────────────────
  configurePassport();
  app.use(passport.initialize());

  // ── Bull Board (queue dashboard) ─────────────────────────────
  // Protected with HTTP Basic Auth
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    // BullMQ v5 has slightly different JobProgress types vs @bull-board v5 expectations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queues: [
      (new BullMQAdapter(emailQueue)) as any,
      (new BullMQAdapter(indexingQueue)) as any,
      (new BullMQAdapter(notificationQueue)) as any,
      (new BullMQAdapter(dlqQueue)) as any,
    ],
    serverAdapter,
  });

  app.use(
    "/admin/queues",
    bullBoardAuth as never,
    serverAdapter.getRouter()
  );

  // ── Health check ──────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── Prometheus Metrics Endpoint ───────────────────────────────
  app.get("/metrics", async (_req, res) => {
    try {
      await updateQueueMetrics();
      res.setHeader("Content-Type", register.contentType);
      res.send(await register.metrics());
    } catch (err) {
      res.status(500).send((err as Error).message);
    }
  });

  // ── API Routes ────────────────────────────────────────────────
  app.use("/api/auth",    authRouter);
  app.use("/api/emails",  emailRouter);
  app.use("/api/slack",   slackRouter);
  app.use("/api/senders", senderRouter);   // sender account management

  // ── 404 handler ───────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: "Route not found" });
  });

  // ── Central error handler (must be last) ──────────────────────
  app.use(errorHandler as never);

  return app;
}

