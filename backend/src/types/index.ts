// ─────────────────────────────────────────────────────────────
//  types/index.ts
//  Shared TypeScript interfaces and types.
//  Keep all domain types here to avoid duplication.
// ─────────────────────────────────────────────────────────────

import { Request } from "express";

// ── Email Status (mirrors Prisma enum) ────────────────────────
// Defined here to avoid Prisma import in all files.
// Keep in sync with prisma/schema.prisma EmailStatus enum.
export type EmailStatus =
  | "PENDING"
  | "QUEUED"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "CANCELLED";

export type CampaignStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED";

// ── Authenticated Request ─────────────────────────────────────
// Extend Express Request to carry the authenticated user.
// userId is ALWAYS derived from JWT — never from req.body.
export interface AuthenticatedRequest extends Request {
  userId: string;
}

// ── API Response wrapper ──────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ── Email Scheduling ──────────────────────────────────────────
export interface ScheduleEmailPayload {
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string; // ISO 8601
  senderId: string;
  campaignId?: string;
}

export interface BulkSchedulePayload {
  recipients: string[];
  subject: string;
  body: string;
  startAt: string;      // ISO 8601 — when to send the first email
  delayBetweenMs: number; // delay between individual emails
  hourlyLimit: number;
  senderId: string;
  campaignName?: string;
}

// ── BullMQ Job Data ────────────────────────────────────────────
// Lightweight payload: only identifiers stored in Redis to minimize memory footprint.
// Full email body and recipient are fetched from DB by worker on execution.
export interface EmailJobData {
  scheduledEmailId: string;
  idempotencyKey: string;
  userId?: string;
  senderId?: string;
  recipient?: string;
  subject?: string;
  body?: string;
}

export interface IndexingJobData {
  scheduledEmailId: string;
  action: "INDEX" | "UPDATE_STATUS" | "DELETE";
  status?: EmailStatus;
}

export interface NotificationJobData {
  userId: string;
  senderEmail: string;
  limitReached: number;
  nextWindowAt: string; // ISO 8601
}


// ── Rate Limiting ─────────────────────────────────────────────
export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  nextWindowMs?: number; // ms until next hour window opens
}

// ── Slack ─────────────────────────────────────────────────────
export interface SlackNotificationPayload {
  senderEmail: string;
  limitReached: number;
  nextWindowAt: Date;
  userId: string;
}

// ── Elasticsearch ─────────────────────────────────────────────
export interface EmailSearchParams {
  query?: string;
  status?: EmailStatus;
  userId: string;
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}

export interface EmailSearchResult {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt?: string;
}

