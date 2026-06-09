// StudentReportCard — printable, single-page-friendly report card for one student.
//
// Route: /school/orgs/:orgId/admin/students/:studentId/report-card
//
// Two key design choices:
//
//   1. Print CSS hides the page chrome (sidebar / nav / browser
//      buttons) so window.print() produces a clean sheet. The user
//      Saves as PDF via the browser's native dialog — we don't need a
//      server-side PDF stack for the pilot.
//
//   2. Layout deliberately mirrors the IFS paper report card the
//      principal already shows parents at the term meeting: school
//      header at the top, student basics, academic section, attendance
//      + behavior, then Hifz on its own block (matching the "two
//      parallel progress systems" spec).

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { Printer, ArrowLeft, Calendar } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  getReportCard,
  getSchoolMe,
  isOrgAdmin,
  type ReportCardResponse,
  type SchoolMeResponse,
} from "../../../utils/schoolApi";

function letterGrade(pct: number | null): string {
  if (pct == null) return "—";
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

export function StudentReportCard() {
  const { orgId = "", studentId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const startDate = search.get("startDate") ?? "";
  const endDate = search.get("endDate") ?? "";

  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [data, setData] = useState<ReportCardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId || !studentId) return;
    setError(null);
    setData(null);
    getReportCard(orgId, studentId, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [orgId, studentId, startDate, endDate]);

  const overallLetter = useMemo(
    () => (data ? letterGrade(data.academic.overallAveragePct) : "—"),
    [data],
  );

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <Navigate to="/school" replace />;

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (!data) return <div className="text-slate-500 text-sm">Loading…</div>;

  const period =
    startDate && endDate
      ? `${fmtDate(startDate)} → ${fmtDate(endDate)}`
      : startDate
      ? `From ${fmtDate(startDate)}`
      : endDate
      ? `Up to ${fmtDate(endDate)}`
      : "All time";

  return (
    <div className="space-y-4">
      {/* Action bar — hidden on print so the sheet is just the card */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link to={`/school/orgs/${orgId}/admin/students/${studentId}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to student
          </Button>
        </Link>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-[11px]">Start</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                const v = e.target.value;
                const next = new URLSearchParams(search);
                if (v) next.set("startDate", v);
                else next.delete("startDate");
                setSearch(next);
              }}
              className="h-8 w-40 text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px]">End</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                const v = e.target.value;
                const next = new URLSearchParams(search);
                if (v) next.set("endDate", v);
                else next.delete("endDate");
                setSearch(next);
              }}
              className="h-8 w-40 text-xs"
            />
          </div>
        </div>
        <Button onClick={() => window.print()} className="ml-auto">
          <Printer className="h-4 w-4 mr-1" /> Print / Save PDF
        </Button>
      </div>

      {/* Print CSS — applies @ media print to neutralize the surrounding
          admin shell and give the sheet a clean A4-friendly layout. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
          .print-hidden, .print\\:hidden { display: none !important; }
          .report-card { box-shadow: none !important; border: 0 !important; }
        }
      `}</style>

      <article className="report-card bg-white border border-slate-200 rounded-lg shadow-sm p-8 max-w-4xl mx-auto">
        {/* Header — school name + logo + period */}
        <header className="flex items-start justify-between gap-4 pb-4 border-b-2 border-slate-900">
          <div className="flex items-center gap-3">
            {data.school.logoUrl && (
              <img
                src={data.school.logoUrl}
                alt=""
                className="h-14 w-14 rounded object-cover"
              />
            )}
            <div>
              <div className="text-2xl font-bold tracking-tight">
                {data.school.name}
              </div>
              {data.school.motto && (
                <div className="text-xs italic text-slate-600 mt-0.5">
                  {data.school.motto}
                </div>
              )}
              {data.school.address && (
                <div className="text-xs text-slate-500 mt-0.5">
                  {data.school.address}
                </div>
              )}
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="uppercase tracking-wider font-semibold text-slate-500">
              Student Report Card
            </div>
            <div className="text-slate-700 mt-1 flex items-center gap-1 justify-end">
              <Calendar className="h-3 w-3" /> {period}
            </div>
          </div>
        </header>

        {/* Student basics */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mt-5 text-sm">
          <Field label="Name" value={data.student.fullName} />
          <Field label="GR Number" value={data.student.grNumber} mono />
          <Field
            label="Class · Section"
            value={
              data.placement.className && data.placement.sectionName
                ? `${data.placement.className} — ${data.placement.sectionName}`
                : data.placement.className ?? "—"
            }
          />
          <Field
            label="Program"
            value={
              data.student.program === "hifz"
                ? "Hifz"
                : data.student.program === "conventional"
                ? "Conventional"
                : "—"
            }
          />
          <Field label="Date of Birth" value={fmtDate(data.student.dateOfBirth)} />
          <Field label="Gender" value={data.student.gender ?? "—"} />
          <Field label="Class Teacher" value={data.placement.classTeacherName ?? "—"} />
          <Field label="Hifz Teacher" value={data.placement.hifzTeacherName ?? "—"} />
        </section>

        {/* Academic block */}
        <section className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1 mb-3">
            Academic Performance
          </h2>
          {data.academic.subjects.length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              No graded assignments in this period.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-300 text-left">
                  <th className="py-1.5 font-semibold">Subject</th>
                  <th className="py-1.5 font-semibold text-right w-24 tabular-nums">
                    Average
                  </th>
                  <th className="py-1.5 font-semibold text-right w-20">Grade</th>
                </tr>
              </thead>
              <tbody>
                {data.academic.subjects.map((s) => (
                  <tr key={s.name} className="border-b border-slate-100">
                    <td className="py-1.5">{s.name}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {s.averagePct == null ? "—" : `${s.averagePct.toFixed(1)}%`}
                    </td>
                    <td className="py-1.5 text-right font-semibold">
                      {letterGrade(s.averagePct)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-900 font-bold">
                  <td className="py-2">Overall</td>
                  <td className="py-2 text-right tabular-nums">
                    {data.academic.overallAveragePct == null
                      ? "—"
                      : `${data.academic.overallAveragePct.toFixed(1)}%`}
                  </td>
                  <td className="py-2 text-right text-lg">{overallLetter}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {/* Attendance + Behavior side by side */}
        <section className="mt-6 grid sm:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1 mb-3">
              Attendance
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-600">Present</dt>
              <dd className="text-right tabular-nums">{data.attendance.present}</dd>
              <dt className="text-slate-600">Late</dt>
              <dd className="text-right tabular-nums">{data.attendance.late}</dd>
              <dt className="text-slate-600">Absent</dt>
              <dd className="text-right tabular-nums">{data.attendance.absent}</dd>
              <dt className="text-slate-600">Excused</dt>
              <dd className="text-right tabular-nums">{data.attendance.excused}</dd>
              <dt className="font-semibold border-t pt-1">Total days</dt>
              <dd className="text-right tabular-nums font-semibold border-t pt-1">
                {data.attendance.total}
              </dd>
              <dt className="font-semibold">Attendance %</dt>
              <dd className="text-right tabular-nums font-semibold">
                {data.attendance.attendancePct == null
                  ? "—"
                  : `${data.attendance.attendancePct}%`}
              </dd>
            </dl>
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1 mb-3">
              Behavior
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-600">Positive observations</dt>
              <dd className="text-right tabular-nums">{data.behavior.positive}</dd>
              <dt className="text-slate-600">Concerns</dt>
              <dd className="text-right tabular-nums">{data.behavior.concern}</dd>
              <dt className="font-semibold border-t pt-1">Net behavior points</dt>
              <dd
                className={
                  "text-right tabular-nums font-semibold border-t pt-1 " +
                  (data.behavior.netPoints >= 0 ? "text-emerald-700" : "text-rose-700")
                }
              >
                {data.behavior.netPoints > 0 ? "+" : ""}
                {data.behavior.netPoints}
              </dd>
            </dl>
          </div>
        </section>

        {/* Hifz — own block. Per the spec, this is a parallel track and
            should never be confused with academic grades. */}
        <section className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1 mb-3">
            Hifz (Memorization) Progress
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-600">Ayahs memorized</dt>
              <dd className="text-right tabular-nums">{data.hifz.ayahsMemorized}</dd>
              <dt className="text-slate-600">Surahs touched</dt>
              <dd className="text-right tabular-nums">{data.hifz.surahsCompleted}</dd>
              <dt className="text-slate-600">Sabaq / revision entries</dt>
              <dd className="text-right tabular-nums">{data.hifz.totalEntries}</dd>
              <dt className="text-slate-600">Missed sabaq days</dt>
              <dd className="text-right tabular-nums">{data.hifz.missedCount}</dd>
            </dl>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-emerald-700">Excellent</dt>
              <dd className="text-right tabular-nums text-emerald-700">
                {data.hifz.qualityCounts.excellent}
              </dd>
              <dt className="text-sky-700">Good</dt>
              <dd className="text-right tabular-nums text-sky-700">
                {data.hifz.qualityCounts.good}
              </dd>
              <dt className="text-amber-700">Needs practice</dt>
              <dd className="text-right tabular-nums text-amber-700">
                {data.hifz.qualityCounts.needs_practice}
              </dd>
              <dt className="text-rose-700">Weak</dt>
              <dd className="text-right tabular-nums text-rose-700">
                {data.hifz.qualityCounts.weak}
              </dd>
            </dl>
          </div>
        </section>

        {/* Signatures footer */}
        <footer className="mt-12 pt-8 grid grid-cols-3 gap-6 text-xs">
          <div className="border-t border-slate-400 pt-1 text-center">Class Teacher</div>
          <div className="border-t border-slate-400 pt-1 text-center">Hifz Teacher</div>
          <div className="border-t border-slate-400 pt-1 text-center">Principal</div>
        </footer>
      </article>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={"text-sm text-slate-900 " + (mono ? "font-mono" : "")}>{value}</div>
    </div>
  );
}

export default StudentReportCard;
