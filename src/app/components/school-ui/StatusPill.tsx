// Small inline pill for table-row status / health indicators.

import { statusClasses, type Status } from "./tokens";

export interface StatusPillProps {
  status: Status;
  /** Override label; defaults to capitalized status. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StatusPill({
  status,
  label,
  size = "sm",
  className,
}: StatusPillProps) {
  const s = statusClasses(status);
  const sizeCls =
    size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-xs";
  const cls = [
    "inline-flex items-center gap-1.5 rounded-full font-medium",
    sizeCls,
    s.badge,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={cls}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label ?? capitalize(status)}
    </span>
  );
}
