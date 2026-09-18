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
  frontier,
  isFatihaOnly,
  hifzOrderOf,
  SABAQ_KINDS,
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
  // 18:75 opens Para 16, and 18:80 is only a little way in.
  assertEquals(proposePortion("hifz", rows), "Para 17–30, and Para 16 up to 18:80");
});

Deno.test("Al-Fatiha alone describes no portion, however it is written", () => {
  // Not the form's default (that is 1:1-1), but still not a portion:
  // every child recites Al-Fatiha at every stage.
  assertEquals(isEmptyPosition(at(1, 1, 7)), false);
  assertEquals(proposePortion("hifz", [at(1, 1, 7)]), "");
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

// ── Al-Fatiha is not evidence of khatam ─────────────────────────────
// Muhammad Aliyan Noman, Hifz IV, nazra track: reading Surahs 114, 113
// and 111 a few ayahs at a time, with one Al-Fatiha in the record.

Deno.test("Al-Fatiha never sets the frontier — everyone recites it", () => {
  const rows = [
    at(70, 1, 11),   // Para 29
    at(1, 1, 7),     // Al-Fatiha, in Para 1
    at(114, 1, 6),   // Para 30
  ];
  assertEquals(isFatihaOnly(at(1, 1, 7)), true);
  assertEquals(frontierPara(rows), 29);
  // Para 29 runs to 77:50, so 70:11 is only part of the way in.
  assertEquals(proposePortion("hifz", rows), "Para 30, and Para 29 up to 70:11");
});

Deno.test("Al-Baqarah to 2:141 IS evidence — that is where Para 1 ends", () => {
  // Bisma Sajid's road: through Para 2, then Para 1 to its last ayah.
  const rows = [at(2, 243, 252), at(2, 1, 69), at(2, 130, 141)];
  assertEquals(frontierPara(rows), 1);
  assertEquals(proposePortion("hifz", rows), "Para 1\u201330");
});

Deno.test("Para 1 chosen outright in para mode still counts", () => {
  // Aroush Azeem Khan logged "juz 1, full" as her lesson.
  const rows = [at(2, 236, 252), para(1, { juz_extent: "full" } as never)];
  assertEquals(frontierPara(rows), 1);
});

Deno.test("a Fatiha row adds nothing to the portion either", () => {
  assertEquals(parasCovered([at(1, 1, 7)]), []);
});

// ── Within a para the road runs forwards ────────────────────────────
// "They still start from the first page of the para — it's not like they
//  start from the last page then go to the first page." (Muneeb, 18 Sep)
//
// So being heard inside Para 18 means the child is working through it,
// not that they hold it. The line names the finished paras and how far
// into the current one they have reached.

Deno.test("part-way through a para: finished paras, then the point reached", () => {
  // Para 18 runs 23:1 to 25:20. Heard at 23:50 — well inside it.
  const rows = [at(25, 21, 40), at(23, 1, 50)];
  const f = frontier(rows);
  assertEquals(f?.para, 18);
  assertEquals(f?.complete, false);
  assertEquals(proposePortion("hifz", rows), "Para 19\u201330, and Para 18 up to 23:50");
});

Deno.test("reaching a para's last ayah completes it", () => {
  // Para 1 ends at 2:141. Fahad Ansari and Bisma Sajid both got there.
  const rows = [at(2, 110, 141)];
  const f = frontier(rows);
  assertEquals(f?.complete, true);
  assertEquals(proposePortion("hifz", rows), "Para 1\u201330");
});

Deno.test("one ayah short is not complete", () => {
  const rows = [at(2, 110, 140)];
  assertEquals(frontier(rows)?.complete, false);
  assertEquals(proposePortion("hifz", rows), "Para 2\u201330, and Para 1 up to 2:140");
});

Deno.test("Muskan Muhammad: finished Para 2, one stray row inside Para 1", () => {
  // Her sabaq worked through Para 2 to its last ayah, 2:252. The 2:84-91
  // of 14 Sep sits inside Para 1 and is not its end, so Para 1 is shown
  // as in progress rather than held — which is the truth either way.
  const rows = [at(2, 84, 91), at(2, 204, 235), at(2, 236, 252)];
  assertEquals(proposePortion("hifz", rows), "Para 2\u201330, and Para 1 up to 2:91");
});

Deno.test("a beginner inside Para 30 holds nothing yet", () => {
  // Para 30 runs 78:1 to 114:6. Heard at 111:2.
  const rows = [at(111, 1, 2)];
  assertEquals(proposePortion("hifz", rows), "Para 30 up to 111:2");
});

Deno.test("para mode: only a full para counts as finished", () => {
  assertEquals(frontier([para(18, { juz_extent: "full" })])?.complete, true);
  const half = frontier([para(18, { juz_extent: "half" })]);
  assertEquals(half?.complete, false);
  assertEquals(half?.at, null);
  assertEquals(proposePortion("hifz", [para(18, { juz_extent: "half" })]),
    "Para 19\u201330, and part of Para 18");
});

Deno.test("the furthest point in the para wins, not the last logged", () => {
  const rows = [at(23, 1, 90), at(23, 40, 60)];
  assertEquals(frontier(rows)?.at, { surah: 23, ayah: 90 });
});

// ── A declared hafiz holds the whole Quran ──────────────────────────
// Three children completed in September 2026 and were announced for the
// 19 Sep ceremony. A record that began on 3 Sep cannot always show the
// last para closing, so the school's declaration has to win.

Deno.test("a declared hafiz is proposed the whole Quran", () => {
  assertEquals(proposePortion("hifz", [], [], { isHafiz: true }), "Para 1\u201330");
});

Deno.test("Muskan Muhammad: the log stops mid-para, the declaration does not", () => {
  const rows = [at(2, 84, 91), at(2, 204, 235), at(2, 236, 252)];
  // What the record alone can say:
  assertEquals(proposePortion("hifz", rows), "Para 2\u201330, and Para 1 up to 2:91");
  // What the school says:
  assertEquals(proposePortion("hifz", rows, [], { isHafiz: true }), "Para 1\u201330");
});

Deno.test("the declaration outranks an empty record entirely", () => {
  assertEquals(proposePortion("hifz", [para(30)], [], { isHafiz: true }), "Para 1\u201330");
});

Deno.test("without the declaration nothing changes", () => {
  assertEquals(proposePortion("hifz", [para(30)], [], { isHafiz: false }), "Para 30");
});

// ── A school that memorises the other way ───────────────────────────
// Iqra IFS goes 30 → 1, and so does most of the region. A school that
// goes 1 → 30 sets settings.hifz_memorization_order and needs nothing
// else from us.

Deno.test("the order defaults to reverse, and only 'forward' changes it", () => {
  assertEquals(hifzOrderOf(null), "reverse");
  assertEquals(hifzOrderOf({}), "reverse");
  assertEquals(hifzOrderOf({ hifz_memorization_order: "reverse" }), "reverse");
  assertEquals(hifzOrderOf({ hifz_memorization_order: "nonsense" }), "reverse");
  assertEquals(hifzOrderOf({ hifz_memorization_order: "forward" }), "forward");
});

Deno.test("forward: the frontier is the HIGHEST para, and 1 to it is held", () => {
  const rows = [para(1), para(2), para(3)];
  assertEquals(frontier(rows, SABAQ_KINDS, "forward")?.para, 3);
  assertEquals(proposePortion("hifz", rows, [], { order: "forward" }), "Para 1–3");
});

Deno.test("forward: a child on Para 12 holds 1 to 12, not 12 to 30", () => {
  assertEquals(proposePortion("hifz", [para(12)], [], { order: "forward" }), "Para 1–12");
  // The same record, read the way this school actually works:
  assertEquals(proposePortion("hifz", [para(12)]), "Para 12–30");
});

Deno.test("forward: part-way into a para names it the same way", () => {
  // Para 2 runs 2:142 to 2:252. Heard at 2:180.
  const rows = [at(2, 142, 180)];
  assertEquals(
    proposePortion("hifz", rows, [], { order: "forward" }),
    "Para 1, and Para 2 up to 2:180",
  );
});

Deno.test("forward: khatam is completing Para 30, not Para 1", () => {
  // Para 30 ends at 114:6.
  const rows = [at(114, 1, 6)];
  assertEquals(proposePortion("hifz", rows, [], { order: "forward" }), "Para 1–30");
});

Deno.test("forward: nothing finished yet inside the first para", () => {
  const rows = [at(2, 30, 50)];
  assertEquals(proposePortion("hifz", rows, [], { order: "forward" }), "Para 1 up to 2:50");
});
