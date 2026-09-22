// The aging rule for fees, in one place.
//
// The fees page is an aging view OF A MONTH: you pick September and it
// tells you who owes as of September. A voucher for a later month is
// not arrears - it is not due yet.
//
// Two things made that matter on the same day (22 Sep):
//   - a family paid Rs 200 over September and the office asked for it
//     to come off October, so the advance sits on an October voucher -
//     and September's page listed them owing Rs 5,800, out of "Paid";
//   - schools open next month's vouchers early so parents can pay
//     early, which would have flipped the whole roll to "owing".
//
// Balance views that are NOT aging - the student profile, the finance
// rollups - pass no window and see every month. That was the
// 4000-vs-8000 fix (17 Sep) and must stay whole.
//
// Kept pure and separate because the regression suite cannot reach it:
// the suite works inside the Sandbox class, and the outstanding rollup
// deliberately skips sandbox students, so an end-to-end check there
// would pass whatever the rule said. Unit tests are the guard.

/** Does this voucher's month count when reading arrears as of
 *  `upToPeriod`? Both are "YYYY-MM"; an absent window means every
 *  month counts (the true balance). */
export function countsTowardAging(
  period: string | null | undefined,
  upToPeriod?: string | null,
): boolean {
  if (!upToPeriod) return true;
  if (!period) return false;
  // "YYYY-MM" compares correctly as text - zero-padded, fixed width.
  return String(period) <= String(upToPeriod);
}

/** What is still owed on one voucher. Never negative: a family that
 *  paid over (an advance, a rounded-up note at the counter) owes
 *  nothing on that month, and their overpayment is not other months'
 *  credit here - the office allocates it deliberately. */
export function owedOn(
  amountDue: number | null | undefined,
  amountPaid: number | null | undefined,
): number {
  const due = Number(amountDue) || 0;
  const paid = Number(amountPaid) || 0;
  return Math.max(0, due - paid);
}
