// ─────────────────────────────────────────────────────────────
//  pages/DashboardPage.tsx
//  Main dashboard with Scheduled / Sent email tabs,
//  Compose button, Search, and Slack connect.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, LogOut, Mail, Slack as SlackIcon } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { useAuth } from "../contexts/AuthContext";
import { useScheduledEmails, useSentEmails } from "../hooks/useEmails";
import { EmailTable } from "../components/email/EmailTable";
import { ComposeModal } from "../components/email/ComposeModal";
import { Button } from "../components/ui/Button";
import { slackApi } from "../services/api";

type Tab = "scheduled" | "sent";

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState<Tab>("scheduled");
  const [composeOpen, setComposeOpen] = useState(false);
  const [scheduledPage, setScheduledPage] = useState(1);
  const [sentPage, setSentPage] = useState(1);

  // Show slack connect toast from callback
  const slackResult = searchParams.get("slack");
  if (slackResult === "connected") toast.success("Slack connected!");
  if (slackResult === "denied")    toast("Slack connection cancelled");
  if (slackResult === "error")     toast.error("Slack connection failed");

  // Data queries
  const {
    data: scheduledData,
    isLoading: scheduledLoading,
    isFetching: scheduledFetching,
    refetch: refetchScheduled,
  } = useScheduledEmails(scheduledPage);

  const {
    data: sentData,
    isLoading: sentLoading,
    isFetching: sentFetching,
    refetch: refetchSent,
  } = useSentEmails(sentPage);

  const { data: slackStatus, refetch: refetchSlack } = useQuery({
    queryKey: ["slack", "status"],
    queryFn: slackApi.getStatus,
  });

  const disconnectSlack = useMutation({
    mutationFn: slackApi.disconnect,
    onSuccess: () => {
      toast.success("Slack disconnected");
      refetchSlack();
    },
  });

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ───────────────────────────────────────────── */}
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
              {/* Slack connect */}
              {slackStatus?.connected ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full border border-green-200">
                    <SlackIcon className="h-3.5 w-3.5" />
                    {slackStatus.teamName ?? "Slack"} connected
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnectSlack.mutate()}
                    isLoading={disconnectSlack.isPending}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <a href="/api/slack/connect">
                  <Button variant="secondary" size="sm">
                    <SlackIcon className="h-4 w-4" />
                    Connect Slack
                  </Button>
                </a>
              )}

              {/* User */}
              <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-8 w-8 rounded-full object-cover"
                  />
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

      {/* ── Main ─────────────────────────────────────────────── */}
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

        {/* Tabs */}
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

        {/* Tab Content */}
        {tab === "scheduled" ? (
          <EmailTable
            emails={scheduledData?.emails ?? []}
            isLoading={scheduledLoading}
            isFetching={scheduledFetching}
            pagination={scheduledData?.pagination}
            page={scheduledPage}
            onPageChange={setScheduledPage}
            onRefresh={() => refetchScheduled()}
            showSentAt={false}
            emptyMessage="No scheduled emails. Click 'Compose New Email' to get started."
          />
        ) : (
          <EmailTable
            emails={sentData?.emails ?? []}
            isLoading={sentLoading}
            isFetching={sentFetching}
            pagination={sentData?.pagination}
            page={sentPage}
            onPageChange={setSentPage}
            onRefresh={() => refetchSent()}
            showSentAt={true}
            emptyMessage="No sent emails yet."
          />
        )}
      </main>

      {/* Compose Modal */}
      <ComposeModal isOpen={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}

