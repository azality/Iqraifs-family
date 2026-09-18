// The school's own paper, in tests.
//
//   سوال اول 20 · سوال دوم 20 · سوال سوم 20   } حفظ القرآن / ناظرہ (60)
//   صفات و مخارج 20 · لہجہ 10 · مسائل 10      میزان 100

import { assertEquals } from "jsr:@std/assert@1";
import { totalsFor, bandFor, markIsValid, type Component, type Band } from "./examScoring.ts";

const PAPER: Component[] = [
  { id: "q1", name: "سوال اول", groupLabel: "حفظ القرآن / ناظرہ", maxMarks: 20, sortOrder: 0 },
  { id: "q2", name: "سوال دوم", groupLabel: "حفظ القرآن / ناظرہ", maxMarks: 20, sortOrder: 1 },
  { id: "q3", name: "سوال سوم", groupLabel: "حفظ القرآن / ناظرہ", maxMarks: 20, sortOrder: 2 },
  { id: "sm", name: "صفات و مخارج", groupLabel: null, maxMarks: 20, sortOrder: 3 },
  { id: "lh", name: "لہجہ", groupLabel: null, maxMarks: 10, sortOrder: 4 },
  { id: "ms", name: "مسائل", groupLabel: null, maxMarks: 10, sortOrder: 5 },
];

/** The school's bands. */
const BANDS: Band[] = [
  { letter: "ممتاز", minPct: 80, maxPct: 100, remark: null },
  { letter: "جید جدا", minPct: 65, maxPct: 79, remark: null },
  { letter: "جید", minPct: 50, maxPct: 64, remark: null },
  { letter: "مقبول", minPct: 40, maxPct: 49, remark: null },
  { letter: "راسب", minPct: 0, maxPct: 39, remark: null },
];

const marks = (m: Record<string, number | null>) =>
  new Map<string, number | null>(Object.entries(m));

Deno.test("the paper adds to 100", () => {
  const t = totalsFor(PAPER, marks({}));
  assertEquals(t.max, 100);
});

Deno.test("a fully marked paper totals and grades", () => {
  const t = totalsFor(PAPER, marks({ q1: 16, q2: 15, q3: 17, sm: 15, lh: 8, ms: 7 }));
  assertEquals(t.obtained, 78);
  assertEquals(t.pct, 78);
  assertEquals(t.unmarked, 0);
  assertEquals(bandFor(BANDS, t.pct)?.letter, "جید جدا");
});

Deno.test("the three questions are subtotalled under their brace", () => {
  const t = totalsFor(PAPER, marks({ q1: 16, q2: 15, q3: 17, sm: 15, lh: 8, ms: 7 }));
  assertEquals(t.groups, [{ label: "حفظ القرآن / ناظرہ", obtained: 48, max: 60 }]);
});

Deno.test("a part-marked paper has no percentage and no band", () => {
  // Three questions in, the examiner is called away. 48/100 would read
  // راسب beside a child who is doing perfectly well.
  const t = totalsFor(PAPER, marks({ q1: 16, q2: 15, q3: 17 }));
  assertEquals(t.obtained, 48);
  assertEquals(t.unmarked, 3);
  assertEquals(t.pct, null);
  assertEquals(bandFor(BANDS, t.pct), null);
});

Deno.test("zero is a mark; not-yet-marked is not", () => {
  const scored = totalsFor(PAPER, marks({ q1: 0, q2: 0, q3: 0, sm: 0, lh: 0, ms: 0 }));
  assertEquals(scored.unmarked, 0);
  assertEquals(scored.pct, 0);
  assertEquals(bandFor(BANDS, scored.pct)?.letter, "راسب");

  const blank = totalsFor(PAPER, marks({ q1: null, q2: 0, q3: 0, sm: 0, lh: 0, ms: 0 }));
  assertEquals(blank.unmarked, 1);
  assertEquals(blank.pct, null);
});

Deno.test("the band boundaries are the school's, to the mark", () => {
  const letter = (pct: number) => bandFor(BANDS, pct)?.letter;
  assertEquals(letter(100), "ممتاز");
  assertEquals(letter(80), "ممتاز");
  assertEquals(letter(79), "جید جدا");
  assertEquals(letter(65), "جید جدا");
  assertEquals(letter(64), "جید");
  assertEquals(letter(50), "جید");
  assertEquals(letter(49), "مقبول");
  assertEquals(letter(40), "مقبول");   // the pass mark
  assertEquals(letter(39), "راسب");
  assertEquals(letter(0), "راسب");
});

Deno.test("a percentage lands on one decimal, not a recurring tail", () => {
  // 47 of 60 on a shortened paper: 78.333…
  const short = PAPER.slice(0, 3);
  const t = totalsFor(short, marks({ q1: 16, q2: 15, q3: 16 }));
  assertEquals(t.pct, 78.3);
});

Deno.test("a mark larger than the question is refused", () => {
  assertEquals(markIsValid(PAPER[0], 20), true);
  assertEquals(markIsValid(PAPER[0], 21), false);
  assertEquals(markIsValid(PAPER[4], 10.5), false);  // لہجہ is out of 10
  assertEquals(markIsValid(PAPER[0], -1), false);
  assertEquals(markIsValid(PAPER[0], null), true);   // clearing a mark
});

Deno.test("half marks are allowed — the slip is written by hand", () => {
  const t = totalsFor(PAPER, marks({ q1: 16.5, q2: 15, q3: 17, sm: 15, lh: 8, ms: 7 }));
  assertEquals(t.obtained, 78.5);
  assertEquals(t.pct, 78.5);
});

Deno.test("an empty paper grades nothing rather than zero", () => {
  const t = totalsFor([], new Map());
  assertEquals(t.max, 0);
  assertEquals(t.pct, null);
});
