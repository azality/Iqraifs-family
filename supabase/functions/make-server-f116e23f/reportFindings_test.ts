import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeFindings, isNotable, type FindingsInput } from "./reportFindings.ts";

const base: FindingsInput = { subjects: [], overallPct: 70, passMarkPct: 40 };
const kinds = (i: FindingsInput) => computeFindings(i).map((f) => f.kind);

Deno.test("Abu Bakar's real card: Urdu is named as weak AND as a failed subject once", () => {
  // GR 2476, 1st Assessment - the card that started this (72.8% overall,
  // Urdu 41.3%, Science 89.3%). Urdu is above the 40% pass mark, so it is
  // a "weak" subject, not a "failed" one - the distinction the E/F band
  // fix turned on.
  const f = computeFindings({
    ...base,
    overallPct: 72.8,
    subjects: [
      { name: "Urdu", percentage: 41.3 },
      { name: "Science", percentage: 89.3 },
      { name: "Maths", percentage: 78.7 },
    ],
  });
  const urdu = f.filter((x) => x.subject === "Urdu");
  assertEquals(urdu.length, 1);
  assertEquals(urdu[0].kind, "subject_weak");
  assertEquals(f.some((x) => x.subject === "Science" && x.kind === "subject_strong"), true);
  // Maths sits within 12 points of the average - nothing to say.
  assertEquals(f.some((x) => x.subject === "Maths"), false);
});

Deno.test("below the pass mark is a CONCERN, and never doubled with 'weak'", () => {
  const f = computeFindings({
    ...base, overallPct: 60,
    subjects: [{ name: "Urdu", percentage: 31 }],
  });
  assertEquals(f.length, 1);
  assertEquals(f[0].kind, "subject_failed");
  assertEquals(f[0].severity, "concern");
});

Deno.test("the oral/written split names the weaker PAPER when the other one holds up", () => {
  // Knows the material on paper, loses it out loud - the case worth telling
  // a parent about: written 80%, oral 30%.
  const f = computeFindings({
    ...base, overallPct: 70,
    subjects: [{
      name: "Islamiyat", percentage: 68,
      papers: [
        { label: "Oral", obtained: 3, max: 10 },
        { label: "Written", obtained: 52, max: 65 },
      ],
    }],
  });
  const gap = f.find((x) => x.kind === "paper_gap");
  assertEquals(gap?.data.weakPaper, "Oral");
  assertEquals(gap?.data.strongPaper, "Written");
});

Deno.test("when BOTH papers are weak, no paper split - the subject line already says it", () => {
  // Abu Bakar's real Urdu: oral 1/5 = 20%, written 30/70 = 42.9%. A
  // 23-point gap, but nothing to contrast against; naming the oral
  // would dilute "Urdu needs work".
  const f = computeFindings({
    ...base, overallPct: 72.8,
    subjects: [{
      name: "Urdu", percentage: 41.3,
      papers: [
        { label: "Oral", obtained: 1, max: 5 },
        { label: "Written", obtained: 30, max: 70 },
      ],
    }],
  });
  assertEquals(f.some((x) => x.kind === "paper_gap"), false);
  assertEquals(f.some((x) => x.kind === "subject_weak"), true);
});

Deno.test("an ABSENT paper is not counted as a weak one", () => {
  const f = computeFindings({
    ...base, overallPct: 70,
    subjects: [{
      name: "Biology", percentage: 70,
      papers: [
        { label: "Oral", obtained: null, max: 25, absent: true },
        { label: "Written", obtained: 53, max: 75 },
      ],
    }],
  });
  assertEquals(f.some((x) => x.kind === "paper_gap"), false);
});

Deno.test("attendance: perfect is a strength, thin attendance is a concern", () => {
  assertEquals(
    kinds({ ...base, attendance: { present: 20, absent: 0, late: 0, total: 20 } }),
    ["attendance_perfect"],
  );
  assertEquals(
    kinds({ ...base, attendance: { present: 16, absent: 4, late: 0, total: 20 } }),
    ["attendance_concern"],
  );
  // A perfect but tiny record says nothing yet.
  assertEquals(
    kinds({ ...base, attendance: { present: 3, absent: 0, late: 0, total: 3 } }),
    [],
  );
});

Deno.test("trend needs a real move, and only when a prior term exists", () => {
  assertEquals(kinds({ ...base, overallPct: 78, priorOverallPct: 70 }), ["trend_up"]);
  assertEquals(kinds({ ...base, overallPct: 62, priorOverallPct: 70 }), ["trend_down"]);
  assertEquals(kinds({ ...base, overallPct: 72, priorOverallPct: 70 }), []); // noise
  assertEquals(kinds({ ...base, overallPct: 72, priorOverallPct: null }), []); // first term
});

Deno.test("Anaya's real hifz record: manzil flagged, sabqi praised, sabaq quiet", () => {
  // GR 1886, Hifz III - the exact tallies in the system.
  const f = computeFindings({
    ...base, overallPct: null,
    hifz: {
      sabaq: { excellent: 2, good: 13, needs_practice: 3, weak: 1 },   // 20% below
      sabqi: { excellent: 1, good: 16, needs_practice: 3 },            // 85% good
      manzil: { good: 13, needs_practice: 5 },                          // 27.8% below
    },
  });
  const weak = f.filter((x) => x.kind === "hifz_area_weak").map((x) => x.data.area);
  assertEquals(weak.includes("manzil"), true);
  assertEquals(f.some((x) => x.kind === "hifz_area_strong" && x.data.area === "sabqi"), true);
  // Every hifz line must name WHICH of the three it is - "weak in manzil"
  // and "weak in sabaq" mean different things to a parent.
  for (const x of f) {
    if (x.kind.startsWith("hifz")) {
      assertEquals(typeof x.data.area === "string" && x.data.area.length > 0, true);
    }
  }
});

Deno.test("a hifz kind with too few entries is not judged", () => {
  assertEquals(kinds({ ...base, overallPct: null, hifz: { manzil: { needs_practice: 2 } } }), []);
});

Deno.test("no marks at all yields nothing - never invent a story", () => {
  assertEquals(computeFindings({ ...base, overallPct: null, subjects: [{ name: "Urdu", percentage: null }] }), []);
});

Deno.test("every finding carries both languages", () => {
  const f = computeFindings({
    ...base, overallPct: 72.8,
    subjects: [{ name: "Urdu", percentage: 41.3, papers: [
      { label: "Oral", obtained: 1, max: 5 }, { label: "Written", obtained: 30, max: 70 }] }],
    attendance: { present: 16, absent: 4, late: 0, total: 20 },
    hifz: { manzil: { good: 13, needs_practice: 5 } },
    priorOverallPct: 80,
  });
  assertEquals(f.length > 0, true);
  for (const x of f) {
    assertEquals(x.en.length > 0, true);
    assertEquals(x.ur.length > 0, true);
  }
});

Deno.test("worst first: concerns lead, strengths trail", () => {
  const f = computeFindings({
    ...base, overallPct: 72.8,
    subjects: [{ name: "Science", percentage: 89.3 }, { name: "Urdu", percentage: 31 }],
    attendance: { present: 20, absent: 0, late: 0, total: 20 },
  });
  assertEquals(f[0].severity, "concern");
  assertEquals(f[f.length - 1].severity, "strength");
});

Deno.test("isNotable: an average child is not notable, a real gap is", () => {
  assertEquals(isNotable(computeFindings({ ...base, overallPct: 70, subjects: [{ name: "Maths", percentage: 71 }] })), false);
  assertEquals(isNotable(computeFindings({ ...base, overallPct: 70, subjects: [{ name: "Urdu", percentage: 39 }] })), true);
});
