// ─────────────────────────────────────────────────────────────
//  services/api.ts
//  Centralised Axios instance + all backend API calls.
// ─────────────────────────────────────────────────────────────

import axios from "axios";
import type {
  ApiResponse,
  ScheduledEmail,
  SenderAccount,
  User,
  BulkScheduleForm,
  ScheduleEmailForm,
  SlackStatus,
} from "../types";

const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && envUrl !== "/api") return envUrl;

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (backendUrl && !backendUrl.includes("localhost")) {
    return `${backendUrl.replace(/\/+$/, "")}/api`;
  }

  if (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")) {
    return "https://outboxlabs-odvu.onrender.com/api";
  }

  return "/api";
};

// ── Axios instance ─────────────────────────────────────────────
export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor: attach bearer token if available ─────
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor ──────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    let message =
      error.response?.data?.error ??
      error.response?.data?.message ??
      error.message ??
      "An unexpected error occurred";

    if (error.response?.data?.data && typeof error.response.data.data === "object") {
      const fieldErrors = Object.entries(error.response.data.data)
        .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? (msgs as string[]).join(", ") : msgs}`)
        .join("; ");
      if (fieldErrors) {
        message = `${message} — ${fieldErrors}`;
      }
    }

    return Promise.reject(new Error(message));
  }
);

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  me: async (): Promise<User | null> => {
    // Check if token was delivered via OAuth callback query param
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token");
      if (urlToken) {
        localStorage.setItem("auth_token", urlToken);
        params.delete("token");
        const newSearch = params.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
        window.history.replaceState({}, "", newUrl);
      }
    }

    try {
      const res = await apiClient.get<ApiResponse<User>>("/auth/me");
      if (res.data.data) {
        return res.data.data;
      }
    } catch {
      // not logged in or backend down
    }
    return null;
  },

  devLogin: async () => {
    const res = await apiClient.post<ApiResponse<{ token: string; user: User }>>("/auth/dev-login");
    if (res.data.data?.token) {
      localStorage.setItem("auth_token", res.data.data.token);
    }
    return res.data.data!;
  },

  logout: async () => {
    try {
      await apiClient.post<ApiResponse>("/auth/logout");
    } catch {}
    localStorage.removeItem("auth_token");
    return { success: true };
  },

  googleLoginUrl: () => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    if (backendUrl && !backendUrl.includes("localhost")) {
      return `${backendUrl.replace(/\/+$/, "")}/api/auth/google`;
    }
    if (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")) {
      return "https://outboxlabs-odvu.onrender.com/api/auth/google";
    }
    return backendUrl ? `${backendUrl}/api/auth/google` : "/api/auth/google";
  },
};

// ── Emails ────────────────────────────────────────────────────
export const emailsApi = {
  getScheduled: async (page = 1, limit = 20) => {
    const res = await apiClient.get<{
      success: boolean;
      emails: ScheduledEmail[];
      pagination: ApiResponse["pagination"];
    }>(`/emails/scheduled?page=${page}&limit=${limit}`);
    return res.data;
  },

  getSent: async (page = 1, limit = 20) => {
    const res = await apiClient.get<{
      success: boolean;
      emails: ScheduledEmail[];
      pagination: ApiResponse["pagination"];
    }>(`/emails/sent?page=${page}&limit=${limit}`);
    return res.data;
  },

  getById: async (id: string): Promise<ScheduledEmail> => {
    const res = await apiClient.get<ApiResponse<ScheduledEmail>>(`/emails/${id}`);
    return res.data.data!;
  },

  schedule: (payload: ScheduleEmailForm) =>
    apiClient
      .post<ApiResponse<ScheduledEmail>>("/emails/schedule", payload)
      .then((r) => r.data),

  bulkSchedule: (payload: BulkScheduleForm) =>
    apiClient
      .post<ApiResponse>("/emails/bulk-schedule", payload)
      .then((r) => r.data),

  search: async (query: string, page = 1) => {
    const res = await apiClient.get<{ success: boolean; data: { results: ScheduledEmail[]; total: number } }>(
      `/emails/search?q=${encodeURIComponent(query)}&page=${page}`
    );
    return res.data.data;
  },
};

// ── Senders ───────────────────────────────────────────────────
export const sendersApi = {
  list: async () => {
    const res = await apiClient.get<ApiResponse<SenderAccount[]>>("/senders");
    return res.data.data ?? [];
  },

  createEthereal: (displayName = "Default Sender") =>
    apiClient
      .post<ApiResponse<SenderAccount & { etherealPassOnce?: string; etherealUser?: string }>>("/senders/ethereal", { displayName })
      .then((r) => r.data.data!),

  remove: (id: string) =>
    apiClient.delete<ApiResponse>(`/senders/${id}`).then((r) => r.data),
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
