// Setup checklist card for fresh schools — surfaces the 6 first-week
// operational steps an admin needs to complete to start daily ops.
// Rendered above the Performance Dashboard hero; dismissable per-org via
// localStorage so we don't nag once the school is running.

import { Link } from "react-router";
import { CheckCircle2, Circle, X, ArrowRight } from "lucide-react";
import { cardBase, cardElev } from "./tokens";

export interface SetupChecklistProps {
  orgId: string;
  classCount: number;
  studentCount: number;
  teacherCount: number;
  linkCodeCount: number;
  announcementCount: number;
  /** Called after the user clicks the dismiss "x". The parent should hide
   *  the card; the component also writes to localStorage so a remount won't
   *  re-show it. */
  onDismiss?: () => void;
}

const STORAGE_PREFIX = "fgs_setup_dismissed:";

export function setupChecklistDismissed(orgId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + orgId) === "1";
  } catch {
    return false;
  }
}

interface Step {
  label: string;
  to: string;
  complete: boolean;
  /** If true, this step never auto-completes — always shows "Open →". */
  reviewOnly?: boolean;
}

export function SetupChecklist(props: SetupChecklistProps) {
  const {
    orgId,
    classCount,
    studentCount,
    teacherCount,
    linkCodeCount,
    announcementCount,
    onDismiss,
  } = props;

  const base = `/school/orgs/${orgId}`;

  const steps: Step[] = [
    {
      label: "Create your first class",
      to: `${base}/admin/classes`,
      complete: classCount > 0,
    },
    {
      label: "Add students",
      to: `${base}/admin/students`,
      complete: studentCount > 0,
    },
    {
      label: "Add teachers",
      to: `${base}/admin/teachers`,
      complete: teacherCount > 0,
    },
    {
      label: "Generate parent link codes",
      to: `${base}/admin/link-codes`,
      complete: linkCodeCount > 0,
    },
    {
      label: "Set permissions for roles",
      to: `${base}/admin/permissions`,
      complete: false,
      reviewOnly: true,
    },
    {
      label: "Post your first announcement",
      to: `${base}/admin/announcements/new`,
      complete: announcementCount > 0,
    },
  ];

  const completedCount = steps.filter((s) => s.complete && !s.reviewOnly).length;
  const totalActionable = steps.filter((s) => !s.reviewOnly).length;

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + orgId, "1");
    } catch {
      /* ignore quota / private-mode errors */
    }
    onDismiss?.();
  };

  return (
    <div
      className={`${cardBase} ${cardElev} border-indigo-100 relative p-4 sm:p-5`}
      role="region"
      aria-label="School setup checklist"
    >
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Dismiss setup checklist"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="pr-8">
        <h2 className="text-base font-semibold text-slate-900">
          Get your school set up
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Knock these out to start daily ops.{" "}
          <span className="font-medium text-indigo-600">
            {completedCount} of {totalActionable} done
          </span>
        </p>
      </div>

      <ul className="mt-4 divide-y divide-slate-100">
        {steps.map((s) => (
          <li
            key={s.label}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <span className="flex items-center gap-2.5">
              {s.complete ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-slate-300" />
              )}
              <span
                className={
                  "text-sm " +
                  (s.complete
                    ? "text-slate-500 line-through"
                    : "text-slate-800")
                }
              >
                {s.label}
              </span>
            </span>
            {s.complete ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Done
              </span>
            ) : (
              <Link
                to={s.to}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                Open
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
