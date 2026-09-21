// ExamMarks — entering the Hifz half-yearly paper.
//
// The examiner draws three questions from each child's OWN memorised
// portion, so every row carries that child's syllabus line. Without it
// the person entering marks is holding 84 different syllabi in their
// head.
//
// Every heading follows the READER, not the paper: a row carries its
// printed name and, when the school gave one, an English twin; میزان
// and کیفیت come from the locale files (Muneeb, 22 Sep).
//
// The numbers are typed exactly as they appear on the paper — six rows,
// each out of its own maximum — and the میزان, the braced subtotal and
// the کیفیت band are computed. Nobody adds up 100 by hand for 84
// children, and nobody looks up which band 78 falls in.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";
import { ArrowLeft, ClipboardList, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  getSchoolMe, isOrgAdmin, listClasses, listTerms, listExams,
  getExamMarks, saveExamMarks,
  type AdminClass, type SchoolMeResponse, type Exam,
  type ExamComponent, type ExamMarkRow,
} from "../../../utils/schoolApi";
import { NoAccessRedirect, sectionTitleClasses } from "../../components/school-ui";

/** Band colours run cool-to-warm so a راسب is visible down a long list
 *  without anyone reading the word. */
const BAND_CLASS: Record<string, string> = {
  "ممتاز": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "جید جدا": "bg-teal-100 text-teal-800 border-teal-200",
  "جید": "bg-sky-100 text-sky-800 border-sky-200",
  "مقبول": "bg-amber-100 text-amber-800 border-amber-200",
  "راسب": "bg-rose-100 text-rose-800 border-rose-200",
};

export function ExamMarks() {
  const { t, i18n } = useTranslation();
  // Urdu reader gets the paper's own name; everyone else gets the
  // English twin, falling back to the printed name when the school
  // never gave one.
  const isUrdu = (i18n.language ?? "en").startsWith("ur");
  const rowLabel = (c: { name: string; nameEn?: string | null }) =>
    isUrdu ? c.name : (c.nameEn || c.name);
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [params] = useSearchParams();
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState(params.get("examId") ?? "");
  const [sectionId, setSectionId] = useState(params.get("sectionId") ?? "");
  const [components, setComponents] = useState<ExamComponent[]>([]);
  const [rows, setRows] = useState<ExamMarkRow[]>([]);
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);

  // Every exam, across terms — the same reason as the syllabus page: a
  // Hifz paper does not belong to a term the main school named.
  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
    listTerms(orgId)
      .then(async (r) => {
        const lists = await Promise.all(
          r.terms.map((t) => listExams(orgId, t.id).then((x) => x.exams).catch(() => [])),
        );
        const all = lists.flat().filter((e) => !e.archivedAt);
        all.sort((a, b) => (b.examDate ?? "").localeCompare(a.examDate ?? ""));
        setExams(all);
      })
      .catch(() => {});
  }, [orgId]);

  const sectionOptions = useMemo(() => {
    const hifz: Array<{ id: string; label: string }> = [];
    const rest: Array<{ id: string; label: string }> = [];
    for (const c of classes) {
      for (const s of c.sections ?? []) {
        const entry = { id: s.id, label: `${c.name} — ${s.name}` };
        (c.kind === "hifz" ? hifz : rest).push(entry);
      }
    }
    return [...hifz, ...rest];
  }, [classes]);

  const load = () => {
    if (!orgId || !examId || !sectionId) { setRows([]); setComponents([]); return; }
    setLoading(true);
    setError(null);
    getExamMarks(orgId, examId, sectionId)
      .then((r) => {
        setComponents(r.components);
        setRows(r.rows);
        setDraft(Object.fromEntries(r.rows.map((row) => [
          row.studentId,
          Object.fromEntries(r.components.map((c) => [
            c.id,
            row.marks[c.id] === null || row.marks[c.id] === undefined
              ? "" : String(row.marks[c.id]),
          ])),
        ])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [orgId, examId, sectionId]);

  /** Save one child's row. The server returns the totals it computed, so
   *  the screen never adds up separately and drifts from the record. */
  const saveRow = async (row: ExamMarkRow, absent = row.absent) => {
    const typed = draft[row.studentId] ?? {};
    const marks: Record<string, number | null> = {};
    for (const c of components) {
      const v = (typed[c.id] ?? "").trim();
      marks[c.id] = v === "" ? null : Number(v);
      if (v !== "" && !Number.isFinite(marks[c.id] as number)) {
        toast.error(`"${c.name}" — ${v} is not a number.`);
        return;
      }
    }
    try {
      const r = await saveExamMarks(orgId, examId, row.studentId, marks, absent);
      setRows((rs) => rs.map((x) =>
        x.studentId === row.studentId
          ? { ...x, marks: r.marks, totals: r.totals, band: r.band, absent }
          : x));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      load();
    }
  };

  const paperTotal = components.reduce((s, c) => s + c.maxMarks, 0);
  const marked = rows.filter((r) => r.totals.unmarked === 0).length;

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId)) return <NoAccessRedirect to={`/school/orgs/${orgId}`} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to={`/school/orgs/${orgId}/admin/assessment`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Assessment
          </Button>
        </Link>
        {examId && sectionId && (
          <Link to={`/school/orgs/${orgId}/admin/assessment/exam-syllabus?examId=${examId}&sectionId=${sectionId}`}>
            <Button variant="outline" size="sm">{t("examMarks.syllabusLink")}</Button>
          </Link>
        )}
      </div>

      <div>
        <h1 className={sectionTitleClasses}>
          <ClipboardList className="mr-2 inline h-5 w-5 text-indigo-600" />
          {t("examMarks.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {t("examMarks.intro", { total: t("examMarks.total"), grade: t("examMarks.grade") })}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-slate-500">{t("examMarks.exam")}</Label>
          <Select value={examId} onValueChange={setExamId}>
            <SelectTrigger className="h-9 w-72 text-sm"><SelectValue placeholder={t("examMarks.pickExam")} /></SelectTrigger>
            <SelectContent>
              {exams.length === 0 && <div className="px-2 py-1.5 text-xs text-slate-500">{t("examMarks.noExams")}</div>}
              {exams.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                  {e.examDate
                    ? ` · ${new Date(e.examDate + "T00:00:00").toLocaleDateString(undefined, {
                        day: "numeric", month: "short", year: "numeric",
                      })}`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-slate-500">{t("examMarks.section")}</Label>
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger className="h-9 w-56 text-sm"><SelectValue placeholder={t("examMarks.pickSection")} /></SelectTrigger>
            <SelectContent>
              {sectionOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {rows.length > 0 && (
          <span className="ms-auto text-xs text-slate-500">
            {t("examMarks.progress", { marked, total: rows.length, paper: paperTotal })}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {examId && sectionId && components.length === 0 && !loading && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t("examMarks.noRows")}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("common.loading")}</p>
      ) : rows.length > 0 && components.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2 font-semibold text-slate-700">{t("examMarks.student")}</th>
                {components.map((c) => (
                  <th key={c.id} className="px-2 py-2 text-center font-semibold text-slate-700 whitespace-nowrap">
                    <span className="block" dir="auto">{rowLabel(c)}</span>
                    <span className="block text-[10px] font-normal text-slate-500">/ {c.maxMarks}</span>
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-semibold text-slate-700">{t("examMarks.total")}</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-700">{t("examMarks.grade")}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.studentId} className={"border-b border-slate-100 " + (row.absent ? "opacity-50" : "")}>
                  <td className="px-3 py-2 align-top">
                    <span className="block font-medium text-slate-800">{row.studentName}</span>
                    <span className="block text-[11px] text-slate-500">
                      {row.grNumber ? `GR ${row.grNumber}` : ""}
                    </span>
                    {/* The syllabus the questions come from. */}
                    <span
                      className={"mt-0.5 block text-[11px] " +
                        (row.portion ? "text-indigo-700" : "text-amber-700")}
                      dir="auto"
                    >
                      {row.portion || t("examMarks.noSyllabus")}
                    </span>
                  </td>
                  {components.map((c) => (
                    <td key={c.id} className="px-2 py-2 text-center align-top">
                      <input
                        inputMode="decimal"
                        disabled={row.absent}
                        className="w-16 rounded-md border border-slate-200 px-1.5 py-1 text-center text-sm disabled:bg-slate-50"
                        value={draft[row.studentId]?.[c.id] ?? ""}
                        onChange={(e) => setDraft((d) => ({
                          ...d,
                          [row.studentId]: { ...(d[row.studentId] ?? {}), [c.id]: e.target.value },
                        }))}
                        onBlur={() => void saveRow(row)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center align-top font-semibold tabular-nums text-slate-800">
                    {row.totals.unmarked === 0
                      ? `${row.totals.obtained} / ${row.totals.max}`
                      : <span className="text-xs font-normal text-slate-400">
                          {t("examMarks.soFar", { n: row.totals.obtained })}
                        </span>}
                  </td>
                  <td className="px-3 py-2 text-center align-top">
                    {row.band ? (
                      <span
                        dir="auto"
                        className={"inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold " +
                          (BAND_CLASS[row.band.letter] ?? "bg-slate-100 text-slate-700 border-slate-200")}
                      >
                        {row.band.letter}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center align-top">
                    <button
                      type="button"
                      title={row.absent ? t("examMarks.markPresent") : t("examMarks.markAbsent")}
                      onClick={() => void saveRow(row, !row.absent)}
                      className={"rounded p-1 transition-colors " +
                        (row.absent ? "text-rose-600" : "text-slate-300 hover:text-slate-500")}
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : examId && sectionId && !loading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("examMarks.noStudents")}</p>
      ) : null}

      {rows.length > 0 && (
        <p className="text-xs text-slate-500">{t("examMarks.partMarkedNote")}</p>
      )}
    </div>
  );
}

export default ExamMarks;
