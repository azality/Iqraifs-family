import { describe, it, expect } from "vitest";
import { isActive, bestActiveTo } from "./navActive";

const O = "/school/orgs/abc";
const ACADEMICS = [
  `${O}/admin/classes`,
  `${O}/admin/timetable`,
  `${O}/admin/assessment`,
  `${O}/admin/assessment/marking-progress`,
];
const ALL = [`${O}`, `${O}/admin`, ...ACADEMICS];

describe("bestActiveTo", () => {
  it("lights Marking progress alone, not Assessment too (18 Sep)", () => {
    expect(bestActiveTo(`${O}/admin/assessment/marking-progress`, ALL))
      .toBe(`${O}/admin/assessment/marking-progress`);
  });

  it("still lights Assessment on its own page", () => {
    expect(bestActiveTo(`${O}/admin/assessment`, ALL)).toBe(`${O}/admin/assessment`);
  });

  it("still lights Assessment on a page beneath it with no entry of its own", () => {
    expect(bestActiveTo(`${O}/admin/assessment/exams/e1/marks`, ALL))
      .toBe(`${O}/admin/assessment`);
    expect(bestActiveTo(`${O}/admin/assessment/tabulation`, ALL))
      .toBe(`${O}/admin/assessment`);
  });

  it("the dashboard lights only on the dashboard", () => {
    expect(bestActiveTo(`${O}`, ALL)).toBe(`${O}`);
    expect(bestActiveTo(`${O}/admin/classes`, ALL)).toBe(`${O}/admin/classes`);
  });

  it("nothing lights on a page no entry covers", () => {
    expect(bestActiveTo(`${O}/somewhere/else`, [`${O}/admin/classes`])).toBeNull();
  });

  it("ignores query strings on both sides", () => {
    expect(bestActiveTo(`${O}/my-schedule?action=time-off`, [`${O}/my-schedule?action=time-off`]))
      .toBe(`${O}/my-schedule?action=time-off`);
  });

  it("a sibling that merely shares a prefix is not a match", () => {
    // /admin/assessment-archive is not beneath /admin/assessment.
    expect(isActive(`${O}/admin/assessment-archive`, `${O}/admin/assessment`)).toBe(false);
  });
});
