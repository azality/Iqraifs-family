// The marks deadline, in one place.
//
// The admin sets a moment per term; at that moment teachers' marks
// entry locks. The admin can move the moment (extension) or grant one
// teacher their own later moment (exception). Admin and principal are
// never locked - the deadline is pressure on data ENTRY, not a cage
// for the people who set it.

export interface DeadlineInputs {
  /** academic_term.marks_deadline_at - null means no deadline set. */
  deadlineAt: string | null;
  /** The caller's own exception, if any - their personal later moment. */
  exceptionUntil: string | null;
  /** Admin / principal callers are never locked. */
  isAdmin: boolean;
  /** Injection point for tests; defaults to now. */
  now?: Date;
}

export interface DeadlineState {
  deadlineAt: string | null;
  exceptionUntil: string | null;
  /** True when this caller's saves must be refused. */
  locked: boolean;
  /** The moment THIS caller locks (their exception if later), so the
   *  countdown is honest per person. Null when no deadline applies. */
  effectiveAt: string | null;
}

export function deadlineState(i: DeadlineInputs): DeadlineState {
  const now = i.now ?? new Date();
  if (!i.deadlineAt || i.isAdmin) {
    return { deadlineAt: i.deadlineAt ?? null, exceptionUntil: i.exceptionUntil ?? null, locked: false, effectiveAt: null };
  }
  const deadline = new Date(i.deadlineAt);
  const exception = i.exceptionUntil ? new Date(i.exceptionUntil) : null;
  const effective = exception && exception > deadline ? exception : deadline;
  return {
    deadlineAt: i.deadlineAt,
    exceptionUntil: i.exceptionUntil ?? null,
    locked: now > effective,
    effectiveAt: effective.toISOString(),
  };
}
