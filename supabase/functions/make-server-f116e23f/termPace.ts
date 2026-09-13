// Expected curriculum pace through a term — with exam days PAUSED.
//
// The naive expectation was a straight line from start_date to end_date:
// "62% complete vs ~95% expected" mid-exams read as a crisis while no
// teaching could possibly happen (Muneeb, 13 Sep). On any date the
// published datesheet shows a paper for this org, the clock simply does
// not advance: each exam day contributes zero to expected progress.
//
// Deliberately numerator-only. Subtracting exam days from the TOTAL as
// well would make the remaining days steeper and push the expectation
// UP — the opposite of a pause. This way a term that closes inside its
// exam window tops out below 100%, which is honest: those days were
// never teachable.
//
// One school-wide date set (the union of every class's paper dates):
// exam season pauses the whole school's teaching rhythm — teachers
// invigilate across classes — and per-class threading would complicate
// four call sites for a distinction measured in single days.

import { serviceRoleClient } from "./middleware.tsx";

export async function termExpectedPct(
  orgId: string,
  term: { id: string; start_date?: string | null; end_date?: string | null } | null | undefined,
  at: Date = new Date(),
): Promise<number | null> {
  if (!term?.start_date || !term?.end_date) return null;
  const startMs = Date.parse(`${term.start_date}T00:00:00Z`);
  const endMs = Date.parse(`${term.end_date}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;

  const DAY = 86_400_000;
  const totalDays = (endMs - startMs) / DAY;
  const elapsedDays = Math.min(totalDays, Math.max(0, (at.getTime() - startMs) / DAY));

  let examElapsed = 0;
  try {
    const { data } = await serviceRoleClient
      .from("exam_schedule")
      .select("exam_date")
      .eq("org_id", orgId)
      .eq("term_id", term.id);
    const atIso = at.toISOString().slice(0, 10);
    const seen = new Set<string>();
    for (const r of ((data ?? []) as Array<{ exam_date: string }>)) {
      const d = r.exam_date;
      if (!d || seen.has(d)) continue;
      seen.add(d);
      if (d >= term.start_date && d <= term.end_date && d <= atIso) examElapsed += 1;
    }
  } catch {
    // No datesheet, no pause — fall through to the naive line.
  }

  const frac = Math.max(0, elapsedDays - examElapsed) / totalDays;
  return Math.round(Math.min(1, frac) * 100);
}
