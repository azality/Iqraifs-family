// TermSwitchNudge — "the current term has ended" banner for the
// principal cockpit.
//
// The current term is a manual flag (is_current), not date-driven, and
// coverage/pace/lesson-prep all measure against it. When the flag lags
// the calendar (1st Assessment ended Sep 20 but nobody switched), every
// number on the dashboard quietly measures the wrong syllabus. This
// banner appears the day after the current term's end date and offers a
// one-click switch to the next term (PATCH flips the old flag
// atomically server-side).
//
// Renders nothing while the current term is still running, when the org
// has no terms (whole-year schools), or while terms are loading. The
// switch PATCH is admin/principal-only server-side; this component only
// renders on the principal cockpit.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listTerms, updateTerm, type AcademicTerm } from "../../../utils/schoolApi";
import { resolveTermNudge } from "./termNudge";

function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function TermSwitchNudge({ orgId }: { orgId: string }) {
  const [terms, setTerms] = useState<AcademicTerm[] | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    listTerms(orgId)
      .then((r) => setTerms(r.terms))
      .catch(() => setTerms(null));
  }, [orgId]);

  const nudge = terms ? resolveTermNudge(terms, localToday()) : null;
  if (!nudge) return null;

  const target = nudge.kind === "switch" ? nudge.nextTerm
    : nudge.kind === "set-current" ? nudge.containingTerm
    : null;

  const doSwitch = async () => {
    if (!target) return;
    setSwitching(true);
    try {
      await updateTerm(orgId, target.id, { isCurrent: true });
      toast.success(`${target.name} is now the current term`);
      // Every card on this page was computed against the old term —
      // reload so the numbers are honest immediately.
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch term");
      setSwitching(false);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <CalendarClock className="h-4 w-4 flex-shrink-0 text-amber-600" />
      <p className="min-w-0 flex-1 text-sm text-amber-900">
        {nudge.kind === "set-current" ? (
          <>No current term is set — coverage and pace have nothing to measure against.</>
        ) : (
          <>
            <span className="font-semibold">{nudge.endedTerm.name}</span> ended{" "}
            {fmtDate(nudge.endedTerm.endDate)} — coverage and pace are still measuring
            against it.
          </>
        )}
      </p>
      {target ? (
        <button
          type="button"
          onClick={doSwitch}
          disabled={switching}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
        >
          {switching && <Loader2 className="h-3 w-3 animate-spin" />}
          {nudge.kind === "set-current"
            ? `Make ${target.name} current`
            : `Switch to ${target.name}`}
        </button>
      ) : (
        <span className="text-xs text-amber-800">Define the next term to switch.</span>
      )}
      <Link
        to={`/school/orgs/${orgId}/admin/assessment`}
        className="text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
      >
        Manage terms
      </Link>
    </div>
  );
}
