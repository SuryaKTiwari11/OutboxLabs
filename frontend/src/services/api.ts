// ─────────────────────────────────────────────────────────────
//  services/api.ts
//  Axios instance + all API call functions.
//  Pattern: centralised API layer — components never call fetch directly.
// ─────────────────────────────────────────────────────────────

import axios from "axios";
import type {
  ApiResponse,
  ScheduledEmail,
  User,
  BulkScheduleForm,
  ScheduleEmailForm,
  SlackStatus,
} from "../types";

// ── Axios instance ─────────────────────────────────────────────
export const apiClient = axios.create({
  baseURL: "/api",
  withCredentials: true, // send HTTP-only auth cookie
  headers: { "Content-Type": "application/json" },
});

// ── Response interceptor: unwrap data or throw ────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.error ??
      error.response?.data?.message ??
      error.message ??
      "An unexpected error occurred";
    return Promise.reject(new Error(message));
  }
);

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  me: () =>
    apiClient.get<ApiResponse<User>>("/auth/me").then((r) => r.data.data!),

  logout: () =>
    apiClient.post<ApiResponse>("/auth/logout").then((r) => r.data),

  googleLoginUrl: () => "/api/auth/google",
};

// ── Emails ────────────────────────────────────────────────────
export const emailsApi = {
  getScheduled: (page = 1, limit = 20) =>
    apiClient
      .get<{ success: boolean; emails: ScheduledEmail[]; pagination: ApiResponse["pagination"] }>(
        `/emails/scheduled?page=${page}&limit=${limit}`
      )
      .then((r) => r.data),

  getSent: (page = 1, limit = 20) =>
    apiClient
      .get<{ success: boolean; emails: ScheduledEmail[]; pagination: ApiResponse["pagination"] }>(
        `/emails/sent?page=${page}&limit=${limit}`
      )
      .then((r) => r.data),

  getById: (id: string) =>
    apiClient
      .get<ApiResponse<ScheduledEmail>>(`/emails/${id}`)
      .then((r) => r.data.data!),

  schedule: (payload: ScheduleEmailForm) =>
    apiClient
      .post<ApiResponse<ScheduledEmail>>("/emails/schedule", payload)
      .then((r) => r.data),

  bulkSchedule: (payload: BulkScheduleForm) =>
    apiClient
      .post<ApiResponse>("/emails/bulk-schedule", payload)
      .then((r) => r.data),

  search: (query: string, page = 1) =>
    apiClient
      .get<{ success: boolean; data: { results: ScheduledEmail[]; total: number } }>(
        `/emails/search?q=${encodeURIComponent(query)}&page=${page}`
      )
      .then((r) => r.data.data!),
};

// ── Slack ─────────────────────────────────────────────────────
export const slackApi = {
  getStatus: () =>
    apiClient
      .get<ApiResponse<SlackStatus>>("/slack/status")
      .then((r) => r.data.data!),

  connectUrl: () => "/api/slack/connect",

  disconnect: () =>
    apiClient.delete<ApiResponse>("/slack/disconnect").then((r) => r.data),
};

