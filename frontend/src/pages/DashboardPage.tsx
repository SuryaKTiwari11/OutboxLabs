// =============================================================================
//  pages/DashboardPage.tsx
//  Main dashboard: Scheduled/Sent tabs, Compose, Search, Slack connect,
//  and Sender account management panel.
// =============================================================================

import { useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  LogOut,
  Mail,
  Search,
  X,
  Wifi,
  WifiOff,
  Trash2,
  Server,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { useAuth } from "../contexts/AuthContext";
import { useScheduledEmails, useSentEmails, useSearchEmails } from "../hooks/useEmails";
import { useSenders, useCreateEtherealSender, useDeleteSender } from "../hooks/useSenders";
import { EmailTable } from "../components/email/EmailTable";
import { ComposeModal } from "../components/email/ComposeModal";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import { slackApi } from "../services/api";

type Tab = "scheduled" | "sent";

// Slack logo inline SVG (Lucide doesn't have Slack in older versions)
function SlackLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  );
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ── State ────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>("scheduled");
  const [composeOpen, setComposeOpen] = useState(false);
  const [scheduledPage, setScheduledPage] = useState(1);
  const [sentPage, setSentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showSenders, setShowSenders] = useState(false);

  // ── Slack callback toasts (run once from URL params) ─────────
  const slackResult = searchParams.get("slack");
  if (slackResult === "connected") toast.success("Slack connected!");
  if (slackResult === "denied")    toast("Slack connection cancelled");
  if (slackResult === "error")     toast.error("Slack connection failed");

  // ── Search debounce ──────────────────────────────────────────
  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    // Simple debounce: fire query after user stops typing 400ms
    const timer = setTimeout(() => setDebouncedQuery(val), 400);
    return () => clearTimeout(timer);
  }, []);

  // ── Data queries ─────────────────────────────────────────────
  const {
    data: scheduledData, isLoading: scheduledLoading,
    isFetching: scheduledFetching, refetch: refetchScheduled,
  } = useScheduledEmails(scheduledPage);

  const {
    data: sentData, isLoading: sentLoading,
    isFetching: sentFetching, refetch: refetchSent,
  } = useSentEmails(sentPage);

  const {
    data: searchData, isLoading: searchLoading,
  } = useSearchEmails(debouncedQuery);

  const { data: slackStatus, refetch: refetchSlack } = useQuery({
    queryKey: ["slack", "status"],
    queryFn: slackApi.getStatus,
  });

  // ── Sender hooks ─────────────────────────────────────────────
  const { data: senders = [], isLoading: sendersLoading } = useSenders();
  const createEthereал = useCreateEtherealSender();
  const deleteSender = useDeleteSender();

  const disconnectSlack = useMutation({
    mutationFn: slackApi.disconnect,
    onSuccess: () => { toast.success("Slack disconnected"); refetchSlack(); },
  });

  const handleLogout = async () => { await logout(); navigate("/login"); };

  // ── Determine which emails to display ────────────────────────
  const isSearchActive = debouncedQuery.length > 2;
  const displayEmails = isSearchActive
    ? searchData?.results ?? []
    : tab === "scheduled"
      ? scheduledData?.emails ?? []
      : sentData?.emails ?? [];

  const displayLoading = isSearchActive
    ? searchLoading
    : tab === "scheduled" ? scheduledLoading : sentLoading;

  const displayFetching = isSearchActive
    ? false
    : tab === "scheduled" ? scheduledFetching : sentFetching;

  const displayPagination = isSearchActive
    ? undefined
    : tab === "scheduled" ? scheduledData?.pagination : sentData?.pagination;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                <Mail className="h-5 w-5 text-white" />
              </div>
              <span className="font-semibold text-slate-900">ReachInbox</span>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">

              {/* Slack connect/disconnect */}
              {slackStatus?.connected ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full border border-green-200">
                    <Wifi className="h-3.5 w-3.5" />
                    {slackStatus.teamName ?? "Slack"} connected
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => disconnectSlack.mutate()}
                    isLoading={disconnectSlack.isPending}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <a href="/api/slack/connect">
                  <Button variant="secondary" size="sm">
                    <SlackLogo className="h-4 w-4" />
                    Connect Slack
                  </Button>
                </a>
              )}

              {/* Senders panel toggle */}
              <Button
                variant="secondary" size="sm"
                onClick={() => setShowSenders((s) => !s)}
              >
                <Server className="h-4 w-4" />
                Senders ({senders.length})
              </Button>

              {/* User info */}
              <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name}
                    className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                    {user?.name?.[0]?.toUpperCase() ?? "U"}
                  </div>
                )}
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-slate-900 leading-none">{user?.name}</p>
                  <p className="text-xs text-slate-500 leading-none mt-0.5">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="ml-2 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Sender accounts panel (collapsible) ─────────────────── */}
      {showSenders && (
        <div className="bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">
                Sender Accounts
                <span className="ml-1.5 text-xs text-slate-400 font-normal">
                  (SMTP identities used to send emails)
                </span>
              </h2>
              <Button
                variant="ghost" size="sm"
                onClick={() => createEthereал.mutate("Default Sender")}
                isLoading={createEthereал.isPending}
              >
                <Plus className="h-4 w-4" />
                Add Ethereal Sender
              </Button>
            </div>

            {sendersLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : senders.length === 0 ? (
              <div className="text-center py-6 text-sm text-slate-400">
                <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No sender accounts yet.{" "}
                <button
                  className="text-indigo-600 hover:underline"
                  onClick={() => createEthereал.mutate("Default Sender")}
                >
                  Create an Ethereal test sender
                </button>{" "}
                to get started.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {senders.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {s.displayName}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{s.fromEmail}</p>
                      <p className="text-xs text-slate-400">{s.smtpHost}:{s.smtpPort}</p>
                    </div>
                    <button
                      onClick={() => deleteSender.mutate(s.id)}
                      className="ml-2 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Remove sender"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400 mt-3">
              💡 Ethereal senders auto-generate fake SMTP credentials — great for testing.
              Sent emails appear at{" "}
              <a href="https://ethereal.email" target="_blank" rel="noreferrer"
                className="text-indigo-500 hover:underline">
                ethereal.email
              </a>
            </p>
          </div>
        </div>
      )}

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Page title + Compose button */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Email Scheduler</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Manage your scheduled and sent email campaigns
            </p>
          </div>
          <Button onClick={() => setComposeOpen(true)} size="md">
            <Plus className="h-4 w-4" />
            Compose New Email
          </Button>
        </div>

        {/* ── Search bar ────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search emails by subject, recipient, or body… (min 3 chars)"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-sm border border-slate-200 rounded-lg bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                       placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); setDebouncedQuery(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ── Search indicator ─────────────────────────────────── */}
        {isSearchActive && (
          <p className="text-xs text-slate-500">
            {searchLoading
              ? "Searching…"
              : `Found ${searchData?.total ?? 0} result(s) for "${debouncedQuery}"`}
          </p>
        )}

        {/* ── Tabs (hidden when search active) ─────────────────── */}
        {!isSearchActive && (
          <div className="border-b border-slate-200">
            <nav className="flex gap-1 -mb-px">
              {(["scheduled", "sent"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`
                    px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors
                    ${tab === t
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                    }
                  `}
                >
                  {t === "scheduled" ? "📅 Scheduled Emails" : "✅ Sent Emails"}
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* ── Email table ───────────────────────────────────────── */}
        <EmailTable
          emails={displayEmails}
          isLoading={displayLoading}
          isFetching={displayFetching}
          pagination={displayPagination}
          page={tab === "scheduled" ? scheduledPage : sentPage}
          onPageChange={tab === "scheduled" ? setScheduledPage : setSentPage}
          onRefresh={() => tab === "scheduled" ? refetchScheduled() : refetchSent()}
          showSentAt={tab === "sent" || isSearchActive}
          emptyMessage={
            isSearchActive
              ? `No emails found matching "${debouncedQuery}"`
              : tab === "scheduled"
                ? "No scheduled emails. Click 'Compose New Email' to get started."
                : "No sent emails yet."
          }
        />
      </main>

      {/* Compose Modal */}
      <ComposeModal isOpen={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}
