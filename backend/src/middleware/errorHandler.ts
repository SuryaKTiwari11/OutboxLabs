// ─────────────────────────────────────────────────────────────
//  middleware/errorHandler.ts
//  Central error handling middleware.
//
//  Pattern: all route handlers call next(err) for errors.
//  This middleware catches them, logs them, and sends a
//  consistent JSON error response.
// ─────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../utils/logger";
import { ApiResponse } from "../types";

// ── Custom application error ──────────────────────────────────
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AppError";
    // Maintain proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── Error handler middleware ──────────────────────────────────
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // ── Zod validation errors ─────────────────────────────────
  if (err instanceof ZodError) {
    const response: ApiResponse = {
      success: false,
      error: "Validation failed",
      data: err.flatten().fieldErrors,
    };
    res.status(400).json(response);
    return;
  }

  // ── Known application errors ──────────────────────────────
  if (err instanceof AppError) {
    logger.warn(`[AppError] ${err.statusCode} ${err.message}`, {
      code: err.code,
      path: req.path,
    });
    const response: ApiResponse = {
      success: false,
      error: err.message,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // ── Prisma unique constraint violation ─────────────────────
  if ((err as { code?: string }).code === "P2002") {
    const response: ApiResponse = {
      success: false,
      error: "Resource already exists (duplicate entry)",
    };
    res.status(409).json(response);
    return;
  }

  // ── Unknown / unexpected errors ────────────────────────────
  logger.error("[UnhandledError]", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const response: ApiResponse = {
    success: false,
    error:
      process.env["NODE_ENV"] === "production"
        ? "Internal server error"
        : err.message,
  };
  res.status(500).json(response);
}

