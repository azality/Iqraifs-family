// Tailored report-card remarks, written by Claude FROM the findings.
//
// 25-26 Sep. Two rules decide the whole design:
//
//  1. The model never does arithmetic. reportFindings.ts has already
//     computed every number; the model is handed those sentences and
//     asked only to write them up in the school's voice. A wrong
//     percentage on a card that reaches a parent is unrecoverable, and
//     this removes the chance of one entirely.
//  2. Nothing is saved automatically. The endpoint SUGGESTS; a teacher
//     or the principal reads it, edits it, and saves it. ("teacher or
//     principal would still be able to edit it.")
//
// Urdu is generated alongside English in the same call, from the same
// findings, so the two say the same thing rather than one being a
// translation of the other. Nominal style, no gendered verb endings -
// one remark serves a boy or a girl.

import type { Finding } from "./reportFindings.ts";

/** A subject the school's own chart calls weak - below the pass mark,
 *  or in the chart's bottom bands (the office's "failing or Ds or Es",
 *  30 Sep). The remark written for it lands in that subject's own
 *  remark field on the card, still placed and saved by a human. */
export interface WeakSubject {
  /** class_subject id - the key the subject's remark field is stored under. */
  id: string;
  name: string;
  pct: number;
  letter: string | null;
  /** The computed finding sentences about this subject (exact, auditable). */
  findings: string[];
}

export interface RemarkContext {
  schoolName: string;
  studentFirstName: string;
  className: string | null;
  termName: string;
  overallPct: number | null;
  passMarkPct: number;
  isMemorizer: boolean;
  weakSubjects: WeakSubject[];
}

export interface SuggestedRemarks {
  classTeacher: string;
  classTeacherUr: string;
  principal: string;
  principalUr: string;
  /** One per weak subject the context listed - never any other subject. */
  subjects: Array<{ id: string; en: string; ur: string }>;
}

/** Sonnet for the Urdu: the school reads these, and the register
 *  matters more here than the few cents a cheaper model would save
 *  (a whole 1,000-child school costs well under $30 a year either way). */
export const REMARK_MODEL = "claude-sonnet-5";

export const SYSTEM_PROMPT = `You write report-card remarks for an Islamic school in Pakistan, in English and Urdu.

You are given FINDINGS that have already been computed from the child's own marks, attendance and hifz record. They are correct. Your job is only to turn them into remarks a parent will read.

Rules:
- Use ONLY what the findings state. Never invent a subject, a behaviour, an attitude, an effort level or a number that is not there. If the findings are thin, write something short and general rather than inventing detail.
- Never restate a percentage the findings did not give you, and never do your own arithmetic.
- Class teacher's remark: 2-3 sentences. Name the specific strength and the specific thing to work on, and say what would actually help at home.
- Principal's remark: 1-2 sentences. Warmer and broader - encouragement, and where relevant an invitation to meet the school.
- Tone: warm, respectful, never harsh about a struggling child, never inflated about a strong one. "Mashallah" and "Inshallah" are natural here; use them where they fit, not in every sentence.
- Urdu must carry the same meaning as the English, not a word-for-word translation. Write it in a NOMINAL style ("محنت نمایاں ہے") and avoid gendered verb endings such as کرتا/کرتی, so the same remark suits a boy or a girl.
- Address the parent about the child. Do not use the child's name more than once.
- When the input lists WEAK SUBJECTS, also write one remark per listed subject: a single English sentence of at most 20 words, and its Urdu counterpart. Name the specific gap the findings state for that subject and one concrete thing to do at home. Encouraging, never harsh - the parent reads it printed beside a low mark. Never write a subject remark for a subject that is not listed, and copy each subject's id exactly as given.

Reply with JSON only, no other text, exactly:
{"classTeacher": "...", "classTeacherUr": "...", "principal": "...", "principalUr": "...", "subjects": [{"id": "...", "en": "...", "ur": "..."}]}
"subjects" is [] when no weak subjects were listed.`;

export function buildUserPrompt(ctx: RemarkContext, findings: Finding[]): string {
  const lines = findings.map((f) => `- [${f.severity}] ${f.en}`);
  return [
    `School: ${ctx.schoolName}`,
    `Term: ${ctx.termName}`,
    ctx.className ? `Class: ${ctx.className}` : null,
    ctx.isMemorizer ? `This child is a hifz student (memorising the Quran).` : null,
    ctx.overallPct !== null
      ? `Overall result: ${Math.round(ctx.overallPct * 10) / 10}% (the school's pass mark is ${ctx.passMarkPct}%)`
      : `No overall result for this term.`,
    ``,
    `Findings:`,
    ...(lines.length > 0 ? lines : ["- (nothing stands out in the numbers)"]),
    ...(ctx.weakSubjects.length > 0
      ? [
          ``,
          `WEAK SUBJECTS (write one remark per subject, copy each id exactly):`,
          ...ctx.weakSubjects.flatMap((w) => [
            `- id=${w.id} | ${w.name} - ${w.pct}%${w.letter ? ` (${w.letter})` : ""}`,
            ...w.findings.map((f) => `    * ${f}`),
          ]),
        ]
      : []),
  ].filter((x) => x !== null).join("\n");
}

/** Parse defensively: a malformed reply must surface as an error the
 *  teacher can see, never as half a remark saved onto a child's card.
 *  Subject remarks are filtered to the ids WE asked about - a subject
 *  the model invented never reaches a card, however fluent it sounds. */
export function parseSuggestion(raw: string, allowedSubjectIds: Set<string>): SuggestedRemarks | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const p = parsed as Record<string, unknown>;
  const need = ["classTeacher", "classTeacherUr", "principal", "principalUr"] as const;
  const out: Record<string, string> = {};
  for (const k of need) {
    const v = p?.[k];
    if (typeof v !== "string" || v.trim().length === 0) return null;
    out[k] = v.trim();
  }
  const subjects: Array<{ id: string; en: string; ur: string }> = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(p?.subjects) ? (p.subjects as unknown[]) : []) {
    const s = item as Record<string, unknown>;
    const id = typeof s?.id === "string" ? s.id : "";
    if (!allowedSubjectIds.has(id) || seen.has(id)) continue;
    const en = typeof s?.en === "string" ? s.en.trim() : "";
    const ur = typeof s?.ur === "string" ? s.ur.trim() : "";
    if (!en || !ur) continue;
    seen.add(id);
    // The field caps at 1000; a runaway sentence is cut rather than refused.
    subjects.push({ id, en: en.slice(0, 400), ur: ur.slice(0, 400) });
  }
  return { ...(out as unknown as Omit<SuggestedRemarks, "subjects">), subjects };
}

/** Urdu must actually be Urdu - a model that answers in English twice
 *  would otherwise fill the Urdu box with English and nobody would
 *  notice until a parent did. */
export function looksLikeUrdu(text: string): boolean {
  const arabicRange = /[؀-ۿ]/g;
  const hits = text.match(arabicRange)?.length ?? 0;
  return hits >= Math.max(8, text.replace(/\s/g, "").length * 0.3);
}
