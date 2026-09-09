// TodayStatusPills — plain-language summary chips shown on:
//   1. the multi-child landing card (compact mode)
//   2. the per-child dashboard (expanded mode)
//
// Same data source (TodaySnapshot). Each pill links to its detail page
// so parents can drill in with one tap.

import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  CheckCircle2, XCircle, Clock, Wallet, BookOpen, Award,
  MessageSquare, FileText, AlertCircle,
} from "lucide-react";
import type { TodaySnapshot } from "../../../utils/schoolPortalApi";

interface Props {
  studentId: string;
  snapshot: TodaySnapshot;
  // compact = single-line chips on multi-child cards.
  // expanded = larger cards with detail line, for the child dashboard.
  variant: "compact" | "expanded";
}

const ATT_LABEL: Record<string, { textKey: string; tone: string; icon: any }> = {
  present: { textKey: "portal.today.attPresent", tone: "emerald", icon: CheckCircle2 },
  late:    { textKey: "portal.today.attLate",    tone: "amber",   icon: Clock },
  absent:  { textKey: "portal.today.attAbsent",  tone: "rose",    icon: XCircle },
  excused: { textKey: "portal.today.attExcused", tone: "slate",   icon: CheckCircle2 },
};

function toneClasses(tone: string, variant: "compact" | "expanded") {
  const base = variant === "compact"
    ? "inline-flex items-center gap-1 rounded-full text-[11px] font-medium px-2 py-0.5 "
    : "rounded-lg border p-3 flex items-start gap-2 ";
  switch (tone) {
    case "emerald": return base + "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "amber":   return base + "bg-amber-50 text-amber-800 border-amber-200";
    case "rose":    return base + "bg-rose-50 text-rose-800 border-rose-200";
    case "indigo":  return base + "bg-indigo-50 text-indigo-800 border-indigo-200";
    case "sky":     return base + "bg-sky-50 text-sky-800 border-sky-200";
    case "slate":
    default:        return base + "bg-slate-50 text-slate-700 border-slate-200";
  }
}

// Compact pill renderer.
function Pill({ tone, icon: Icon, label, to }: {
  tone: string; icon: any; label: string; to: string;
}) {
  return (
    <Link to={to} className={toneClasses(tone, "compact") + " hover:opacity-90"}>
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </Link>
  );
}

// Expanded card renderer — bigger surface with a detail subline.
function Card({ tone, icon: Icon, title, detail, to }: {
  tone: string; icon: any; title: string; detail: string; to: string;
}) {
  return (
    <Link to={to} className={toneClasses(tone, "expanded") + " hover:opacity-95 transition"}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] opacity-80 mt-0.5">{detail}</div>
      </div>
    </Link>
  );
}

function fmtPkr(n: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency", currency: "PKR", maximumFractionDigits: 0,
  }).format(n);
}

export function TodayStatusPills({ studentId, snapshot, variant }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language ?? "en";
  const base = `/school-portal/students/${studentId}`;
  const att = snapshot.attendanceToday;
  const items: Array<{
    tone: string; icon: any; title: string; detail: string; to: string;
  }> = [];

  // Attendance.
  if (att) {
    const lbl = ATT_LABEL[att.status];
    if (lbl) {
      items.push({
        tone: lbl.tone, icon: lbl.icon,
        title: t(lbl.textKey),
        detail: att.takenAt
          ? t("portal.today.markedAt", {
              time: new Date(att.takenAt).toLocaleTimeString(
                lang.startsWith("ur") ? "ur-PK" : [],
                { hour: "2-digit", minute: "2-digit" },
              ),
            })
          : t("portal.today.today"),
        to: `${base}/attendance`,
      });
    }
  } else {
    items.push({
      tone: "slate", icon: Clock,
      title: t("portal.today.attNotTaken"),
      detail: t("portal.today.attNotTakenDetail"),
      to: `${base}/attendance`,
    });
  }

  // Homework pending.
  if (snapshot.homeworkPending.count > 0) {
    const due = snapshot.homeworkPending.soonestDueDate;
    items.push({
      tone: "amber", icon: BookOpen,
      title: t("portal.today.homeworkPending", { n: snapshot.homeworkPending.count }),
      detail: due ? t("portal.today.nextDue", { date: due }) : t("portal.today.openHomework"),
      to: `${base}/grades`,
    });
  }

  // Fees due now.
  if (snapshot.feesDueNow) {
    items.push({
      tone: "rose", icon: Wallet,
      title: t("portal.today.feeDue", { amount: fmtPkr(snapshot.feesDueNow.amount) }),
      detail: snapshot.feesDueNow.periodLabel || t("portal.today.viewInvoice"),
      to: `${base}/fees`,
    });
  } else if (variant === "expanded") {
    items.push({
      tone: "emerald", icon: Wallet,
      title: t("portal.today.feesUpToDate"),
      detail: t("portal.today.nothingDue"),
      to: `${base}/fees`,
    });
  }

  // Hifz revision.
  if (snapshot.hifzRevisionNeeded) {
    items.push({
      tone: "amber", icon: Award,
      title: t("portal.today.hifzRevisionNeeded"),
      detail: t("portal.today.lastRevision", { n: snapshot.hifzRevisionNeeded.daysSince }),
      to: `${base}/hifz`,
    });
  }

  // Report card published — promoted ABOVE the teacher note so when
  // multiple cards stack the highest-signal pill (a publishable term
  // result) stays in the visible window on the compact landing strip.
  // Previously a 4th teacher-note pill was pushing this off the row
  // for some children even when slice(0, 5) should have fit it; the
  // wrap-at-row-end caused it to land on a second visual line that the
  // landing card layout hid.
  if (snapshot.publishedReportCardTermName) {
    items.push({
      tone: "indigo", icon: FileText,
      title: t("portal.today.reportCard", { term: snapshot.publishedReportCardTermName }),
      detail: t("portal.today.publishedTap"),
      to: `${base}/report-card`,
    });
  }

  // Latest teacher note.
  if (snapshot.latestTeacherNote) {
    const isPositive = snapshot.latestTeacherNote.kind === "positive";
    items.push({
      tone: isPositive ? "emerald" : "amber",
      icon: isPositive ? MessageSquare : AlertCircle,
      title: isPositive ? t("portal.today.teacherPraise") : t("portal.today.teacherConcern"),
      detail: snapshot.latestTeacherNote.summary || t("portal.today.viewNote"),
      to: `${base}/behavior`,
    });
  }

  if (items.length === 0) {
    return null;
  }

  if (variant === "compact") {
    // Compact mode: pills row, short labels only.
    return (
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 5).map((it, i) => (
          <Pill key={i} tone={it.tone} icon={it.icon} label={it.title} to={it.to} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((it, i) => (
        <Card key={i} {...it} />
      ))}
    </div>
  );
}

export default TodayStatusPills;
