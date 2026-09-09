// MyStudentFees — parent-facing read-only fee history for a single student.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

const STATUS_LABEL_KEY: Record<Status, string> = {
  paid: "portal.fees.stPaid",
  pending: "portal.fees.stPending",
  partial: "portal.fees.stPartial",
  overdue: "portal.fees.stOverdue",
  waived: "portal.fees.stWaived",
};

function FeeStatusPill({ status }: { status: Status }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${STATUS_BADGE[status]}`}
    >
      {t(STATUS_LABEL_KEY[status])}
    </span>
  );
}

export function MyStudentFees() {
  const { t } = useTranslation();
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
      header: t("portal.fees.colPeriod"),
      width: "w-28",
      cell: (f) => <span className="font-mono text-xs">{f.period}</span>,
    },
    {
      key: "status",
      header: t("portal.fees.colStatus"),
      width: "w-24",
      cell: (f) => <FeeStatusPill status={f.status} />,
    },
    {
      key: "due",
      header: t("portal.fees.colDue"),
      align: "right",
      cell: (f) => (
        <span className="tabular-nums">
          {f.amount_due != null ? `Rs. ${Number(f.amount_due).toLocaleString("en-PK")}` : "—"}
        </span>
      ),
    },
    {
      key: "paid",
      header: t("portal.fees.colPaid"),
      align: "right",
      cell: (f) => (
        <span className="tabular-nums">
          {f.amount_paid != null ? `Rs. ${Number(f.amount_paid).toLocaleString("en-PK")}` : "—"}
        </span>
      ),
    },
    {
      key: "dueDate",
      header: t("portal.fees.colDueDate"),
      cell: (f) => (
        <span className="text-xs text-slate-600 tabular-nums">
          {f.due_date ?? "—"}
        </span>
      ),
    },
    {
      key: "receipt",
      header: t("portal.fees.colReceipt"),
      cell: (f) =>
        f.receipt_url ? (
          <a
            href={f.receipt_url}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 text-xs underline"
          >
            {t("portal.fees.view")}
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
        title={student ? `${student.fullName} – ${t("portal.fees.title")}` : t("portal.fees.title")}
      />

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          variant="light"
          label={t("portal.fees.stPaid")}
          icon={CheckCircle2}
          value={summary.paid}
          hint={t("portal.fees.hintPeriods")}
        />
        <KpiTile
          variant="light"
          label={t("portal.fees.unpaid")}
          icon={AlertCircle}
          value={summary.unpaid}
          hint={t("portal.fees.hintPeriods")}
        />
        <KpiTile
          variant="light"
          label={t("portal.fees.totalDue")}
          icon={Wallet}
          value={`Rs. ${summary.totalDue.toLocaleString("en-PK")}`}
          hint={t("portal.fees.hintAllPeriods")}
        />
        <KpiTile
          variant="light"
          label={t("portal.fees.totalPaid")}
          icon={Clock}
          value={`Rs. ${summary.totalPaid.toLocaleString("en-PK")}`}
          hint={t("portal.fees.hintAllPeriods")}
        />
      </div>

      <DataTable
        columns={columns}
        rows={fees ?? []}
        rowKey={(f) => f.id}
        emptyMessage={fees === null ? t("common.loading") : t("portal.fees.noRecords")}
      />
    </div>
  );
}
