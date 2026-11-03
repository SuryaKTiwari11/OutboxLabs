// ─────────────────────────────────────────────────────────────
//  pages/EmailDetailPage.tsx
//  SCREEN 3 - EMAIL DETAIL (Loads real email from backend)
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Star,
  Archive,
  Trash2,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { emailsApi } from "../services/api";

export function EmailDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [isStarred, setIsStarred] = useState(false);

  const displayAvatar = user?.avatarUrl || "/avatar.png";
  const displayName = user?.name || "Oliver Brown";

  const { data: email, isLoading, isError } = useQuery({
    queryKey: ["email", id],
    queryFn: () => emailsApi.getById(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-[#00A63E] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (isError || !email) {
    return (
      <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center p-4">
        <h2 className="text-[20px] font-[600] text-[#101828] mb-[8px]">
          Email not found
        </h2>
        <p className="text-[14px] text-[#6A7282] mb-[20px]">
          The email you requested could not be found or has been removed.
        </p>
        <button
          onClick={() => navigate("/")}
          className="px-[16px] h-[36px] rounded-full border border-[#00A63E] text-[#00A63E] text-[14px] font-[500] hover:bg-[#E5F6EC] transition-colors"
        >
          Return to Inbox
        </button>
      </div>
    );
  }

  const senderName = email.sender?.displayName || email.sender?.fromEmail || "Sender";
  const senderInitial = senderName.charAt(0).toUpperCase() || "A";
  const senderEmail = email.sender?.fromEmail || "sender@example.com";

  // Formatted date
  let formattedDate = email.sentAt || email.scheduledAt;
  try {
    const d = new Date(email.sentAt || email.scheduledAt);
    if (!isNaN(d.getTime())) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      let hr = d.getHours();
      const ampm = hr >= 12 ? "PM" : "AM";
      hr = hr % 12 || 12;
      const min = String(d.getMinutes()).padStart(2, "0");
      formattedDate = `${monthNames[d.getMonth()]} ${d.getDate()}, ${hr}:${min} ${ampm}`;
    }
  } catch {}

  return (
    <div className="min-h-screen w-full bg-white flex flex-col font-sans">
      {/* HEADER (76px tall, items vertically centered) */}
      <header className="w-full h-[76px] flex items-center justify-between px-[18px] border-b border-[#F8F9FA]">
        {/* Left: back arrow 24px, 18px from left edge */}
        <div className="flex items-center gap-[8px]">
          <button
            onClick={() => navigate("/")}
            className="w-[24px] h-[24px] flex items-center justify-center text-[#101828] hover:opacity-80 transition-opacity"
            title="Back to inbox"
          >
            <ArrowLeft className="w-[20px] h-[20px] stroke-[1.5]" />
          </button>
          <h1 className="text-[24px] font-[400] text-[#101828] tracking-[-0.01em] ml-[8px]">
            {email.subject}
          </h1>
        </div>

        {/* Right side actions */}
        <div className="flex items-center pr-[16px] gap-[18px]">
          <div className="flex items-center gap-[18px]">
            <button
              onClick={() => setIsStarred(!isStarred)}
              className="text-[#B7BCC7] hover:text-[#99A1AF] transition-colors"
            >
              <Star
                className={`w-[20px] h-[20px] stroke-[1.5] ${
                  isStarred ? "fill-[#FDC700] text-[#FDC700]" : ""
                }`}
              />
            </button>
            <button className="text-[#B7BCC7] hover:text-[#99A1AF] transition-colors">
              <Archive className="w-[20px] h-[20px] stroke-[1.5]" />
            </button>
            <button className="text-[#B7BCC7] hover:text-[#99A1AF] transition-colors">
              <Trash2 className="w-[20px] h-[20px] stroke-[1.5]" />
            </button>
          </div>

          <div className="w-[1px] h-[32px] bg-[#B7BCC7]" />

          {/* User Round avatar */}
          <img
            src={displayAvatar}
            alt={displayName}
            onError={(e) => {
              e.currentTarget.src = "/avatar.png";
            }}
            className="w-[32px] h-[32px] rounded-full object-cover border border-[#E5E7EB]"
          />
        </div>
      </header>

      {/* BODY: centered column 1040px wide */}
      <main className="w-full flex justify-center pt-[24px] pb-[60px]">
        <div className="w-[1040px] flex flex-col">
          {/* Sender row */}
          <div className="flex items-start justify-between w-full">
            <div className="flex items-center gap-[16px]">
              {/* 40px circle bg #00C950, white initial letter */}
              <div className="w-[40px] h-[40px] rounded-full bg-[#00C950] flex items-center justify-center text-white font-[600] text-[16px] flex-shrink-0">
                {senderInitial}
              </div>

              {/* Sender name & email */}
              <div className="flex flex-col">
                <div className="flex items-baseline gap-[8px]">
                  <span className="text-[16px] font-[600] text-[#101828]">
                    {senderName}
                  </span>
                  <span className="text-[14px] text-[#6A7282]">
                    &lt;{senderEmail}&gt;
                  </span>
                </div>
                <div className="flex items-center gap-[4px] mt-[1px]">
                  <span className="text-[14px] text-[#6A7282]">to {email.recipient}</span>
                  <ChevronDown className="w-[12px] h-[12px] text-[#6A7282] stroke-[1.5]" />
                </div>
              </div>
            </div>

            {/* Date and Ethereal preview badge */}
            <div className="flex flex-col items-end gap-[6px]">
              <span className="text-[14px] text-[#6A7282] pt-[2px]">
                {formattedDate}
              </span>
              {email.etherealPreviewUrl && (
                <a
                  href={email.etherealPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[6px] px-[12px] py-[4px] bg-[#E5F6EC] hover:bg-[#d8f0e2] text-[#00A63E] rounded-full text-[12px] font-[600] border border-[#00A63E]/30 transition-colors"
                >
                  <span>View in Ethereal</span>
                  <ExternalLink className="w-[12px] h-[12px]" />
                </a>
              )}
            </div>
          </div>

          {/* Message body indented 56px */}
          <div className="pl-[56px] pt-[24px] flex flex-col text-[16px] leading-[24px] text-[#1E2939] space-y-[20px]">
            {email.body.split("\n\n").map((para, i) => (
              <p key={i} className="whitespace-pre-line">
                {para}
              </p>
            ))}

            {/* If Ethereal preview is available */}
            {email.etherealPreviewUrl && (
              <div className="mt-[16px] p-[12px] bg-[#F4F7F5] rounded-[8px] flex items-center justify-between border border-[#E5E7EB]">
                <div className="flex items-center gap-[8px]">
                  <span className="text-[13px] font-[500] text-[#101828]">
                    SMTP Test Delivery Preview Available
                  </span>
                </div>
                <a
                  href={email.etherealPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-[4px] text-[13px] text-[#00A63E] font-[500] hover:underline"
                >
                  <span>View in Ethereal</span>
                  <ExternalLink className="w-[14px] h-[14px]" />
                </a>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
