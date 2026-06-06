// FinanceHome — Phase 6d dashboard for the financial_staff role.
//
// Replaces the previous redirect-to-Fees with a focused workload page:
//   - Collection rate for the current period (paid / due)
//   - Overdue accounts to chase (sorted oldest-due first)
//   - Recent payments recorded (confirmation feed)
//
// One backend call: GET /school/orgs/:orgId/finance-snapshot

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Receipt,
  CheckCircle2,
  Users,
} from "lucide-react";
import {
  getFinanceSnapshot,
  type FinanceSnapshot,
} from "../../../utils/schoolApi";

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function firstName(): string {
  const stored =
    typeof window !== "undefined"
      ? window.localStorage.getItem("fgs_user_name")
      : null;
  return stored ? stored.split(/\s+/)[0] : "Finance";
}

function fmtRs(amount: number): string {
  return `Rs. ${amount.toLocaleString("en-PK")}`;
}

function fmtPeriod(period: string): string {
  // Period stored as YYYY-MM — render as "Jun 2026" for readability.
  const [y, m] = period.split("-");
  if (!y || !m) return period;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function FinanceHome() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFinanceSnapshot(orgId)
      .then((r) => {
        if (!cancelled) setSnapshot(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Could not load dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Loading finance dashboard…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!snapshot) return null;

  const c = snapshot.collection;
  const collectionTone =
    c.collectionPct >= 90
      ? "text-emerald-700"
      : c.collectionPct >= 70
      ? "text-amber-700"
      : "text-rose-700";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back, {firstName()}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">{todayLabel()}</p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
          <Users className="h-3.5 w-3.5 text-indigo-500" />
          {c.studentCount} fee records · {fmtPeriod(snapshot.period)}
        </div>
      </div>

      {/* Collection hero — large readable summary for the demo */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 p-5 shadow-lg ring-1 ring-white/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              Collection · {fmtPeriod(snapshot.period)}
            </div>
            <h2 className="mt-0.5 text-lg font-semibold text-white">
              {fmtRs(c.paidTotal)} of {fmtRs(c.dueTotal)}
            </h2>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums text-white">
              {c.collectionPct}%
            </div>
            <div className="text-[11px] text-emerald-300">collected</div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={
              "h-full " +
              (c.collectionPct >= 90
                ? "bg-emerald-400"
                : c.collectionPct >= 70
                ? "bg-amber-400"
                : "bg-rose-400")
            }
            style={{ width: `${Math.min(100, c.collectionPct)}%` }}
          />
        </div>
        {/* Breakdown chips */}
        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300 ring-1 ring-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" />
            {c.paidCount} paid
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300 ring-1 ring-amber-500/20">
            {c.partialCount} partial
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-300 ring-1 ring-rose-500/20">
            {c.unpaidCount} unpaid
          </span>
          {c.waivedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-slate-300 ring-1 ring-slate-500/20">
              {c.waivedCount} waived
            </span>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            <TrendingUp className="h-3.5 w-3.5" />
            Collection rate
          </div>
          <div className={"mt-1 text-2xl font-semibold tabular-nums " + collectionTone}>
            {c.collectionPct}%
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            Overdue (all periods)
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-rose-700">
            {snapshot.overdue.countAnyPeriod}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            <Receipt className="h-3.5 w-3.5" />
            Recent payments
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {snapshot.recentPayments.length}
          </div>
        </div>
      </div>

      {/* Overdue list */}
      {snapshot.overdue.recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Overdue accounts
            </h2>
            <Link
              to={`/school/orgs/${orgId}/admin/fees`}
              className="text-xs text-indigo-600 hover:underline"
            >
              All fees →
            </Link>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 overflow-hidden">
            <ul className="divide-y divide-rose-100">
              {snapshot.overdue.recent.map((r) => (
                <li key={r.feeStatusId}>
                  <Link
                    to={`/school/orgs/${orgId}/students/${r.studentId}/fees`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-rose-100/40"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-rose-900">
                        {r.studentName}
                      </div>
                      <div className="text-[10px] text-rose-700">
                        {r.grNumber ?? ""}
                        {r.className ? ` · ${r.className}` : ""}
                        {r.sectionName ? ` · ${r.sectionName}` : ""}
                        {r.dueDate
                          ? ` · due ${new Date(r.dueDate).toLocaleDateString()}`
                          : ""}
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="text-sm font-semibold text-rose-700 tabular-nums">
                        {fmtRs(r.remaining)}
                      </div>
                      {r.amountPaid > 0 && (
                        <div className="text-[10px] text-slate-500">
                          paid {fmtRs(r.amountPaid)}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Recent payments */}
      {snapshot.recentPayments.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Recent payments
          </h2>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {snapshot.recentPayments.map((p) => (
                <li key={p.feeStatusId}>
                  <Link
                    to={`/school/orgs/${orgId}/students/${p.studentId}/fees`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {p.studentName}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {p.grNumber ?? ""} · {fmtPeriod(p.period)} ·{" "}
                        {new Date(p.paidDate).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700 tabular-nums">
                      {fmtRs(p.amountPaid)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Empty-state CTA when nothing to show */}
      {snapshot.overdue.recent.length === 0 &&
        snapshot.recentPayments.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <DollarSign className="mx-auto h-8 w-8 text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-900">
              No fee activity yet
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Once fees are invoiced, you'll see collection % and overdue
              accounts here.
            </p>
            <Link
              to={`/school/orgs/${orgId}/admin/fees`}
              className="mt-3 inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
            >
              Go to fees admin →
            </Link>
          </div>
        )}
    </div>
  );
}

export default FinanceHome;
