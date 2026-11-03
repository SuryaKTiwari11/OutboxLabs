// ─────────────────────────────────────────────────────────────
//  integrations/slack.ts
//  Slack Web API integration for rate-limit notifications.
//
//  Pattern: Adapter — wraps Slack's HTTP API behind a clean interface.
//
//  Notification deduplication:
//  - Redis key: slack-notif:{userId}:{senderId}:{hourWindow}
//  - TTL: 1 hour
//  - Prevents notification spam when many jobs hit the limit
//    at the same time (e.g. 1000 emails scheduled simultaneously).
//
//  If Slack is not connected → logs a warning, does NOT throw.
// ─────────────────────────────────────────────────────────────

import { getRedisClient } from "../config/redis";
import { decrypt } from "../utils/crypto";
import { logger } from "../utils/logger";
import { SlackNotificationPayload } from "../types";
import { prisma } from "../config/database";
import { env } from "../config/env";

const SLACK_API_URL = "https://slack.com/api/chat.postMessage";

export class SlackService {
  /**
   * Send a rate-limit notification to the user's Slack or workspace channel.
   * Silently skips if neither user integration nor bot token is configured,
   * or if a notification was already sent in this hour window.
   */
  async notifyRateLimitHit(payload: SlackNotificationPayload): Promise<void> {
    const { userId, senderEmail, limitReached, nextWindowAt } = payload;

    // 1. Resolve Slack token: User OAuth token OR Workspace Bot token
    let token: string | null = null;
    let channel: string = env.SLACK_DEFAULT_CHANNEL || "general";

    if (userId) {
      const integration = await prisma.slackIntegration.findUnique({
        where: { userId },
        select: { isActive: true, accessTokenEncrypted: true },
      });
      if (integration && integration.isActive) {
        token = decrypt(integration.accessTokenEncrypted);
      }
    }

    // Fall back to workspace Bot token if no user OAuth integration
    if (!token && env.SLACK_BOT_TOKEN) {
      token = env.SLACK_BOT_TOKEN;
    }

    if (!token) {
      logger.debug(`[Slack] No active Slack integration or Bot token found`);
      return;
    }

    // 2. Atomically claim this notification window before posting.
    const hourWindow = Math.floor(Date.now() / 3_600_000);
    const dedupKey = `slack-notif:${userId || "system"}:${senderEmail}:${hourWindow}`;
    const redis = getRedisClient();

    try {
      const claimed = await redis.set(dedupKey, "1", "EX", 65 * 60, "NX");
      if (claimed !== "OK") {
        logger.debug(`[Slack] Rate-limit notification already sent this hour`, {
          userId,
          senderEmail,
        });
        return;
      }
    } catch {
      // Redis down should not block notification attempt
    }

    // 3. Post notification
    try {
      const message = this.buildRateLimitMessage(senderEmail, limitReached, nextWindowAt);
      await this.postMessage(token, message, channel);

      logger.info(`[Slack] Rate-limit notification sent`, { userId, senderEmail, channel });
    } catch (err) {
      try {
        await redis.del(dedupKey);
      } catch {
        logger.warn("[Slack] Failed to release notification deduplication claim");
      }
      // Never let Slack errors break the email pipeline
      logger.error(`[Slack] Failed to send notification`, { error: err, userId });
    }
  }

  /**
   * Send a test ping to verify Slack bot configuration.
   */
  async sendTestMessage(channel: string = env.SLACK_DEFAULT_CHANNEL || "general"): Promise<{ ok: boolean; error?: string }> {
    const token = env.SLACK_BOT_TOKEN;
    if (!token) {
      return { ok: false, error: "SLACK_BOT_TOKEN is not configured" };
    }

    const text = `🚀 *ReachInbox Alert System*: Slack integration is live and connected! Rate-limit alerts and email delivery telemetry will be reported here.`;
    try {
      await this.postMessage(token, text, channel);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  private async postMessage(token: string, text: string, channel: string = "general"): Promise<void> {
    const channelFormatted = channel.startsWith("#") || channel.startsWith("C") ? channel : `#${channel}`;
    const response = await fetch(SLACK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: channelFormatted,
        text,
        username: "ReachInbox Bot",
        icon_emoji: ":email:",
      }),
    });

    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }
  }

  private buildRateLimitMessage(
    senderEmail: string,
    limitReached: number,
    nextWindowAt: Date
  ): string {
    const timeStr = nextWindowAt.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
    return (
      `⚠️ *Rate Limit Reached* — ReachInbox\n\n` +
      `• *Sender:* ${senderEmail}\n` +
      `• *Hourly limit hit:* ${limitReached} emails/hour\n` +
      `• *Next sending window opens at:* ${timeStr}\n\n` +
      `Affected emails have been automatically rescheduled to the next window.`
    );
  }
}

export const slackService = new SlackService();
