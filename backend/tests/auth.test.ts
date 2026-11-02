// ─────────────────────────────────────────────────────────────
//  tests/auth.test.ts
//  Unit tests for JWT generation and authMiddleware verification.
// ─────────────────────────────────────────────────────────────

process.env["DATABASE_URL"]        = "postgresql://test:test@localhost:5432/test";
process.env["GOOGLE_CLIENT_ID"]    = "test";
process.env["GOOGLE_CLIENT_SECRET"]= "test";
process.env["GOOGLE_CALLBACK_URL"] = "http://localhost/callback";
process.env["SLACK_CLIENT_ID"]     = "test";
process.env["SLACK_CLIENT_SECRET"] = "test";
process.env["SLACK_REDIRECT_URI"]  = "http://localhost/slack";
process.env["JWT_SECRET"]          = "test-secret-minimum-32-chars-long!!!!";
process.env["ENCRYPTION_KEY"]      = "a".repeat(64);

import { generateJwt, authMiddleware } from "../src/middleware/auth";
import { Request, Response, NextFunction } from "express";

describe("Auth Middleware & JWT", () => {
  it("generates a valid JWT and verifies it in authMiddleware", () => {
    const payload = { userId: "user-abc-123", email: "user@example.com" };
    const token = generateJwt(payload.userId, payload.email);

    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);

    const req = {
      cookies: { auth_token: token },
    } as unknown as Request;

    const res = {} as Response;
    const next: NextFunction = jest.fn();

    authMiddleware(req as never, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as never as { userId: string }).userId).toBe("user-abc-123");
  });

  it("extracts token from Authorization: Bearer <token> header if cookie is missing", () => {
    const payload = { userId: "user-bearer-456", email: "bearer@example.com" };
    const token = generateJwt(payload.userId, payload.email);

    const req = {
      cookies: {},
      headers: { authorization: `Bearer ${token}` },
    } as unknown as Request;

    const res = {} as Response;
    const next: NextFunction = jest.fn();

    authMiddleware(req as never, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as never as { userId: string }).userId).toBe("user-bearer-456");
  });

  it("calls next with 401 AppError when no token is present", () => {
    const req = {
      cookies: {},
      headers: {},
    } as unknown as Request;

    const res = {} as Response;
    const next: NextFunction = jest.fn();

    authMiddleware(req as never, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: "Authentication required",
      })
    );
  });

  it("calls next with 401 AppError when token is corrupted or invalid", () => {
    const req = {
      cookies: { auth_token: "invalid.jwt.token" },
      headers: {},
    } as unknown as Request;

    const res = {} as Response;
    const next: NextFunction = jest.fn();

    authMiddleware(req as never, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: "Invalid or expired token",
      })
    );
  });
});
