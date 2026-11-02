// ─────────────────────────────────────────────────────────────
//  components/ui/Badge.tsx
//  Email status badge with color coding.
// ─────────────────────────────────────────────────────────────

import { clsx } from "clsx";
import type { EmailStatus } from "../../types";

const statusConfig: Record<EmailStatus, { label: string; className: string }> = {
  PENDING:    { label: "Pending",    className: "bg-yellow-100 text-yellow-800" },
  QUEUED:     { label: "Queued",     className: "bg-blue-100   text-blue-800"   },
  PROCESSING: { label: "Processing", className: "bg-purple-100 text-purple-800" },
  SENT:       { label: "Sent",       className: "bg-green-100  text-green-800"  },
  FAILED:     { label: "Failed",     className: "bg-red-100    text-red-800"    },
  CANCELLED:  { label: "Cancelled",  className: "bg-slate-100  text-slate-600"  },
};

interface BadgeProps {
  status: EmailStatus;
  className?: string;
}

export function StatusBadge({ status, className }: BadgeProps) {
  const { label, className: statusClass } = statusConfig[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        statusClass,
        className
      )}
    >
      {label}
    </span>
  );
}

