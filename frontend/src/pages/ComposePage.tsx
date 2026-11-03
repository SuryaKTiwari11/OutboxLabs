// ─────────────────────────────────────────────────────────────
//  pages/ComposePage.tsx
//  SCREEN 4 - COMPOSE (/compose) [no sidebar]
//  Features:
//  - Google-style "+N" expandable recipient popover & chip manager
//  - CSV/TXT recipient list upload
//  - "From" sender account dropdown
//  - Interactive rich-text editor with functional formatting toolbar
//  - Attachments with preview and removal
//  - "Send Later" popover with date picker & quick presets
//  - Full API integration with safe future-date validation
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Paperclip,
  Clock,
  ChevronDown,
  Upload,
  X,
  Undo2,
  Redo2,
  ChevronsUpDown,
  Bold,
  Italic,
  Underline,
  ListOrdered,
  List,
  Indent,
  Outdent,
  Quote,
  AlignLeft,
  Strikethrough,
  Trash2,
  Search,
} from "lucide-react";
import Papa from "papaparse";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import { emailsApi, sendersApi } from "../services/api";
import { DatePickerPopover } from "../components/ui/DatePickerPopover";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ComposePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const recipientListRef = useRef<HTMLDivElement>(null);

  // ── Sender Accounts State ─────────────────────────────────────
  const [senders, setSenders] = useState<Array<{ id: string; fromEmail: string; displayName: string }>>([]);
  const [selectedSenderId, setSelectedSenderId] = useState("");
  const [isFromDropdownOpen, setIsFromDropdownOpen] = useState(false);

  // Fetch real senders if available or synchronize user
  useEffect(() => {
    if (user?.email) {
      setSenders((prev) => [
        { id: "user", fromEmail: user.email, displayName: user.name || user.email },
        ...prev.filter((s) => s.fromEmail !== user.email),
      ]);
      setSelectedSenderId((current) => current || "user");
    }
    sendersApi.list().then((list) => {
      if (list && list.length > 0) {
        setSenders(list.map((s) => ({ id: s.id, fromEmail: s.fromEmail, displayName: s.displayName })));
        setSelectedSenderId(list[0].id);
      }
    }).catch(() => {});
  }, [user]);

  const currentSender = senders.find((s) => s.id === selectedSenderId) ?? senders[0];

  // ── Recipient State ───────────────────────────────────────────
  const [recipients, setRecipients] = useState<string[]>([]);
  const [typedRecipient, setTypedRecipient] = useState("");
  const [isRecipientListOpen, setIsRecipientListOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");

  // ── Form State ───────────────────────────────────────────────
  const [subject, setSubject] = useState("");
  const [delayBetween, setDelayBetween] = useState("");
  const [hourlyLimit, setHourlyLimit] = useState("");
  const [editorHtml, setEditorHtml] = useState("");

  // ── Attachments ──────────────────────────────────────────────
  const [attachments, setAttachments] = useState<
    Array<{ name: string; size: string; preview: string }>
  >([]);

  // ── Schedule Popover State ───────────────────────────────────
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [popoverInputDate, setPopoverInputDate] = useState("");
  const [selectedQuickOption, setSelectedQuickOption] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isScheduled = !!scheduledDate;
  const hasAttachment = attachments.length > 0;

  // Close popovers on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsPopoverOpen(false);
      }
      if (recipientListRef.current && !recipientListRef.current.contains(e.target as Node)) {
        setIsRecipientListOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Recipient Handlers ───────────────────────────────────────
  const handleAddRecipient = (emailToAdd: string) => {
    const trimmed = emailToAdd.trim().toLowerCase();
    if (!trimmed) return;
    if (EMAIL_REGEX.test(trimmed)) {
      if (!recipients.includes(trimmed)) {
        setRecipients((prev) => [...prev, trimmed]);
        setTypedRecipient("");
      } else {
        toast("Recipient already added", { icon: "ℹ️" });
      }
    } else {
      toast.error("Please enter a valid email address");
    }
  };

  const handleKeyDownRecipient = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      handleAddRecipient(typedRecipient);
    } else if (e.key === "Backspace" && !typedRecipient && recipients.length > 0) {
      setRecipients((prev) => prev.slice(0, -1));
    }
  };

  const handleRemoveRecipient = (emailToRemove: string) => {
    setRecipients((prev) => prev.filter((e) => e !== emailToRemove));
  };

  const handleClearAllRecipients = () => {
    setRecipients([]);
    setIsRecipientListOpen(false);
    toast("All recipients removed");
  };

  // ── CSV Upload ───────────────────────────────────────────────
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const found = new Set<string>(recipients);
        const emailCols = ["email", "Email", "EMAIL", "recipient", "Recipient"];

        result.data.forEach((row) => {
          for (const col of emailCols) {
            const val = row[col]?.trim();
            if (val && EMAIL_REGEX.test(val)) {
              found.add(val.toLowerCase());
            }
          }
        });

        if (found.size === recipients.length) {
          const raw = result.data.map((r) => Object.values(r).join(",")).join("\n");
          raw.split(/[\r\n,;]+/).forEach((t) => {
            const tr = t.trim().toLowerCase();
            if (EMAIL_REGEX.test(tr)) found.add(tr);
          });
        }

        const updated = Array.from(found);
        setRecipients(updated);
        toast.success(`Imported ${updated.length} recipients successfully!`);
      },
    });
    // Reset file input
    e.target.value = "";
  };

  // ── Attachment handling ──────────────────────────────────────
  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAtts = Array.from(files).map((f) => ({
      name: f.name,
      size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
      preview: URL.createObjectURL(f),
    }));
    setAttachments((prev) => [...prev, ...newAtts]);
    toast.success(`${files.length} attachment(s) added`);
    e.target.value = "";
  };

  // ── Rich Text Toolbar Commands ───────────────────────────────
  const formatDoc = (cmd: string, val: string | undefined = undefined) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      setEditorHtml(editorRef.current.innerHTML);
      editorRef.current.focus();
    }
  };

  // ── Schedule Popover Helpers ─────────────────────────────────
  const quickOptions = [
    { label: "Tomorrow", offsetHours: 24 },
    { label: "Tomorrow, 10:00 AM", setTime: 10 },
    { label: "Tomorrow, 11:00 AM", setTime: 11 },
    { label: "Tomorrow, 3:00 PM", setTime: 15 },
  ];

  const handleSelectQuickOption = (opt: (typeof quickOptions)[0]) => {
    setSelectedQuickOption(opt.label);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (opt.setTime !== undefined) {
      d.setHours(opt.setTime, 0, 0, 0);
    } else {
      d.setHours(9, 0, 0, 0);
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setPopoverInputDate(formatted);
  };

  const handlePopoverDone = () => {
    if (!popoverInputDate && !selectedQuickOption) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      setScheduledDate(d.toISOString());
    } else if (popoverInputDate) {
      const d = new Date(popoverInputDate);
      if (isNaN(d.getTime())) {
        toast.error("Please pick a valid date & time");
        return;
      }
      setScheduledDate(d.toISOString());
    }
    setIsPopoverOpen(false);
    toast.success("Schedule updated: Send Later enabled");
  };

  const handlePopoverCancel = () => {
    setIsPopoverOpen(false);
  };

  // ── Submit / Send ─────────────────────────────────────────────
  const handleSubmitSend = async () => {
    if (recipients.length === 0) {
      toast.error("Please add at least one recipient");
      return;
    }
    if (!selectedSenderId) {
      toast.error("Please select a sender account");
      return;
    }

    try {
      setIsSubmitting(true);

      // Safe future start date (strictly in future to satisfy backend check)
      let effectiveStartAt = scheduledDate;
      if (!effectiveStartAt) {
        effectiveStartAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      }

      const delayMs = parseInt(delayBetween) ? parseInt(delayBetween) * 1000 : 2000;
      const hourly = parseInt(hourlyLimit) ? parseInt(hourlyLimit) : 200;

      const plainBody = editorRef.current?.innerText || editorHtml || "Hello from ReachInbox";

      if (recipients.length === 1) {
        await emailsApi.schedule({
          recipientEmail: recipients[0],
          subject: subject || "No Subject",
          body: plainBody,
          scheduledAt: effectiveStartAt,
          senderId: selectedSenderId,
        });
      } else {
        await emailsApi.bulkSchedule({
          recipients,
          subject: subject || "No Subject",
          body: plainBody,
          startAt: effectiveStartAt,
          delayBetweenMs: delayMs,
          hourlyLimit: hourly,
          senderId: selectedSenderId,
          campaignName: `Campaign ${new Date().toLocaleDateString()}`,
        });
      }

      toast.success(
        isScheduled ? "Emails scheduled successfully!" : "Emails sent successfully!"
      );
      navigate("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to schedule emails");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredRecipients = recipients.filter((r) =>
    r.toLowerCase().includes(recipientSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen w-full bg-white flex flex-col font-sans relative">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={handleCsvUpload}
      />
      <input
        ref={attachmentInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx"
        className="hidden"
        multiple
        onChange={handleAttachmentUpload}
      />

      {/* HEADER (76px tall): back arrow + "Compose New Email" 24px/400 #101828 */}
      <header className="w-full h-[76px] flex items-center justify-between px-[18px] border-b border-[#F8F9FA]">
        <div className="flex items-center gap-[8px]">
          <button
            onClick={() => navigate("/")}
            className="w-[24px] h-[24px] flex items-center justify-center text-[#101828] hover:opacity-80 transition-opacity"
            title="Back to inbox"
          >
            <ArrowLeft className="w-[20px] h-[20px] stroke-[1.5]" />
          </button>
          <h1 className="text-[24px] font-[400] text-[#101828] tracking-[-0.01em] ml-[8px]">
            Compose New Email
          </h1>
        </div>

        {/* Right side (16px right padding): paperclip (20px), clock (20px, 40px center-to-center), 18px gap,
            action button: 100x34 pill, 1px #00A63E border, transparent bg, text 14px weight 500 #00A63E */}
        <div className="flex items-center pr-[16px] relative">
          <div className="flex items-center">
            {/* Paperclip */}
            <div className="relative flex items-center justify-center w-[32px] h-[32px]">
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                className="hover:opacity-80 transition-opacity"
                title="Attach file"
              >
                <Paperclip
                  className={`w-[20px] h-[20px] stroke-[1.5] ${
                    hasAttachment || isScheduled
                      ? "text-[#00A63E]"
                      : "text-[#99A1AF]"
                  }`}
                />
              </button>
              {(hasAttachment || isScheduled) && (
                <span className="absolute -bottom-[2px] right-[2px] w-[12px] h-[12px] rounded-full bg-[#F5F5F5] text-[#6A7282] text-[9px] font-[500] flex items-center justify-center border border-[#E5E7EB]">
                  {attachments.length || 1}
                </span>
              )}
            </div>

            {/* Gap to clock (40px center-to-center) */}
            <div className="w-[8px]" />

            {/* Clock icon */}
            <button
              type="button"
              onClick={() => setIsPopoverOpen(!isPopoverOpen)}
              className="w-[32px] h-[32px] flex items-center justify-center hover:opacity-80 transition-opacity"
              title="Schedule email"
            >
              <Clock
                className={`w-[20px] h-[20px] stroke-[1.5] ${
                  isScheduled ? "text-[#00A63E]" : "text-[#99A1AF]"
                }`}
              />
            </button>
          </div>

          <div className="w-[18px]" />

          {/* Action button */}
          <button
            type="button"
            onClick={handleSubmitSend}
            disabled={isSubmitting}
            className="w-[100px] h-[34px] rounded-full border border-[#00A63E] bg-transparent text-[#00A63E] text-[14px] font-[500] hover:bg-[#E5F6EC] transition-colors flex items-center justify-center disabled:opacity-50"
          >
            {isScheduled || hasAttachment ? "Send Later" : "Send"}
          </button>
        </div>
      </header>

      {/* SEND LATER POPOVER (opens from the clock icon) */}
      {isPopoverOpen && (
        <div
          ref={popoverRef}
          className="absolute top-[76px] right-[16px] w-[320px] h-[365px] bg-white rounded-[8px] p-[16px] flex flex-col justify-between z-50 border border-[#F0F0F0]"
          style={{ boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)" }}
        >
          <div className="flex flex-col">
            <h3 className="text-[16px] font-[500] text-[#101828]">Send Later</h3>

            {/* Date field */}
            <div className="mt-[16px]">
              <DatePickerPopover
                value={popoverInputDate}
                onChange={(iso) => {
                  setPopoverInputDate(iso);
                  setSelectedQuickOption(null);
                }}
              />
            </div>

            {/* Quick options */}
            <div className="mt-[12px] flex flex-col">
              {quickOptions.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => handleSelectQuickOption(opt)}
                  className={`w-full h-[36px] px-[8px] text-left text-[14px] rounded-[6px] transition-colors flex items-center justify-between ${
                    selectedQuickOption === opt.label
                      ? "bg-[#E5F6EC] text-[#00A63E] font-[500]"
                      : "text-[#4A5565] hover:bg-[#F3F4F6]"
                  }`}
                >
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-[24px] pt-[12px]">
            <button
              type="button"
              onClick={handlePopoverCancel}
              className="text-[14px] font-[500] text-[#0A0A0A] hover:opacity-75 transition-opacity"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePopoverDone}
              className="w-[85px] h-[32px] rounded-full border border-[#00A63E] bg-transparent text-[#00A63E] text-[14px] font-[500] hover:bg-[#E5F6EC] transition-colors flex items-center justify-center"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <main className="w-full flex justify-center px-4 md:px-8 pt-5 pb-[60px]">
        <div className="w-full max-w-[1040px] flex flex-col">
          {/* Row "From": chip 222x38, bg #F5F5F5, radius 10px, padding-left 10px, text "oliver.brown@domain.io" 16px #000 */}
          <div className="flex items-center h-[52px] relative">
            <span className="w-[56px] text-[14px] font-[400] text-[#010715]">
              From
            </span>
            <div
              onClick={() => setIsFromDropdownOpen(!isFromDropdownOpen)}
              className="w-[222px] h-[38px] bg-[#F5F5F5] rounded-[10px] pl-[10px] pr-[12px] flex items-center justify-between cursor-pointer hover:bg-[#eeeeee] transition-colors select-none"
            >
              <span className="text-[16px] text-[#000000] truncate font-[400]">
                {currentSender?.fromEmail ?? "Select a sender"}
              </span>
              <ChevronDown className="w-[14px] h-[14px] text-[#99A1AF] stroke-[1.5]" />
            </div>

            {/* Sender Account Switcher Dropdown */}
            {isFromDropdownOpen && (
              <div className="absolute top-[48px] left-[56px] w-[260px] bg-white rounded-[8px] shadow-lg border border-[#E5E7EB] py-[4px] z-40">
                {senders.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedSenderId(s.id);
                      setIsFromDropdownOpen(false);
                      toast(`Sender switched to ${s.fromEmail}`);
                    }}
                    className={`w-full px-[12px] py-[8px] text-left flex flex-col hover:bg-[#F4F7F5] transition-colors ${
                      s.id === selectedSenderId ? "bg-[#E5F6EC]" : ""
                    }`}
                  >
                    <span className="text-[14px] font-[500] text-[#101828]">
                      {s.displayName}
                    </span>
                    <span className="text-[12px] text-[#6A7282]">
                      {s.fromEmail}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Row "To" (pitch ~57px): no box, bottom border 1px #E5E7EB, placeholder "recipient@example.com" 16px #A1A1A1, right: Upload List */}
          <div className="flex items-center min-h-[45px] py-[6px] border-b border-[#E5E7EB] mt-[4px] relative">
            <span className="w-[56px] text-[14px] font-[400] text-[#010715] flex-shrink-0">
              To
            </span>

            <div className="flex-1 flex items-center flex-wrap gap-[4px] pr-[12px]">
              {/* Display first 3 chips */}
              {recipients.slice(0, 3).map((r) => (
                <div
                  key={r}
                  className="h-[26px] px-[10px] rounded-full bg-[#E6F7ED] border border-[#00A63E] flex items-center gap-[4px] group"
                >
                  <span className="text-[14px] text-[#000000] font-[400]">
                    {r}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRecipient(r)}
                    className="text-[#00A63E] hover:text-[#008f35] opacity-0 group-hover:opacity-100 transition-opacity ml-[2px]"
                    title="Remove recipient"
                  >
                    <X className="w-[12px] h-[12px]" />
                  </button>
                </div>
              ))}

              {/* +N chip if more than 3: Clicking opens the Google-style Recipient List Popover */}
              {recipients.length > 3 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsRecipientListOpen(!isRecipientListOpen)}
                    className="h-[26px] px-[8px] rounded-full bg-[#E6F7ED] border border-[#00A63E] flex items-center justify-center cursor-pointer hover:bg-[#d5f3e1] transition-colors"
                    title="Click to view all recipients"
                  >
                    <span className="text-[14px] text-[#000000] font-[400]">
                      +{recipients.length - 3}
                    </span>
                  </button>

                  {/* GOOGLE-STYLE RECIPIENT MANAGER DROPDOWN / POPOVER */}
                  {isRecipientListOpen && (
                    <div
                      ref={recipientListRef}
                      className="absolute top-[34px] left-0 w-[380px] max-h-[420px] bg-white rounded-[10px] border border-[#E5E7EB] shadow-2xl p-[14px] flex flex-col z-50 animate-in fade-in zoom-in-95 duration-150"
                      style={{ boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)" }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between pb-[10px] border-b border-[#E5E7EB]">
                        <div className="flex items-center gap-[6px]">
                          <span className="text-[14px] font-[600] text-[#101828]">
                            Recipients
                          </span>
                          <span className="text-[12px] px-[8px] py-[1px] rounded-full bg-[#E6F7ED] text-[#00A63E] font-[500]">
                            {recipients.length} total
                          </span>
                        </div>
                        <div className="flex items-center gap-[8px]">
                          <button
                            type="button"
                            onClick={handleClearAllRecipients}
                            className="text-[12px] text-red-600 hover:text-red-700 font-[500] transition-colors"
                          >
                            Clear all
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsRecipientListOpen(false)}
                            className="text-[#99A1AF] hover:text-[#101828]"
                          >
                            <X className="w-[16px] h-[16px]" />
                          </button>
                        </div>
                      </div>

                      {/* Search inside recipients */}
                      <div className="my-[10px] relative">
                        <Search className="w-[14px] h-[14px] text-[#99A1AF] absolute left-[10px] top-[10px]" />
                        <input
                          type="text"
                          placeholder="Search recipients..."
                          value={recipientSearch}
                          onChange={(e) => setRecipientSearch(e.target.value)}
                          className="w-full h-[34px] bg-[#F4F7F5] rounded-[6px] pl-[30px] pr-[10px] text-[13px] text-[#101828] placeholder-[#99A1AF] outline-none focus:ring-1 focus:ring-[#00A63E]"
                        />
                      </div>

                      {/* Recipient items list */}
                      <div className="flex-1 overflow-y-auto max-h-[240px] pr-[4px] space-y-[4px]">
                        {filteredRecipients.length === 0 ? (
                          <div className="py-[20px] text-center text-[13px] text-[#6A7282]">
                            No recipients found
                          </div>
                        ) : (
                          filteredRecipients.map((r, idx) => (
                            <div
                              key={r}
                              className="flex items-center justify-between p-[6px_10px] rounded-[6px] hover:bg-[#F4F7F5] group transition-colors"
                            >
                              <div className="flex items-center gap-[8px] overflow-hidden">
                                <div className="w-[22px] h-[22px] rounded-full bg-[#E5F6EC] text-[#00A63E] text-[11px] font-[600] flex items-center justify-center flex-shrink-0">
                                  {idx + 1}
                                </div>
                                <span className="text-[13px] text-[#1E2939] truncate">
                                  {r}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveRecipient(r)}
                                className="text-[#99A1AF] hover:text-red-600 transition-colors opacity-70 group-hover:opacity-100"
                                title="Delete recipient"
                              >
                                <Trash2 className="w-[14px] h-[14px]" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Quick add recipient input */}
                      <div className="mt-[10px] pt-[8px] border-t border-[#E5E7EB] flex items-center gap-[6px]">
                        <input
                          type="email"
                          placeholder="Add email address..."
                          value={typedRecipient}
                          onChange={(e) => setTypedRecipient(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddRecipient(typedRecipient);
                            }
                          }}
                          className="flex-1 h-[32px] px-[8px] border border-[#E5E7EB] rounded-[6px] text-[12px] text-[#101828] placeholder-[#A1A1A1] outline-none focus:border-[#00A63E]"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddRecipient(typedRecipient)}
                          className="h-[32px] px-[12px] rounded-[6px] bg-[#00A63E] text-white text-[12px] font-[500] hover:bg-[#008f35] transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Input for adding additional recipients inline */}
              <input
                type="text"
                placeholder={recipients.length === 0 ? "recipient@example.com" : ""}
                value={typedRecipient}
                onChange={(e) => setTypedRecipient(e.target.value)}
                onKeyDown={handleKeyDownRecipient}
                className="flex-1 min-w-[140px] text-[16px] text-[#101828] placeholder-[#A1A1A1] outline-none bg-transparent"
              />
            </div>

            {/* Upload List (CSV picker) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-[6px] text-[#00A63E] hover:opacity-85 transition-opacity pl-[12px]"
            >
              <Upload className="w-[18px] h-[18px] stroke-[1.5]" />
              <span className="text-[16px] font-[400]">Upload List</span>
            </button>
          </div>

          {/* Row "Subject": same underline style, placeholder "Subject" #A1A1A1 16px */}
          <div className="flex items-center h-[52px] border-b border-[#E5E7EB]">
            <span className="w-[56px] text-[14px] font-[400] text-[#010715]">
              Subject
            </span>
            <input
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 text-[16px] text-[#101828] placeholder-[#A1A1A1] outline-none bg-transparent"
            />
          </div>

          {/* Row (about 54px pitch): "Delay between 2 emails" label, 16px gap, numeric input 70x38 (00 placeholder); 28px gap; "Hourly Limit" */}
          <div className="flex items-center h-[54px] mt-[6px]">
            <span className="text-[14px] font-[400] text-[#010715] mr-[16px]">
              Delay between 2 emails
            </span>
            <input
              type="number"
              placeholder="00"
              value={delayBetween}
              onChange={(e) => setDelayBetween(e.target.value)}
              className="w-[70px] h-[38px] bg-white border border-[#E5E7EB] rounded-[10px] pl-[10px] text-[16px] text-[#101828] placeholder-[#A1A1A1] outline-none focus:ring-1 focus:ring-[#00A63E]"
            />

            <div className="w-[28px]" />

            <span className="text-[14px] font-[400] text-[#010715] mr-[6px]">
              Hourly Limit
            </span>
            <input
              type="number"
              placeholder="00"
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(e.target.value)}
              className="w-[70px] h-[38px] bg-white border border-[#E5E7EB] rounded-[10px] pl-[10px] text-[16px] text-[#101828] placeholder-[#A1A1A1] outline-none focus:ring-1 focus:ring-[#00A63E]"
            />
          </div>

          {/* Editor card (16px below row): 1040px wide, ~475px tall, bg #FAFAFA, radius 16px, padding 16px */}
          <div className="w-[1040px] h-[475px] bg-[#FAFAFA] rounded-[16px] p-[16px] mt-[16px] flex flex-col relative">
            {/* Top: placeholder "Type Your Reply..." 16px #A1A1A1 */}
            <div className="text-[16px] text-[#A1A1A1] mb-[16px] select-none">
              Type Your Reply...
            </div>

            {/* Toolbar pill: 1008px x 40px, bg #FFFFFF, radius 9999px, horizontal padding ~14px */}
            <div className="w-full h-[40px] bg-white rounded-full px-[14px] flex items-center border border-[#F0F0F0] select-none">
              {/* Undo / Redo */}
              <div className="flex items-center gap-[12px]">
                <button
                  type="button"
                  onClick={() => formatDoc("undo")}
                  className="text-[#888888] hover:text-[#101828] transition-colors"
                  title="Undo"
                >
                  <Undo2 className="w-[18px] h-[18px] stroke-[1.5]" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("redo")}
                  className="text-[#888888] hover:text-[#101828] transition-colors"
                  title="Redo"
                >
                  <Redo2 className="w-[18px] h-[18px] stroke-[1.5]" />
                </button>
              </div>

              {/* Divider */}
              <div className="w-[1px] h-[20px] bg-[#E7E7E7] mx-[14px]" />

              {/* Text size (Tт + up/down chevron) */}
              <button
                type="button"
                onClick={() => formatDoc("fontSize", "4")}
                className="flex items-center gap-[4px] cursor-pointer text-[#888888] hover:text-[#101828] transition-colors"
                title="Heading Size"
              >
                <span className="text-[15px] font-[500] leading-none">Tт</span>
                <ChevronsUpDown className="w-[14px] h-[14px] stroke-[1.5]" />
              </button>

              {/* Divider */}
              <div className="w-[1px] h-[20px] bg-[#E7E7E7] mx-[14px]" />

              {/* Bold, Italic, Underline */}
              <div className="flex items-center gap-[14px]">
                <button
                  type="button"
                  onClick={() => formatDoc("bold")}
                  className="text-[#888888] hover:text-[#101828] transition-colors"
                  title="Bold"
                >
                  <Bold className="w-[18px] h-[18px] stroke-[1.5]" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("italic")}
                  className="text-[#888888] hover:text-[#101828] transition-colors"
                  title="Italic"
                >
                  <Italic className="w-[18px] h-[18px] stroke-[1.5]" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("underline")}
                  className="text-[#888888] hover:text-[#101828] transition-colors"
                  title="Underline"
                >
                  <Underline className="w-[18px] h-[18px] stroke-[1.5]" />
                </button>
              </div>

              {/* Divider */}
              <div className="w-[1px] h-[20px] bg-[#E7E7E7] mx-[14px]" />

              {/* Align + up/down chevron */}
              <button
                type="button"
                onClick={() => formatDoc("justifyCenter")}
                className="flex items-center gap-[4px] cursor-pointer text-[#888888] hover:text-[#101828] transition-colors"
                title="Align Center"
              >
                <AlignLeft className="w-[18px] h-[18px] stroke-[1.5]" />
                <ChevronsUpDown className="w-[14px] h-[14px] stroke-[1.5]" />
              </button>

              {/* Divider */}
              <div className="w-[1px] h-[20px] bg-[#E7E7E7] mx-[14px]" />

              {/* Ordered list, Bullet list, Indent, Outdent, Blockquote, Align-left block */}
              <div className="flex items-center gap-[14px]">
                <button
                  type="button"
                  onClick={() => formatDoc("insertOrderedList")}
                  className="text-[#888888] hover:text-[#101828] transition-colors"
                  title="Ordered List"
                >
                  <ListOrdered className="w-[18px] h-[18px] stroke-[1.5]" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("insertUnorderedList")}
                  className="text-[#888888] hover:text-[#101828] transition-colors"
                  title="Bullet List"
                >
                  <List className="w-[18px] h-[18px] stroke-[1.5]" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("indent")}
                  className="text-[#888888] hover:text-[#101828] transition-colors"
                  title="Indent"
                >
                  <Indent className="w-[18px] h-[18px] stroke-[1.5]" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("outdent")}
                  className="text-[#888888] hover:text-[#101828] transition-colors"
                  title="Outdent"
                >
                  <Outdent className="w-[18px] h-[18px] stroke-[1.5]" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("formatBlock", "blockquote")}
                  className="text-[#888888] hover:text-[#101828] transition-colors"
                  title="Quote"
                >
                  <Quote className="w-[18px] h-[18px] stroke-[1.5]" />
                </button>
                <button
                  type="button"
                  onClick={() => formatDoc("justifyLeft")}
                  className="text-[#888888] hover:text-[#101828] transition-colors"
                  title="Align Left"
                >
                  <AlignLeft className="w-[18px] h-[18px] stroke-[1.5]" />
                </button>
              </div>

              {/* Divider */}
              <div className="w-[1px] h-[20px] bg-[#E7E7E7] mx-[14px]" />

              {/* Strikethrough */}
              <button
                type="button"
                onClick={() => formatDoc("strikeThrough")}
                className="text-[#888888] hover:text-[#101828] transition-colors"
                title="Strikethrough"
              >
                <Strikethrough className="w-[18px] h-[18px] stroke-[1.5]" />
              </button>
            </div>

            {/* Editable rich-text div */}
            <div
              ref={editorRef}
              contentEditable
              onInput={() => {
                if (editorRef.current) {
                  setEditorHtml(editorRef.current.innerHTML);
                }
              }}
              data-placeholder="Write your email message here..."
              className="flex-1 w-full mt-[16px] bg-transparent outline-none overflow-y-auto text-[16px] text-[#1E2939] font-sans leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
            />
          </div>

          {/* Attachments below editor (16px gap): card 210x168 with remove button */}
          {attachments.length > 0 && (
            <div className="mt-[16px] flex items-center gap-[18px] flex-wrap">
              {attachments.map((att, index) => (
                <div
                  key={index}
                  className="w-[210px] h-[168px] bg-[#F9FAFB] rounded-[10px] overflow-hidden flex flex-col border border-[#F1F2F4] relative group"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="absolute top-[6px] right-[6px] w-[20px] h-[20px] rounded-full bg-black/60 text-white flex items-center justify-center opacity-80 hover:opacity-100 z-10 transition-opacity"
                      title="Remove attachment"
                  >
                    <X className="w-[12px] h-[12px]" />
                  </button>
                  <div className="w-[210px] h-[117px] overflow-hidden bg-[#e0e0e0]">
                    <img
                      src={att.preview}
                      alt={att.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-[8px_10px] flex flex-col justify-center flex-1">
                    <span className="text-[14px] text-[#1E2939] truncate font-[400]">
                      {att.name}
                    </span>
                    <span className="text-[12px] text-[#6A7282]">{att.size}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
