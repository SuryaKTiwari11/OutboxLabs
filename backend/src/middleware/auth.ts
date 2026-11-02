// ─────────────────────────────────────────────────────────────
//  middleware/auth.ts
//  JWT authentication middleware.
//
//  Security principles:
//  - userId is ALWAYS derived from the verified JWT
//  - NEVER trust userId from req.body or req.params
//  - Tokens stored in HTTP-only cookies (XSS-proof)
//  - Also accepts Bearer token for API clients
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthenticatedRequest } from "../types";
import { AppError } from "./errorHandler";

interface JwtPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    // Try cookie first, then Authorization header
    const token =
      req.cookies?.["auth_token"] ??
      extractBearerToken(req.headers.authorization);

    if (!token) {
      throw new AppError(401, "Authentication required");
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.userId = payload.userId;

    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError(401, "Invalid or expired token"));
  }
}

function extractBearerToken(header?: string): string | null {
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7);
}

export function generateJwt(userId: string, email: string): string {
  return jwt.sign({ userId, email }, env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

/** Basic auth middleware for Bull Board (username:password) */
export function bullBoardAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Bull Board"');
    res.status(401).send("Authentication required");
    return;
  }

  const base64 = authorization.slice(6);
  const [user, pass] = Buffer.from(base64, "base64").toString().split(":");

  if (user === env.BULL_BOARD_USERNAME && pass === env.BULL_BOARD_PASSWORD) {
    next();
  } else {
    res.setHeader("WWW-Authenticate", 'Basic realm="Bull Board"');
    res.status(401).send("Invalid credentials");
  }
}

