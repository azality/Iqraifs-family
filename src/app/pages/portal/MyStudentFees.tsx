// MyStudentFees — parent-facing fee statement for a single student.
//
// Customer-view redesign (17 Sep, matching the staff fees redesign):
//   1. ONE balance headline — rose when owing (with month chips + due
//      date), emerald "all settled" when clear. No four-tile math.
//   2. How-to-pay bank card promoted right under the balance while
//      anything is owed, with a copy-account-number button (parents
//      paste it into their banking app).
//   3. Month statement CARDS instead of a table — status pill, amount,
//      the payment ledger lines inside, remaining balance on partials,
//      and the receipt button per month. Phones first: parents read
//      this on a 360px screen.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { AlertCircle, CheckCircle2, Copy, Landmark, MessageCircleQuestion, Printer } from "lucide-react";
import { HeroCard } from "../../components/school-ui";
import { usePinAuth } from "../../contexts/PinAuthContext";
import { toast } from "sonner";
import {
  getMyStudentFees,
  openMyFeeReceipt,
  type FeeStatus,
} from "../../../utils/schoolPortalApi";

type Status = FeeStatus["status"];

const STATUS_BADGE: Record<Status, string> = {
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  unpaid: "bg-rose-100 text-rose-700 border-rose-200",
  partial: "bg-amber-100 text-amber-700 border-amber-200",
  waived: "bg-slate-100 text-slate-700 border-slate-200",
};

const STATUS_LABEL_KEY: Record<Status, string> = {
  paid: "portal.fees.stPaid",
  unpaid: "portal.fees.stPending",
  partial: "portal.fees.stPartial",
  waived: "portal.fees.stWaived",
};

const isOverdue = (f: FeeStatus): boolean =>
  f.status !== "paid" && f.status !== "waived" &&
  !!f.due_date && f.due_date < new Date().toISOString().slice(0, 10);

const owedOf = (f: FeeStatus): number =>
  f.status === "waived" ? 0 : Math.max(0, (f.amount_due ?? 0) - (f.amount_paid ?? 0));

const rs = (n: number) => `Rs. ${n.toLocaleString("en-PK")}`;

function FeeStatusPill({ fee }: { fee: FeeStatus }) {
  const { t } = useTranslation();
  if (isOverdue(fee)) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border bg-rose-100 text-rose-700 border-rose-200">
        {t("portal.fees.stOverdue")}
      </span>
    );
  }
  const status = (fee.status in STATUS_BADGE ? fee.status : "unpaid") as Status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${STATUS_BADGE[status]}`}
    >
      {t(STATUS_LABEL_KEY[status])}
    </span>
  );
}

export function MyStudentFees() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language ?? "en";
  const { studentId = "" } = useParams<{ studentId: string }>();
  const { subject } = usePinAuth();
  const [fees, setFees] = useState<FeeStatus[] | null>(null);
  // Where this child's fees are deposited — the school banks per class
  // group, so the account comes with the fees payload.
  const [bankAccount, setBankAccount] = useState<{
    bank: string | null; title: string | null; accountNumber: string | null; iban?: string | null;
  } | null>(null);
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
        if (!cancelled) {
          setFees(r.fees);
          setBankAccount(r.bankAccount ?? null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // Month labels in the parent's own language ("Aug 2026" / "اگست 2026").
  const periodLabel = (period: string): string => {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) return period;
    return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString(
      lang.startsWith("ur") ? "ur-PK" : undefined,
      { month: "short", year: "numeric" },
    );
  };
  const dateLabel = (iso: string): string => {
    const [y, mo, d] = iso.split("-").map(Number);
    if (!y || !mo || !d) return iso;
    return new Date(y, mo - 1, d).toLocaleDateString(
      lang.startsWith("ur") ? "ur-PK" : undefined,
      { day: "numeric", month: "short", year: "numeric" },
    );
  };

  const summary = useMemo(() => {
    if (!fees) return { paid: 0, totalPaid: 0, balance: 0, owedFees: [] as FeeStatus[] };
    let paid = 0;
    let totalPaid = 0;
    let balance = 0;
    const owedFees: FeeStatus[] = [];
    for (const f of fees) {
      if (f.status === "paid" || f.status === "waived") paid += 1;
      totalPaid += f.amount_paid ?? 0;
      const owed = owedOf(f);
      if (owed > 0) {
        balance += owed;
        owedFees.push(f);
      }
    }
    // Oldest first — the same order the office settles them in.
    owedFees.sort((a, b) => a.period.localeCompare(b.period));
    return { paid, totalPaid, balance, owedFees };
  }, [fees]);

  const owing = summary.balance > 0;
  const oldestDue = summary.owedFees.find((f) => f.due_date)?.due_date ?? null;
  const anyOverdue = summary.owedFees.some(isOverdue);

  const copyText = (value: string | null | undefined) => {
    if (!value) return;
    navigator.clipboard?.writeText(value)
      .then(() => toast.success(t("portal.fees.copied")))
      .catch(() => { /* clipboard unavailable — the number is on screen */ });
  };

  const receiptButton = (f: FeeStatus) => {
    if (f.receipt_url) {
      return (
        <a
          href={f.receipt_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] font-bold text-indigo-700 hover:bg-indigo-50"
        >
          <Printer className="h-3 w-3" /> {t("portal.fees.view")}
        </a>
      );
    }
    // The payer can print their own receipt — any month with money
    // recorded gets the school-branded printable page.
    if ((f.payments ?? []).some((p) => !p.voidedAt)) {
      return (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] font-bold text-indigo-700 hover:bg-indigo-50"
          onClick={() => openMyFeeReceipt(f.id).catch((e) => toast.error(e instanceof Error ? e.message : String(e)))}
        >
          <Printer className="h-3 w-3" /> {t("portal.fees.printReceipt")}
        </button>
      );
    }
    // An OWED month prints as a VOUCHER — the same page with the
    // bank-deposit box, to take to the Askari counter. The route always
    // rendered it; the button was only shown after money existed, so a
    // family with an unpaid bill had nothing to print (review, 17 Sep).
    if (owedOf(f) > 0) {
      return (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11.5px] font-bold text-indigo-700 hover:bg-indigo-100"
          onClick={() => openMyFeeReceipt(f.id).catch((e) => toast.error(e instanceof Error ? e.message : String(e)))}
        >
          <Printer className="h-3 w-3" /> {t("portal.fees.printVoucher")}
        </button>
      );
    }
    return null;
  };

  // "What I see ≠ what the school noted" needs a door, not a phone
  // hunt: each month links into Contact school with the subject
  // prefilled, so the office knows exactly which bill is disputed.
  const askLink = (f: FeeStatus) => {
    const subjectLine = t("portal.fees.disputeSubject", {
      period: periodLabel(f.period),
      gr: student?.grNumber ?? "",
    });
    return (
      <Link
        to={`/school-portal/contact-school?compose=1&student=${encodeURIComponent(studentId)}&subject=${encodeURIComponent(subjectLine)}`}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] font-bold text-slate-600 hover:bg-slate-50"
      >
        <MessageCircleQuestion className="h-3 w-3" /> {t("portal.fees.askAboutBill")}
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <HeroCard
        eyebrow={student ? `GR# ${student.grNumber}` : undefined}
        title={student ? `${student.fullName} – ${t("portal.fees.title")}` : t("portal.fees.title")}
      />

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* 1 ── The balance headline. One number, one color, no math. */}
      {fees !== null && (
        <div
          className={
            "rounded-2xl border p-4 sm:p-5 " +
            (owing
              ? "border-rose-200 bg-gradient-to-br from-rose-50 to-white"
              : "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white")
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className={
                  "flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide " +
                  (owing ? "text-rose-700" : "text-emerald-700")
                }
              >
                {owing ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {t("portal.fees.balanceDue")}
              </div>
              <div className={"mt-1 text-3xl font-extrabold tabular-nums " + (owing ? "text-rose-900" : "text-emerald-900")}>
                {rs(summary.balance)}
              </div>
              {owing ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {summary.owedFees.map((f) => (
                    <span
                      key={f.id}
                      className={
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums " +
                        (isOverdue(f)
                          ? "border-rose-200 bg-rose-100 text-rose-800"
                          : "border-amber-200 bg-amber-100 text-amber-800")
                      }
                    >
                      {periodLabel(f.period)} · {rs(owedOf(f))}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-sm font-medium text-emerald-800">
                  {t("portal.fees.allSettledMsg")}
                </div>
              )}
              {owing && oldestDue && (
                <div className={"mt-2 text-xs font-semibold " + (anyOverdue ? "text-rose-700" : "text-slate-600")}>
                  {anyOverdue
                    ? t("portal.fees.overdueSince", { date: dateLabel(oldestDue) })
                    : t("portal.fees.dueBy", { date: dateLabel(oldestDue) })}
                </div>
              )}
            </div>
          </div>
          {summary.totalPaid > 0 && (
            <div className="mt-3 border-t border-slate-200/70 pt-2 text-xs text-slate-500 tabular-nums">
              {t("portal.fees.paidSummary", { amount: summary.totalPaid.toLocaleString("en-PK"), n: summary.paid })}
            </div>
          )}
        </div>
      )}

      {/* 2 ── How to pay — promoted while anything is owed. */}
      {bankAccount?.accountNumber && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-indigo-700">
            <Landmark className="h-3.5 w-3.5" /> {t("portal.fees.howToPay")}
          </div>
          <div className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
            {bankAccount.bank && (
              <div>
                <div className="text-[11px] text-slate-500">{t("portal.fees.bank")}</div>
                <div className="font-medium text-slate-800">{bankAccount.bank}</div>
              </div>
            )}
            {bankAccount.title && (
              <div>
                <div className="text-[11px] text-slate-500">{t("portal.fees.accountTitle")}</div>
                <div className="font-medium text-slate-800">{bankAccount.title}</div>
              </div>
            )}
            <div>
              <div className="text-[11px] text-slate-500">{t("portal.fees.accountNumber")}</div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold tracking-wide text-slate-900" dir="ltr">
                  {bankAccount.accountNumber}
                </span>
                <button
                  type="button"
                  onClick={() => copyText(bankAccount.accountNumber)}
                  className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-indigo-700 hover:bg-indigo-50"
                >
                  <Copy className="h-3 w-3" /> {t("portal.fees.copy")}
                </button>
              </div>
            </div>
            {bankAccount.iban && (
              <div>
                <div className="text-[11px] text-slate-500">IBAN</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold tracking-wide text-slate-900" dir="ltr">
                    {bankAccount.iban}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText(bankAccount.iban)}
                    className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-indigo-700 hover:bg-indigo-50"
                  >
                    <Copy className="h-3 w-3" /> {t("portal.fees.copy")}
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-2 text-[12px] text-slate-600">{t("portal.fees.cashNote")}</p>
        </div>
      )}

      {/* No account mapped for this class — still answer "how do I pay?"
          instead of showing nothing (review, 17 Sep). */}
      {fees !== null && !bankAccount?.accountNumber && owing && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-indigo-700">
            <Landmark className="h-3.5 w-3.5" /> {t("portal.fees.howToPay")}
          </div>
          <p className="mt-2 text-sm text-slate-700">{t("portal.fees.contactOfficeToPay")}</p>
        </div>
      )}

      {/* 3 ── Month statement cards, newest first. */}
      {fees === null ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
          {t("common.loading")}
        </div>
      ) : fees.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
          {t("portal.fees.noRecords")}
        </div>
      ) : (
        <div className="space-y-2.5">
          {fees.map((f) => {
            const live = (f.payments ?? []).filter((p) => !p.voidedAt);
            const owed = owedOf(f);
            const overdue = isOverdue(f);
            return (
              <div
                key={f.id}
                className={
                  "rounded-2xl border bg-white p-3.5 shadow-sm " +
                  (overdue
                    ? "border-rose-200 border-s-4 border-s-rose-400"
                    : owed > 0
                    ? "border-amber-200 border-s-4 border-s-amber-400"
                    : "border-slate-200")
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-extrabold text-slate-900">{periodLabel(f.period)}</span>
                  <FeeStatusPill fee={f} />
                  <span className="ms-auto text-sm font-bold tabular-nums text-slate-900">
                    {f.amount_due != null ? rs(f.amount_due) : "—"}
                  </span>
                </div>
                {f.due_date && f.status !== "paid" && f.status !== "waived" && (
                  <div className={"mt-1 text-[11.5px] " + (overdue ? "font-semibold text-rose-600" : "text-slate-500")}>
                    {t("portal.fees.dueBy", { date: dateLabel(f.due_date) })}
                  </div>
                )}
                {live.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                    {live.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-[12.5px] text-slate-600">
                        <CheckCircle2 className="h-3.5 w-3.5 flex-none text-emerald-500" />
                        <span className="tabular-nums">{dateLabel(p.paidOn)}</span>
                        <span className="ms-auto font-semibold tabular-nums text-slate-800">{rs(Number(p.amount))}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(owed > 0 && (f.amount_paid ?? 0) > 0) && (
                  <div className="mt-1.5 text-[12px] font-semibold text-amber-700 tabular-nums">
                    {t("portal.fees.remaining")}: {rs(owed)}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {receiptButton(f)}
                  {askLink(f)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
