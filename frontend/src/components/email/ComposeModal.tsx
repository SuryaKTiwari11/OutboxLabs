// ─────────────────────────────────────────────────────────────
//  components/email/ComposeModal.tsx
//  Modal for composing + scheduling an email campaign.
//  Supports CSV upload, recipient parsing, and bulk scheduling.
// ─────────────────────────────────────────────────────────────

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Papa from "papaparse";
import { Upload, Users, CheckCircle2, AlertCircle } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useBulkSchedule } from "../../hooks/useEmails";
import { useAuth } from "../../contexts/AuthContext";

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
  const { user } = useAuth();
  const bulkSchedule = useBulkSchedule();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseResult, setParseResult] = useState<RecipientParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      delayBetweenMs: 2000,
      hourlyLimit:    200,
    },
  });

  // Parse CSV / TXT file for email addresses
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const emails = new Set<string>();

        // Try common column names for email fields
        const emailColumns = ["email", "Email", "EMAIL", "email_address", "EmailAddress"];

        result.data.forEach((row) => {
          for (const col of emailColumns) {
            const val = row[col]?.trim();
            if (val && EMAIL_REGEX.test(val)) {
              emails.add(val.toLowerCase());
            }
          }
          // Fallback: try all columns
          if (emails.size === 0) {
            Object.values(row).forEach((val) => {
              const trimmed = val?.trim();
              if (trimmed && EMAIL_REGEX.test(trimmed)) {
                emails.add(trimmed.toLowerCase());
              }
            });
          }
        });

        // Also handle plain text files (one email per line)
        const rawText = result.data.map((r) => Object.values(r).join(",")).join("\n");
        rawText.split(/[\s,;]+/).forEach((token) => {
          const t = token.trim();
          if (EMAIL_REGEX.test(t)) emails.add(t.toLowerCase());
        });

        const validList = Array.from(emails);
        // For demo: detect "invalid" as anything that didn't match
        const allTokens = rawText.split(/[\s,;]+/).filter((t) => t.length > 3);
        const invalidCount = allTokens.filter(
          (t) => !EMAIL_REGEX.test(t.trim()) && t.includes("@")
        ).length;

        setParseResult({
          valid:   validList,
          invalid: [],
          total:   validList.length + invalidCount,
        });
      },
    });
  };

  const onSubmit = async (data: FormData) => {
    if (!parseResult || parseResult.valid.length === 0) return;

    await bulkSchedule.mutateAsync({
      ...data,
      recipients: parseResult.valid,
    });

    reset();
    setParseResult(null);
    setFileName(null);
    onClose();
  };

  const handleClose = () => {
    reset();
    setParseResult(null);
    setFileName(null);
    onClose();
  };

  const senders = user?.senderAccounts ?? [];

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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              No senders configured. Please add a sender account first.
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
            placeholder="<p>Hi {{name}}, ...</p>"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            {...register("body")}
          />
          {errors.body && <p className="text-xs text-red-600">{errors.body.message}</p>}
        </div>

        {/* CSV Upload */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700">Recipients (CSV/TXT)</label>
          <div
            className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-400 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600">
              {fileName ? (
                <span className="font-medium text-indigo-600">{fileName}</span>
              ) : (
                <>Drop a CSV/TXT file or <span className="text-indigo-600">browse</span></>
              )}
            </p>
            <p className="text-xs text-slate-400 mt-1">Must include an email column</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Parse result preview */}
          {parseResult && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-indigo-500" />
                <span className="font-medium">
                  {parseResult.valid.length} valid recipient{parseResult.valid.length !== 1 ? "s" : ""} detected
                </span>
              </div>
              {parseResult.valid.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {parseResult.valid.slice(0, 3).join(", ")}
                  {parseResult.valid.length > 3 && ` +${parseResult.valid.length - 3} more`}
                </div>
              )}
              {parseResult.invalid.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {parseResult.invalid.length} invalid addresses skipped
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

