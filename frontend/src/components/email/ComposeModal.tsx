// ─────────────────────────────────────────────────────────────
//  components/email/ComposeModal.tsx
//  Modal for composing + scheduling an email campaign.
//  Supports CSV/TXT upload, manual entry, recipient review & removal.
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Papa from "papaparse";
import {
  Upload,
  Users,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useBulkSchedule } from "../../hooks/useEmails";
import { useSenders } from "../../hooks/useSenders";

const schema = z.object({
  subject:        z.string().min(1, "Subject is required"),
  body:           z.string().min(1, "Email body is required"),
  startAt:        z.string().min(1, "Start time is required"),
  delayBetweenMs: z.number().min(0).max(3_600_000),
  hourlyLimit:    z.number().int().min(1).max(10000),
  senderId:       z.string().min(1, "Sender is required"),
  campaignName:   z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ComposeModalProps {
  isOpen:  boolean;
  onClose: () => void;
}

interface RecipientParseResult {
  valid:   string[];
  invalid: string[];
  total:   number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ComposeModal({ isOpen, onClose }: ComposeModalProps) {
  const { data: senders = [] } = useSenders();
  const bulkSchedule = useBulkSchedule();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parseResult, setParseResult] = useState<RecipientParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState("");
  const [showRecipientList, setShowRecipientList] = useState(false);

  const getNowDatetimeLocal = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      startAt:        getNowDatetimeLocal(),
      delayBetweenMs: 2000,
      hourlyLimit:    200,
      senderId:       senders[0]?.id ?? "",
    },
  });

  // Automatically select first sender if available
  useEffect(() => {
    if (senders.length > 0) {
      setValue("senderId", senders[0].id);
    }
  }, [senders, setValue]);

  // Parse CSV / TXT file for email addresses
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const validEmails = new Set<string>(parseResult?.valid ?? []);
        const invalidTokens = new Set<string>();

        const emailColumns = ["email", "Email", "EMAIL", "email_address", "EmailAddress", "recipient"];

        result.data.forEach((row) => {
          let foundCol = false;
          for (const col of emailColumns) {
            const val = row[col]?.trim();
            if (val) {
              foundCol = true;
              if (EMAIL_REGEX.test(val)) {
                validEmails.add(val.toLowerCase());
              } else {
                invalidTokens.add(val);
              }
            }
          }

          if (!foundCol) {
            Object.values(row).forEach((val) => {
              const trimmed = val?.trim();
              if (trimmed) {
                if (EMAIL_REGEX.test(trimmed)) {
                  validEmails.add(trimmed.toLowerCase());
                } else if (trimmed.includes("@")) {
                  invalidTokens.add(trimmed);
                }
              }
            });
          }
        });

        // Also handle plain text fallback if header parsing missed plain line lists
        if (validEmails.size === 0) {
          const rawText = result.data.map((r) => Object.values(r).join(",")).join("\n");
          rawText.split(/[\r\n,;]+/).forEach((token) => {
            const t = token.trim();
            if (EMAIL_REGEX.test(t)) {
              validEmails.add(t.toLowerCase());
            } else if (t.includes("@")) {
              invalidTokens.add(t);
            }
          });
        }

        const validList = Array.from(validEmails);
        const invalidList = Array.from(invalidTokens);

        setParseResult({
          valid:   validList,
          invalid: invalidList,
          total:   validList.length + invalidList.length,
        });
      },
    });
  };

  const handleAddManualEmail = () => {
    const tokens = manualEmail
      .split(/[\s,;]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    if (tokens.length === 0) return;

    const currentValid = new Set(parseResult?.valid ?? []);
    const currentInvalid = new Set(parseResult?.invalid ?? []);

    tokens.forEach((t) => {
      if (EMAIL_REGEX.test(t)) {
        currentValid.add(t);
      } else {
        currentInvalid.add(t);
      }
    });

    const validList = Array.from(currentValid);
    const invalidList = Array.from(currentInvalid);

    setParseResult({
      valid:   validList,
      invalid: invalidList,
      total:   validList.length + invalidList.length,
    });
    setManualEmail("");
  };

  const handleRemoveRecipient = (email: string) => {
    if (!parseResult) return;
    const updatedValid = parseResult.valid.filter((e) => e !== email);
    setParseResult({
      ...parseResult,
      valid: updatedValid,
      total: updatedValid.length + parseResult.invalid.length,
    });
  };

  const onSubmit = async (data: FormData) => {
    if (!parseResult || parseResult.valid.length === 0) return;

    const startAtDate = data.startAt ? new Date(data.startAt) : new Date();
    const formattedStartAt = isNaN(startAtDate.getTime())
      ? new Date().toISOString()
      : startAtDate.toISOString();

    await bulkSchedule.mutateAsync({
      ...data,
      startAt: formattedStartAt,
      recipients: parseResult.valid,
    });

    reset();
    setParseResult(null);
    setFileName(null);
    setManualEmail("");
    onClose();
  };

  const handleClose = () => {
    reset();
    setParseResult(null);
    setFileName(null);
    setManualEmail("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Compose Email Campaign" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* Campaign name */}
        <Input
          label="Campaign Name (optional)"
          placeholder="Q4 Outreach"
          {...register("campaignName")}
          error={errors.campaignName?.message}
        />

        {/* Sender selection */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">From (Sender)</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            {...register("senderId")}
          >
            <option value="">Select sender…</option>
            {senders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName} &lt;{s.fromEmail}&gt;
              </option>
            ))}
          </select>
          {errors.senderId && (
            <p className="text-xs text-red-600">{errors.senderId.message}</p>
          )}
          {senders.length === 0 && (
            <p className="text-xs text-amber-600">
              No senders configured. Please add a sender account using the "Senders" panel first.
            </p>
          )}
        </div>

        {/* Subject */}
        <Input
          label="Subject"
          placeholder="Your subject line…"
          {...register("subject")}
          error={errors.subject?.message}
        />

        {/* Body */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">Email Body (HTML)</label>
          <textarea
            rows={5}
            placeholder="<p>Hi there,</p><p>We are reaching out to discuss...</p>"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            {...register("body")}
          />
          {errors.body && <p className="text-xs text-red-600">{errors.body.message}</p>}
        </div>

        {/* Recipients: Manual entry + CSV Upload */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700">Recipients</label>

          {/* Quick manual entry */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add recipient (e.g. user@example.com) or paste comma-separated..."
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddManualEmail();
                }
              }}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Button type="button" variant="secondary" size="sm" onClick={handleAddManualEmail}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {/* CSV File Upload Dropzone */}
          <div
            className="border-2 border-dashed border-slate-300 rounded-lg p-5 text-center cursor-pointer hover:border-indigo-400 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-6 w-6 text-slate-400 mx-auto mb-1.5" />
            <p className="text-sm text-slate-600">
              {fileName ? (
                <span className="font-medium text-indigo-600">{fileName}</span>
              ) : (
                <>Upload a CSV/TXT lead list or <span className="text-indigo-600">browse file</span></>
              )}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Supports CSV headers (email, recipient, etc.) or plain text lists</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Parse result preview & review */}
          {parseResult && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <Users className="h-4 w-4 text-indigo-500" />
                  <span>
                    {parseResult.valid.length} valid recipient{parseResult.valid.length !== 1 ? "s" : ""} detected
                  </span>
                </div>

                {parseResult.valid.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowRecipientList(!showRecipientList)}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    {showRecipientList ? (
                      <>Hide list <ChevronUp className="h-3 w-3" /></>
                    ) : (
                      <>Review list ({parseResult.valid.length}) <ChevronDown className="h-3 w-3" /></>
                    )}
                  </button>
                )}
              </div>

              {parseResult.invalid.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{parseResult.invalid.length} invalid email addresses skipped</span>
                </div>
              )}

              {/* Collapsible / Reviewable recipient badges */}
              {showRecipientList && parseResult.valid.length > 0 && (
                <div className="max-h-36 overflow-y-auto space-y-1 p-2 bg-white rounded border border-slate-200">
                  <div className="flex flex-wrap gap-1.5">
                    {parseResult.valid.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => handleRemoveRecipient(email)}
                          className="text-slate-400 hover:text-red-500"
                          title="Remove recipient"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scheduling config */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            type="datetime-local"
            label="Start Time"
            {...register("startAt")}
            error={errors.startAt?.message}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Delay Between Emails (ms)</label>
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              {...register("delayBetweenMs", { valueAsNumber: true })}
            />
            {errors.delayBetweenMs && (
              <p className="text-xs text-red-600">{errors.delayBetweenMs.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Hourly Limit</label>
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              {...register("hourlyLimit", { valueAsNumber: true })}
            />
            {errors.hourlyLimit && (
              <p className="text-xs text-red-600">{errors.hourlyLimit.message}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={bulkSchedule.isPending}
            disabled={!parseResult || parseResult.valid.length === 0}
          >
            Schedule {parseResult?.valid.length ?? 0} Email{parseResult?.valid.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
