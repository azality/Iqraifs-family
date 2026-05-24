// Severity-colored alert card. Severity drives the entire color scheme via
// the shared `severityClasses()` token helper.

import type { ComponentType } from "react";
import { ChevronRight } from "lucide-react";
import { severityClasses } from "./tokens";

export interface AlertCardProps {
  severity: "critical" | "warning" | "info" | "success";
  /** Small uppercase tag shown in the corner (e.g. "ATTENDANCE"). */
  kind?: string;
  icon?: ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function AlertCard({
  severity,
  kind,
  icon: Icon,
  title,
  body,
  actionLabel,
  actionHref,
  onAction,
  className,
}: AlertCardProps) {
  const s = severityClasses(severity);
  const cls = [
    "rounded-xl border-2 p-4",
    s.bg,
    s.border,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const ActionEl = () => {
    if (!actionLabel) return null;
    const content = (
      <>
        {actionLabel}
        <ChevronRight className="h-3.5 w-3.5" />
      </>
    );
    const linkCls = `mt-3 inline-flex items-center gap-1 text-xs font-medium ${s.title} hover:underline`;
    if (actionHref) {
      return (
        <a href={actionHref} className={linkCls}>
          {content}
        </a>
      );
    }
    if (onAction) {
      return (
        <button type="button" onClick={onAction} className={linkCls}>
          {content}
        </button>
      );
    }
    return null;
  };

  return (
    <div className={cls}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {Icon && <Icon className={`h-5 w-5 mt-0.5 ${s.icon}`} />}
          <div>
            <h3 className={`text-sm font-semibold ${s.title}`}>{title}</h3>
          </div>
        </div>
        {kind && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.badge}`}
          >
            {kind}
          </span>
        )}
      </div>
      {body && (
        <p className={`mt-2 text-xs leading-relaxed ${s.title} opacity-90`}>
          {body}
        </p>
      )}
      <ActionEl />
    </div>
  );
}
