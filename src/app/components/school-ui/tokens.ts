// Design tokens for the school product.
//
// These constants encode the franchise-style aesthetic established by the
// Performance Dashboard (dark slate→indigo hero, light cards, severity-colored
// alerts, dense leaderboard tables). Import these instead of redefining the
// same Tailwind class strings inside every page.
//
// The values are Tailwind class strings rather than CSS variables so JIT can
// see them at build time. Composition: `className={`${cardBase} ${cardElev} p-4`}`.

// ─── Color palette ──────────────────────────────────────────────────────

export const heroGradient =
  "bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950";
export const heroBorder = "border-indigo-900/40";

export const cardBase = "bg-white border border-slate-200 rounded-xl";
export const cardElev = "bg-white border border-slate-200 rounded-xl shadow-sm";

export const accentBg = "bg-indigo-50";
export const accentText = "text-indigo-900";
export const accentBorder = "border-indigo-200";

// ─── Severity palette ───────────────────────────────────────────────────

export type Severity = "critical" | "warning" | "info" | "success" | "neutral";

export interface SeverityClassSet {
  /** Card background tint. */
  bg: string;
  /** Card border. */
  border: string;
  /** Title / heading text color. */
  title: string;
  /** Icon color. */
  icon: string;
  /** Combined badge classes (background + text). */
  badge: string;
}

const SEVERITY_MAP: Record<Severity, SeverityClassSet> = {
  critical: {
    bg: "bg-rose-50",
    border: "border-rose-300",
    title: "text-rose-900",
    icon: "text-rose-600",
    badge: "bg-rose-600 text-white",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    title: "text-amber-900",
    icon: "text-amber-600",
    badge: "bg-amber-500 text-white",
  },
  info: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    title: "text-sky-900",
    icon: "text-sky-600",
    badge: "bg-sky-500 text-white",
  },
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    title: "text-emerald-900",
    icon: "text-emerald-600",
    badge: "bg-emerald-600 text-white",
  },
  neutral: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    title: "text-slate-700",
    icon: "text-slate-500",
    badge: "bg-slate-200 text-slate-700",
  },
};

export function severityClasses(s: Severity): SeverityClassSet {
  return SEVERITY_MAP[s];
}

// ─── Status palette (leaderboard row / pill) ────────────────────────────

export type Status = "compliant" | "watch" | "flagged" | "neutral";

const STATUS_MAP: Record<Status, SeverityClassSet> = {
  compliant: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    title: "text-emerald-900",
    icon: "text-emerald-600",
    badge: "bg-emerald-600 text-white",
  },
  watch: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    title: "text-amber-900",
    icon: "text-amber-600",
    badge: "bg-amber-500 text-white",
  },
  flagged: {
    bg: "bg-rose-50",
    border: "border-rose-300",
    title: "text-rose-900",
    icon: "text-rose-600",
    badge: "bg-rose-600 text-white",
  },
  neutral: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    title: "text-slate-700",
    icon: "text-slate-500",
    badge: "bg-slate-200 text-slate-700",
  },
};

export function statusClasses(s: Status): SeverityClassSet {
  return STATUS_MAP[s];
}

// ─── Typography helpers ─────────────────────────────────────────────────

export const pageTitleClasses =
  "text-2xl font-semibold text-slate-900 tracking-tight";
export const sectionTitleClasses =
  "text-sm font-bold uppercase tracking-widest text-slate-500";
export const mutedClasses = "text-xs text-slate-500";
