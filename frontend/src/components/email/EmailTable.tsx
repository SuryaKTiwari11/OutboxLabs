// ─────────────────────────────────────────────────────────────
//  components/email/EmailTable.tsx
//  Reusable table for scheduled + sent emails.
// ─────────────────────────────────────────────────────────────

import { format } from "date-fns";
import { ExternalLink, RefreshCcw } from "lucide-react";
import { StatusBadge } from "../ui/Badge";
import { TableRowSkeleton } from "../ui/Skeleton";
import { Pagination } from "../ui/Pagination";
import { Button } from "../ui/Button";
import type { ScheduledEmail } from "../../types";
import type { Pagination as PaginationType } from "../../types";

interface EmailTableProps {
  emails:      ScheduledEmail[];
  isLoading:   boolean;
  isFetching:  boolean;
  pagination?: PaginationType;
  page:        number;
  onPageChange: (page: number) => void;
  onRefresh:   () => void;
  showSentAt?: boolean; // true for Sent tab, false for Scheduled tab
  emptyMessage?: string;
}

export function EmailTable({
  emails,
  isLoading,
  isFetching,
  pagination,
  page,
  onPageChange,
  onRefresh,
  showSentAt = false,
  emptyMessage = "No emails found.",
}: EmailTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Table header toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <p className="text-sm text-slate-600">
          {pagination
            ? `${pagination.total} email${pagination.total !== 1 ? "s" : ""} total`
            : "Loading…"}
        </p>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isFetching}>
          <RefreshCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Recipient</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Sender</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {showSentAt ? "Sent At" : "Scheduled At"}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              {showSentAt && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Preview</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={showSentAt ? 6 : 5} />
                ))
              : emails.length === 0
              ? (
                <tr>
                  <td colSpan={showSentAt ? 6 : 5} className="px-4 py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-4xl">📭</span>
                      <span className="text-sm">{emptyMessage}</span>
                    </div>
                  </td>
                </tr>
              )
              : emails.map((email) => (
                <tr key={email.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-700 font-mono text-xs">{email.recipient}</td>
                  <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{email.subject}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{email.sender?.fromEmail ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {showSentAt
                      ? email.sentAt
                        ? format(new Date(email.sentAt), "MMM d, yyyy HH:mm")
                        : "—"
                      : format(new Date(email.scheduledAt), "MMM d, yyyy HH:mm")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={email.status} />
                  </td>
                  {showSentAt && (
                    <td className="px-4 py-3">
                      {email.etherealPreviewUrl ? (
                        <a
                          href={email.etherealPreviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-xs"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}

