// StudentReportCard v2 — term-based, comment editor, finalize/publish.
//
// Replaces the previous date-range-driven view. Behaviour:
//
//   - Term picker → loads /students/:id/terms/:termId/report-card.
//   - Subjects rendered with per-exam breakdown + overall totals,
//     letter grades, remarks (configurable in PR 3).
//   - Attendance / behavior / Hifz blocks aggregated for the term window.
//   - Editable comments: per-subject (class teacher), class-teacher,
//     principal. Admin/principal can set principal_comment; teachers
//     can set their own and per-subject.
//   - Finalize / Publish toggles for admin/principal.
//   - Print: window.print() with print CSS hiding page chrome.

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft, Printer, CheckCircle2, Send, Calendar, Award, BookOpen,
  TrendingUp, ShieldAlert, Pencil,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Card, CardContent } from "../../components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  getSchoolMe, isOrgAdmin,
  listTerms, getTermReportCard,
  saveReportCardComments, setReportCardWorkflow,
  type SchoolMeResponse, type AcademicTerm,
  type TermReportCardResponse,
} from "../../../utils/schoolApi";

function fmtPct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}

export function StudentReportCard() {
  const { orgId = "", studentId = "" } = useParams<{ orgId: string; studentId: string }>();
  const [search, setSearch] = useSearchParams();
  const termId = search.get("term") || "";
  const setTermId = (id: string) => {
    const next = new URLSearchParams(search);
    if (id) next.set("term", id); else next.delete("term");
    setSearch(next);
  };

  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [card, setCard] = useState<TermReportCardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [classTeacherComment, setClassTeacherComment] = useState("");
  const [principalComment, setPrincipalComment] = useState("");
  const [subjectComments, setSubjectComments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSchoolMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoading(false));
  }, []);
  useEffect(() => {
    if (!orgId) return;
    listTerms(orgId).then((r) => {
      setTerms(r.terms);
      if (!termId && r.terms.length > 0) {
        const cur = r.terms.find((t) => t.isCurrent) ?? r.terms[0];
        setTermId(cur.id);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const refresh = () => {
    if (!orgId || !studentId || !termId) { setCard(null); return; }
    setLoading(true);
    getTermReportCard(orgId, studentId, termId)
      .then((r) => {
        setCard(r);
        setClassTeacherComment(r.comments.classTeacher ?? "");
        setPrincipalComment(r.comments.principal ?? "");
        setSubjectComments(r.comments.subjects ?? {});
        setError(null);
      })
      .catch((e) => { setCard(null); setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => setLoading(false));
  };
  useEffect(refresh, [orgId, studentId, termId]);

  const isAdmin = useMemo(() => isOrgAdmin(me, orgId), [me, orgId]);
  if (meLoading) return null;
  if (!isAdmin && !me) return <Navigate to={`/school/orgs/${orgId}`} replace />;

  const handleSaveComments = async () => {
    if (!termId) return;
    setSaving(true);
    try {
      await saveReportCardComments(orgId, studentId, termId, {
        classTeacherComment: classTeacherComment || null,
        principalComment: isAdmin ? (principalComment || null) : undefined,
        subjectComments,
      });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };
  const handleWorkflow = async (action: "finalize" | "unfinalize" | "publish" | "unpublish") => {
    if (!termId) return;
    try {
      await setReportCardWorkflow(orgId, studentId, termId, action);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4 print:space-y-3">
      <style>{`
        /* PR feat/report-card-print — A4 print quality */
        @page { size: A4; margin: 12mm 12mm 14mm 12mm; }
        @media print {
          .no-print, .no-print * { display: none !important; }
          body { background: white !important; }
          .print-card { box-shadow: none !important; border: none !important; }
          /* Keep each major section together when paginating */
          .print-keep { break-inside: avoid; page-break-inside: avoid; }
          /* Body text scales slightly down so the typical card fits one A4 */
          .print-card, .print-card * { font-size: 10pt; }
          .print-card table { font-size: 9.5pt; }
          .print-card .text-xs, .print-card .text-\\[10px\\], .print-card .text-\\[11px\\] {
            font-size: 9pt !important;
          }
          /* Signature block stays at the bottom of the card */
          .print-signature { break-before: auto; }
          .print-only { display: block !important; }
        }
        @media screen {
          .print-only { display: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between flex-wrap gap-2 no-print">
        <Link to={`/school/orgs/${orgId}/admin/students/${studentId}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Student
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Select value={termId || "__none__"} onValueChange={(v) => setTermId(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-9 text-sm w-40"><SelectValue placeholder="Pick term…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Pick term —</SelectItem>
              {terms.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}{t.isCurrent ? " · current" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!card}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 no-print">{error}</div>
      )}

      {!termId ? (
        <Card><CardContent className="p-4 text-sm text-slate-500 italic">Pick a term above.</CardContent></Card>
      ) : loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : !card ? null : (
        <>
          {isAdmin && (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs flex items-center gap-2 flex-wrap no-print">
              <span className="font-semibold text-slate-700">Workflow:</span>
              {card.workflow.finalizedAt ? (
                <>
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Finalized {new Date(card.workflow.finalizedAt).toLocaleDateString()}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => handleWorkflow("unfinalize")}>Unfinalize</Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => handleWorkflow("finalize")}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Finalize
                </Button>
              )}
              {card.workflow.publishedAt ? (
                <>
                  <span className="inline-flex items-center gap-1 text-indigo-700">
                    <Send className="h-3.5 w-3.5" /> Published {new Date(card.workflow.publishedAt).toLocaleDateString()}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => handleWorkflow("unpublish")}>Unpublish</Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => handleWorkflow("publish")} disabled={!card.workflow.finalizedAt}>
                  <Send className="h-3.5 w-3.5 mr-1" /> Publish to parents
                </Button>
              )}
            </div>
          )}

          <Card className="print-card">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 print-keep">
                <div className="flex items-center gap-3">
                  {card.school.logoUrl && (
                    <img src={card.school.logoUrl} alt="" className="h-12 w-12 rounded object-cover" />
                  )}
                  <div>
                    <div className="text-lg font-bold text-slate-900">{card.school.name}</div>
                    {card.school.motto && <div className="text-xs text-slate-600 italic">{card.school.motto}</div>}
                    {card.school.address && <div className="text-[11px] text-slate-500">{card.school.address}</div>}
                  </div>
                </div>
                <div className="text-right flex items-start gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Report Card</div>
                    <div className="text-sm font-medium text-slate-900">{card.term.name}</div>
                    <div className="text-[11px] text-slate-500">{card.term.startDate} → {card.term.endDate}</div>
                  </div>
                  {/* Print-only QR. Points at the school-portal login page
                      for this org so a parent can scan and access their
                      child's full record. Uses a public QR-image API so we
                      don't carry a generator dep. */}
                  {card.school.slug && (
                    <img
                      className="print-only h-16 w-16"
                      alt="Scan for portal"
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
                        `${window.location.origin}/school-portal/${card.school.slug}/login`,
                      )}`}
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div><div className="text-slate-500">Name</div><div className="font-medium">{card.student.fullName}</div></div>
                <div><div className="text-slate-500">GR No</div><div className="font-medium">{card.student.grNumber}</div></div>
                <div><div className="text-slate-500">Class</div>
                  <div className="font-medium">
                    {card.placement.className ?? "—"}{card.placement.sectionName ? ` — ${card.placement.sectionName}` : ""}
                  </div>
                </div>
                <div><div className="text-slate-500">Class teacher</div>
                  <div className="font-medium">{card.placement.classTeacherName ?? "—"}</div>
                </div>
              </div>

              <section className="print-keep">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5 text-indigo-500" /> Academic performance
                </h3>
                {card.academic.subjects.length === 0 ? (
                  <div className="text-xs text-slate-500 italic">No subject scores recorded for this term.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-700">
                        <tr>
                          <th className="text-left px-2 py-1.5">Subject</th>
                          {card.exams.map((e) => (
                            <th key={e.id} className="text-center px-2 py-1.5">{e.name}</th>
                          ))}
                          <th className="text-right px-2 py-1.5">Total</th>
                          <th className="text-right px-2 py-1.5">%</th>
                          <th className="text-center px-2 py-1.5">Grade</th>
                          <th className="text-left px-2 py-1.5">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.academic.subjects.map((s) => (
                          <tr key={s.classSubjectId} className="border-t border-slate-100">
                            <td className="px-2 py-1.5 font-medium">{s.name}</td>
                            {card.exams.map((e) => {
                              const pe = s.perExam.find((x) => x.examId === e.id);
                              return (
                                <td key={e.id} className="px-2 py-1.5 text-center">
                                  {!pe ? "—" : pe.absent ? <span className="text-rose-600">Abs</span> :
                                    pe.obtained === null ? "—" :
                                    <>{pe.obtained}<span className="text-slate-400">/{pe.max}</span></>}
                                </td>
                              );
                            })}
                            <td className="px-2 py-1.5 text-right">
                              {s.totalMax > 0 ? `${s.totalObtained}/${s.totalMax}` : "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium">{fmtPct(s.percentage)}</td>
                            <td className="px-2 py-1.5 text-center font-bold">{s.letter}</td>
                            <td className="px-2 py-1.5 text-slate-600">{s.remark}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-slate-300 bg-slate-50/60 font-semibold">
                          <td className="px-2 py-1.5">Overall</td>
                          <td colSpan={card.exams.length} className="px-2 py-1.5"></td>
                          <td className="px-2 py-1.5 text-right">
                            {card.academic.overall.max > 0
                              ? `${card.academic.overall.obtained}/${card.academic.overall.max}`
                              : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right">{fmtPct(card.academic.overall.percentage)}</td>
                          <td className="px-2 py-1.5 text-center">{card.academic.overall.letter}</td>
                          <td className="px-2 py-1.5">{card.academic.overall.remark}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 print-keep">
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-indigo-500" /> Attendance
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div>Present: <span className="font-medium">{card.attendance.present}</span></div>
                    <div>Late: <span className="font-medium">{card.attendance.late}</span></div>
                    <div>Absent: <span className="font-medium">{card.attendance.absent}</span></div>
                    <div>Excused: <span className="font-medium">{card.attendance.excused}</span></div>
                    <div className="pt-1 border-t border-slate-100 mt-1">
                      <span className="font-semibold">{fmtPct(card.attendance.attendancePct)}</span> attendance
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Behavior
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div>Positive notes: <span className="font-medium text-emerald-700">{card.behavior.positive}</span></div>
                    <div>Concerns: <span className="font-medium text-amber-700">{card.behavior.concern}</span></div>
                    <div>Net points: <span className="font-semibold">{card.behavior.netPoints}</span></div>
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1">
                    <Award className="h-3.5 w-3.5 text-amber-500" /> Hifz progress
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div>Ayahs memorized: <span className="font-medium">{card.hifz.ayahsMemorized}</span></div>
                    <div>Surahs touched: <span className="font-medium">{card.hifz.surahsCompleted}</span></div>
                    <div>Entries: {card.hifz.totalEntries} (missed {card.hifz.missedCount})</div>
                    <div className="pt-1 border-t border-slate-100 mt-1 text-[11px] text-slate-500">
                      Quality: Excellent {card.hifz.qualityCounts.excellent} ·
                      Good {card.hifz.qualityCounts.good} ·
                      Needs practice {card.hifz.qualityCounts.needs_practice} ·
                      Weak {card.hifz.qualityCounts.weak}
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-3 print-keep">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Subject remarks
                  </div>
                  <div className="space-y-1.5">
                    {card.academic.subjects.map((s) => {
                      const v = subjectComments[s.classSubjectId] ?? "";
                      return (
                        <div key={s.classSubjectId} className="text-xs">
                          <div className="font-medium text-slate-700">{s.name}:</div>
                          <Textarea
                            value={v}
                            onChange={(e) => setSubjectComments({ ...subjectComments, [s.classSubjectId]: e.target.value })}
                            placeholder="—"
                            className="text-xs h-16 no-print"
                            maxLength={1000}
                          />
                          <div className="hidden print:block text-slate-700">{v || "—"}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Class teacher's remark
                    </div>
                    <Textarea
                      value={classTeacherComment}
                      onChange={(e) => setClassTeacherComment(e.target.value)}
                      placeholder="—"
                      className="text-xs h-20 no-print"
                      maxLength={2000}
                    />
                    <div className="hidden print:block text-xs text-slate-700">
                      {classTeacherComment || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Principal's remark
                    </div>
                    <Textarea
                      value={principalComment}
                      onChange={(e) => setPrincipalComment(e.target.value)}
                      placeholder="—"
                      className="text-xs h-20 no-print"
                      maxLength={2000}
                      disabled={!isAdmin}
                    />
                    <div className="hidden print:block text-xs text-slate-700">
                      {principalComment || "—"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 no-print">
                  <Button size="sm" onClick={handleSaveComments} disabled={saving}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save comments"}
                  </Button>
                  {card.workflow.publishedAt && (
                    <span className="text-[11px] text-amber-700 inline-flex items-center gap-1">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Card is published — edits show to parents immediately.
                    </span>
                  )}
                </div>
              </section>

              {/* Signature + stamp block. Stays on the last printed page
                  thanks to print-keep + print-signature. Stamp box gives
                  the office a defined area for the rubber stamp so it
                  doesn't smudge over the text. */}
              <section className="pt-4 mt-4 border-t border-slate-200 print-keep print-signature">
                <div className="grid grid-cols-4 gap-6 text-[11px] text-slate-600">
                  <div className="text-center">
                    <div className="h-10 border-b border-slate-300"></div>
                    <div className="mt-1">Class teacher</div>
                    <div className="text-[10px] text-slate-500">{card.placement.classTeacherName ?? ""}</div>
                  </div>
                  <div className="text-center">
                    <div className="h-10 border-b border-slate-300"></div>
                    <div className="mt-1">Principal</div>
                  </div>
                  <div className="text-center">
                    <div className="h-10 border-b border-slate-300"></div>
                    <div className="mt-1">Parent signature</div>
                  </div>
                  <div className="text-center">
                    <div className="h-14 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">
                      School stamp
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-[10px] text-slate-400 text-center">
                  Issued {new Date().toLocaleDateString()} · {card.school.name}
                  {card.school.slug && ` · Scan the QR on the header to view this card on the parent portal.`}
                </div>
              </section>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default StudentReportCard;
