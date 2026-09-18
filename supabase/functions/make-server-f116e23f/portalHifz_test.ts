// A hifz parent's view, in tests. Umar Farooq (Hifz II A) is the case
// the parents reported: heard on sabaq and sabqi, with "Next lesson:
// Sabaq: Al-Furqan 1–8" recorded — and none of it on the parent's screens.

import { assertEquals } from "jsr:@std/assert@1";
import {
  currentHomework, groupByDay, hifzKindOfSubject, schoolDateOf,
  type HifzRow,
} from "./portalHifz.ts";

const KARACHI = "Asia/Karachi";

const row = (kind: string, recordedAt: string, over: Partial<HifzRow> = {}): HifzRow => ({
  kind,
  surah_number: null, ayah_from: null, ayah_to: null,
  juz_number: null, juz_extent: null, qaida_lesson: null,
  quality: "good", next_target: null, recorded_at: recordedAt, missed: false,
  ...over,
});

// Friday 18 Sep, school hours in Karachi (UTC+5).
const FRI_SABAQ = row("sabaq", "2026-09-18T05:10:00Z", {
  surah_number: 24, ayah_from: 62, ayah_to: 64, next_target: "Sabaq: Al-Furqan 1–8",
});
const FRI_SABQI = row("sabqi", "2026-09-18T06:40:00Z", {
  juz_number: 18, next_target: null,
});
const THU_SABQI = row("sabqi", "2026-09-17T06:40:00Z", {
  juz_number: 18, next_target: "Sabqi: Para 18 to An-Nur",
});
const THU_MANZIL = row("manzil", "2026-09-17T07:10:00Z", {
  juz_number: 26, next_target: "Manzil: Para 26 (last ¼ — salasa → end)",
});

// Newest first, the way every endpoint reads them.
const UMAR = [FRI_SABQI, FRI_SABAQ, THU_MANZIL, THU_SABQI];

Deno.test("Umar's homework is what his teacher set — sabaq, sabqi and manzil", () => {
  const hw = currentHomework(UMAR, KARACHI);
  assertEquals(hw.map((h) => h.kind), ["sabaq", "sabqi", "manzil"]);
  assertEquals(hw[0].text, "Sabaq: Al-Furqan 1–8");
});

Deno.test("a hearing with no target does not cancel yesterday's", () => {
  // Friday's sabqi was rated and saved without a next target. Thursday's
  // instruction still stands, and it is what the child is carrying.
  const hw = currentHomework(UMAR, KARACHI);
  const sabqi = hw.find((h) => h.kind === "sabqi");
  assertEquals(sabqi?.text, "Sabqi: Para 18 to An-Nur");
  assertEquals(sabqi?.setOn, "2026-09-17");
});

Deno.test("the most recent target wins over an older one", () => {
  const older = row("sabaq", "2026-09-16T05:00:00Z", { next_target: "Sabaq: An-Nur 55–61" });
  const hw = currentHomework([FRI_SABAQ, older], KARACHI);
  assertEquals(hw[0].text, "Sabaq: Al-Furqan 1–8");
  assertEquals(hw[0].setOn, "2026-09-18");
});

Deno.test("no targets set anywhere means no homework, not a guess", () => {
  assertEquals(currentHomework([FRI_SABQI], KARACHI), []);
});

Deno.test("days group newest first, one line per kind", () => {
  const days = groupByDay(UMAR, KARACHI);
  assertEquals(days.map((d) => d.date), ["2026-09-18", "2026-09-17"]);
  assertEquals(days[0].heard.map((r) => r.kind), ["sabaq", "sabqi"]);
  assertEquals(days[1].heard.map((r) => r.kind), ["sabqi", "manzil"]);
});

Deno.test("a day's homework is what was set THAT day", () => {
  const days = groupByDay(UMAR, KARACHI);
  assertEquals(days[0].homework.map((h) => h.text), ["Sabaq: Al-Furqan 1–8"]);
  assertEquals(days[1].homework.map((h) => h.kind), ["sabqi", "manzil"]);
});

Deno.test("an absence is not classwork, but its instruction still counts", () => {
  const absent = row("sabaq", "2026-09-19T05:00:00Z", {
    missed: true, next_target: "Sabaq: Al-Furqan 1–8 (repeat)",
  });
  const days = groupByDay([absent], KARACHI);
  assertEquals(days[0].heard, []);
  assertEquals(days[0].homework[0].text, "Sabaq: Al-Furqan 1–8 (repeat)");
});

Deno.test("a day with nothing heard and nothing set is dropped", () => {
  const absent = row("sabaq", "2026-09-19T05:00:00Z", { missed: true });
  assertEquals(groupByDay([absent], KARACHI), []);
});

Deno.test("the school's clock decides the day, not UTC", () => {
  // 20:30 in Karachi on Thursday is 15:30 UTC — same date either way.
  assertEquals(schoolDateOf("2026-09-17T15:30:00Z", KARACHI), "2026-09-17");
  // 00:30 Friday in Karachi is 19:30 UTC THURSDAY. slice(0,10) says
  // Thursday; the school says Friday.
  assertEquals(schoolDateOf("2026-09-17T19:30:00Z", KARACHI), "2026-09-18");
});

Deno.test("period subjects map to their hifz kind, in both scripts", () => {
  assertEquals(hifzKindOfSubject("Sabaq"), "sabaq");
  assertEquals(hifzKindOfSubject("Sabqi"), "sabqi");
  assertEquals(hifzKindOfSubject("Manzil"), "manzil");
  assertEquals(hifzKindOfSubject("سبق"), "sabaq");
  assertEquals(hifzKindOfSubject("سبقی"), "sabqi");
  assertEquals(hifzKindOfSubject("منزل"), "manzil");
});

Deno.test("sabqi is never read as sabaq, though it starts with it", () => {
  assertEquals(hifzKindOfSubject("Sabaqi"), "sabqi");
  assertEquals(hifzKindOfSubject("sabqi"), "sabqi");
});

Deno.test("an ordinary subject is not a hifz period", () => {
  assertEquals(hifzKindOfSubject("Mutala"), null);
  assertEquals(hifzKindOfSubject("Islamiyah"), null);
  assertEquals(hifzKindOfSubject("English"), null);
  assertEquals(hifzKindOfSubject(null), null);
});
