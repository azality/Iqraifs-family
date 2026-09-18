// Stable keys for tsc-baseline.json.
//
// tsc prints the members of a union in the order it happened to
// instantiate them, and that order shifts when completely unrelated
// files change. The same pre-existing error then arrives with its
// message reshuffled:
//
//   '"PASS" | "FAIL" | "SKIP" | "PENDING"'      (recorded in the baseline)
//   '"SKIP" | "PASS" | "FAIL" | "PENDING"'      (same error, next run)
//
// which the gate reported as one error resolved and one brand-new error —
// failing CI on a pull request that never touched the file (18 Sep, #668).
//
// Sorting the members inside each quoted type gives the error one key for
// good. Applied to BOTH sides of the comparison, so an existing baseline
// written before this keeps matching without being rewritten.

/** Canonical form of a baseline key or a raw tsc message. */
export function normalizeTscKey(key) {
  // tsc separates union members with exactly " | ". Matching that, rather
  // than a bare pipe, leaves a quoted string that merely contains a pipe
  // character alone.
  return String(key).replace(/'([^']* \| [^']*)'/g, (whole, inner) => {
    const parts = inner.split(" | ");
    if (parts.length < 2 || parts.some((p) => p.length === 0)) return whole;
    return "'" + [...parts].sort().join(" | ") + "'";
  });
}

export default normalizeTscKey;
