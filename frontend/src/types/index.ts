// ─────────────────────────────────────────────────────────────
//  types/index.ts  (frontend)
//  All shared TypeScript interfaces for API responses and props.
// ─────────────────────────────────────────────────────────────

// ── Email Status ──────────────────────────────────────────────
export type EmailStatus =
  | "PENDING"
  | "QUEUED"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "CANCELLED";

// ── Sender Account ────────────────────────────────────────────
export interface SenderAccount {
  id: string;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  isDefault: boolean;
}

// ── User ──────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  senderAccounts: SenderAccount[];
  slackConnected: boolean;
}

// ── Scheduled Email ───────────────────────────────────────────
export interface ScheduledEmail {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt?: string;
  status: EmailStatus;
  smtpMessageId?: string;
  etherealPreviewUrl?: string;
  lastError?: string;
  attemptCount: number;
  createdAt: string;
  sender: SenderAccount;
  campaign?: { id: string; name: string };
}

// ── Email Campaign ────────────────────────────────────────────
export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  totalEmails: number;
  sentCount: number;
  failedCount: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  scheduledAt: string;
}

// ── API Response wrapper ──────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: Pagination;
  emails?: T; // some endpoints return { emails, pagination }
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ── Form Payloads ─────────────────────────────────────────────
export interface ScheduleEmailForm {
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
  senderId: string;
}

export interface BulkScheduleForm {
  subject: string;
  body: string;
  startAt: string;
  delayBetweenMs: number;
  hourlyLimit: number;
  senderId: string;
  campaignName?: string;
  recipients: string[]; // parsed from CSV
}

// ── Slack Status ──────────────────────────────────────────────
export interface SlackStatus {
  connected: boolean;
  teamName?: string;
  connectedAt?: string;
}

