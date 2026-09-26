// When a class teacher may still write a report-card remark.
//
// Two locks, asked for together (Muneeb, 27 Sep) once teachers were given
// their own class's cards:
//
//   "when they finalized their remarks are also locked"
//   "there should still be a cutoff time because the office needs to
//    finalize ... if they enter the remarks last min the office won't
//    have time to get those printed"
//
// So: a finalized card is closed to its teacher whatever the clock says,
// and a remarks deadline closes the rest. The office is never locked by
// either — they own the artifact and can unfinalize to reopen one.
//
// The deadline is NOT the marks deadline. Remarks are written after the
// marks are in, and IFS's 1st Assessment marks deadline had already gone
// (24 Sep) before teachers got cards at all; sharing it would have shut
// them out of the term the whole change was for.

export type RemarkLockReason = "finalized" | "deadline" | null;

export interface RemarkLockInputs {
  /** The card's finalized_at, if the office has finalized it. */
  finalizedAt?: string | null;
  /** The term's remarks_deadline_at. Null = no cutoff. */
  deadlineAt?: string | null;
  /** True for admin/principal — never locked. */
  isOffice?: boolean;
  /** True when the child's class is exempt from deadlines (the school's
   *  existing marks_deadline_off list: Hifz I-IV, Junior, Reception). */
  classExempt?: boolean;
  now?: Date;
}

export interface RemarkLock {
  locked: boolean;
  /** Why, so the screen can say it plainly rather than "forbidden". */
  reason: RemarkLockReason;
  /** The moment writing closes, when a deadline applies and still stands. */
  closesAt: string | null;
}

/** May this person still write the class-teacher remark on this card? */
export function remarkLock(i: RemarkLockInputs): RemarkLock {
  // The office writes whenever they like; unfinalizing is theirs too.
  if (i.isOffice) return { locked: false, reason: null, closesAt: null };

  // A finalized card is closed to its teacher even before any deadline —
  // the office has already read it and may already have printed it.
  if (i.finalizedAt) return { locked: true, reason: "finalized", closesAt: null };

  // An exempt class has no cutoff, exactly as it has no marks deadline.
  if (i.classExempt || !i.deadlineAt) {
    return { locked: false, reason: null, closesAt: null };
  }
  const deadline = new Date(i.deadlineAt);
  if (Number.isNaN(deadline.getTime())) {
    // An unparseable deadline must not silently lock a teacher out.
    return { locked: false, reason: null, closesAt: null };
  }
  const now = i.now ?? new Date();
  return now > deadline
    ? { locked: true, reason: "deadline", closesAt: deadline.toISOString() }
    : { locked: false, reason: null, closesAt: deadline.toISOString() };
}

/** What to tell the person whose save was refused. */
export function remarkLockMessage(reason: RemarkLockReason): string {
  if (reason === "finalized") {
    return "This report card has been finalized by the office, so its remarks can no longer be changed. Ask the office if it needs reopening.";
  }
  if (reason === "deadline") {
    return "The deadline for writing report-card remarks has passed. Ask the office if you still need to add one.";
  }
  return "";
}
