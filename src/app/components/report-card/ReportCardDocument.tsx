// THE report card. One definition, rendered by both surfaces.
//
// 3 Oct, results morning: the office reported that none of the card
// work from 30 Sep - 2 Oct had reached parents. The cause was not any
// one of those changes - it was that the office's page and the parent's
// portal were two components rendering the same payload, so thirteen
// fixes landed on one and missed the other for four days.
//
// Everything a parent and the office must read IDENTICALLY lives here:
// header, identity band, subject table, attendance/behavior/hifz boxes,
// the remarks chart, the signature strip. Change the card once, here,
// and both surfaces move together.
//
// What legitimately differs stays OUT of this file and in the pages:
//   office  - workflow bar, editable remark fields, teacher observations,
//             the AI tray, the findings panel, print CSS
//   parent  - Urdu labels and reader-language remarks
// Differences are expressed through props (labels, render callbacks),
// never by forking the markup.

import type { ReactNode } from "react";
import { BookOpen, Calendar, TrendingUp, Award } from "lucide-react";
import type { TermReportCardResponse } from "../../../utils/schoolApi";
import { fmtDayMonthYear, paperOnly, bandRangeLabel } from "../../../utils/reportCardFormat";

type Card = TermReportCardResponse;
type Subject = Card["academic"]["subjects"][number];

/** Every word the card prints. The office passes English; the portal
 *  passes its translations. Nothing here is hardcoded at a call site. */
export interface CardLabels {
  reportCard: string;
  academic: string;
  subject: string;
  total: string;
  grade: string;
  remarks: string;
  overall: string;
  abs: string;
  noMarks: string;
  name: string;
  grNo: string;
  klass: string;
  classTeacher: string;
  attendance: string;
  attendanceWord: string;
  present: string;
  late: string;
  absent: string;
  excused?: string;
  behavior: string;
  positiveNotes: string;
  concerns: string;
  netPoints: string;
  hifzProgress: string;
  ayahsMemorized: string;
  surahsTouched: string;
  signClassTeacher: string;
  signPrincipal: string;
  signParent: string;
  stampBox: string;
  remarksChart: string;
  passMark: (pct: number) => string;
  ofDays: (present: number, total: number) => string;
  daysSinceJoining: (present: number) => string;
  joinedOn: (date: string) => string;
  carried: (count: number, date: string) => string;
  entriesLine: (n: number, missed: number) => string;
  partTermNoPct: string;
  failedSubjects: (subjects: string, pct: number) => string;
  failedBelow: (pct: number) => string;
}

/** English, as the office reads it. The portal overrides with i18n. */
export const EN_LABELS: CardLabels = {
  reportCard: "Report Card",
  academic: "Academic performance",
  subject: "Subject",
  total: "Total",
  grade: "Grade",
  remarks: "Remarks",
  overall: "Overall",
  abs: "Abs",
  noMarks: "No subject scores recorded for this term.",
  name: "Name",
  grNo: "GR No",
  klass: "Class",
  classTeacher: "Class teacher",
  attendance: "Attendance",
  attendanceWord: "attendance",
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
  behavior: "Behavior",
  positiveNotes: "Positive notes",
  concerns: "Concerns",
  netPoints: "Net points:",
  hifzProgress: "Hifz progress",
  ayahsMemorized: "Ayahs memorized",
  surahsTouched: "Surahs touched",
  signClassTeacher: "Class teacher",
  signPrincipal: "Principal",
  signParent: "Parent signature",
  stampBox: "School stamp",
  remarksChart: "Remarks chart",
  passMark: (pct) => `Pass mark ${pct}%`,
  ofDays: (present, total) => `${present} days of ${total} days`,
  daysSinceJoining: (present) => `${present} days since joining`,
  joinedOn: (date) => `Joined ${date}, part-way through the term.`,
  carried: (count, date) => `Includes ${count} days from the school register up to ${date}.`,
  entriesLine: (n, missed) => `Entries: ${n} (missed ${missed})`,
  partTermNoPct: "Attendance percentage not shown for a part-term.",
  failedSubjects: (subjects, pct) => `— Failed (${subjects} below ${pct}%)`,
  failedBelow: (pct) => `— Failed (below ${pct}%)`,
};

// ── Header ────────────────────────────────────────────────────────────
export function CardHeader({ card, labels, qr, contactFallback }: {
  card: Card;
  labels: CardLabels;
  qr?: ReactNode;
  /** Used only until the payload carries the contact (v1.23.0): the
   *  office page can read org settings, a parent token cannot, so the
   *  office passes what it fetched and the payload takes over on the
   *  next edge deploy without a second code change. */
  contactFallback?: { n: string; wa: boolean } | null;
}) {
  const phone = card.school.whatsappNumber?.trim()
    ? { n: card.school.whatsappNumber.trim(), wa: true }
    : card.school.contactPhone?.trim()
      ? { n: card.school.contactPhone.trim(), wa: false }
      : contactFallback ?? null;
  return (
    <div className="border-b border-slate-200 pb-2 print-keep">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {card.school.logoUrl && (
            <img src={card.school.logoUrl} alt="" className="h-12 w-12 rounded object-cover shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-lg font-bold text-slate-900">{card.school.name}</div>
            {card.school.motto && <div className="text-xs text-slate-600 italic">{card.school.motto}</div>}
          </div>
        </div>
        <div className="text-right flex items-start gap-3 shrink-0">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              {labels.reportCard}
            </div>
            {phone && (
              <div className="text-[10px] text-slate-600 mt-0.5 whitespace-nowrap">
                {phone.wa ? "WhatsApp " : "Tel "}{phone.n}
              </div>
            )}
          </div>
          {qr}
        </div>
      </div>
      {/* One line PER CAMPUS, full width under the row. */}
      {card.school.address && (
        <div className="text-[11px] text-slate-500 mt-1 print-addr">
          {card.school.address.split(/\r?\n/).filter((l) => l.trim()).map((line, i) => (
            <div key={i} className="truncate">{line.trim()}</div>
          ))}
        </div>
      )}
      <div className="text-center text-[11px] text-slate-600 mt-1.5 whitespace-nowrap print-term-line">
        <span className="font-semibold text-slate-900">{card.term.name}</span>
        <span className="text-slate-400"> · </span>
        {fmtDayMonthYear(card.term.startDate)} – {fmtDayMonthYear(card.term.endDate)}
      </div>
    </div>
  );
}

// ── Identity band ─────────────────────────────────────────────────────
export function CardIdentity({ card, labels }: { card: Card; labels: CardLabels }) {
  const cell = (k: string, v: ReactNode) => (
    <div>
      <div className="text-slate-500">{k}</div>
      <div className="font-semibold text-slate-900">{v}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 print-keep print-info-band">
      {cell(labels.name, card.student.fullName)}
      {cell(labels.grNo, card.student.grNumber)}
      {cell(labels.klass,
        `${card.placement.className ?? "—"}${card.placement.sectionName ? ` — ${card.placement.sectionName}` : ""}`)}
      {cell(labels.classTeacher, card.placement.classTeacherName ?? "—")}
    </div>
  );
}

// ── Subject table ─────────────────────────────────────────────────────
export function CardSubjectTable({ card, labels, remarkFor, fmtPct }: {
  card: Card;
  labels: CardLabels;
  /** The office injects live unsaved edits; the portal injects the
   *  reader's language. Both fall back to the same default. */
  remarkFor: (s: Subject) => ReactNode;
  fmtPct: (n: number | null) => string;
}) {
  const o = card.academic.overall;
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1">
        <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
        <span className="underline underline-offset-2">{labels.academic}</span>
      </h3>
      {card.academic.subjects.length === 0 ? (
        <div className="text-xs text-slate-500 italic">{labels.noMarks}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-300 print-subject-table">
            {/* Width HINTS, not hard shares - a column grows if its
                content needs it (a fixed layout printed "422.5/650"
                across the next column, office 2 Oct). */}
            <colgroup>
              <col className="w-[14%]" />
              {card.exams.map((e) => <col key={e.id} className="w-[10%]" />)}
              <col className="w-[11%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col />
            </colgroup>
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="text-left px-2 py-1.5 border border-slate-200">{labels.subject}</th>
                {/* The class's OWN column name ("Overall Learning &
                    Participation" on Classes I-VII), else the paper
                    without the term said twice (office, 1 Oct). */}
                {card.exams.map((e) => (
                  <th key={e.id} className="text-center px-2 py-1.5 border border-slate-200">
                    {e.columnLabel || paperOnly(e.name, card.term.name)}
                  </th>
                ))}
                <th className="text-right px-2 py-1.5 border border-slate-200">{labels.total}</th>
                <th className="text-right px-2 py-1.5 border border-slate-200">%</th>
                <th className="text-center px-2 py-1.5 border border-slate-200">{labels.grade}</th>
                <th className="text-center px-2 py-1.5 border border-slate-200">{labels.remarks}</th>
              </tr>
            </thead>
            <tbody>
              {card.academic.subjects.map((s) => {
                // Below the school's pass line reads RED on both
                // surfaces - they must never disagree about who failed.
                const failed = s.percentage !== null && s.percentage < o.passMarkPct;
                return (
                  <tr key={s.classSubjectId}>
                    <td className="px-2 py-1.5 font-medium border border-slate-200">{s.name}</td>
                    {card.exams.map((e) => {
                      const pe = s.perExam.find((x) => x.examId === e.id);
                      return (
                        <td key={e.id} className="px-2 py-1.5 text-center border border-slate-200">
                          {!pe ? "—" : pe.absent ? <span className="text-rose-600">{labels.abs}</span> :
                            pe.obtained === null ? "—" :
                            <>{pe.obtained}<span className="text-slate-400">/{pe.max}</span></>}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right border border-slate-200">
                      {s.totalMax > 0 ? `${s.totalObtained}/${s.totalMax}` : "—"}
                    </td>
                    <td className={"px-2 py-1.5 text-right font-medium border border-slate-200 " + (failed ? "text-rose-700" : "")}>
                      {fmtPct(s.percentage)}
                    </td>
                    <td className={"px-2 py-1.5 text-center font-bold border border-slate-200 " + (failed ? "text-rose-700" : "")}>
                      {s.letter}
                    </td>
                    <td className={"px-2 py-1.5 border border-slate-200 print-subject-remark " + (failed ? "text-rose-700" : "text-slate-600")}>
                      <div className="remark-clamp">{remarkFor(s)}</div>
                    </td>
                  </tr>
                );
              })}
              {/* The heavier rule above Overall is the office's "line in
                  between" pen note (1 Oct). */}
              <tr className="border-t-2 border-slate-400 bg-slate-50/60 font-semibold">
                <td className="px-2 py-1.5 border border-slate-200 border-t-2 border-t-slate-400">{labels.overall}</td>
                <td colSpan={card.exams.length} className="px-2 py-1.5 border border-slate-200 border-t-2 border-t-slate-400"></td>
                <td className="px-2 py-1.5 text-right border border-slate-200 border-t-2 border-t-slate-400">
                  {o.max > 0 ? `${o.obtained}/${o.max}` : "—"}
                </td>
                <td className={"px-2 py-1.5 text-right border border-slate-200 border-t-2 border-t-slate-400 " + (o.failed ? "font-bold text-rose-700" : "")}>
                  {fmtPct(o.percentage)}
                </td>
                <td className="px-2 py-1.5 text-center border border-slate-200 border-t-2 border-t-slate-400">{o.letter}</td>
                <td className="px-2 py-1.5 border border-slate-200 border-t-2 border-t-slate-400">
                  {o.remark}
                  {o.failed && (
                    <span className="ml-1.5 font-bold text-rose-700">
                      {(o.failedSubjects ?? []).length > 0
                        ? labels.failedSubjects(o.failedSubjects!.join(", "), o.passMarkPct)
                        : labels.failedBelow(o.passMarkPct)}
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Attendance / behavior / hifz ──────────────────────────────────────
export function CardStatBoxes({ card, labels, fmtPct }: {
  card: Card; labels: CardLabels; fmtPct: (n: number | null) => string;
}) {
  const a = card.attendance;
  const box = (icon: ReactNode, title: string, body: ReactNode) => (
    <div className="rounded-md border border-slate-300 bg-white p-3">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 pb-1 border-b border-slate-200 flex items-center gap-1">
        {icon} {title}
      </div>
      <div className="text-xs space-y-0.5">{body}</div>
    </div>
  );
  return (
    <section className={`grid grid-cols-1 ${card.hifz.show !== false ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-3 print-keep`}>
      {box(<Calendar className="h-3.5 w-3.5 text-indigo-500" />, labels.attendance, (
        <>
          {/* Days present leads. With a carried balance the per-status
              counts below cover only the days marked here (21 Sep). */}
          <div>
            {labels.present}:{" "}
            <span className="font-medium">
              {a.joinedMidTerm
                ? labels.daysSinceJoining(a.daysPresent ?? a.present)
                : labels.ofDays(a.daysPresent ?? a.present, a.workingDays ?? a.total)}
            </span>
          </div>
          {/* A mid-term arrival divided by their class's whole register
              read as a truant - print the joining date instead (25 Sep). */}
          {a.joinedMidTerm ? (
            <div className="text-[10px] leading-tight text-slate-500">
              {labels.joinedOn(String(a.startsOn ?? a.admissionDate ?? ""))}
            </div>
          ) : !!a.carriedDays && (
            <div className="text-[10px] leading-tight text-slate-500">
              {labels.carried(a.carriedDays, a.carriedAsOf ?? "")}
            </div>
          )}
          <div>{labels.late}: <span className="font-medium">{a.late}</span></div>
          <div>{labels.absent}: <span className="font-medium">{a.absent}</span></div>
          <div className="pt-1 border-t border-slate-100 mt-1">
            {a.joinedMidTerm ? (
              <span className="text-slate-500">{labels.partTermNoPct}</span>
            ) : (
              <><span className="font-semibold">{fmtPct(a.attendancePct)}</span> {labels.attendanceWord}</>
            )}
          </div>
        </>
      ))}
      {box(<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />, labels.behavior, (
        <>
          <div>{labels.positiveNotes}: <span className="font-medium text-emerald-700">{card.behavior.positive}</span></div>
          <div>{labels.concerns}: <span className="font-medium text-amber-700">{card.behavior.concern}</span></div>
          <div>{labels.netPoints} <span className="font-semibold">{card.behavior.netPoints}</span></div>
        </>
      ))}
      {/* Only a memorizing child gets the Hifz box - an academic child's
          card showed a box of zeros (school, 14 Sep). */}
      {card.hifz.show !== false && box(
        <Award className="h-3.5 w-3.5 text-amber-500" />, labels.hifzProgress, (
          <>
            <div>{labels.ayahsMemorized}: <span className="font-medium">{card.hifz.ayahsMemorized}</span></div>
            <div>{labels.surahsTouched}: <span className="font-medium">{card.hifz.surahsCompleted}</span></div>
            <div>{labels.entriesLine(card.hifz.totalEntries, card.hifz.missedCount)}</div>
          </>
        ))}
    </section>
  );
}

// ── Remarks chart ─────────────────────────────────────────────────────
/** The school's own chart, laid out the way they print it on their own
 *  paper (office, 2 Oct, with a photo): remark word, grade, range. */
export function CardRemarksChart({ card, labels }: { card: Card; labels: CardLabels }) {
  const raw = card.gradeScale?.bands ?? [];
  if (raw.length === 0) return null;
  const bands = [...raw].sort((a, b) => b.minPct - a.minPct);
  const lowest = bands[bands.length - 1];
  // Only say the pass mark when the chart does not already say it.
  const chartSaysPass = Math.round(lowest?.maxPct ?? -1) === card.academic.overall.passMarkPct;
  return (
    <div className="mt-5 flex justify-center print-keep">
      <div className="inline-block border-2 border-indigo-900/70 rounded-sm px-4 py-2">
        <div className="text-center text-[11px] font-bold uppercase tracking-wider text-indigo-900 mb-1">
          {labels.remarksChart}
        </div>
        <table className="text-[10px] text-slate-700">
          <tbody>
            {bands.map((b) => (
              <tr key={`${b.letter}-${b.minPct}`}>
                <td className="pr-6 py-[1px] whitespace-nowrap">{b.remark ?? "—"}</td>
                <td className="pr-6 py-[1px] text-center font-semibold whitespace-nowrap">{b.letter}</td>
                <td className="py-[1px] text-right whitespace-nowrap tabular-nums">{bandRangeLabel(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!chartSaysPass && (
          <div className="text-center text-[9px] text-slate-500 mt-1">
            {labels.passMark(card.academic.overall.passMarkPct)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Signature strip ───────────────────────────────────────────────────
/** Which lines print is the school's call (26 Sep: teachers were uneasy
 *  about handing over a signature image). The row rebalances to however
 *  many are switched on. */
export function CardSignatures({ card, labels, sizes = "normal" }: {
  card: Card; labels: CardLabels; sizes?: "normal" | "compact";
}) {
  const sig = card.school.signatureLines
    ?? { classTeacher: true, principal: true, parent: true, stamp: true };
  const n = [sig.classTeacher, sig.principal, sig.parent, sig.stamp].filter(Boolean).length;
  if (n === 0) return null;
  const lineH = sizes === "compact" ? "h-10" : "h-10";
  return (
    <div className="grid gap-6 text-[11px] text-slate-600"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      {sig.classTeacher && (
        <div className="text-center">
          <div className={`${lineH} border-b border-slate-300 flex items-end justify-center`}>
            {card.placement.classTeacherSignatureUrl && (
              <img src={card.placement.classTeacherSignatureUrl} alt="" className="max-h-9 max-w-full object-contain" />
            )}
          </div>
          <div className="mt-1">{labels.signClassTeacher}</div>
          <div className="text-[10px] text-slate-500">{card.placement.classTeacherName ?? ""}</div>
        </div>
      )}
      {sig.principal && (
        <div className="text-center">
          <div className={`${lineH} border-b border-slate-300 flex items-end justify-center`}>
            {card.school.principalSignatureUrl && (
              <img src={card.school.principalSignatureUrl} alt="" className="max-h-9 max-w-full object-contain" />
            )}
          </div>
          <div className="mt-1">{labels.signPrincipal}</div>
        </div>
      )}
      {sig.parent && (
        <div className="text-center">
          <div className={`${lineH} border-b border-slate-300`}></div>
          <div className="mt-1">{labels.signParent}</div>
        </div>
      )}
      {sig.stamp && (
        <div className="text-center">
          {card.school.stampUrl ? (
            <div className="h-14 flex items-center justify-center">
              <img src={card.school.stampUrl} alt="" className="max-h-14 max-w-full object-contain" />
            </div>
          ) : (
            <div className="h-14 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">
              {labels.stampBox}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
