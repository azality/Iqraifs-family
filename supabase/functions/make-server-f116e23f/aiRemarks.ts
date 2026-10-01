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

/** What the teacher actually SAW in a subject - the one input only a
 *  human can supply (round 3, 2 Oct design review). Optional per
 *  subject; never preselected from marks; never printed raw. */
export interface SubjectObservation {
  /** A picked need ("incomplete answers", "difficulty recalling
   *  content", "needs help applying concepts") or the teacher's own
   *  short phrase. */
  need?: string;
  /** A few words in the teacher's own voice. */
  note?: string;
}

/** A subject the writer covers. kind "weak" = below the pass mark or
 *  in the chart's bottom bands (office, 30 Sep); "strong" = a genuine
 *  strength worth an extension, never a manufactured weakness;
 *  "mid" = a steady subject - one honest sentence, no drama (full
 *  coverage, 2 Oct: auto-generation writes for every marked subject). */
export interface SubjectContext {
  /** class_subject id - the key the subject's remark field is stored under. */
  id: string;
  name: string;
  kind: "weak" | "strong" | "mid";
  pct: number;
  letter: string | null;
  /** The same subject's percentage in the previous marked term, when
   *  one exists - movement is information no single card shows. */
  priorPct: number | null;
  /** The computed finding sentences about this subject (exact, auditable). */
  findings: string[];
  /** The teacher's observation, when they recorded one. */
  observation: SubjectObservation | null;
}

export interface RemarkContext {
  schoolName: string;
  studentFirstName: string;
  className: string | null;
  termName: string;
  overallPct: number | null;
  /** Previous marked term's overall, when one exists. */
  priorOverallPct: number | null;
  passMarkPct: number;
  isMemorizer: boolean;
  subjects: SubjectContext[];
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

/** One prompt, two language modes. Auto-generation at finalize writes
 *  ENGLISH ONLY (2 Oct: Urdu roughly doubles the output tokens, so it
 *  is generated on demand through the Suggest button instead); the
 *  button keeps producing both so an Urdu-reading family is one click
 *  away. */
export function systemPrompt(urdu: boolean): string {
  return `You write report-card remarks for an Islamic school in Pakistan, in ${urdu ? "English and Urdu" : "English"}.

You are given computed FINDINGS (correct arithmetic from the child's own marks, attendance and hifz record) and, for some subjects, a TEACHER OBSERVATION - what the teacher actually saw in class. Your job is to turn that evidence into remarks a parent will read.

The acceptance test for every remark: after reading it, the parent knows ONE useful thing to try - and you have claimed nothing you do not know.

Rules:
- Use ONLY what the findings and observations state. Never invent a behaviour, an attitude, an effort level, a cause, or a number that is not there. A mark tells you WHERE marks were lost, never WHY.
- Never repeat a percentage or score in a subject remark - the parent is reading it beside the printed numbers. Do not do your own arithmetic.
- A high participation or classwork score does NOT prove the child understands the concepts. Never infer understanding from it.

Per-subject remarks (one per listed subject, copy each id exactly; never for a subject not listed):
- 1-2 short sentences: a supported observation, then ONE manageable action, and where it fits naturally, how to check progress.
- WITH a teacher observation, build on it. Example shape: "Your child understands the lessons but sometimes leaves written answers incomplete. Twice a week, practise one short question, checking that every part has been answered."
- WITHOUT an observation, do not invent a weakness to sound personal. Suggest an evidence-finding activity instead, e.g.: "For the next revision, have your child retry two questions where marks were lost, then compare their answers with the teacher's corrections."
- For a STRONG subject, offer an appropriate extension (a harder exercise, teaching it to a sibling, a related reading) - never manufacture a weakness.
- For a MID subject (steady, nothing stands out), ONE honest sentence: a brief affirmation or a light next step. No drama, no manufactured concern.
- Where a previous term's result is given, you may name the direction of movement ("improved since last term") without quoting numbers.
- Encouraging, never harsh - a weak subject's remark is printed beside a low mark.
- Vary the wording across subjects - the parent reads them as one column, and ten copies of the same sentence read as a machine.

Class teacher's remark: 2-3 sentences. ONE supported strength and one or two priorities across subjects - never a list of per-subject homework routines. End with the single most useful thing to do at home.
Principal's remark: 1-2 sentences. Warmer and broader - encouragement, and where relevant an invitation to meet the school.
Tone: warm, respectful, never harsh about a struggling child, never inflated about a strong one. "Mashallah" and "Inshallah" are natural here; use them where they fit, not in every sentence.
${urdu ? `Urdu must carry the same meaning as the English, not a word-for-word translation. Write it in a NOMINAL style ("محنت نمایاں ہے") and avoid gendered verb endings such as کرتا/کرتی, so the same remark suits a boy or a girl.
` : ""}Address the parent about the child. Do not use the child's name more than once.

Reply with JSON only, no other text, exactly:
${urdu
    ? `{"classTeacher": "...", "classTeacherUr": "...", "principal": "...", "principalUr": "...", "subjects": [{"id": "...", "en": "...", "ur": "..."}]}`
    : `{"classTeacher": "...", "principal": "...", "subjects": [{"id": "...", "en": "..."}]}`}
"subjects" is [] when no subjects were listed.`;
}

/** The two-language prompt, kept under its old name for the Suggest
 *  button's path. */
export const SYSTEM_PROMPT = systemPrompt(true);

export function buildUserPrompt(ctx: RemarkContext, findings: Finding[]): string {
  const lines = findings.map((f) => `- [${f.severity}] ${f.en}`);
  const subjLines = ctx.subjects.flatMap((s) => {
    const head = `- id=${s.id} | ${s.name} [${s.kind.toUpperCase()}] - ${s.pct}%${s.letter ? ` (${s.letter})` : ""}` +
      (s.priorPct !== null ? ` | previous term: ${s.priorPct}%` : "");
    const obs = s.observation
      ? [`    TEACHER OBSERVED: ${[s.observation.need, s.observation.note].filter(Boolean).join(" - ")}`]
      : [`    (no teacher observation recorded)`];
    return [head, ...obs, ...s.findings.map((f) => `    * ${f}`)];
  });
  return [
    `School: ${ctx.schoolName}`,
    `Term: ${ctx.termName}`,
    ctx.className ? `Class: ${ctx.className}` : null,
    ctx.isMemorizer ? `This child is a hifz student (memorising the Quran).` : null,
    ctx.overallPct !== null
      ? `Overall result: ${Math.round(ctx.overallPct * 10) / 10}% (the school's pass mark is ${ctx.passMarkPct}%)` +
        (ctx.priorOverallPct !== null ? ` | previous term overall: ${Math.round(ctx.priorOverallPct * 10) / 10}%` : "")
      : `No overall result for this term.`,
    ``,
    `Findings:`,
    ...(lines.length > 0 ? lines : ["- (nothing stands out in the numbers)"]),
    ...(ctx.subjects.length > 0
      ? [
          ``,
          `SUBJECTS to write a remark for (one per subject, copy each id exactly):`,
          ...subjLines,
        ]
      : []),
  ].filter((x) => x !== null).join("\n");
}

/** Parse defensively: a malformed reply must surface as an error the
 *  teacher can see, never as half a remark saved onto a child's card.
 *  Subject remarks are filtered to the ids WE asked about - a subject
 *  the model invented never reaches a card, however fluent it sounds. */
export function parseSuggestion(
  raw: string,
  allowedSubjectIds: Set<string>,
  opts: { urdu?: boolean } = {},
): SuggestedRemarks | null {
  const urdu = opts.urdu !== false;
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
  const need = urdu
    ? (["classTeacher", "classTeacherUr", "principal", "principalUr"] as const)
    : (["classTeacher", "principal"] as const);
  const out: Record<string, string> = { classTeacherUr: "", principalUr: "" };
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
    if (!en || (urdu && !ur)) continue;
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
