// Dark-gradient hero block — used at the top of dashboard-style school pages.
// Mirrors the "School at a Glance" block on PerformanceDashboard.
//
// PR G: pulls per-org branding (logo, theme color, motto) from
// OrgBrandingContext. Outside a provider, falls back to the default theme.

import type { ReactNode } from "react";
import { heroBorder, heroGradient } from "./tokens";
import { useOrgBranding, brandedHeroStyle } from "../../contexts/OrgBrandingContext";

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
  /** Optional eyebrow text shown above the title (small, uppercase). */
  eyebrow?: string;
  /** Opt out of branding (e.g. when this hero IS the branding editor — the
   *  preview is rendered separately). Default false. */
  ignoreBranding?: boolean;
}

export function HeroCard({
  title,
  subtitle,
  asOf,
  rightSlot,
  children,
  className,
  eyebrow,
  ignoreBranding,
}: HeroCardProps) {
  const branding = useOrgBranding();
  const themeColor = ignoreBranding ? "" : branding.themeColor;
  const logoUrl = ignoreBranding ? "" : branding.logoUrl;
  const motto = ignoreBranding ? "" : branding.motto;

  const cls = [
    "rounded-2xl border",
    heroBorder,
    // When theme color is set, the inline style takes over via
    // backgroundImage. Keep the gradient class as fallback for browsers that
    // ignore the override (none in practice).
    themeColor ? "" : heroGradient,
    "text-white shadow-lg p-5",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} style={brandedHeroStyle(themeColor)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              className="h-12 w-12 rounded-lg bg-white/10 object-contain p-1 shadow-sm"
              onError={(e) => {
                // Silently hide a broken image so the hero still renders.
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[10px] uppercase tracking-widest text-indigo-200/80">
                {eyebrow}
              </p>
            )}
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-indigo-200">{subtitle}</p>
            )}
            {motto && !subtitle && (
              <p className="mt-0.5 text-xs italic text-indigo-200/90">
                {motto}
              </p>
            )}
            {asOf && (
              <p className="mt-0.5 text-xs text-indigo-300">{asOf}</p>
            )}
          </div>
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
