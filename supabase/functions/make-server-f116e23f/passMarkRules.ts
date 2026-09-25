// The pass/fail RULES - pure, so they can be tested and so every
// surface reaches the same verdict. The school's threshold itself is
// read in passMark.ts (which needs the database); nothing here touches
// it, and everything takes the pass mark as an argument.

/** Is this percentage a fail? Null (nothing marked yet) is never a
 *  fail — a pending paper must not brand a child. */
export function isFailing(pct: number | null | undefined, passMarkPct: number): boolean {
  return pct !== null && pct !== undefined && pct < passMarkPct;
}

/** The school's overall verdict (26 Sep). A fail in ANY subject fails
 *  the child for the term, however strong the rest of the card:
 *  "agar bacha aik bhi subject main fail to overall woh bacha fail hai,
 *  irrespective agar woh baqi sarey subjects main A+ hi keyo na aaya ho".
 *
 *  This REVERSES the 22 Sep call, where only the grand total decided and
 *  a child who dropped one subject kept their rank. Both the report
 *  card's verdict and the tabulation's ranking read this one function so
 *  the two documents can never disagree about who failed.
 *
 *  A subject with nothing marked yet (null) is not a fail - a pending
 *  paper must not brand a child mid-term. */
export function failedSubjectNames(
  subjects: Array<{ name: string; percentage: number | null }>,
  passMarkPct: number,
): string[] {
  return subjects
    .filter((s) => isFailing(s.percentage, passMarkPct))
    .map((s) => s.name);
}

/** True when the child fails the term: the grand total is below the
 *  pass mark, OR any single subject is. */
export function failedTerm(
  overallPct: number | null,
  subjects: Array<{ name: string; percentage: number | null }>,
  passMarkPct: number,
): boolean {
  return isFailing(overallPct, passMarkPct)
    || failedSubjectNames(subjects, passMarkPct).length > 0;
}
