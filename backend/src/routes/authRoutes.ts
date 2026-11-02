// ─────────────────────────────────────────────────────────────
//  routes/authRoutes.ts
//  Google OAuth + session management routes.
// ─────────────────────────────────────────────────────────────

import { Router } from "express";
import passport from "passport";
import { authController } from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// GET /api/auth/google — redirect to Google
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

// GET /api/auth/google/callback — Google redirects here
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login?error=true" }),
  authController.googleCallback as never
);

// POST /api/auth/logout
router.post("/logout", authController.logout as never);

// GET /api/auth/me — returns current user (protected)
router.get("/me", authMiddleware as never, authController.me as never);

export { router as authRouter };

