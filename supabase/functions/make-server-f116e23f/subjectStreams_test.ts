import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSitsResolver } from "./subjectStreams.ts";

// Class IX as the school runs it: five ordinary subjects plus a
// "Stream" pair - Biology or Computer, never both.
const SUBJECTS = [
  { id: "urdu", elective_group: null },
  { id: "bio", elective_group: "Stream" },
  { id: "comp", elective_group: "Stream" },
];
const CHOICES = [
  { student_id: "maryam", class_subject_id: "bio" },
  { student_id: "ayan", class_subject_id: "comp" },
];

Deno.test("everyone sits a subject with no group", () => {
  const r = buildSitsResolver(SUBJECTS, CHOICES);
  assertEquals(r.sits("maryam", "urdu"), true);
  assertEquals(r.sits("ayan", "urdu"), true);
  assertEquals(r.sits("nobody", "urdu"), true);
});

Deno.test("a bio child sits Biology and NOT Computer - and vice versa", () => {
  const r = buildSitsResolver(SUBJECTS, CHOICES);
  assertEquals(r.sits("maryam", "bio"), true);
  assertEquals(r.sits("maryam", "comp"), false);
  assertEquals(r.sits("ayan", "comp"), true);
  // The 21 stray "absent" stamps: Biology rows for computer children
  // exist in the table, and this false is what keeps them uncounted.
  assertEquals(r.sits("ayan", "bio"), false);
});

Deno.test("no choice yet: sits NEITHER, and is reported by name", () => {
  const r = buildSitsResolver(SUBJECTS, CHOICES);
  assertEquals(r.sits("fresh", "bio"), false);
  assertEquals(r.sits("fresh", "comp"), false);
  assertEquals(r.unchosen(["maryam", "ayan", "fresh"]), [
    { group: "Stream", studentIds: ["fresh"] },
  ]);
});

Deno.test("a class with no elective groups reports nothing and gates nothing", () => {
  const r = buildSitsResolver([{ id: "urdu", elective_group: null }], []);
  assertEquals(r.groups, []);
  assertEquals(r.unchosen(["a", "b"]), []);
  assertEquals(r.sits("a", "urdu"), true);
});

Deno.test("a choice row pointing at a non-elective subject is inert", () => {
  const r = buildSitsResolver(SUBJECTS, [
    { student_id: "x", class_subject_id: "urdu" },
  ]);
  assertEquals(r.sits("x", "urdu"), true);
  assertEquals(r.unchosen(["x"]), [{ group: "Stream", studentIds: ["x"] }]);
});

Deno.test("two groups are independent - choosing in one leaves the other open", () => {
  const r = buildSitsResolver(
    [
      { id: "bio", elective_group: "Stream" },
      { id: "comp", elective_group: "Stream" },
      { id: "sindhi", elective_group: "Language" },
      { id: "arabic", elective_group: "Language" },
    ],
    [{ student_id: "s", class_subject_id: "bio" }],
  );
  assertEquals(r.sits("s", "bio"), true);
  assertEquals(r.sits("s", "sindhi"), false);
  assertEquals(r.unchosen(["s"]), [{ group: "Language", studentIds: ["s"] }]);
});

Deno.test("an empty-string group is no group at all", () => {
  const r = buildSitsResolver([{ id: "a", elective_group: "  " }], []);
  assertEquals(r.groups, []);
  assertEquals(r.sits("s", "a"), true);
});
