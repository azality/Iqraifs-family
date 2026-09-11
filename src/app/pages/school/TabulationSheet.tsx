// TabulationSheet — the end-of-term result register, one grid.
//
// Oral and written are entered as separate exams, each showing its own
// percentage — but the school closes a term with ONE sheet: every
// student, every subject, each paper's marks side by side, combined
// into the subject's total ("60 + 15 = /75, aur 75 main se kitne
// aaye"), then grand total, percentage and position (Ambreen, 11 Sep).
//
// Deliberately generic: it renders however many exams the term holds
// (two papers here, any number at another school), weighted the same
// way as the report card, so the two never disagree. Print-friendly —
// the pickers and chrome disappear under @media print, the grid stays.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Printer, Table2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Card, CardContent } from "../../components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  getSchoolMe, isOrgAdmin, listClasses, listTerms, getTabulation,
  type AdminClass, type AcademicTerm, type SchoolMeResponse,
  type TabulationResponse,
} from "../../../utils/schoolApi";
import { NoAccessRedirect } from "../../components/school-ui";

const fmt = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

export function TabulationSheet() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  // ?sectionId= is the teacher-facing front door, same as the marks
  // sheet: admins pick sections; a class teacher arrives via deep link.
  const [searchParams] = useSearchParams();
  const presetSectionId = searchParams.get("sectionId") ?? "";
  const presetTermId = searchParams.get("termId") ?? "";
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [sectionId, setSectionId] = useState(presetSectionId);
  const [termId, setTermId] = useState(presetTermId);
  const [data, setData] = useState<TabulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);
  useEffect(() => {
    if (!orgId) return;
    listClasses(orgId).then(setClasses).catch(() => {});
    listTerms(orgId)
      .then((r) => {
        setTerms(r.terms);
        // Default to the current term so "make the tabulation" is two
        // clicks at term end, not a hunt through settings.
        if (!presetTermId) {
          const cur = r.terms.find((t) => t.isCurrent);
          if (cur) setTermId((v) => v || cur.id);
        }
      })
      .catch(() => {});
  }, [orgId, presetTermId]);

  useEffect(() => {
    if (!orgId || !sectionId) { setData(null); return; }
    setLoading(true);
    setError(null);
    getTabulation(orgId, sectionId, termId || undefined)
      .then(setData)
      .catch((e) => { setData(null); setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => setLoading(false));
  }, [orgId, sectionId, termId]);

  const sectionOptions = useMemo(
    () => classes.flatMap((c) =>
      (c.sections ?? []).map((s) => ({ id: s.id, label: `${c.name} — ${s.name}` }))),
    [classes],
  );

  if (meLoading) return null;
  if (!isOrgAdmin(me, orgId) && !presetSectionId) {
    return <NoAccessRedirect to={`/school/orgs/${orgId}`} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <Link to={`/school/orgs/${orgId}/admin/assessment`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Assessment
          </Button>
        </Link>
        <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!data}>
          <Printer className="h-3.5 w-3.5 mr-1" /> Print
        </Button>
      </div>

      <div className="print:hidden">
        <h1 className="text-lg font-semibold tracking-wide text-slate-900 flex items-center gap-2">
          <Table2 className="h-5 w-5 text-indigo-600" /> TABULATION SHEET
        </h1>
        <p className="text-sm text-slate-500">
          The whole section's result register for one term — every paper's marks combined
          into each subject's total, with the grand total, percentage and position.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <Label className="text-xs text-slate-500">Section</Label>
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger className="h-9 w-56 text-sm"><SelectValue placeholder="Pick a section" /></SelectTrigger>
            <SelectContent>
              {sectionOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-slate-500">Term</Label>
          <Select value={termId} onValueChange={setTermId}>
            <SelectTrigger className="h-9 w-56 text-sm"><SelectValue placeholder="Current term" /></SelectTrigger>
            <SelectContent>
              {terms.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}{t.isCurrent ? " (current)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 print:hidden">{error}</div>
      )}

      {!sectionId ? (
        <Card><CardContent className="p-4 text-sm text-slate-500 italic">
          Pick a section above to build its tabulation sheet.
        </CardContent></Card>
      ) : loading ? (
        <div className="text-sm text-slate-500">Building the sheet…</div>
      ) : !data ? null : (
        <>
          {/* Print header — invisible on screen, carries the identity a
              paper register needs. */}
          <div className="hidden print:block text-center mb-2">
            <div className="text-lg font-bold">{data.section.className} — {data.section.name}</div>
            <div className="text-sm">{data.term.name} · Tabulation sheet</div>
          </div>
          <div className="text-sm text-slate-600 print:hidden">
            <span className="font-medium text-slate-900">{data.section.className} — {data.section.name}</span>
            {" · "}{data.term.name}
            {" · combines "}
            {data.exams.map((e) => e.name).join(" + ") || "no exams in this term"}
          </div>

          {data.subjects.length === 0 ? (
            <Card><CardContent className="p-4 text-sm text-slate-500 italic">
              No examined subjects in this class — enter a marks distribution first.
            </CardContent></Card>
          ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white print:border-0">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="text-left px-2 py-2 sticky left-0 bg-slate-50 z-10">Student</th>
                  {data.subjects.map((s) => (
                    <th key={s.id} className="text-center px-2 py-2 min-w-[110px]">
                      {s.name}
                      {s.expectedMax !== null && (
                        <div className="mt-0.5 text-[10px] font-normal text-slate-400">/{s.expectedMax}</div>
                      )}
                    </th>
                  ))}
                  <th className="text-right px-2 py-2 bg-slate-100">Total</th>
                  <th className="text-right px-2 py-2 bg-slate-100">%</th>
                  <th className="text-center px-2 py-2 bg-slate-100">Position</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((r) => (
                  <tr key={r.studentId} className="border-t border-slate-100">
                    <td className="px-2 py-2 sticky left-0 bg-white z-10">
                      <div className="font-medium text-slate-900">{r.studentName}</div>
                      <div className="text-[10px] text-slate-500">
                        {r.rollNumber ? `Roll ${r.rollNumber} · ` : ""}{r.grNumber}
                      </div>
                    </td>
                    {data.subjects.map((s) => {
                      const cell = r.subjects[s.id];
                      if (!cell || cell.max === 0) {
                        return <td key={s.id} className="px-2 py-2 text-center text-slate-300">—</td>;
                      }
                      // "12 + 45 = 57/75" — each paper in the term's
                      // exam order, then the combined total.
                      const parts = data.exams
                        .map((e) => cell.perExam[e.id])
                        .filter((p) => p && !p.absent && p.obtained !== null)
                        .map((p) => fmt(p!.obtained!));
                      return (
                        <td key={s.id} className="px-2 py-2 text-center align-top">
                          <div className="tabular-nums text-slate-900">
                            {parts.length > 1 ? `${parts.join(" + ")} = ` : ""}
                            <span className="font-semibold">{fmt(cell.obtained)}</span>
                            <span className="text-slate-400">/{fmt(cell.max)}</span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {cell.percentage !== null ? `${cell.percentage.toFixed(0)}%` : ""}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right bg-slate-50/60 font-medium tabular-nums">
                      {r.totalMax > 0 ? <>{fmt(r.totalObtained)}<span className="text-slate-400">/{fmt(r.totalMax)}</span></> : "—"}
                    </td>
                    <td className="px-2 py-2 text-right bg-slate-50/60 tabular-nums">
                      {r.percentage !== null ? `${r.percentage.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-2 py-2 text-center bg-slate-50/60 font-semibold">
                      {r.position ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}
    </div>
  );
}

export default TabulationSheet;
