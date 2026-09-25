// StudentTermReportCard (portal) — parent/student view of published term
// report cards. Lists all published cards across terms; clicking one
// shows the same TermReportCardResponse shape the admin sees (read-only).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
  // An Urdu reader gets the Urdu remark when the school has written one;
  // a remark a teacher typed exists only in their language, so it shows
  // as-is rather than not at all (26 Sep).
  const inReaderLanguage = (en: string | null | undefined, ur: string | null | undefined) =>
    (i18n.language?.startsWith("ur") ? (ur || en) : en) || null;
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

  if (loading) return <div className="text-sm text-slate-500">{t("common.loading")}</div>;
  if (cards.length === 0) {
    return (
      <div className="space-y-5">
        <HeroCard title={t("portal.rc.title")} subtitle={t("portal.rc.subtitle")} />
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-500 italic">
          <FileText className="h-6 w-6 mx-auto text-slate-300 mb-2" />
          {t("portal.rc.empty")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          /* Print the CARD, nothing else - the portal nav and hero were
             riding along on parents' printouts (25 Sep). */
          body * { visibility: hidden; }
          .rc-print-card, .rc-print-card * { visibility: visible; }
          .rc-print-card { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
          .no-print, .no-print * { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <HeroCard
        title={t("portal.rc.title")}
        subtitle={t("portal.rc.subtitle")}
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
              <Printer className="h-3.5 w-3.5 mr-1" /> {t("portal.rc.print")}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 no-print">{error}</div>
      )}

      {!card ? null : (
        <div className="rc-print-card rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-3">
              {card.school.logoUrl && <img src={card.school.logoUrl} alt="" className="h-12 w-12 rounded object-cover" />}
              <div>
                <div className="text-lg font-bold text-slate-900">{card.school.name}</div>
                {card.school.motto && <div className="text-xs text-slate-600 italic">{card.school.motto}</div>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700">{t("portal.rc.docTitle")}</div>
              <div className="text-sm font-medium text-slate-900">{card.term.name}</div>
              <div className="text-[11px] text-slate-500">{card.term.startDate} → {card.term.endDate}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><div className="text-slate-500">{t("portal.rc.name")}</div><div className="font-medium">{card.student.fullName}</div></div>
            <div><div className="text-slate-500">{t("portal.rc.grNo")}</div><div className="font-medium">{card.student.grNumber}</div></div>
            <div><div className="text-slate-500">{t("portal.rc.class")}</div>
              <div className="font-medium">{card.placement.className ?? "—"}{card.placement.sectionName ? ` — ${card.placement.sectionName}` : ""}</div></div>
            <div><div className="text-slate-500">{t("portal.rc.classTeacher")}</div><div className="font-medium">{card.placement.classTeacherName ?? "—"}</div></div>
          </div>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5 text-indigo-500" /> {t("portal.rc.academic")}
            </h3>
            {card.academic.subjects.length === 0 ? (
              <div className="text-xs text-slate-500 italic">{t("portal.rc.noMarks")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="text-left px-2 py-1.5">{t("portal.rc.colSubject")}</th>
                      {card.exams.map((e) => <th key={e.id} className="text-center px-2 py-1.5">{e.name}</th>)}
                      <th className="text-right px-2 py-1.5">{t("portal.rc.colTotal")}</th>
                      <th className="text-right px-2 py-1.5">%</th>
                      <th className="text-center px-2 py-1.5">{t("portal.rc.colGrade")}</th>
                      <th className="text-left px-2 py-1.5">{t("portal.rc.colRemarks")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.academic.subjects.map((s) => {
                    // Below the pass line reads red for the parent too -
                    // the same rule the office sees.
                    const subjFailed = s.percentage !== null &&
                      s.percentage < card.academic.overall.passMarkPct;
                    return (
                      <tr key={s.classSubjectId} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 font-medium">{s.name}</td>
                        {card.exams.map((e) => {
                          const pe = s.perExam.find((x) => x.examId === e.id);
                          return (
                            <td key={e.id} className="px-2 py-1.5 text-center">
                              {!pe ? "—" : pe.absent ? <span className="text-rose-600">{t("portal.rc.abs")}</span> :
                                pe.obtained === null ? "—" :
                                <>{pe.obtained}<span className="text-slate-400">/{pe.max}</span></>}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right">{s.totalMax > 0 ? `${s.totalObtained}/${s.totalMax}` : "—"}</td>
                        <td className={"px-2 py-1.5 text-right font-medium " + (subjFailed ? "text-rose-700" : "")}>{fmtPct(s.percentage)}</td>
                        <td className={"px-2 py-1.5 text-center font-bold " + (subjFailed ? "text-rose-700" : "")}>{s.letter}</td>
                        <td className={"px-2 py-1.5 " + (subjFailed ? "text-rose-700" : "text-slate-600")}>{s.teacherComment || s.remark}</td>
                      </tr>
                    );
                    })}
                    <tr className="border-t-2 border-slate-300 bg-slate-50/60 font-semibold">
                      <td className="px-2 py-1.5">{t("portal.rc.overall")}</td>
                      <td colSpan={card.exams.length}></td>
                      <td className="px-2 py-1.5 text-right">
                        {card.academic.overall.max > 0 ? `${card.academic.overall.obtained}/${card.academic.overall.max}` : "—"}
                      </td>
                      <td className={"px-2 py-1.5 text-right " +
                        (card.academic.overall.failed ? "font-bold text-rose-700" : "")}>
                        {fmtPct(card.academic.overall.percentage)}
                      </td>
                      <td className="px-2 py-1.5 text-center">{card.academic.overall.letter}</td>
                      <td className="px-2 py-1.5">
                        {card.academic.overall.remark}
                        {card.academic.overall.failed && (
                          <span className="ml-1.5 font-bold text-rose-700">
                            {(card.academic.overall.failedSubjects ?? []).length > 0
                              ? t("portal.rc.failedSubjects", {
                                  subjects: card.academic.overall.failedSubjects!.join(", "),
                                  pct: card.academic.overall.passMarkPct,
                                })
                              : t("portal.rc.failedBelow", { pct: card.academic.overall.passMarkPct })}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={`grid grid-cols-1 ${card.hifz.show !== false ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-3`}>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-indigo-500" /> {t("portal.rc.attendance")}
              </div>
              <div className="text-xs space-y-0.5">
                {/* Days present leads; the school's own paper register
                    is carried in, so the counts under it are only the
                    days marked in the system (21 Sep). */}
                <div>
                  {t("portal.rc.present")}:{" "}
                  <span className="font-medium">
                    {card.attendance.joinedMidTerm
                      ? t("portal.rc.daysSinceJoining", {
                          present: card.attendance.daysPresent ?? card.attendance.present,
                        })
                      : t("portal.rc.ofDays", {
                          present: card.attendance.daysPresent ?? card.attendance.present,
                          total: card.attendance.workingDays ?? card.attendance.total,
                        })}
                  </span>
                </div>
                {/* A mid-term arrival was being divided by their class's
                    whole register, so a new child's card read 5%. The
                    joining date is printed instead (25 Sep). */}
                {card.attendance.joinedMidTerm ? (
                  <div className="text-[10px] leading-tight text-slate-500">
                    {t("portal.rc.joinedOn", {
                      date: card.attendance.startsOn ?? card.attendance.admissionDate ?? "",
                    })}
                  </div>
                ) : !!card.attendance.carriedDays && (
                  <div className="text-[10px] leading-tight text-slate-500">
                    {t("portal.rc.carried", {
                      count: card.attendance.carriedDays,
                      date: card.attendance.carriedAsOf ?? "",
                    })}
                  </div>
                )}
                <div>{t("portal.rc.late")}: <span className="font-medium">{card.attendance.late}</span></div>
                <div>{t("portal.rc.absent")}: <span className="font-medium">{card.attendance.absent}</span></div>
                <div className="pt-1 border-t border-slate-100 mt-1">
                  {card.attendance.joinedMidTerm ? (
                    <span className="text-slate-500">{t("portal.rc.partTermNoPct")}</span>
                  ) : (
                    <>
                      <span className="font-semibold">{fmtPct(card.attendance.attendancePct)}</span>{" "}
                      {t("portal.rc.attendanceWord")}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> {t("portal.rc.behavior")}
              </div>
              <div className="text-xs space-y-0.5">
                <div>{t("portal.rc.positiveNotes")}: <span className="font-medium text-emerald-700">{card.behavior.positive}</span></div>
                <div>{t("portal.rc.concerns")}: <span className="font-medium text-amber-700">{card.behavior.concern}</span></div>
                <div>{t("portal.beh.netPoints")} <span className="font-semibold">{card.behavior.netPoints}</span></div>
              </div>
            </div>
            {/* Hidden for a child who is not memorizing — same rule as the
                staff card. */}
            {card.hifz.show !== false && (
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1">
                  <Award className="h-3.5 w-3.5 text-amber-500" /> {t("portal.rc.hifzProgress")}
                </div>
                <div className="text-xs space-y-0.5">
                  <div>{t("portal.rc.ayahsMemorized")}: <span className="font-medium">{card.hifz.ayahsMemorized}</span></div>
                  <div>{t("portal.rc.surahsTouched")}: <span className="font-medium">{card.hifz.surahsCompleted}</span></div>
                  <div>{t("portal.rc.entriesLine", { n: card.hifz.totalEntries, missed: card.hifz.missedCount })}</div>
                </div>
              </div>
            )}
          </section>

          {(() => {
            const ctRemark = inReaderLanguage(card.comments.classTeacher, card.comments.classTeacherUr);
            const prRemark = inReaderLanguage(card.comments.principal, card.comments.principalUr);
            return (ctRemark || prRemark) && (
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {ctRemark && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">{t("portal.rc.ctRemark")}</div>
                  <div className="text-slate-800 whitespace-pre-wrap">{ctRemark}</div>
                </div>
              )}
              {prRemark && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">{t("portal.rc.principalRemark")}</div>
                  <div className="text-slate-800 whitespace-pre-wrap">{prRemark}</div>
                </div>
              )}
            </section>
            );
          })()}

          {/* The paper ritual (25 Sep): signatures + the school stamp,
              identical to the office's printed card. An uploaded
              principal signature / stamp (Settings -> Organization)
              sits on the line; blank lines otherwise. */}
          {(() => {
            // The school chooses which lines appear; all default on.
            const sig = card.school.signatureLines
              ?? { classTeacher: true, principal: true, parent: true, stamp: true };
            const n = [sig.classTeacher, sig.principal, sig.parent, sig.stamp].filter(Boolean).length;
            if (n === 0) return null;
            return (
          <section className="pt-4 mt-2 border-t border-slate-200">
            <div
              className="grid gap-4 text-[11px] text-slate-600"
              style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
            >
              {sig.classTeacher && (
                <div className="text-center">
                  <div className="h-10 border-b border-slate-300 flex items-end justify-center">
                    {card.placement.classTeacherSignatureUrl && (
                      <img src={card.placement.classTeacherSignatureUrl} alt="" className="max-h-9 max-w-full object-contain" />
                    )}
                  </div>
                  <div className="mt-1">{t("portal.rc.signClassTeacher")}</div>
                  <div className="text-[10px] text-slate-500">{card.placement.classTeacherName ?? ""}</div>
                </div>
              )}
              {sig.principal && (
                <div className="text-center">
                  <div className="h-10 border-b border-slate-300 flex items-end justify-center">
                    {card.school.principalSignatureUrl && (
                      <img src={card.school.principalSignatureUrl} alt="" className="max-h-9 max-w-full object-contain" />
                    )}
                  </div>
                  <div className="mt-1">{t("portal.rc.signPrincipal")}</div>
                </div>
              )}
              {sig.parent && (
                <div className="text-center">
                  <div className="h-10 border-b border-slate-300"></div>
                  <div className="mt-1">{t("portal.rc.signParent")}</div>
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
                      {t("portal.rc.stampBox")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default StudentTermReportCard;
