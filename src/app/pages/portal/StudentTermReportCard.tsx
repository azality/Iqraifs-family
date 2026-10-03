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
import { defaultSubjectRemark } from "../../../utils/subjectRemarkDefaults";
import {
  CardHeader, CardIdentity, CardSubjectTable, CardStatBoxes,
  CardRemarksChart, CardSignatures, EN_LABELS, type CardLabels,
} from "../../components/report-card/ReportCardDocument";

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

  // What shows when the teacher wrote nothing: the same tiered
  // evidence-finding activity the paper card prints (2 Oct review's
  // marks-only answer), in the reader's own language. The teacher's
  // words always win.
  const portalDefault = (pct: number | null, bandRemark: string) => {
    const d = defaultSubjectRemark({
      percentage: pct,
      passMarkPct: card?.academic.overall.passMarkPct ?? 40,
    });
    return d ? (inReaderLanguage(d.en, d.ur) ?? bandRemark) : bandRemark;
  };

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

  // The shared document's words, in the reader's language. The office
  // passes EN_LABELS; nothing is hardcoded inside the document.
  const labels: CardLabels = {
    ...EN_LABELS,
    reportCard: t("portal.rc.docTitle"),
    academic: t("portal.rc.academic"),
    subject: t("portal.rc.colSubject"),
    total: t("portal.rc.colTotal"),
    grade: t("portal.rc.colGrade"),
    remarks: t("portal.rc.colRemarks"),
    overall: t("portal.rc.overall"),
    abs: t("portal.rc.abs"),
    noMarks: t("portal.rc.noMarks"),
    name: t("portal.rc.name"),
    grNo: t("portal.rc.grNo"),
    klass: t("portal.rc.class"),
    classTeacher: t("portal.rc.classTeacher"),
    attendance: t("portal.rc.attendance"),
    attendanceWord: t("portal.rc.attendanceWord"),
    present: t("portal.rc.present"),
    late: t("portal.rc.late"),
    absent: t("portal.rc.absent"),
    behavior: t("portal.rc.behavior"),
    positiveNotes: t("portal.rc.positiveNotes"),
    concerns: t("portal.rc.concerns"),
    netPoints: t("portal.beh.netPoints"),
    hifzProgress: t("portal.rc.hifzProgress"),
    ayahsMemorized: t("portal.rc.ayahsMemorized"),
    surahsTouched: t("portal.rc.surahsTouched"),
    signClassTeacher: t("portal.rc.signClassTeacher"),
    signPrincipal: t("portal.rc.signPrincipal"),
    signParent: t("portal.rc.signParent"),
    stampBox: t("portal.rc.stampBox"),
    partTermNoPct: t("portal.rc.partTermNoPct"),
    ofDays: (present, total) => t("portal.rc.ofDays", { present, total }),
    daysSinceJoining: (present) => t("portal.rc.daysSinceJoining", { present }),
    joinedOn: (date) => t("portal.rc.joinedOn", { date }),
    carried: (count, date) => t("portal.rc.carried", { count, date }),
    entriesLine: (n, missed) => t("portal.rc.entriesLine", { n, missed }),
    failedSubjects: (subjects, pct) => t("portal.rc.failedSubjects", { subjects, pct }),
    failedBelow: (pct) => t("portal.rc.failedBelow", { pct }),
  };

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
          {/* THE shared card document (3 Oct). Identical to what the
              office sees and prints - the only differences are the
              Urdu labels and the reader's language on remarks. */}
          <CardHeader card={card} labels={labels} />
          <CardIdentity card={card} labels={labels} />
          <CardSubjectTable
            card={card}
            labels={labels}
            fmtPct={fmtPct}
            remarkFor={(s) => s.teacherComment || portalDefault(s.percentage, s.remark)}
          />
          <CardStatBoxes card={card} labels={labels} fmtPct={fmtPct} />

          {(() => {
            const ctRemark = inReaderLanguage(card.comments.classTeacher, card.comments.classTeacherUr);
            const prRemark = inReaderLanguage(card.comments.principal, card.comments.principalUr);
            return (ctRemark || prRemark) && (
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs items-stretch">
                {ctRemark && (
                  <div className="rounded-md border border-slate-200 p-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      {t("portal.rc.ctRemark")}
                    </div>
                    <div className="text-slate-800 whitespace-pre-wrap">{ctRemark}</div>
                  </div>
                )}
                {prRemark && (
                  <div className="rounded-md border border-slate-200 p-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      {t("portal.rc.principalRemark")}
                    </div>
                    <div className="text-slate-800 whitespace-pre-wrap">{prRemark}</div>
                  </div>
                )}
              </section>
            );
          })()}

          {/* The paper ritual: signatures + stamp, then the school's own
              chart beneath them ("sign k bad", office 2 Oct). */}
          <section className="pt-4 mt-2 border-t border-slate-200">
            <CardSignatures card={card} labels={labels} />
            <CardRemarksChart card={card} labels={labels} />
          </section>
        </div>
      )}
    </div>
  );
}

export default StudentTermReportCard;
