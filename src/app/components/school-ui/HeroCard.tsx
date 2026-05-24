// Dark-gradient hero block — used at the top of dashboard-style school pages.
// Mirrors the "School at a Glance" block on PerformanceDashboard.

import type { ReactNode } from "react";
import { heroBorder, heroGradient } from "./tokens";

export interface HeroCardProps {
  title: string;
  subtitle?: string;
  /** e.g. "Today · 14:32". Rendered in indigo-300 below the subtitle. */
  asOf?: string;
  /** Right-aligned slot for a health pill, period selector, etc. */
  rightSlot?: ReactNode;
  /** Typically a KPI grid; rendered in a `mt-6` block below the header row. */
  children?: ReactNode;
  className?: string;
}

export function HeroCard({
  title,
  subtitle,
  asOf,
  rightSlot,
  children,
  className,
}: HeroCardProps) {
  const cls = [
    "rounded-2xl border",
    heroBorder,
    heroGradient,
    "text-white shadow-lg p-5",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-sm text-indigo-200">{subtitle}</p>
          )}
          {asOf && (
            <p className="mt-0.5 text-xs text-indigo-300">{asOf}</p>
          )}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
