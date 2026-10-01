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
  listTerms, getTermReportCard, getReportCardsBrowser,
  saveReportCardComments, setReportCardWorkflow, suggestRemarks,
  listGradeScales, getOrganization,
  type SchoolMeResponse, type AcademicTerm,
  type TermReportCardResponse, type SuggestedRemarks, type GradeBand,
} from "../../../utils/schoolApi";
import { ReportFindingsPanel } from "./components/ReportFindingsPanel";
import { defaultSubjectRemark } from "../../../utils/subjectRemarkDefaults";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

function fmtPct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}

/** Day-month-year, the way Pakistan writes a date (office, 30 Sep). The
 *  term dates arrive as YYYY-MM-DD; split the string rather than parsing,
 *  so a date never shifts a day across a timezone. */
function fmtDayMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

/** "1st Assessment — Written" said the term twice on the card (office,
 *  1 Oct): the term heads the whole card, so the column keeps only its
 *  paper. Strips a leading "<term name> — " (any dash); anything else
 *  passes through untouched. */
function paperOnly(examName: string, termName: string): string {
  if (!examName.startsWith(termName)) return examName;
  const rest = examName.slice(termName.length).replace(/^\s*[—–-]+\s*/, "").trim();
  return rest || examName;
}

export function StudentReportCard() {
  const { orgId = "", studentId = "" } = useParams<{ orgId: string; studentId: string }>();
  const [search, setSearch] = useSearchParams();
  const termId = search.get("term") || "";
  // Set when the card was opened from the Report cards browser: the
  // section whose children Previous/Next steps through.
  const browseSectionId = search.get("browse") || "";
  const [roster, setRoster] = useState<Array<{ id: string; name: string }>>([]);
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
  // What the teacher SAW per subject (round 3, 2 Oct): a picked need +
  // a few words. The evidence the AI writes from; never printed raw.
  const [subjectObservations, setSubjectObservations] =
    useState<Record<string, { need?: string; note?: string }>>({});
  const [saving, setSaving] = useState(false);
  // AI suggestion: written from the computed findings, held in a review
  // tray. Nothing lands in a field until its Use button is pressed, and
  // nothing saves until Save comments (round 2, 30 Sep - the office had
  // no way to place the Urdu or the per-subject remarks).
  const [suggesting, setSuggesting] = useState(false);
  const [sugg, setSugg] = useState<{
    s: SuggestedRemarks;
    urduOk: boolean;
    usage?: { inputTokens: number; outputTokens: number; approxUsd: number };
  } | null>(null);

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
  useEffect(() => {
    // The class roster behind Previous/Next, only when browsing.
    if (!orgId || !browseSectionId) { setRoster([]); return; }
    getReportCardsBrowser(orgId, { termId: termId || undefined, sectionId: browseSectionId })
      .then((r) => setRoster((r.students ?? []).map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => setRoster([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, browseSectionId]);
  const rosterIdx = roster.findIndex((s) => s.id === studentId);

  const refresh = () => {
    if (!orgId || !studentId || !termId) { setCard(null); return; }
    setLoading(true);
    getTermReportCard(orgId, studentId, termId)
      .then((r) => {
        setCard(r);
        // Auto (band-chart) text stays OUT of the editor: saving it
        // verbatim would freeze it, and the chart should keep applying
        // until someone actually writes. The card display still shows it.
        setClassTeacherComment(r.comments.auto?.classTeacher ? "" : (r.comments.classTeacher ?? ""));
        setPrincipalComment(r.comments.auto?.principal ? "" : (r.comments.principal ?? ""));
        setSubjectComments(r.comments.subjects ?? {});
        setSubjectObservations(r.comments.observations ?? {});
        setError(null);
      })
      .catch((e) => { setCard(null); setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => setLoading(false));
  };
  useEffect(refresh, [orgId, studentId, termId]);

  const isAdmin = useMemo(() => isOrgAdmin(me, orgId), [me, orgId]);
  // The server decides; the screen only reflects it.
  const remarkLocked = !!card?.remarkLock?.locked;

  // The default remark for each subject is its computed FINDING (office,
  // 1 Oct: "remarks for every subject by default" - these are the exact,
  // auditable sentences the findings engine already writes; no model, no
  // credits, recomputed per term). Worst finding first in the payload,
  // so the first one per subject is the one worth the column.
  // What prints when the teacher writes nothing: the review's own
  // marks-only answer - an evidence-finding activity the parent can
  // actually do, tiered by how the subject went (2 Oct: "having just
  // good, not graded, excellent is not good"). See
  // subjectRemarkDefaults.ts. The teacher's words always win; the
  // AI-suggested, teacher-approved remark is still the ceiling.
  const printedDefault = (pct: number | null, bandRemark: string) =>
    defaultSubjectRemark({
      percentage: pct,
      passMarkPct: card?.academic.overall.passMarkPct ?? 40,
    })?.en ?? bandRemark;

  // The grading key printed at the foot of the card (office, 1 Oct:
  // "Keys" pen note). The school's own chart; quietly absent if this
  // viewer cannot read the scales endpoint.
  const [keyBands, setKeyBands] = useState<GradeBand[] | null>(null);
  useEffect(() => {
    if (!orgId) return;
    listGradeScales(orgId)
      .then((r) => {
        const scale = r.scales.find((s) => s.isDefault) ?? r.scales[0];
        setKeyBands(scale?.bands?.length ? scale.bands : null);
      })
      .catch(() => setKeyBands(null));
  }, [orgId]);

  // The school's WhatsApp number for the header (office pen, 1 Oct).
  // Settings-owned: whatsapp_number, else the plain contact phone.
  // Quietly absent when neither is set or this viewer cannot read the
  // org (the card payload itself is frozen until the 4 Oct deploy).
  const [schoolPhone, setSchoolPhone] = useState<{ n: string; wa: boolean } | null>(null);
  useEffect(() => {
    if (!orgId) return;
    getOrganization(orgId)
      .then((o) => {
        const s = (o.organization.settings ?? {}) as Record<string, unknown>;
        const wa = typeof s.whatsapp_number === "string" && s.whatsapp_number.trim();
        const tel = typeof s.contact_phone === "string" && s.contact_phone.trim();
        setSchoolPhone(wa ? { n: wa as string, wa: true } : tel ? { n: tel as string, wa: false } : null);
      })
      .catch(() => setSchoolPhone(null));
  }, [orgId]);

  // Which signature lines this school prints. Everything defaults ON,
  // so a school that never opens the setting keeps the card it has.
  const sigLines = card?.school.signatureLines
    ?? { classTeacher: true, principal: true, parent: true, stamp: true };
  const sigCount = [sigLines.classTeacher, sigLines.principal, sigLines.parent, sigLines.stamp]
    .filter(Boolean).length;

  const handleSuggest = async () => {
    if (!card) return;
    setSuggesting(true);
    try {
      const r = await suggestRemarks(orgId, studentId, termId);
      setSugg({ s: r.suggestion, urduOk: r.urduOk, usage: r.usage });
      toast.success(
        r.urduOk
          ? "Written from this child's own numbers — place what you want, edit, then Save."
          : "Suggested — but the Urdu came back oddly, please check it before placing.",
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  };

  // Place a whole suggestion set in one press - the office's ask: "a
  // single button to paste the suggested remarks to their respective
  // subject remark field, or class teacher field". Per-line Use buttons
  // cover the mixed case (this subject in Urdu, the rest in English).
  const placeAll = (lang: "en" | "ur") => {
    if (!sugg) return;
    const s = sugg.s;
    const next = { ...subjectComments };
    for (const x of s.subjects ?? []) next[x.id] = lang === "en" ? x.en : x.ur;
    setSubjectComments(next);
    setClassTeacherComment(lang === "en" ? s.classTeacher : s.classTeacherUr);
    if (isAdmin) setPrincipalComment(lang === "en" ? s.principal : s.principalUr);
    toast.success("Placed — review, edit anything, then Save comments.");
  };

  // One suggested line and the button that lands it in its field.
  const suggLine = (text: string, current: string, place: (t: string) => void, rtl = false) => (
    <div className="flex items-start gap-2">
      <p dir={rtl ? "rtl" : undefined} lang={rtl ? "ur" : undefined} className="flex-1 text-slate-800">
        {text}
      </p>
      <Button
        size="sm" variant={current.trim() === text ? "secondary" : "outline"}
        className="h-6 px-2 text-[10px] shrink-0"
        disabled={remarkLocked || current.trim() === text}
        onClick={() => place(text)}
      >
        {current.trim() === text ? "Placed ✓" : "Use"}
      </Button>
    </div>
  );
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
        subjectObservations,
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
        /* PR feat/report-card-print — A4 print quality. PORTRAIT since
           14 Sep: landscape was the principal's call back when remarks
           were side-by-side columns; with remarks now inside the table
           the card is one tall stack, and on landscape the unbreakable
           summary boxes fell onto a second page after a half-empty
           first (Ambreen's print). Portrait holds the whole card — the
           biggest class table included — on one page. */
        @page { size: A4 portrait; margin: 8mm 10mm; }
        @media print {
          .no-print, .no-print * { display: none !important; }
          body { background: white !important; }
          /* Print the CARD, nothing else. Measured on the office's own
             card (25 Sep): the card is ~899px at A4 width - inside the
             ~1063px page - but the workspace SHELL printed with it
             (header 107px, footer 49px, a search block 40px), pushing
             the total to ~1119px. The signature strip cannot break, so
             it jumped whole to a second page. Taking the card out of
             flow leaves the shell behind without reserving its height. */
          body * { visibility: hidden; }
          .print-card, .print-card * { visibility: visible; }
          .print-card {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important;
          }
          .print-card { box-shadow: none !important; border: none !important; }
          /* Keep each major section together when paginating */
          .print-keep { break-inside: avoid; page-break-inside: avoid; }
          /* Body text scales slightly down so the typical card fits one A4 */
          .print-card, .print-card * { font-size: 10pt; }
          .print-card table { font-size: 9.5pt; }
          .print-card .text-xs, .print-card .text-\\[10px\\], .print-card .text-\\[11px\\] {
            font-size: 9pt !important;
          }
          /* Rows breathe again (office, 2 Oct: "it's okay if it spills to
             the next page because it doesn't look nice"). One page stopped
             being the top priority the moment keeping it cost legibility -
             squeezed rows, a 7.5pt heading and a truncated remark. The
             no-orphan rules below still govern HOW it spills. */
          .print-card table td, .print-card table th {
            padding-top: 4px !important; padding-bottom: 4px !important;
          }
          .print-card .print-keep .rounded-md { padding: 10px !important; }
          /* Tailwind's space-y-* puts the gap on margin-BOTTOM here, and
             every print override before 2 Oct only shrank margin-top - so
             each section carried an unmeasured 20px. Set deliberately now
             rather than accidentally: enough air to read, not the 20px
             that nobody chose. */
          .print-card .space-y-5 > * { margin-bottom: 12px !important; }
          .print-card .space-y-4 > * { margin-bottom: 10px !important; }
          .print-card .space-y-3 > * { margin-bottom: 8px !important; }
          .print-card > div { padding-top: 18px !important; }
          /* Table headings stay readable. NO table-layout:fixed - with it,
             a wide value ("422.5/650") overflowed its share and printed on
             top of the next column (office's 2 Oct print). The colgroup
             shares are hints the browser may grow from. */
          .print-card table th { font-size: 8.5pt !important; line-height: 1.25 !important; }
          /* A row is never split down the middle by a page break, and the
             heading repeats on the second page so the columns still have
             names there. */
          .print-card table tr { break-inside: avoid; page-break-inside: avoid; }
          .print-card table thead { display: table-header-group; }
          /* NO ORPHANS (office, 30 Sep: "if it absolutely has to be on the
             second page then there should be more than just sign and
             stamp"). A lone signature strip on page two is the worst
             outcome - the card looks finished on page one and the parent
             gets a near-blank sheet. 'break-before: avoid' forbids a break
             immediately before the strip, so the browser carries the
             remarks block over with it rather than stranding it. */
          .print-signature { break-before: avoid !important; page-break-before: avoid !important; }
          /* Same rule one level up: the remarks block must not be split
             from what precedes it either, so whatever moves, moves as a
             readable chunk. */
          .print-remarks {
            break-before: avoid; page-break-before: avoid;
            break-after: avoid; page-break-after: avoid;
          }
          /* Whatever else moves, these never arrive alone: a second page
             carrying only a signature line and a stamp is the outcome
             the office rejected (30 Sep). Remarks + key + signatures
             travel as one readable block. */
          .print-remarks, .print-signature { break-inside: avoid; page-break-inside: avoid; }
          /* Remarks print IN FULL (2 Oct). The line clamps existed only
             to defend the single page; defending it truncated a class
             teacher's remark mid-sentence with an ellipsis on the copy
             that goes home to a parent. The 700-character input caps
             still bound how much can be written. */
          .print-remark-body { line-height: 1.45; }
          .print-subject-remark .remark-clamp {
            line-height: 1.35;
            font-size: 9pt !important;
          }
          .print-card .print-info-band {
            padding-top: 6px !important; padding-bottom: 6px !important;
          }
          /* Chrome drops cell fills and some rules when printing unless
             told otherwise - the ruled table and the quiet grey bands
             are the whole point of this revision (office, 1 Oct). */
          .print-card, .print-card * {
            print-color-adjust: exact; -webkit-print-color-adjust: exact;
          }
          /* A blank SECOND page (Ambreen's print, 25 Sep): the card
             itself ended on page one and only trailing space spilled
             over. Nothing after the last section may carry margin,
             padding or height, or the page box grows past A4. */
          .print-card { padding-bottom: 0 !important; margin-bottom: 0 !important; }
          .print-card > *:last-child,
          .print-card .space-y-5 > *:last-child,
          .print-signature { margin-bottom: 0 !important; padding-bottom: 0 !important; }
          .print-card .space-y-5 > * + * { margin-top: 12px !important; }
          .print-card .space-y-4 > * + * { margin-top: 10px !important; }
          .print-card .space-y-3 > * + * { margin-top: 8px !important; }
          html, body { height: auto !important; min-height: 0 !important; }
          .print-signature { padding-top: 14px !important; margin-top: 14px !important; }
          .print-signature .h-14 { height: 44px !important; }
          .print-signature .h-10 { height: 30px !important; }
          /* QR prints a notch smaller (48px = 12.7mm, still an easy
             scan for a short URL) to pay for the WhatsApp line beside
             it (1 Oct) - the header must not outgrow the left stack. */
          .print-card img.print-only { height: 60px !important; width: 60px !important; }
          /* The 3-line address (", Pakistan" since 1 Oct) drives the
             header's height - print it a touch smaller and tighter. */
          .print-card .print-addr { font-size: 9pt !important; line-height: 1.35 !important; }
          /* One line per campus costs real height in a header that is
             already the tightest part of the card (2 Oct) - the term
             line and the section gaps give it back. */
          .print-card .print-term-line { margin-top: 6px !important; }
          .print-signature .h-14 { height: 44px !important; }
          .print-signature .h-10 { height: 30px !important; }
          .print-only { display: block !important; }
        }
        @media screen {
          .print-only { display: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between flex-wrap gap-2 no-print">
        <Link
          to={browseSectionId
            ? `/school/orgs/${orgId}/admin/assessment/report-cards?term=${termId}&section=${browseSectionId}`
            : `/school/orgs/${orgId}/admin/students/${studentId}`}
        >
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> {browseSectionId ? "Class list" : "Student"}
          </Button>
        </Link>
        {/* Stepping child-to-child inside a class, so reading a class's
            cards is not a back-back-back loop (Ambreen, 27 Sep). */}
        {roster.length > 1 && rosterIdx >= 0 && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Link
              to={rosterIdx > 0
                ? `/school/orgs/${orgId}/admin/students/${roster[rosterIdx - 1].id}/report-card?term=${termId}&browse=${browseSectionId}`
                : "#"}
              aria-disabled={rosterIdx === 0}
              className={rosterIdx === 0 ? "pointer-events-none opacity-40" : ""}
            >
              <Button variant="outline" size="sm">‹ Previous</Button>
            </Link>
            <span className="tabular-nums px-1">{rosterIdx + 1} of {roster.length}</span>
            <Link
              to={rosterIdx < roster.length - 1
                ? `/school/orgs/${orgId}/admin/students/${roster[rosterIdx + 1].id}/report-card?term=${termId}&browse=${browseSectionId}`
                : "#"}
              aria-disabled={rosterIdx === roster.length - 1}
              className={rosterIdx === roster.length - 1 ? "pointer-events-none opacity-40" : ""}
            >
              <Button variant="outline" size="sm">Next ›</Button>
            </Link>
          </div>
        )}
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
                    <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Report Card</div>
                    {/* The office pen wrote the WhatsApp number on the
                        header (1 Oct) - settings-owned, see schoolPhone. */}
                    {schoolPhone && (
                      <div className="text-[10px] text-slate-600 mt-0.5 whitespace-nowrap">
                        {schoolPhone.wa ? "WhatsApp " : "Tel "}{schoolPhone.n}
                      </div>
                    )}
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
                {/* One line PER CAMPUS, full width UNDER the header row.
                    Inside the row it fought the QR column for width:
                    either the QR was pushed past the printable edge
                    (office, 2 Oct: "the QR code is cutting off") or, once
                    the block was allowed to shrink, every campus line
                    wrapped and the card grew past A4. Rendered as one
                    blob the campuses also ran together ("...KARACHI,
                    Pakistan Campus II: B-15..."). */}
                {card.school.address && (
                  <div className="text-[11px] text-slate-500 mt-1 print-addr">
                    {card.school.address.split(/\r?\n/).filter((l) => l.trim()).map((line, i) => (
                      <div key={i} className="truncate">{line.trim()}</div>
                    ))}
                  </div>
                )}
                {/* The term and its dates, CENTERED on their own line
                    (office, 1 Oct print markup: "centralize"). Dates read
                    day-month-year, the way Pakistan writes them. */}
                <div className="text-center text-[11px] text-slate-600 mt-1.5 whitespace-nowrap print-term-line">
                  <span className="font-semibold text-slate-900">{card.term.name}</span>
                  <span className="text-slate-400"> · </span>
                  {fmtDayMonthYear(card.term.startDate)} – {fmtDayMonthYear(card.term.endDate)}
                </div>
              </div>

              {/* The child's identity sits in its own quiet band (office,
                  1 Oct markup: wanted it bolder; a subtle boxed strip
                  separates it without shouting). Values go semibold. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 print-keep print-info-band">
                <div><div className="text-slate-500">Name</div><div className="font-semibold text-slate-900">{card.student.fullName}</div></div>
                <div><div className="text-slate-500">GR No</div><div className="font-semibold text-slate-900">{card.student.grNumber}</div></div>
                <div><div className="text-slate-500">Class</div>
                  <div className="font-semibold text-slate-900">
                    {card.placement.className ?? "—"}{card.placement.sectionName ? ` — ${card.placement.sectionName}` : ""}
                  </div>
                </div>
                <div><div className="text-slate-500">Class teacher</div>
                  <div className="font-semibold text-slate-900">{card.placement.classTeacherName ?? "—"}</div>
                </div>
              </div>

              <section>
                {/* Underlined, per the office's pen (1 Oct). */}
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
                  <span className="underline underline-offset-2">Academic performance</span>
                </h3>
                {card.academic.subjects.length === 0 ? (
                  <div className="text-xs text-slate-500 italic">No subject scores recorded for this term.</div>
                ) : (
                  <div className="overflow-x-auto">
                    {/* Full grid lines (office, 1 Oct): every cell ruled so
                        a parent's eye can't drift a row - which grade and
                        remark belongs to which subject is unmistakable. */}
                    <table className="w-full text-xs border border-slate-300 print-subject-table">
                      {/* Width HINTS, not hard shares - the table lays out
                          auto, so a column grows if its content needs it.
                          With table-layout:fixed a wide total ("422.5/650")
                          overflowed its share and printed across the next
                          column (office's 2 Oct print). Remarks still take
                          whatever is left, which keeps the finding
                          sentences to two lines on most cards. */}
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
                          <th className="text-left px-2 py-1.5 border border-slate-200">Subject</th>
                          {/* "1st Assessment — Written" said the term twice:
                              the term already heads the card, so the column is
                              just "Written" (office, 1 Oct). A per-class
                              override label is used as-is. */}
                          {card.exams.map((e) => (
                            <th key={e.id} className="text-center px-2 py-1.5 border border-slate-200">
                              {e.columnLabel || paperOnly(e.name, card.term.name)}
                            </th>
                          ))}
                          <th className="text-right px-2 py-1.5 border border-slate-200">Total</th>
                          <th className="text-right px-2 py-1.5 border border-slate-200">%</th>
                          <th className="text-center px-2 py-1.5 border border-slate-200">Grade</th>
                          <th className="text-center px-2 py-1.5 border border-slate-200">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.academic.subjects.map((s) => {
                        // Below the school's pass line reads RED here, the
                        // same as on the tabulation sheet - the two must
                        // never disagree about who failed what (25 Sep:
                        // Fizza's Science showed F in plain black).
                        const subjFailed = s.percentage !== null &&
                          s.percentage < card.academic.overall.passMarkPct;
                        return (
                          <tr key={s.classSubjectId}>
                            <td className="px-2 py-1.5 font-medium border border-slate-200">{s.name}</td>
                            {card.exams.map((e) => {
                              const pe = s.perExam.find((x) => x.examId === e.id);
                              return (
                                <td key={e.id} className="px-2 py-1.5 text-center border border-slate-200">
                                  {!pe ? "—" : pe.absent ? <span className="text-rose-600">Abs</span> :
                                    pe.obtained === null ? "—" :
                                    <>{pe.obtained}<span className="text-slate-400">/{pe.max}</span></>}
                                </td>
                              );
                            })}
                            <td className="px-2 py-1.5 text-right border border-slate-200">
                              {s.totalMax > 0 ? `${s.totalObtained}/${s.totalMax}` : "—"}
                            </td>
                            <td className={"px-2 py-1.5 text-right font-medium border border-slate-200 " + (subjFailed ? "text-rose-700" : "")}>{fmtPct(s.percentage)}</td>
                            <td className={"px-2 py-1.5 text-center font-bold border border-slate-200 " + (subjFailed ? "text-rose-700" : "")}>{s.letter}</td>
                            {/* The subject teacher's own comment lives IN the
                                table; the computed FINDING for the subject is
                                the default (office, 1 Oct: "remarks for every
                                subject by default" - the findings are exact
                                arithmetic, no model, no credits); the band
                                remark is the last fallback. Live state, so
                                unsaved edits print. */}
                            <td className={"px-2 py-1.5 border border-slate-200 print-subject-remark " + (subjFailed ? "text-rose-700" : "text-slate-600")}>
                              <div className="remark-clamp">
                                {(subjectComments[s.classSubjectId] ?? "").trim()
                                  || printedDefault(s.percentage, s.remark)}
                              </div>
                            </td>
                          </tr>
                        );
                        })}
                        {/* The heavier rule above Overall is the office's
                            "line in between" pen note (1 Oct). */}
                        <tr className="border-t-2 border-slate-400 bg-slate-50/60 font-semibold">
                          <td className="px-2 py-1.5 border border-slate-200 border-t-2 border-t-slate-400">Overall</td>
                          <td colSpan={card.exams.length} className="px-2 py-1.5 border border-slate-200 border-t-2 border-t-slate-400"></td>
                          <td className="px-2 py-1.5 text-right border border-slate-200 border-t-2 border-t-slate-400">
                            {card.academic.overall.max > 0
                              ? `${card.academic.overall.obtained}/${card.academic.overall.max}`
                              : "—"}
                          </td>
                          {/* The verdict by the SCHOOL's own pass mark, which
                              is set independently of the grading chart (22 Sep). */}
                          <td className={"px-2 py-1.5 text-right border border-slate-200 border-t-2 border-t-slate-400 " +
                            (card.academic.overall.failed ? "font-bold text-rose-700" : "")}>
                            {fmtPct(card.academic.overall.percentage)}
                          </td>
                          <td className="px-2 py-1.5 text-center border border-slate-200 border-t-2 border-t-slate-400">{card.academic.overall.letter}</td>
                          <td className="px-2 py-1.5 border border-slate-200 border-t-2 border-t-slate-400">
                            {card.academic.overall.remark}
                            {card.academic.overall.failed && (
                              <span className="ml-1.5 font-bold text-rose-700">
                                {/* A fail in ANY subject fails the term, so the
                                    card must say which - otherwise a card with a
                                    healthy total just reads "Failed" (26 Sep). */}
                                — Failed
                                {(card.academic.overall.failedSubjects ?? []).length > 0
                                  ? ` (${card.academic.overall.failedSubjects!.join(", ")} below ${card.academic.overall.passMarkPct}%)`
                                  : ` (below ${card.academic.overall.passMarkPct}%)`}
                              </span>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className={`grid grid-cols-1 ${card.hifz.show !== false ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-3 print-keep`}>
                <div className="rounded-md border border-slate-300 bg-white p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 pb-1 border-b border-slate-200 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-indigo-500" /> Attendance
                  </div>
                  <div className="text-xs space-y-0.5">
                    {/* Days present leads. With a carried balance the
                        per-status counts below cover only the days marked
                        here, so they are labelled (21 Sep). */}
                    <div>
                      Present:{" "}
                      <span className="font-medium">
                        {card.attendance.daysPresent ?? card.attendance.present} days
                        {card.attendance.joinedMidTerm
                          ? " since joining"
                          : ` of ${card.attendance.workingDays ?? card.attendance.total} days`}
                      </span>
                    </div>
                    {/* A child admitted mid-term was handed their class's
                        register denominator, which made a new arrival read
                        as a truant. Print the joining date instead of a
                        percentage we cannot stand behind (25 Sep). */}
                    {card.attendance.joinedMidTerm ? (
                      <div className="text-[10px] leading-tight text-slate-500">
                        Joined{" "}
                        {new Date(
                          (card.attendance.startsOn ?? card.attendance.admissionDate) as string,
                        ).toLocaleDateString()}
                        , part-way through the term.
                      </div>
                    ) : !!card.attendance.carriedDays && (
                      <div className="text-[10px] leading-tight text-slate-500">
                        Includes {card.attendance.carriedDays} days from the school
                        {card.attendance.carriedAsOf ? ` register up to ${card.attendance.carriedAsOf}` : " register"}.
                      </div>
                    )}
                    <div className="pt-1">
                      {card.attendance.carriedDays && !card.attendance.joinedMidTerm ? "Since then — " : ""}
                      Late: <span className="font-medium">{card.attendance.late}</span>
                      {" · "}Absent: <span className="font-medium">{card.attendance.absent}</span>
                      {" · "}Excused: <span className="font-medium">{card.attendance.excused}</span>
                    </div>
                    <div className="pt-1 border-t border-slate-100 mt-1">
                      {card.attendance.joinedMidTerm ? (
                        <span className="text-slate-500">
                          Attendance percentage not shown for a part-term.
                        </span>
                      ) : (
                        <>
                          <span className="font-semibold">{fmtPct(card.attendance.attendancePct)}</span> attendance
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-slate-300 bg-white p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 pb-1 border-b border-slate-200 flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Behavior
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div>Positive notes: <span className="font-medium text-emerald-700">{card.behavior.positive}</span></div>
                    <div>Concerns: <span className="font-medium text-amber-700">{card.behavior.concern}</span></div>
                    <div>Net points: <span className="font-semibold">{card.behavior.netPoints}</span></div>
                  </div>
                </div>
                {/* Only a memorizing child gets the Hifz box — an academic
                    child's card showed a box of zeros (school, 14 Sep). */}
                {card.hifz.show !== false && (
                  <div className="rounded-md border border-slate-300 bg-white p-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 pb-1 border-b border-slate-200 flex items-center gap-1">
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
                )}
              </section>

              {/* Editing tool only — on PAPER each subject's comment sits in
                  the table's Remarks column above. Printing this list too
                  repeated every subject ("Subject: —" × 9) and pushed the
                  card onto a second page (Ambreen, 14 Sep). */}
              <section className="space-y-3 no-print">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Subject remarks
                    <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                      printed inside the table's Remarks column
                    </span>
                  </div>
                  {/* Round 3 (2 Oct): the AI can only write what someone
                      saw. An observation per subject - a picked need and
                      a few words - is what turns "practice is needed"
                      into "finish every part of the written answer". */}
                  <p className="mb-2 text-[11px] text-slate-500">
                    What you observed makes the AI suggestion specific — pick what you saw,
                    add a few words. Observations are never printed; they shape the suggested remark.
                  </p>
                  <div className="space-y-1.5">
                    {card.academic.subjects.map((s) => {
                      const v = subjectComments[s.classSubjectId] ?? "";
                      // What the card will print if the teacher writes
                      // nothing. Shown as the placeholder so an override
                      // is an informed act (1 Oct).
                      const dflt = printedDefault(s.percentage, s.remark);
                      const obs = subjectObservations[s.classSubjectId] ?? {};
                      const setObs = (patch: { need?: string; note?: string }) =>
                        setSubjectObservations({
                          ...subjectObservations,
                          [s.classSubjectId]: { ...obs, ...patch },
                        });
                      return (
                        <div key={s.classSubjectId} className="text-xs">
                          <div className="font-medium text-slate-700">{s.name}:</div>
                          <Textarea
                            value={v}
                            onChange={(e) => setSubjectComments({ ...subjectComments, [s.classSubjectId]: e.target.value })}
                            placeholder={dflt ? `Auto: ${dflt}` : "—"}
                            className="text-xs h-16"
                            maxLength={1000}
                          />
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">Observed:</span>
                            <select
                              className="h-6 rounded border border-slate-200 bg-white px-1 text-[10px] text-slate-600"
                              value={obs.need ?? ""}
                              onChange={(e) => setObs({ need: e.target.value || undefined })}
                            >
                              <option value="">— nothing picked —</option>
                              <option>Incomplete answers</option>
                              <option>Difficulty recalling content</option>
                              <option>Needs help applying concepts</option>
                            </select>
                            <input
                              type="text"
                              className="h-6 flex-1 min-w-[140px] rounded border border-slate-200 bg-white px-1.5 text-[10px] text-slate-600"
                              placeholder="…a few words of your own (not printed)"
                              value={obs.note ?? ""}
                              maxLength={280}
                              onChange={(e) => setObs({ note: e.target.value || undefined })}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {card.findings && (
                <ReportFindingsPanel
                  findings={card.findings.items}
                  notable={card.findings.notable}
                />
              )}

              <section className="space-y-3 print-keep print-remarks">
                {/* Boxed and top-aligned (office, 1 Oct): the two remarks
                    read as two clearly separate sections whose headings
                    start level with each other. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                  <div className="rounded-md border border-slate-200 p-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Class teacher's remark
                    </div>
                    <Textarea
                      value={classTeacherComment}
                      onChange={(e) => setClassTeacherComment(e.target.value)}
                      placeholder={card.comments.auto?.classTeacher ? (card.comments.classTeacher ?? "—") : "—"}
                      className="text-xs h-20 no-print"
                      maxLength={700}
                      disabled={remarkLocked}
                    />
                    {/* Locked once the office finalizes, or once the
                        remarks deadline passes - say which, rather than
                        letting the save fail (27 Sep). */}
                    {remarkLocked ? (
                      <p className="mt-1 text-[10px] text-amber-700 no-print">
                        {card.remarkLock?.message}
                      </p>
                    ) : (
                      <>
                        {card.comments.auto?.classTeacher && !classTeacherComment && (
                          <p className="mt-1 text-[10px] text-slate-400 no-print">
                            Auto from the remarks chart — type to replace, leave empty to keep it following the chart.
                          </p>
                        )}
                        {card.remarkLock?.closesAt && !isAdmin && (
                          <p className="mt-1 text-[10px] text-slate-500 no-print">
                            Remarks close {new Date(card.remarkLock.closesAt).toLocaleString()}.
                          </p>
                        )}
                      </>
                    )}
                    <div className="hidden print:block text-xs text-slate-700 print-remark-body">
                      {classTeacherComment || card.comments.classTeacher || "—"}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                      Principal's remark
                    </div>
                    <Textarea
                      value={principalComment}
                      onChange={(e) => setPrincipalComment(e.target.value)}
                      placeholder={card.comments.auto?.principal ? (card.comments.principal ?? "—") : "—"}
                      className="text-xs h-20 no-print"
                      maxLength={700}
                      disabled={!isAdmin}
                    />
                    {card.comments.auto?.principal && !principalComment && (
                      <p className="mt-1 text-[10px] text-slate-400 no-print">
                        Auto from the remarks chart — type to replace.
                      </p>
                    )}
                    <div className="hidden print:block text-xs text-slate-700 print-remark-body">
                      {principalComment || card.comments.principal || "—"}
                    </div>
                  </div>
                </div>

                {/* The review tray (round 2, 30 Sep). Every suggested
                    line — per weak subject, class teacher, principal —
                    shows English and Urdu side by side with a Use button
                    that fills its field. "Placed ✓" is literal: the
                    field currently holds exactly this text. Nothing here
                    saves anything; Save comments does. */}
                {sugg && (
                  <div className="rounded-md border border-indigo-200 bg-indigo-50/60 px-3 py-2.5 text-xs no-print space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-indigo-900 mr-auto">
                        Suggested remarks — press Use to place each line
                      </div>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                        disabled={remarkLocked} onClick={() => placeAll("en")}>
                        Place all · English
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                        disabled={remarkLocked} onClick={() => placeAll("ur")}>
                        Place all · اردو
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                        onClick={() => setSugg(null)}>
                        Dismiss
                      </Button>
                    </div>

                    {(sugg.s.subjects ?? []).map((x) => {
                      const subj = card.academic.subjects.find((s) => s.classSubjectId === x.id);
                      const cur = subjectComments[x.id] ?? "";
                      const place = (t: string) =>
                        setSubjectComments({ ...subjectComments, [x.id]: t });
                      return (
                        <div key={x.id} className="space-y-1">
                          <div className="font-medium text-slate-700">
                            {subj?.name ?? "Subject"}
                            {subj?.percentage != null && (
                              <span className="ml-1.5 font-normal text-slate-400">
                                {Math.round(subj.percentage * 10) / 10}%
                                {subj.letter ? ` · ${subj.letter}` : ""}
                              </span>
                            )}
                          </div>
                          {suggLine(x.en, cur, place)}
                          {suggLine(x.ur, cur, place, true)}
                        </div>
                      );
                    })}

                    <div className="space-y-1">
                      <div className="font-medium text-slate-700">Class teacher's remark</div>
                      {suggLine(sugg.s.classTeacher, classTeacherComment, setClassTeacherComment)}
                      {suggLine(sugg.s.classTeacherUr, classTeacherComment, setClassTeacherComment, true)}
                    </div>
                    {isAdmin && (
                      <div className="space-y-1">
                        <div className="font-medium text-slate-700">Principal's remark</div>
                        {suggLine(sugg.s.principal, principalComment, setPrincipalComment)}
                        {suggLine(sugg.s.principalUr, principalComment, setPrincipalComment, true)}
                      </div>
                    )}

                    {!sugg.urduOk && (
                      <p className="text-[10px] text-amber-700">
                        The Urdu came back oddly — read it before placing.
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500">
                      Nothing is saved until you press Save comments. Subject remarks print
                      inside the table's Remarks column; a placed remark keeps its language.
                      {sugg.usage &&
                        ` This suggestion used ${sugg.usage.inputTokens + sugg.usage.outputTokens} tokens (≈ ${sugg.usage.approxUsd < 0.01 ? "1¢" : "$" + sugg.usage.approxUsd.toFixed(2)}).`}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 no-print">
                  <Button size="sm" onClick={handleSaveComments} disabled={saving || remarkLocked}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save comments"}
                  </Button>
                  {/* Writes from the findings above, in the school's voice.
                      It fills the boxes - saving is still a human act.
                      Off once locked: no token is worth spending on a
                      remark this reader could not save (27 Sep). */}
                  <Button size="sm" variant="outline" onClick={handleSuggest} disabled={suggesting || saving || remarkLocked}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    {suggesting ? "Writing…" : "Suggest with AI"}
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
                {/* Which lines print is the school's call (26 Sep: teachers
                    were uneasy about handing over a signature image). The
                    row rebalances to however many are switched on, and the
                    class teacher's NAME still heads the card either way. */}
                <div
                  className="grid gap-6 text-[11px] text-slate-600"
                  style={{ gridTemplateColumns: `repeat(${sigCount || 1}, minmax(0, 1fr))` }}
                >
                  {sigLines.classTeacher && (
                    <div className="text-center">
                      {/* An uploaded signature (the teacher's own profile
                          page) sits on the line like ink; otherwise the
                          line stays blank to be signed by hand. */}
                      <div className="h-10 border-b border-slate-300 flex items-end justify-center">
                        {card.placement.classTeacherSignatureUrl && (
                          <img src={card.placement.classTeacherSignatureUrl} alt="" className="max-h-9 max-w-full object-contain" />
                        )}
                      </div>
                      <div className="mt-1">Class teacher</div>
                      <div className="text-[10px] text-slate-500">{card.placement.classTeacherName ?? ""}</div>
                    </div>
                  )}
                  {sigLines.principal && (
                    <div className="text-center">
                      {/* Set in Settings → Organization. Blank when unset. */}
                      <div className="h-10 border-b border-slate-300 flex items-end justify-center">
                        {card.school.principalSignatureUrl && (
                          <img
                            src={card.school.principalSignatureUrl}
                            alt=""
                            className="max-h-9 max-w-full object-contain"
                          />
                        )}
                      </div>
                      <div className="mt-1">Principal</div>
                    </div>
                  )}
                  {sigLines.parent && (
                    <div className="text-center">
                      <div className="h-10 border-b border-slate-300"></div>
                      <div className="mt-1">Parent signature</div>
                    </div>
                  )}
                  {sigLines.stamp && (
                    <div className="text-center">
                      {card.school.stampUrl ? (
                        <div className="h-14 flex items-center justify-center">
                          <img src={card.school.stampUrl} alt="School stamp" className="max-h-14 max-w-full object-contain" />
                        </div>
                      ) : (
                        <div className="h-14 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">
                          School stamp
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* The REMARKS CHART, laid out the way the school prints
                    it on its own paper (office, 2 Oct, with a photo of
                    theirs): remark word, grade, range - boxed, headed,
                    centered. It sits BELOW the signature row, where they
                    asked for it ("Remarks chart sign k bad hona chahiye",
                    2 Oct), with only the issued footer after it.
                    Built from the school's OWN grade scale, so it can
                    never drift from the letters the card awards.
                    Ranges read their way too: a band stored half-open as
                    [80, 90) prints "80% - 89%", and the bottom band
                    prints "Below 40%". */}
                {keyBands && keyBands.length > 0 && (() => {
                  const bands = [...keyBands].sort((a, b) => b.minPct - a.minPct);
                  const lowest = bands[bands.length - 1];
                  const range = (b: GradeBand) =>
                    b.minPct <= 0
                      ? `Below ${Math.round(b.maxPct)}%`
                      : `${Math.round(b.minPct)}% – ${Math.round(b.maxPct) >= 100 ? 100 : Math.round(b.maxPct) - 1}%`;
                  // Only say the pass mark when it is NOT simply the
                  // bottom band's edge - otherwise the chart already
                  // says it and repeating it adds noise.
                  const passSaidByChart = Math.round(lowest?.maxPct ?? -1) === card.academic.overall.passMarkPct;
                  return (
                    <div className="mt-5 flex justify-center print-keep">
                      <div className="inline-block border-2 border-indigo-900/70 rounded-sm px-4 py-2">
                        <div className="text-center text-[11px] font-bold uppercase tracking-wider text-indigo-900 mb-1">
                          Remarks chart
                        </div>
                        <table className="text-[10px] text-slate-700">
                          <tbody>
                            {bands.map((b) => (
                              <tr key={`${b.letter}-${b.minPct}`}>
                                <td className="pr-6 py-[1px] whitespace-nowrap">{b.remark ?? "—"}</td>
                                <td className="pr-6 py-[1px] text-center font-semibold whitespace-nowrap">{b.letter}</td>
                                <td className="py-[1px] text-right whitespace-nowrap tabular-nums">{range(b)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!passSaidByChart && (
                          <div className="text-center text-[9px] text-slate-500 mt-1">
                            Pass mark {card.academic.overall.passMarkPct}%
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
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
