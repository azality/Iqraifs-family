import { describe, it, expect } from "vitest";
import { rangeBounds, earliestFrom, daysInRange, rangeSummary, localDate, firstHeardDay } from "./hifzWeek";

// Noon local time, so the device's timezone can never push it into
// another day.
const at = (day: string, hh = 12) => new Date(`${day}T${String(hh).padStart(2, "0")}:00:00`).toISOString();
const e = (id: string, kind: string, day: string, extra: Record<string, unknown> = {}) =>
  ({ id, kind, recordedAt: at(day), ...extra });

// 18 Sep 2026 is a Friday.
const FRI = "2026-09-18";

describe("rangeBounds", () => {
  it("this week runs Monday to today", () => {
    expect(rangeBounds("week", FRI)).toEqual({ from: "2026-09-14", to: FRI });
  });
  it("on a Monday, this week is just today", () => {
    expect(rangeBounds("week", "2026-09-14")).toEqual({ from: "2026-09-14", to: "2026-09-14" });
  });
  it("on a Sunday, this week is still the week that began Monday", () => {
    expect(rangeBounds("week", "2026-09-20").from).toBe("2026-09-14");
  });
  it("last week is the whole previous Monday to Sunday", () => {
    expect(rangeBounds("lastWeek", FRI)).toEqual({ from: "2026-09-07", to: "2026-09-13" });
  });
  it("this month starts on the 1st", () => {
    expect(rangeBounds("month", FRI)).toEqual({ from: "2026-09-01", to: FRI });
  });
  it("fetch far enough back for last week even early in a month", () => {
    expect(earliestFrom("2026-10-02")).toBe("2026-09-21");
    expect(earliestFrom(FRI)).toBe("2026-09-01");
  });
});

describe("daysInRange", () => {
  const heard = [
    e("a", "manzil", "2026-09-17"),
    e("b", "sabaq", "2026-09-17"),
    e("c", "sabqi", "2026-09-17"),
    e("d", "sabaq", "2026-09-18"),
    e("x", "sabaq", "2026-09-11"), // last week — outside
  ];

  it("a whole week, not just the last two days (the 18 Sep complaint)", () => {
    const rows = daysInRange(heard, "2026-09-14", FRI);
    expect(rows.map((r) => r.date)).toEqual([
      "2026-09-18", "2026-09-17", "2026-09-16", "2026-09-15", "2026-09-14",
    ]);
  });

  it("a day reads sabaq, sabqi, manzil — in that order", () => {
    const thu = daysInRange(heard, "2026-09-14", FRI).find((r) => r.date === "2026-09-17")!;
    expect(thu.entries.map((x) => x.kind)).toEqual(["sabaq", "sabqi", "manzil"]);
  });

  it("an empty weekday still shows, an empty weekend does not", () => {
    const rows = daysInRange([], "2026-09-07", "2026-09-13");
    expect(rows.map((r) => r.date)).toEqual([
      "2026-09-11", "2026-09-10", "2026-09-09", "2026-09-08", "2026-09-07",
    ]);
  });

  it("a Saturday with a hearing does show", () => {
    const rows = daysInRange([e("s", "sabaq", "2026-09-12")], "2026-09-07", "2026-09-13");
    expect(rows[0].date).toBe("2026-09-12");
  });

  it("no blank days before the first hearing on record (logging began 12 Sep)", () => {
    const heardSat = [e("s", "sabqi", "2026-09-12")];
    const rows = daysInRange(heardSat, "2026-09-07", "2026-09-13", firstHeardDay(heardSat));
    expect(rows.map((r) => r.date)).toEqual(["2026-09-12"]);
  });

  it("a gap AFTER the first hearing still shows", () => {
    const mon = [e("m", "sabaq", "2026-09-14"), e("f", "sabaq", "2026-09-18")];
    const rows = daysInRange(mon, "2026-09-14", FRI, firstHeardDay(mon));
    expect(rows.map((r) => [r.date, r.entries.length])).toEqual([
      ["2026-09-18", 1], ["2026-09-17", 0], ["2026-09-16", 0], ["2026-09-15", 0], ["2026-09-14", 1],
    ]);
  });

  it("the calendar day is the viewer's, not UTC's", () => {
    const late = new Date("2026-09-17T23:30:00");
    expect(localDate(late)).toBe("2026-09-17");
  });
});

describe("rangeSummary", () => {
  it("counts heard days and missed-SABAQ days only", () => {
    const rows = daysInRange([
      e("1", "sabaq", "2026-09-14"),
      e("2", "sabaq", "2026-09-15", { missed: true }),
      e("3", "manzil", "2026-09-16", { missed: true }), // skipped manzil
    ], "2026-09-14", "2026-09-16");
    expect(rangeSummary(rows)).toEqual({ heardDays: 1, missedSabaqDays: 1 });
  });
});
