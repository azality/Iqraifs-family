// What the numbers actually SAY about one child, computed - not written.
//
// 25 Sep: "does the system assess kids' overall understanding... something
// actually helpful for the parents or kids to improve". The useful part of
// that is arithmetic, not prose: a subject far below the child's own
// average, an oral/written split inside one subject, attendance that
// explains a dip, hifz revision slipping while new lessons hold. All of it
// is computable from data we already store, so it is exact, free, and
// auditable - no model can get a percentage wrong here.
//
// The findings feed three things: a teacher-facing "what to tell this
// parent" panel, the remark chooser, and (later) an AI that WRITES from
// these findings rather than doing its own arithmetic.
//
// Pure module: no database, no network, no clock.

export type FindingKind =
  | "subject_strong" | "subject_weak" | "subject_failed" | "paper_gap"
  | "attendance_perfect" | "attendance_concern"
  | "trend_up" | "trend_down"
  | "hifz_area_weak" | "hifz_area_strong";

export type Severity = "strength" | "watch" | "concern";

export interface Finding {
  kind: FindingKind;
  severity: Severity;
  /** Subject name where the finding is about one subject. */
  subject?: string;
  /** Plain sentence, ready to show a teacher or feed a writer. */
  en: string;
  ur: string;
  /** The numbers behind it, so a UI can render its own phrasing. */
  data: Record<string, number | string>;
}

export interface FindingsSubject {
  name: string;
  percentage: number | null;
  /** Per-paper marks inside this subject (oral / written / …). */
  papers?: Array<{ label: string; obtained: number | null; max: number; absent?: boolean }>;
}

export interface FindingsInput {
  subjects: FindingsSubject[];
  overallPct: number | null;
  passMarkPct: number;
  attendance?: { present: number; absent: number; late: number; total: number } | null;
  /** Hifz quality tallies per kind, e.g. { sabaq: { excellent: 2, good: 13,
   *  needs_practice: 3, weak: 1 }, … }. */
  hifz?: Record<string, Record<string, number>> | null;
  /** Same child's overall percentage in the previous term, when there is one. */
  priorOverallPct?: number | null;
}

/** A subject this far from the child's OWN average is worth naming. */
const SUBJECT_GAP = 12;
/** Oral vs written this far apart points at one specific paper - but
 *  only when the other paper is genuinely holding up (below), otherwise
 *  "the oral is weaker" is noise on a subject that is weak throughout. */
const PAPER_GAP = 20;
/** The stronger paper must clear this for the split to mean anything. */
const PAPER_CONTRAST_FLOOR = 50;
/** Attendance below this is worth a parent's attention. */
const ATTENDANCE_FLOOR = 85;
/** Term-over-term movement this large is a real change, not noise. */
const TREND_STEP = 5;
/** Hifz: a kind needs this many entries before its rate means anything. */
const HIFZ_MIN_ENTRIES = 5;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Ordered worst-first so a UI can take the top N and show what matters. */
const SEVERITY_RANK: Record<Severity, number> = { concern: 0, watch: 1, strength: 2 };

export function computeFindings(input: FindingsInput): Finding[] {
  const out: Finding[] = [];
  const { overallPct, passMarkPct } = input;

  // ── Per subject: against the child's OWN average, not the class's ──
  for (const s of input.subjects) {
    if (s.percentage === null || !Number.isFinite(s.percentage)) continue;
    const pct = s.percentage;

    if (pct < passMarkPct) {
      out.push({
        kind: "subject_failed", severity: "concern", subject: s.name,
        en: `${s.name} is below the pass mark (${r1(pct)}%).`,
        ur: `${s.name} کامیابی کی حد سے کم ہے (${r1(pct)}%)۔`,
        data: { percentage: r1(pct), passMarkPct },
      });
    } else if (overallPct !== null && pct <= overallPct - SUBJECT_GAP) {
      out.push({
        kind: "subject_weak", severity: "watch", subject: s.name,
        en: `${s.name} (${r1(pct)}%) is well below their own average of ${r1(overallPct)}%.`,
        ur: `${s.name} (${r1(pct)}%) ان کے اپنے اوسط ${r1(overallPct)}% سے خاصا کم ہے۔`,
        data: { percentage: r1(pct), overallPct: r1(overallPct), gap: r1(overallPct - pct) },
      });
    } else if (overallPct !== null && pct >= overallPct + SUBJECT_GAP) {
      out.push({
        kind: "subject_strong", severity: "strength", subject: s.name,
        en: `${s.name} (${r1(pct)}%) is a clear strength, well above their own average.`,
        ur: `${s.name} (${r1(pct)}%) نمایاں قوت ہے، ان کے اپنے اوسط سے کہیں بہتر۔`,
        data: { percentage: r1(pct), overallPct: r1(overallPct), gap: r1(pct - overallPct) },
      });
    }

    // ── Inside one subject: which PAPER lost the marks ──
    const sat = (s.papers ?? []).filter(
      (p) => !p.absent && p.obtained !== null && p.max > 0,
    );
    if (sat.length >= 2) {
      const scored = sat.map((p) => ({ label: p.label, pct: (p.obtained! / p.max) * 100 }));
      scored.sort((a, b) => a.pct - b.pct);
      const low = scored[0];
      const high = scored[scored.length - 1];
      // Both papers weak? The subject-level finding already says it -
      // naming a paper would only dilute the message (Abu Bakar's Urdu:
      // oral 20%, written 43%, and the whole subject needs work).
      if (high.pct - low.pct >= PAPER_GAP && high.pct >= PAPER_CONTRAST_FLOOR) {
        out.push({
          kind: "paper_gap", severity: "watch", subject: s.name,
          en: `In ${s.name} the ${low.label} paper (${r1(low.pct)}%) is far weaker than ${high.label} (${r1(high.pct)}%) - the practice is needed there specifically.`,
          ur: `${s.name} میں ${low.label} کا پرچہ (${r1(low.pct)}%) ${high.label} (${r1(high.pct)}%) سے کہیں کمزور ہے — مشق خاص طور پر اسی میں درکار ہے۔`,
          data: { weakPaper: low.label, weakPct: r1(low.pct), strongPaper: high.label, strongPct: r1(high.pct) },
        });
      }
    }
  }

  // ── Attendance: the context that explains (or rules out) a dip ──
  const a = input.attendance;
  if (a && a.total > 0) {
    const pct = (a.present / a.total) * 100;
    if (pct < ATTENDANCE_FLOOR) {
      out.push({
        kind: "attendance_concern", severity: "concern",
        en: `Attendance was ${r1(pct)}% (${a.absent} day${a.absent === 1 ? "" : "s"} absent) - missed lessons are hard to recover.`,
        ur: `حاضری ${r1(pct)}% رہی (${a.absent} دن غیر حاضر) — چھوٹے ہوئے اسباق کی تلافی مشکل ہوتی ہے۔`,
        data: { attendancePct: r1(pct), absent: a.absent, late: a.late },
      });
    } else if (a.absent === 0 && a.late === 0 && a.total >= 10) {
      out.push({
        kind: "attendance_perfect", severity: "strength",
        en: `Full attendance - present every one of the ${a.total} days.`,
        ur: `مکمل حاضری — تمام ${a.total} دن حاضر۔`,
        data: { days: a.total },
      });
    }
  }

  // ── Movement since last term ──
  if (overallPct !== null && input.priorOverallPct !== null && input.priorOverallPct !== undefined) {
    const delta = overallPct - input.priorOverallPct;
    if (delta >= TREND_STEP) {
      out.push({
        kind: "trend_up", severity: "strength",
        en: `Overall rose from ${r1(input.priorOverallPct)}% to ${r1(overallPct)}% since last term.`,
        ur: `مجموعی نتیجہ پچھلے ٹرم کے ${r1(input.priorOverallPct)}% سے بڑھ کر ${r1(overallPct)}% ہو گیا۔`,
        data: { from: r1(input.priorOverallPct), to: r1(overallPct), delta: r1(delta) },
      });
    } else if (delta <= -TREND_STEP) {
      out.push({
        kind: "trend_down", severity: "concern",
        en: `Overall fell from ${r1(input.priorOverallPct)}% to ${r1(overallPct)}% since last term.`,
        ur: `مجموعی نتیجہ پچھلے ٹرم کے ${r1(input.priorOverallPct)}% سے کم ہو کر ${r1(overallPct)}% رہ گیا۔`,
        data: { from: r1(input.priorOverallPct), to: r1(overallPct), delta: r1(delta) },
      });
    }
  }

  // ── Hifz: WHICH of sabaq / sabqi / manzil is slipping ──
  // The three carry different meanings - new lesson, recent revision,
  // long-term retention - so "weak in manzil" tells a parent something
  // very different from "weak in sabaq". Named per kind, never merged.
  const HIFZ_LABEL: Record<string, { en: string; ur: string; meaning_en: string }> = {
    sabaq: { en: "Sabaq (new lesson)", ur: "سبق (نیا سبق)", meaning_en: "new memorisation" },
    sabqi: { en: "Sabqi (recent revision)", ur: "سبقی (حالیہ دہرائی)", meaning_en: "recent revision" },
    manzil: { en: "Manzil (older revision)", ur: "منزل (پرانی دہرائی)", meaning_en: "long-term retention" },
  };
  for (const [kind, tally] of Object.entries(input.hifz ?? {})) {
    const label = HIFZ_LABEL[kind];
    if (!label) continue;
    const excellent = tally.excellent ?? 0;
    const good = tally.good ?? 0;
    const needs = tally.needs_practice ?? 0;
    const weak = tally.weak ?? 0;
    const rated = excellent + good + needs + weak;
    if (rated < HIFZ_MIN_ENTRIES) continue;
    const belowRate = ((needs + weak) / rated) * 100;
    const goodRate = ((excellent + good) / rated) * 100;
    if (belowRate >= 20) {
      out.push({
        kind: "hifz_area_weak", severity: "watch",
        en: `${label.en}: ${needs + weak} of ${rated} entries needed practice - this is the area to give extra daily time.`,
        ur: `${label.ur}: ${rated} میں سے ${needs + weak} مرتبہ مشق کی ضرورت رہی — روزانہ اضافی وقت اسی حصے کو درکار ہے۔`,
        data: { area: kind, below: needs + weak, rated, belowRate: r1(belowRate) },
      });
    } else if (goodRate >= 85) {
      out.push({
        kind: "hifz_area_strong", severity: "strength",
        en: `${label.en}: ${excellent + good} of ${rated} entries rated good or better.`,
        ur: `${label.ur}: ${rated} میں سے ${excellent + good} کی کیفیت اچھی یا بہتر رہی۔`,
        data: { area: kind, good: excellent + good, rated, goodRate: r1(goodRate) },
      });
    }
  }

  // Worst first, so "the top three things to say" is just a slice.
  out.sort((x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity]);
  return out;
}

/** True when the findings hold something a band remark could not say -
 *  the ~third of children where a tailored remark actually earns its
 *  keep (and, later, the only ones worth spending an AI call on). */
export function isNotable(findings: Finding[]): boolean {
  return findings.some((f) => f.severity !== "strength")
    || findings.filter((f) => f.severity === "strength").length >= 2;
}
