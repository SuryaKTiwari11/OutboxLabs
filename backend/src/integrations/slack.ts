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

const SLACK_API_URL = "https://slack.com/api/chat.postMessage";

export class SlackService {
  /**
   * Send a rate-limit notification to the user's Slack.
   * Silently skips if:
   * - Slack is not connected for this user
   * - A notification was already sent in this hour window
   */
  async notifyRateLimitHit(payload: SlackNotificationPayload): Promise<void> {
    const { userId, senderEmail, limitReached, nextWindowAt } = payload;

    // 1. Check if Slack is connected for this user
    const integration = await prisma.slackIntegration.findUnique({
      where: { userId },
      select: { isActive: true, accessTokenEncrypted: true },
    });

    if (!integration || !integration.isActive) {
      logger.debug(`[Slack] No active Slack integration for user ${userId}`);
      return;
    }

    // 2. Check deduplication (don't spam the same notification)
    const hourWindow = Math.floor(Date.now() / 3_600_000);
    const dedupKey = `slack-notif:${userId}:${senderEmail}:${hourWindow}`;
    const redis = getRedisClient();

    const alreadySent = await redis.get(dedupKey);
    if (alreadySent) {
      logger.debug(`[Slack] Rate-limit notification already sent this hour`, {
        userId,
        senderEmail,
      });
      return;
    }

    // 3. Decrypt token and send the Slack message
    try {
      const accessToken = decrypt(integration.accessTokenEncrypted);
      const message = this.buildRateLimitMessage(senderEmail, limitReached, nextWindowAt);

      await this.postMessage(accessToken, message);

      // Mark as sent for this hour (TTL = 65 min for safety)
      await redis.setex(dedupKey, 65 * 60, "1");

      logger.info(`[Slack] Rate-limit notification sent`, { userId, senderEmail });
    } catch (err) {
      // Never let Slack errors break the email pipeline
      logger.error(`[Slack] Failed to send notification`, { error: err, userId });
    }
  }

  private async postMessage(token: string, text: string): Promise<void> {
    // Using native fetch (Node 18+)
    const response = await fetch(SLACK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: "#general",   // or stored channel per user
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

