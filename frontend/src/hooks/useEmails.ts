// ─────────────────────────────────────────────────────────────
//  hooks/useEmails.ts
//  TanStack Query hooks for email data fetching.
//  Pattern: custom hooks encapsulate query logic → components stay clean.
// ─────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { emailsApi } from "../services/api";
import type { BulkScheduleForm, ScheduleEmailForm } from "../types";
import toast from "react-hot-toast";

// ── Query Keys (centralised to avoid typos) ───────────────────
export const emailKeys = {
  all: ["emails"] as const,
  scheduled: (page: number) => ["emails", "scheduled", page] as const,
  sent:       (page: number) => ["emails", "sent", page] as const,
  detail:     (id: string)   => ["emails", "detail", id] as const,
  search:     (q: string)    => ["emails", "search", q] as const,
};

// ── Hooks ──────────────────────────────────────────────────────
export function useScheduledEmails(page = 1) {
  return useQuery({
    queryKey: emailKeys.scheduled(page),
    queryFn: () => emailsApi.getScheduled(page),
    placeholderData: (prev) => prev, // keep previous data while loading next page
  });
}

export function useSentEmails(page = 1) {
  return useQuery({
    queryKey: emailKeys.sent(page),
    queryFn: () => emailsApi.getSent(page),
    placeholderData: (prev) => prev,
  });
}

export function useEmailDetail(id: string) {
  return useQuery({
    queryKey: emailKeys.detail(id),
    queryFn: () => emailsApi.getById(id),
    enabled: !!id,
  });
}

export function useSearchEmails(query: string) {
  return useQuery({
    queryKey: emailKeys.search(query),
    queryFn: () => emailsApi.search(query),
    enabled: query.length > 2,
  });
}

export function useScheduleEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ScheduleEmailForm) => emailsApi.schedule(payload),
    onSuccess: () => {
      toast.success("Email scheduled!");
      qc.invalidateQueries({ queryKey: emailKeys.all });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useBulkSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BulkScheduleForm) => emailsApi.bulkSchedule(payload),
    onSuccess: (data) => {
      toast.success(`Campaign scheduled! ${data.message ?? ""}`);
      qc.invalidateQueries({ queryKey: emailKeys.all });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

