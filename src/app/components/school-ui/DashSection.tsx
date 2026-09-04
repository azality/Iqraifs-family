// Mobile accordion wrapper (design handoff option 1d).
//
// On phones every dashboard module sits behind a 44px collapsible header
// so the page is one screen deep; on lg+ the wrapper vanishes
// (display:contents) and children render as normal cards. Extracted from
// PerformanceDashboard so every role home shares the pattern.

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface DashSectionProps {
  title: string;
  right?: ReactNode;
  tone?: "default" | "alert";
  defaultOpen?: boolean;
  /** Collapse on EVERY viewport (TeacherHome declutter) - the default
   *  collapses on phones only and renders transparently on lg+. */
  desktopCollapsible?: boolean;
  children: ReactNode;
}

export function DashSection({
  title,
  right,
  tone = "default",
  defaultOpen = false,
  desktopCollapsible = false,
  children,
}: DashSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const alertTone = tone === "alert";
  return (
    <div className={desktopCollapsible ? "" : "lg:contents"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          "flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-4 py-3 text-left " +
          (desktopCollapsible ? "" : "lg:hidden ") +
          (alertTone ? "border-rose-200 bg-rose-50" : "bg-white")
        }
        style={alertTone ? undefined : { borderColor: "rgba(20,22,58,.08)" }}
      >
        <span
          className={"text-[12.5px] font-bold " + (alertTone ? "text-rose-800" : "")}
          style={alertTone ? undefined : { color: "#14163a" }}
        >
          {title}
        </span>
        {right}
        <ChevronDown
          className={
            "ml-auto h-4 w-4 transition-transform " +
            (alertTone ? "text-rose-400 " : "text-slate-400 ") +
            (open ? "rotate-180" : "")
          }
        />
      </button>
      {/* max-lg:hidden (not `hidden`) so the closed state can never fight
          lg:contents in the cascade — both are display utilities. */}
      <div
        className={
          desktopCollapsible
            ? open ? "mt-3 space-y-4" : "hidden"
            : (open ? "space-y-4 " : "max-lg:hidden ") + "lg:contents"
        }
      >
        {children}
      </div>
    </div>
  );
}

export default DashSection;
