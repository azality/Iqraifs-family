import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DEFAULT_REMARK_BANDS, normalizeRemarkBands, pickRemarkBand } from "./remarkBands.ts";

Deno.test("the default chart covers 0-100 with no gaps and no overlaps", () => {
  const sorted = [...DEFAULT_REMARK_BANDS].sort((a, b) => a.minPct - b.minPct);
  assertEquals(sorted[0].minPct, 0);
  assertEquals(sorted[sorted.length - 1].maxPct, 100);
  for (let i = 1; i < sorted.length; i++) {
    assertEquals(sorted[i].minPct, sorted[i - 1].maxPct);
  }
});

Deno.test("boundaries: 95 is the top band, 100 inclusive, 39.9 is fail, 40 is not", () => {
  assertEquals(pickRemarkBand(DEFAULT_REMARK_BANDS, 100)!.minPct, 95);
  assertEquals(pickRemarkBand(DEFAULT_REMARK_BANDS, 95)!.minPct, 95);
  assertEquals(pickRemarkBand(DEFAULT_REMARK_BANDS, 94.9)!.minPct, 90);
  assertEquals(pickRemarkBand(DEFAULT_REMARK_BANDS, 39.9)!.minPct, 0);
  assertEquals(pickRemarkBand(DEFAULT_REMARK_BANDS, 40)!.minPct, 40);
  // Abu Bakar's real 72.8% lands in 70-75.
  assertEquals(pickRemarkBand(DEFAULT_REMARK_BANDS, 72.8)!.minPct, 70);
});

Deno.test("no marks means NO auto remark - never praise a blank card", () => {
  assertEquals(pickRemarkBand(DEFAULT_REMARK_BANDS, null), null);
});

Deno.test("settings rows are data: malformed bands are dropped, junk falls back", () => {
  const ok = normalizeRemarkBands([
    { minPct: 50, maxPct: 100, classTeacher: "Good", principal: "Keep going" },
    { minPct: "x", maxPct: 50 },       // dropped - NaN
    { minPct: 40, maxPct: 40 },        // dropped - empty range
    { minPct: 0, maxPct: 50, classTeacher: 7 }, // kept, comment coerced to ""
  ]);
  assertEquals(ok!.length, 2);
  assertEquals(ok![1].classTeacher, "");
  assertEquals(normalizeRemarkBands("nonsense"), null);
  assertEquals(normalizeRemarkBands([]), null);
});
