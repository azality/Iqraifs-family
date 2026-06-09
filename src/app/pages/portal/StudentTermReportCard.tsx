// StudentTermReportCard (portal) — parent/student view of published term
// report cards. Lists all published cards across terms; clicking one
// shows the same TermReportCardResponse shape the admin sees (read-only).

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { Printer, FileText, Award, BookOpen, Calendar, TrendingUp } from "lucide-react";
import { HeroCard } from "../../components/school-ui";
import { Button } from "../../components/ui/button";
import {
  listMyTermReportCards, getMyTermReportCard,
  type MyTermReportCardListItem,
} from "../../../utils/schoolPortalApi";
import type { TermReportCardResponse } from "../../../utils/schoolApi";

function fmtPct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}

export function StudentTermReportCard() {
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [search, setSearch] = useSearchParams();
  const termId = search.get("term") || "";
  const setTermId = (id: string) => {
    const next = new URLSearchParams(search);
    if (id) next.set("term", id); else next.delete("term");
    setSearch(next);
  };

  const [cards, setCards] = useState<MyTermReportCardListItem[]>([]);
  const [card, setCard] = useState<TermReportCardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listMyTermReportCards(studentId)
      .then((r) => {
        setCards(r.cards);
        if (!termId && r.cards.length > 0) setTermId(r.cards[0].termId);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => {
    if (!studentId || !termId) { setCard(null); return; }
    getMyTermReportCard(studentId, termId)
      .then(setCard)
      .catch((e) => {
        setCard(null);
        setError(e instanceof Error ? e.message : "Failed to load card");
      });
  }, [studentId, termId]);

  if (loading) return <div className="text-sm text-slate-500">Loading…</div>;
  if (cards.length === 0) {
    return (
      <div className="space-y-5">
        <HeroCard title="Report cards" subtitle="Published per term" />
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-500 italic">
          <FileText className="h-6 w-6 mx-auto text-slate-300 mb-2" />
          No report cards have been published yet. They'll appear here at the end of each term.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          .no-print, .no-print * { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <HeroCard
        title="Report cards"
        subtitle="Published per term"
        rightSlot={
          <div className="flex items-center gap-2 no-print">
            <select
              className="h-9 rounded-md bg-white/10 border border-white/20 text-white text-sm px-2"
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
            >
              {cards.map((c) => (
                <option key={c.termId} value={c.termId} className="text-slate-900">
                  {c.termName}
                </option>
              ))}
            </select>
            <Button
              variant="outline" size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={() => window.print()}
              disabled={!card}
            >
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 no-print">{error}</div>
      )}

      {!card ? null : (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-3">
              {card.school.logoUrl && <img src={card.school.logoUrl} alt="" className="h-12 w-12 rounded object-cover" />}
              <div>
                <div className="text-lg font-bold text-slate-900">{card.school.name}</div>
                {card.school.motto && <div className="text-xs text-slate-600 italic">{card.school.motto}</div>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Report Card</div>
              <div className="text-sm font-medium text-slate-900">{card.term.name}</div>
              <div className="text-[11px] text-slate-500">{card.term.startDate} → {card.term.endDate}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><div className="text-slate-500">Name</div><div className="font-medium">{card.student.fullName}</div></div>
            <div><div className="text-slate-500">GR No</div><div className="font-medium">{card.student.grNumber}</div></div>
            <div><div className="text-slate-500">Class</div>
              <div className="font-medium">{card.placement.className ?? "—"}{card.placement.sectionName ? ` — ${card.placement.sectionName}` : ""}</div></div>
            <div><div className="text-slate-500">Class teacher</div><div className="font-medium">{card.placement.classTeacherName ?? "—"}</div></div>
          </div>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5 text-indigo-500" /> Academic performance
            </h3>
            {card.academic.subjects.length === 0 ? (
              <div className="text-xs text-slate-500 italic">No marks recorded.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="text-left px-2 py-1.5">Subject</th>
                      {card.exams.map((e) => <th key={e.id} className="text-center px-2 py-1.5">{e.name}</th>)}
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
                        <td className="px-2 py-1.5 text-right">{s.totalMax > 0 ? `${s.totalObtained}/${s.totalMax}` : "—"}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{fmtPct(s.percentage)}</td>
                        <td className="px-2 py-1.5 text-center font-bold">{s.letter}</td>
                        <td className="px-2 py-1.5 text-slate-600">{s.teacherComment || s.remark}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 bg-slate-50/60 font-semibold">
                      <td className="px-2 py-1.5">Overall</td>
                      <td colSpan={card.exams.length}></td>
                      <td className="px-2 py-1.5 text-right">
                        {card.academic.overall.max > 0 ? `${card.academic.overall.obtained}/${card.academic.overall.max}` : "—"}
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

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-indigo-500" /> Attendance
              </div>
              <div className="text-xs space-y-0.5">
                <div>Present: <span className="font-medium">{card.attendance.present}</span></div>
                <div>Late: <span className="font-medium">{card.attendance.late}</span></div>
                <div>Absent: <span className="font-medium">{card.attendance.absent}</span></div>
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
              </div>
            </div>
          </section>

          {(card.comments.classTeacher || card.comments.principal) && (
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {card.comments.classTeacher && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Class teacher's remark</div>
                  <div className="text-slate-800 whitespace-pre-wrap">{card.comments.classTeacher}</div>
                </div>
              )}
              {card.comments.principal && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Principal's remark</div>
                  <div className="text-slate-800 whitespace-pre-wrap">{card.comments.principal}</div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default StudentTermReportCard;
