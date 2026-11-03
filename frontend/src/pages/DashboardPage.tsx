// ─────────────────────────────────────────────────────────────
//  pages/DashboardPage.tsx
//  SCREEN 2 - INBOX (/) with Scheduled / Sent tabs
// ─────────────────────────────────────────────────────────────

import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  Send,
  Search,
  Filter,
  RotateCw,
  Star,
  ChevronDown,
  LogOut,
  LogIn,
  User as UserIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import { useScheduledEmails, useSentEmails } from "../hooks/useEmails";

type Tab = "scheduled" | "sent";

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("scheduled");
  const [searchQuery, setSearchQuery] = useState("");
  const [starredMap, setStarredMap] = useState<Record<string, boolean>>({});
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Display user info from real authenticated user only
  const displayName = user?.name ?? "";
  const displayEmail = user?.email ?? "";
  const displayAvatar = user?.avatarUrl ?? "";

  // ── Queries ──────────────────────────────────────────────────
  const {
    data: scheduledData,
    refetch: refetchScheduled,
    isFetching: scheduledFetching,
  } = useScheduledEmails(1);

  const {
    data: sentData,
    refetch: refetchSent,
    isFetching: sentFetching,
  } = useSentEmails(1);

  const isRefreshing = scheduledFetching || sentFetching;

  const handleRefresh = () => {
    if (tab === "scheduled") refetchScheduled();
    else refetchSent();
  };

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    await logout();
    toast.success("Logged out successfully");
  };

  const scheduledList = scheduledData?.emails ?? [];
  const sentList = sentData?.emails ?? [];

  const currentList = tab === "scheduled" ? scheduledList : sentList;

  // Filter list by searchQuery
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return currentList;
    const q = searchQuery.toLowerCase();
    return currentList.filter(
      (email) =>
        email.recipient.toLowerCase().includes(q) ||
        email.subject.toLowerCase().includes(q) ||
        (email.body && email.body.toLowerCase().includes(q))
    );
  }, [currentList, searchQuery]);

  const toggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setStarredMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="min-h-screen w-full bg-white flex font-sans overflow-x-hidden">
      {/* =================================================================
          SIDEBAR (260px wide, content width 236px, left offset 8px)
          ================================================================= */}
      <aside className="w-[260px] h-screen flex-shrink-0 flex flex-col pl-[8px] pr-[16px] pt-[20px] select-none">
        {/* 1. Logo "ONB": pixel/8-bit wordmark, ~74x30px, black at x=20px y=20px */}
        <div className="pl-[12px] mb-[28px] flex items-center">
          <img
            src="/onb-logo.png"
            alt="ONB"
            className="h-[28px] w-auto object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const span = document.createElement("span");
                span.className = "font-pixel font-bold text-[28px] text-[#101828] tracking-wider";
                span.innerText = "ONB";
                parent.appendChild(span);
              }
            }}
          />
        </div>

        {/* 2. User block (top ~58px): 236x56, bg #F4F7F5, radius 10px, padding-left 12px */}
        <div className="relative" ref={userMenuRef}>
          <div
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="w-[236px] h-[56px] bg-[#F4F7F5] rounded-[10px] pl-[12px] pr-[12px] flex items-center justify-between cursor-pointer hover:bg-[#eef2ef] transition-colors mb-[12px]"
          >
            <div className="flex items-center gap-[10px] overflow-hidden">
              <img
                src={displayAvatar}
                alt={displayName}
                onError={(e) => {
                  e.currentTarget.src = "/avatar.png";
                }}
                className="w-[32px] h-[32px] rounded-full object-cover flex-shrink-0 border border-[#E5E7EB]"
              />
              <div className="flex flex-col truncate">
                <span className="text-[14px] font-[400] text-[#101828] leading-tight truncate">
                  {displayName}
                </span>
                <span className="text-[10px] text-[#6A7282] leading-tight truncate">
                  {displayEmail}
                </span>
              </div>
            </div>
            <ChevronDown
              className={`w-[16px] h-[16px] text-[#99A1AF] stroke-[1.5] transition-transform ${
                isUserMenuOpen ? "rotate-180" : ""
              }`}
            />
          </div>

          {/* USER ACCOUNT & LOGOUT DROPDOWN */}
          {isUserMenuOpen && (
            <div
              className="absolute top-[60px] left-0 w-[240px] bg-white rounded-[10px] shadow-xl border border-[#E5E7EB] p-[12px] z-50 flex flex-col animate-in fade-in zoom-in-95 duration-100"
              style={{ boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)" }}
            >
              <div className="flex items-center gap-[10px] pb-[10px] border-b border-[#F1F2F4]">
                <img
                  src={displayAvatar}
                  alt={displayName}
                  className="w-[36px] h-[36px] rounded-full object-cover border border-[#E5E7EB]"
                />
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[13px] font-[600] text-[#101828] truncate">
                    {displayName}
                  </span>
                  <span className="text-[11px] text-[#6A7282] truncate">
                    {displayEmail}
                  </span>
                  {isAuthenticated ? (
                    <span className="text-[10px] text-[#00A63E] font-[500] mt-[1px]">
                      ● Signed in
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#CA3500] font-[500] mt-[1px]">
                      ● Guest preview
                    </span>
                  )}
                </div>
              </div>

              {/* Menu options */}
              <div className="pt-[8px] flex flex-col gap-[2px]">
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full h-[36px] px-[10px] rounded-[6px] text-left text-[13px] text-red-600 hover:bg-red-50 font-[500] transition-colors flex items-center gap-[8px]"
                  >
                    <LogOut className="w-[15px] h-[15px]" />
                    <span>Log Out</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        navigate("/login");
                      }}
                      className="w-full h-[36px] px-[10px] rounded-[6px] text-left text-[13px] text-[#00A63E] hover:bg-[#E5F6EC] font-[500] transition-colors flex items-center gap-[8px]"
                    >
                      <LogIn className="w-[15px] h-[15px]" />
                      <span>Log In to Account</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full h-[36px] px-[10px] rounded-[6px] text-left text-[13px] text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-[8px]"
                    >
                      <UserIcon className="w-[15px] h-[15px]" />
                      <span>Switch Account</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3. Compose button (12px below): 236x34, transparent, 1px #00A63E border, pill, text "Compose" 14px weight 500 #00A63E */}
        <button
          onClick={() => navigate("/compose")}
          className="w-[236px] h-[34px] rounded-full border border-[#00A63E] bg-transparent text-[#00A63E] text-[14px] font-[500] hover:bg-[#E5F6EC] transition-colors flex items-center justify-center mb-[20px]"
        >
          Compose
        </button>

        {/* 4. Section label "CORE": 10px, uppercase, letter-spacing ~0.5px, #B6B6B6, indented 16px from block's left */}
        <div className="pl-[16px] text-[10px] uppercase font-[500] tracking-[0.5px] text-[#B6B6B6] mb-[8px]">
          CORE
        </div>

        {/* 5. Nav items: each 236x36, radius 10px, gap 2px */}
        <nav className="flex flex-col gap-[2px] w-[236px]">
          {/* Scheduled Nav */}
          <button
            onClick={() => setTab("scheduled")}
            className={`w-[236px] h-[36px] rounded-[10px] flex items-center justify-between pl-[16px] pr-[20px] transition-colors ${
              tab === "scheduled"
                ? "bg-[#E5F6EC] text-[#101828] font-[600]"
                : "bg-transparent text-[#101828] font-[400] hover:bg-[#F4F7F5]"
            }`}
          >
            <div className="flex items-center gap-[12px]">
              <Clock className="w-[16px] h-[16px] stroke-[1.5] text-[#101828]" />
              <span className="text-[14px]">Scheduled</span>
            </div>
            <span className="text-[12px] text-[#6A7282] font-[400]">
              {scheduledData?.pagination?.total ?? 0}
            </span>
          </button>

          {/* Sent Nav */}
          <button
            onClick={() => setTab("sent")}
            className={`w-[236px] h-[36px] rounded-[10px] flex items-center justify-between pl-[16px] pr-[20px] transition-colors ${
              tab === "sent"
                ? "bg-[#E5F6EC] text-[#101828] font-[600]"
                : "bg-transparent text-[#101828] font-[400] hover:bg-[#F4F7F5]"
            }`}
          >
            <div className="flex items-center gap-[12px]">
              <Send className="w-[16px] h-[16px] stroke-[1.5] text-[#101828]" />
              <span className="text-[14px]">Sent</span>
            </div>
            <span className="text-[12px] text-[#6A7282] font-[400]">
              {sentData?.pagination?.total ?? 0}
            </span>
          </button>
        </nav>
      </aside>

      {/* =================================================================
          MAIN CONTENT AREA (starts 16px after sidebar, ends 16px from right edge)
          Total list width = 1148px
          ================================================================= */}
      <main className="flex-1 flex flex-col pt-[20px] pl-[16px] pr-[16px] max-w-[1180px]">
        {/* MAIN TOOLBAR */}
        <div className="flex items-center h-[38px] mb-[16px]">
          {/* Search bar: 672x38 pill, bg #F4F7F5, no border */}
          <div className="w-[672px] h-[38px] bg-[#F4F7F5] rounded-full flex items-center pl-[14px] pr-[16px]">
            <Search className="w-[16px] h-[16px] text-[#99A1AF] stroke-[1.5] flex-shrink-0" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-[14px] text-[#101828] placeholder-[#99A1AF] outline-none ml-[8px]"
            />
          </div>

          {/* Filter icon: 32px hit target, center sits ~26px right of search bar */}
          <div className="ml-[18px]">
            <button
              type="button"
              className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[#99A1AF] hover:text-[#101828] transition-colors"
              title="Filter"
            >
              <Filter className="w-[16px] h-[16px] stroke-[1.5]" />
            </button>
          </div>

          {/* Refresh icon: 32px hit target, center sits ~42px after filter */}
          <div className="ml-[10px]">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[#99A1AF] hover:text-[#101828] transition-colors"
              title="Refresh"
            >
              <RotateCw
                className={`w-[16px] h-[16px] stroke-[1.5] ${
                  isRefreshing ? "animate-spin text-[#00A63E]" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* EMAIL LIST: 1148px wide */}
        <div className="w-[1148px] flex flex-col">
          {filteredList.length === 0 ? (
            <div className="w-[1148px] py-[64px] flex flex-col items-center justify-center text-center">
              <div className="w-[48px] h-[48px] rounded-full bg-[#F4F7F5] flex items-center justify-center text-[#99A1AF] mb-[12px]">
                {tab === "scheduled" ? (
                  <Clock className="w-[24px] h-[24px]" />
                ) : (
                  <Send className="w-[24px] h-[24px]" />
                )}
              </div>
              <span className="text-[15px] font-[500] text-[#101828]">
                {tab === "scheduled"
                  ? "No scheduled emails found"
                  : "No sent emails yet"}
              </span>
              <span className="text-[13px] text-[#99A1AF] mt-[4px]">
                {tab === "scheduled"
                  ? "Click 'Compose' above to schedule your first campaign."
                  : "Emails that are sent will appear in this list."}
              </span>
            </div>
          ) : (
            filteredList.map((email) => {
              const isStarred = starredMap[email.id] || false;
              let scheduledTime = email.scheduledAt;
              try {
                const d = new Date(email.scheduledAt);
                if (!isNaN(d.getTime())) {
                  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                  let hr = d.getHours();
                  const ampm = hr >= 12 ? "PM" : "AM";
                  hr = hr % 12 || 12;
                  const min = String(d.getMinutes()).padStart(2, "0");
                  const sec = String(d.getSeconds()).padStart(2, "0");
                  scheduledTime = `${days[d.getDay()]} ${hr}:${min}:${sec} ${ampm}`;
                }
              } catch {}

            return (
              <div
                key={email.id}
                onClick={() => navigate(`/email/${email.id}`)}
                className="w-[1148px] h-[56px] border-b border-[#F8F9FA] px-[24px] flex items-center justify-between cursor-pointer hover:bg-[#F9FAFB] transition-colors group"
              >
                {/* Left block: Column 1 + Column 2 */}
                <div className="flex items-center flex-1 overflow-hidden">
                  {/* Column 1: "To: John Smith" 14px weight 500 #101828, width 232px from row's left */}
                  <div className="w-[208px] flex-shrink-0 text-[14px] font-[500] text-[#101828] truncate pr-[12px]">
                    To: {email.recipient}
                  </div>

                  {/* Column 2: badge, then subject (weight 500), then " - " + preview (400 #99A1AF) */}
                  <div className="flex items-center flex-1 overflow-hidden">
                    {/* Badge */}
                    {tab === "scheduled" ? (
                      /* Scheduled badge: height 24px, padding 0 10px, pill, bg #FFEDD4, 1px orange border, clock 12px + text 12-13px #CA3500 */
                      <div className="h-[24px] px-[10px] rounded-full bg-[#FFEDD4] border border-[#FFD6A7] flex items-center gap-[4px] flex-shrink-0 mr-[5px]">
                        <Clock className="w-[12px] h-[12px] text-[#CA3500] stroke-[1.5]" />
                        <span className="text-[12px] font-[500] text-[#CA3500] leading-none">
                          {scheduledTime}
                        </span>
                      </div>
                    ) : (
                      /* Sent badge: height 24px, padding 0 12px, pill, bg #F3F4F6, no border, text "Sent" 12-13px weight 500 #4A5565 */
                      <div className="h-[24px] px-[12px] rounded-full bg-[#F3F4F6] flex items-center justify-center flex-shrink-0 mr-[5px]">
                        <span className="text-[12px] font-[500] text-[#4A5565] leading-none">
                          Sent
                        </span>
                      </div>
                    )}

                    {/* Subject + Preview */}
                    <div className="flex items-baseline truncate text-[14px] ml-[2px]">
                      <span className="font-[500] text-[#101828] flex-shrink-0">
                        {email.subject}
                      </span>
                      <span className="text-[#99A1AF] font-[400] truncate ml-[4px]">
                        - {email.body || "No preview available"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Star outline icon at far right (padding-right 24px), 16-18px, #D1D5DC */}
                <button
                  type="button"
                  onClick={(e) => toggleStar(e, email.id)}
                  className="w-[24px] h-[24px] flex items-center justify-center flex-shrink-0 ml-[16px] text-[#D1D5DC] hover:text-[#FDC700] transition-colors"
                >
                  <Star
                    className={`w-[16px] h-[16px] stroke-[1.5] ${
                      isStarred ? "fill-[#FDC700] text-[#FDC700]" : ""
                    }`}
                  />
                </button>
              </div>
            );
          })
        )}
        </div>
      </main>
    </div>
  );
}
