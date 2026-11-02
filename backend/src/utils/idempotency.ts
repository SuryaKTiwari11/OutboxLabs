// ─────────────────────────────────────────────────────────────
//  utils/idempotency.ts
//  Generates deterministic idempotency keys for emails.
//
//  Design decision:
//    key = sha256(userId + "|" + recipient + "|" + scheduledAt)
//
//  This ensures that if the same API request is retried
//  (e.g. network timeout), it produces the exact same key,
//  which is UNIQUE in the DB → insert fails gracefully.
//  BullMQ job ID is also set to this key to prevent
//  duplicate queue entries.
// ─────────────────────────────────────────────────────────────

import * as crypto from "crypto";

/**
 * Generate a deterministic idempotency key for a scheduled email.
 */
export function generateIdempotencyKey(
  userId: string,
  recipient: string,
  scheduledAt: Date
): string {
  const input = `${userId}|${recipient.toLowerCase().trim()}|${scheduledAt.toISOString()}`;
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Generate a campaign idempotency key.
 */
export function generateCampaignKey(
  userId: string,
  campaignName: string,
  createdAt: Date
): string {
  const input = `campaign|${userId}|${campaignName}|${createdAt.toISOString()}`;
  return crypto.createHash("sha256").update(input).digest("hex");
}

