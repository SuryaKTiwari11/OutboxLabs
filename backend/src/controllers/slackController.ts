// ─────────────────────────────────────────────────────────────
//  controllers/slackController.ts
//  Slack OAuth connect / disconnect flow.
// ─────────────────────────────────────────────────────────────

import { Response, NextFunction } from "express";
import { AuthenticatedRequest, ApiResponse } from "../types";
import { env } from "../config/env";
import { encrypt } from "../utils/crypto";
import { prisma } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { SlackService } from "../integrations/slack";

const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL     = "https://slack.com/api/oauth.v2.access";
const SLACK_SCOPES        = "chat:write,incoming-webhook";

export const slackController = {
  // GET /api/slack/connect
  // Redirects user to Slack OAuth authorization page
  async connect(req: AuthenticatedRequest, res: Response): Promise<void> {
    const state = Buffer.from(JSON.stringify({ userId: req.userId })).toString("base64url");

    const url = new URL(SLACK_AUTHORIZE_URL);
    url.searchParams.set("client_id",     env.SLACK_CLIENT_ID);
    url.searchParams.set("scope",         SLACK_SCOPES);
    url.searchParams.set("redirect_uri",  env.SLACK_REDIRECT_URI);
    url.searchParams.set("state",         state);

    res.redirect(url.toString());
  },

  // GET /api/slack/callback
  // Slack redirects back here after user authorizes
  async callback(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      logger.warn(`[Slack] OAuth denied: ${error}`);
      res.redirect(`${env.FRONTEND_URL}/dashboard?slack=denied`);
      return;
    }

    // Decode state to get userId
    let userId: string;
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
      userId = decoded.userId;
    } catch {
      res.redirect(`${env.FRONTEND_URL}/dashboard?slack=error`);
      return;
    }

    try {
      // Exchange code for access token
      const tokenResponse = await fetch(SLACK_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id:     env.SLACK_CLIENT_ID,
          client_secret: env.SLACK_CLIENT_SECRET,
          code,
          redirect_uri:  env.SLACK_REDIRECT_URI,
        }),
      });

      const data = (await tokenResponse.json()) as {
        ok: boolean;
        access_token?: string;
        team?: { id: string; name: string };
        bot_user_id?: string;
        incoming_webhook?: { url: string };
        error?: string;
      };

      if (!data.ok || !data.access_token) {
        throw new Error(`Slack token exchange failed: ${data.error}`);
      }

      // Encrypt token before storing
      const encryptedToken = encrypt(data.access_token);

      await prisma.slackIntegration.upsert({
        where:  { userId },
        update: {
          teamId:               data.team?.id ?? "",
          teamName:             data.team?.name ?? "",
          accessTokenEncrypted: encryptedToken,
          botUserId:            data.bot_user_id,
          webhookUrl:           data.incoming_webhook?.url,
          isActive:             true,
        },
        create: {
          userId,
          teamId:               data.team?.id ?? "",
          teamName:             data.team?.name ?? "",
          accessTokenEncrypted: encryptedToken,
          botUserId:            data.bot_user_id,
          webhookUrl:           data.incoming_webhook?.url,
          isActive:             true,
        },
      });

      logger.info(`[Slack] OAuth connected for user ${userId}`, { team: data.team?.name });
      res.redirect(`${env.FRONTEND_URL}/dashboard?slack=connected`);
    } catch (err) {
      logger.error(`[Slack] OAuth callback error`, { error: err });
      res.redirect(`${env.FRONTEND_URL}/dashboard?slack=error`);
    }
  },

  // DELETE /api/slack/disconnect
  async disconnect(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await prisma.slackIntegration.updateMany({
        where: { userId: req.userId },
        data:  { isActive: false },
      });
      const response: ApiResponse = { success: true, message: "Slack disconnected" };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/slack/status
  async status(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const integration = await prisma.slackIntegration.findUnique({
        where:  { userId: req.userId },
        select: { isActive: true, teamName: true, connectedAt: true },
      });
      const response: ApiResponse = {
        success: true,
        data: {
          connected: !!integration?.isActive,
          teamName:  integration?.teamName ?? null,
          connectedAt: integration?.connectedAt ?? null,
        },
      };
      res.json(response);
    } catch (err) {
      next(err);
    }
  },

  // POST /api/slack/test
  async sendTest(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const channel = (req.body?.channel as string) || env.SLACK_DEFAULT_CHANNEL || "general";
      const slackService = new SlackService();
      const result = await slackService.sendTestMessage(channel);
      if (!result.ok) {
        res.status(400).json({ success: false, error: result.error });
        return;
      }
      res.json({ success: true, message: `Test notification sent to #${channel}` });
    } catch (err) {
      next(err);
    }
  },
};


