// MyStudentFees — parent-facing read-only fee history for a single student.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Wallet, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import {
  HeroCard,
  KpiTile,
  DataTable,
  type DataTableColumn,
} from "../../components/school-ui";
import { usePinAuth } from "../../contexts/PinAuthContext";
import {
  getMyStudentFees,
  type FeeStatus,
} from "../../../utils/schoolPortalApi";

type Status = FeeStatus["status"];

const STATUS_BADGE: Record<Status, string> = {
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending: "bg-rose-100 text-rose-700 border-rose-200",
  partial: "bg-amber-100 text-amber-700 border-amber-200",
  overdue: "bg-rose-100 text-rose-700 border-rose-200",
  waived: "bg-slate-100 text-slate-700 border-slate-200",
};

function FeeStatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${STATUS_BADGE[status]}`}
    >
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}

export function MyStudentFees() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const { subject } = usePinAuth();
  const [fees, setFees] = useState<FeeStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const student = useMemo(() => {
    if (subject?.student && subject.student.id === studentId) return subject.student;
    return subject?.students?.find((s) => s.id === studentId) ?? null;
  }, [subject, studentId]);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setFees(null);
    setError(null);
    getMyStudentFees(studentId)
      .then((r) => {
        if (!cancelled) setFees(r.fees);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const summary = useMemo(() => {
    if (!fees) return { paid: 0, unpaid: 0, totalDue: 0, totalPaid: 0 };
    let paid = 0;
    let unpaid = 0;
    let totalDue = 0;
    let totalPaid = 0;
    for (const f of fees) {
      if (f.status === "paid" || f.status === "waived") paid += 1;
      else unpaid += 1;
      totalDue += f.amount_due ?? 0;
      totalPaid += f.amount_paid ?? 0;
    }
    return { paid, unpaid, totalDue, totalPaid };
  }, [fees]);

  const columns: Array<DataTableColumn<FeeStatus>> = [
    {
      key: "period",
      header: "Period",
      width: "w-28",
      cell: (f) => <span className="font-mono text-xs">{f.period}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "w-24",
      cell: (f) => <FeeStatusPill status={f.status} />,
    },
    {
      key: "due",
      header: "Amount due",
      align: "right",
      cell: (f) => <span className="tabular-nums">{f.amount_due ?? "—"}</span>,
    },
    {
      key: "paid",
      header: "Amount paid",
      align: "right",
      cell: (f) => <span className="tabular-nums">{f.amount_paid ?? "—"}</span>,
    },
    {
      key: "dueDate",
      header: "Due date",
      cell: (f) => (
        <span className="text-xs text-slate-600 tabular-nums">
          {f.due_date ?? "—"}
        </span>
      ),
    },
    {
      key: "receipt",
      header: "Receipt",
      cell: (f) =>
        f.receipt_url ? (
          <a
            href={f.receipt_url}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 text-xs underline"
          >
            View
          </a>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <HeroCard
        eyebrow={student ? `GR# ${student.grNumber}` : undefined}
        title={student ? `${student.fullName} – Fees` : "Fees"}
      />

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          variant="light"
          label="Paid"
          icon={CheckCircle2}
          value={summary.paid}
          hint="periods"
        />
        <KpiTile
          variant="light"
          label="Unpaid"
          icon={AlertCircle}
          value={summary.unpaid}
          hint="periods"
        />
        <KpiTile
          variant="light"
          label="Total due"
          icon={Wallet}
          value={summary.totalDue}
          hint="amount"
        />
        <KpiTile
          variant="light"
          label="Total paid"
          icon={Clock}
          value={summary.totalPaid}
          hint="amount"
        />
      </div>

      <DataTable
        columns={columns}
        rows={fees ?? []}
        rowKey={(f) => f.id}
        emptyMessage={fees === null ? "Loading…" : "No fee records."}
      />
    </div>
  );
}
