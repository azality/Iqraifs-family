// The school's question, in tests.
//
// "Our children memorise backwards — 30, then 29, 28, 27 down to 19.
//  Surely the system will just say Para 1, 2, 3, 4?"
//
// Every case below starts from what was actually heard. Nothing counts
// upwards from Para 1, and there is no case in which it could.

import { assertEquals } from "jsr:@std/assert@1";
import {
  proposePortion,
  parasCovered,
  isEmptyPosition,
  frontierPara,
} from "./hifzPortion.ts";

type Row = Parameters<typeof parasCovered>[0][number];

const base: Row = {
  student_id: "s1",
  kind: "sabaq",
  surah_number: null,
  ayah_from: null,
  ayah_to: null,
  juz_number: null,
  qaida_lesson: null,
  missed: null,
};

/** A para-mode hearing, the way the Hifz round logs it. */
const para = (n: number, over: Partial<Row> = {}): Row =>
  ({ ...base, juz_number: n, ...over });

/** A surah/ayah hearing. */
const at = (surah: number, from: number, to: number, over: Partial<Row> = {}): Row =>
  ({ ...base, surah_number: surah, ayah_from: from, ayah_to: to, ...over });

Deno.test("backwards memorisation reads as its own range, not 1 upwards", () => {
  // Heard in the order the school teaches: 30 first, then 29, then 28.
  const rows = [para(30), para(29), para(28)];
  assertEquals(proposePortion("hifz", rows), "Para 28–30");
});

Deno.test("the full Amma-backwards case the school described: 30 down to 19", () => {
  const rows = [];
  for (let p = 30; p >= 19; p--) rows.push(para(p));
  assertEquals(proposePortion("hifz", rows), "Para 19–30");
});

Deno.test("a child on Para 22 is proposed Para 22–30 — never 1–22", () => {
  assertEquals(proposePortion("hifz", [para(22)]), "Para 22–30");
});

Deno.test("a sabaq at Para 1 is khatam, wherever else the child was heard", () => {
  // Fahad Ansari, corrected by the school 18 Sep: sabaq reached Para 1
  // and finished it. The Para 11 sabaq beside it is his dour beginning.
  const rows = [para(30), para(29), para(1), para(11)];
  assertEquals(frontierPara(rows), 1);
  assertEquals(proposePortion("hifz", rows), "Para 1–30");
});

Deno.test("the baseline supplies what was memorised before we kept records", () => {
  // Three weeks of hearings (28–30), plus the office's note that the
  // child already held 19–27 when the school started using the system.
  const rows = [para(30), para(29), para(28)];
  const baseline = [19, 20, 21, 22, 23, 24, 25, 26, 27];
  assertEquals(proposePortion("hifz", rows, baseline), "Para 19–30");
});

Deno.test("baseline alone is enough when nothing has been heard yet", () => {
  assertEquals(proposePortion("hifz", [], [29, 30]), "Para 29–30");
});

Deno.test("nothing heard and no baseline proposes nothing — never a guess", () => {
  assertEquals(proposePortion("hifz", []), "");
});

Deno.test("an absence never widens a portion", () => {
  const rows = [para(30), para(20, { missed: true })];
  assertEquals(proposePortion("hifz", rows), "Para 30");
});

// ── The empty-position rows found in the pilot's first week ──────────
Deno.test("a hearing left on the form's default 1:1 carries no portion", () => {
  assertEquals(isEmptyPosition(at(1, 1, 1)), true);
  // Surah 18 ayah 75 is the start of Para 16.
  const rows = [at(1, 1, 1), at(18, 75, 80)];
  assertEquals(proposePortion("hifz", rows), "Para 16–30");
});

Deno.test("a real Al-Fatiha lesson is kept — it runs 1 to 7, not 1 to 1", () => {
  assertEquals(isEmptyPosition(at(1, 1, 7)), false);
  // Para 1 on the hifz road means the whole Quran — see the khatam test.
  assertEquals(proposePortion("hifz", [at(1, 1, 7)]), "Para 1–30");
});

Deno.test("a deliberate Para 1 in para mode survives the empty-position rule", () => {
  // juz_number is matched first, so the untouched surah/ayah fields
  // beside it cannot discard the teacher's actual choice.
  const rows = [para(1, { surah_number: 1, ayah_from: 1, ayah_to: 1 })];
  assertEquals(parasCovered(rows), [1]);
});

Deno.test("only portion kinds count — a nazra reading is not memorisation", () => {
  const rows = [para(30), para(5, { kind: "nazra" })];
  assertEquals(proposePortion("hifz", rows), "Para 30");
});

Deno.test("nazra track reads its own kinds, and fills the road down", () => {
  const rows = [para(5, { kind: "nazra" }), para(6, { kind: "nazra_revision" })];
  assertEquals(proposePortion("nazra", rows), "Para 5–30");
});

Deno.test("qaida is counted in takhtis, and the para baseline stays out of it", () => {
  const rows = [
    { ...base, kind: "qaida", qaida_lesson: 4 },
    { ...base, kind: "qaida", qaida_lesson: 11 },
  ];
  assertEquals(proposePortion("qaida", rows, [30]), "Qaida — takhti 1–11");
});


// ── The road travelled: hifz runs 30 → 1 ────────────────────────────
// "If a kid finished 12 para this means he memorised 30th, then 29th,
//  28th … to 19th, therefore the syllabus should be 19th to 30th."
//
// And, corrected by the school: the frontier is the LOWEST sabaq, never
// the most recent hearing. Fahad Ansari completed Para 1 — his khatam —
// while his latest sabaq sits at Para 11 because he has started dour.

/** Revision: sits wherever the cycle is, never moves the frontier. */
const sabqi = (n: number): Row => ({ ...base, kind: "sabqi", juz_number: n });
const manzil = (n: number): Row => ({ ...base, kind: "manzil", juz_number: n });

Deno.test("twelve paras done: heard on Para 19, syllabus is Para 19-30", () => {
  assertEquals(proposePortion("hifz", [para(20), para(19)]), "Para 19\u201330");
});

Deno.test("a child only ever heard on Para 30 stays at Para 30", () => {
  assertEquals(proposePortion("hifz", [para(30)]), "Para 30");
});

Deno.test("Fahad Ansari: sabaq at 1 and 11, revision elsewhere - khatam", () => {
  const rows = [
    para(1), para(11),            // sabaq: Para 1 finished, dour begun
    sabqi(1), sabqi(1),           // revising Para 1 daily
    manzil(5), manzil(30),        // older revision, wherever the cycle is
  ];
  assertEquals(frontierPara(rows), 1);
  assertEquals(proposePortion("hifz", rows), "Para 1\u201330");
});

Deno.test("revision never sets the frontier, however deep it reaches", () => {
  // Sabaq says Para 20. Sabqi happens to be revising Para 3 today.
  const rows = [para(20), sabqi(3), manzil(2)];
  assertEquals(frontierPara(rows), 20);
  assertEquals(proposePortion("hifz", rows), "Para 20\u201330");
});

Deno.test("an absence does not move the frontier", () => {
  const rows = [para(20), para(5, { missed: true })];
  assertEquals(frontierPara(rows), 20);
  assertEquals(proposePortion("hifz", rows), "Para 20\u201330");
});

Deno.test("nazra travels the same road: 30, 29, 28", () => {
  const rows = [para(29, { kind: "nazra" }), para(28, { kind: "nazra" })];
  assertEquals(proposePortion("nazra", rows), "Para 28\u201330");
});

Deno.test("the baseline still counts where it reaches further", () => {
  assertEquals(proposePortion("hifz", [para(25)], [19, 20, 21, 22, 23, 24]), "Para 19\u201330");
});

Deno.test("no sabaq at all leaves the frontier unknown", () => {
  assertEquals(frontierPara([sabqi(4), manzil(9)]), null);
});
