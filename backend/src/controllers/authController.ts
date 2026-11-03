// ─────────────────────────────────────────────────────────────
//  controllers/authController.ts
//  Google OAuth flow + JWT cookie management.
// ─────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest, ApiResponse } from "../types";
import { generateJwt } from "../middleware/auth";
import { userRepository } from "../repositories/userRepository";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";

export const authController = {
  // GET /api/auth/google — handled by Passport middleware (see routes)

  // GET /api/auth/google/callback
  async googleCallback(req: Request, res: Response): Promise<void> {
    // At this point Passport has verified the token and attached req.user
    const user = req.user as { id: string; email: string } | undefined;

    if (!user) {
      res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
      return;
    }

    const token = generateJwt(user.id, user.email);

    // Set HTTP-only cookie (XSS-proof)
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: env.isProduction(),
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.redirect(`${env.FRONTEND_URL}/?token=${token}`);
  },

  // POST /api/auth/dev-login — one-click login for quick testing
  async devLogin(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let user = await userRepository.findByEmail("demo@reachinbox.io");
      if (!user) {
        user = await userRepository.upsertFromGoogle({
          googleId: "dev-test-google-id",
          email: "demo@reachinbox.io",
          name: "Demo User",
          avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=DemoUser",
        });
      }

      const token = generateJwt(user.id, user.email);
      res.cookie("auth_token", token, {
        httpOnly: true,
        secure: env.isProduction(),
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/auth/logout
  async logout(_req: Request, res: Response): Promise<void> {
    res.clearCookie("auth_token");
    const response: ApiResponse = { success: true, message: "Logged out" };
    res.json(response);
  },

  // GET /api/auth/me
  async me(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await userRepository.findById(req.userId);
      if (!user) throw new AppError(404, "User not found");

      const response: ApiResponse = {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          senderAccounts: user.senderAccounts,
          slackConnected: !!user.slackIntegration?.isActive,
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },
};
