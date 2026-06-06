// Single KPI tile — used inside HeroCard (dark variant) or standalone on a
// light page (light variant).

import type { ComponentType } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cardBase, cardElev } from "./tokens";

export interface KpiTileProps {
  /** Optional — when omitted, only the label renders in the header row. */
  icon?: ComponentType<{ className?: string }>;
  label: string;
  /** null renders as muted em-dash placeholder. */
  value: string | number | null;
  /** Small caption below the value. */
  hint?: string;
  /** Percentage-point delta. Positive = green, negative = red. */
  deltaPp?: number | null;
  /** Entire tile rendered greyed out (for "coming soon" tiles). */
  muted?: boolean;
  onClick?: () => void;
  /** Dark = use inside HeroCard. Light = standalone. Defaults to dark. */
  variant?: "dark" | "light";
  className?: string;
}

export function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  deltaPp,
  muted,
  onClick,
  variant = "dark",
  className,
}: KpiTileProps) {
  const isDark = variant === "dark";
  const isMuted = muted || value === null;
  const display = value === null || value === undefined ? "—" : String(value);

  const container = isDark
    ? "rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 p-3 transition text-left"
    : `${cardBase} ${cardElev} p-4 text-left transition hover:border-indigo-200`;

  const iconCls = isDark ? "text-indigo-300 h-4 w-4" : "text-indigo-600 h-4 w-4";
  const labelCls = isDark
    ? "text-xs uppercase tracking-wide text-indigo-200"
    : "text-xs uppercase tracking-wide text-slate-500";
  const valueCls = isDark
    ? "text-2xl font-semibold text-white mt-1 tabular-nums"
    : "text-2xl font-semibold text-slate-900 mt-1 tabular-nums";
  const hintCls = isDark
    ? "text-xs text-indigo-300 mt-0.5"
    : "text-xs text-slate-500 mt-0.5";

  const mutedCls = isMuted ? "opacity-60" : "";
  const cursor = onClick ? "cursor-pointer" : "";
  const cls = [container, mutedCls, cursor, className ?? ""]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className={iconCls} />}
        <span className={labelCls}>{label}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <div className={valueCls}>{display}</div>
        {deltaPp !== null && deltaPp !== undefined && (
          <span
            className={
              "inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums " +
              (deltaPp >= 0
                ? isDark
                  ? "text-emerald-400"
                  : "text-emerald-600"
                : isDark
                ? "text-rose-400"
                : "text-rose-600")
            }
          >
            {deltaPp >= 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {deltaPp >= 0 ? "+" : ""}
            {deltaPp}pp
          </span>
        )}
      </div>
      {hint && <div className={hintCls}>{hint}</div>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}
