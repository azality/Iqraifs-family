// The flake this closes: tsc reordered a union in an error message and
// the gate called one baseline error resolved and one brand-new, failing
// CI on a PR that never touched the file.

import { describe, it, expect } from "vitest";
import { normalizeTscKey } from "./tsc-baseline-key.mjs";

const RECORDED =
  `src/tests/p0-test-runner.ts|TS2345|Argument of type '"PASS" | "FAIL" | "SKIP" | "PENDING"' ` +
  `is not assignable to parameter of type '"PASS" | "FAIL" | "SKIP"'.`;
const REPRINTED =
  `src/tests/p0-test-runner.ts|TS2345|Argument of type '"SKIP" | "PASS" | "FAIL" | "PENDING"' ` +
  `is not assignable to parameter of type '"SKIP" | "PASS" | "FAIL"'.`;

describe("normalizeTscKey", () => {
  it("gives a reshuffled union the same key", () => {
    expect(normalizeTscKey(REPRINTED)).toBe(normalizeTscKey(RECORDED));
  });

  it("is idempotent", () => {
    const once = normalizeTscKey(RECORDED);
    expect(normalizeTscKey(once)).toBe(once);
  });

  it("leaves a message with no union untouched", () => {
    const k = "src/foo.tsx|TS2304|Cannot find name 'Button'.";
    expect(normalizeTscKey(k)).toBe(k);
  });

  it("still tells genuinely different errors apart", () => {
    const a = `src/a.ts|TS2345|Argument of type '"A" | "B"' is not assignable.`;
    const b = `src/a.ts|TS2345|Argument of type '"A" | "C"' is not assignable.`;
    expect(normalizeTscKey(a)).not.toBe(normalizeTscKey(b));
  });

  it("keeps the file and code parts of the key intact", () => {
    expect(normalizeTscKey(RECORDED).startsWith("src/tests/p0-test-runner.ts|TS2345|")).toBe(true);
  });

  it("does not reorder a quoted string that merely contains a pipe", () => {
    const k = `src/a.ts|TS1234|Type '"b|"' is odd.`;
    expect(normalizeTscKey(k)).toBe(k);
  });
});
