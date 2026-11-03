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

const DEFAULT_PRODUCTION_API_BASE_URL = "https://outboxlabs-odvu.onrender.com/api";

const isAbsoluteHttpUrl = (value: string | undefined): value is string =>
  Boolean(value && /^https?:\/\//i.test(value));

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly endpoint?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (isAbsoluteHttpUrl(envUrl)) return envUrl.replace(/\/+$/, "");

  const backendUrl = import.meta.env.VITE_BACKEND_URL?.trim();
  if (isAbsoluteHttpUrl(backendUrl) && !backendUrl.includes("localhost")) {
    return `${backendUrl.replace(/\/+$/, "")}/api`;
  }

  // A relative /api URL only works when the frontend host proxies the API.
  // Use the deployed backend directly so a stale/missing Vercel rewrite cannot
  // turn authentication calls into static-site 404s.
  if (import.meta.env.PROD) return DEFAULT_PRODUCTION_API_BASE_URL;

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
    const status = error.response?.status as number | undefined;
    const endpoint = error.config?.url as string | undefined;
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

    const operation = endpoint?.includes("bulk-schedule")
      ? "Bulk scheduling"
      : endpoint?.includes("/emails/schedule")
        ? "Email scheduling"
        : "Request";
    const statusText = status ? ` (HTTP ${status})` : "";
    const endpointText = endpoint ? ` at ${endpoint}` : "";
    const guidance =
      status && status >= 500
        ? " The server did not confirm the operation; check Scheduled before retrying to avoid duplicates."
        : "";

    return Promise.reject(
      new ApiRequestError(
        `${operation} failed${statusText}${endpointText}: ${message}.${guidance}`,
        status,
        endpoint,
      )
    );
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
    return `${getApiBaseUrl()}/auth/google`;
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

  connectUrl: () => `${getApiBaseUrl()}/slack/connect`,

  disconnect: () =>
    apiClient.delete<ApiResponse>("/slack/disconnect").then((r) => r.data),
};
