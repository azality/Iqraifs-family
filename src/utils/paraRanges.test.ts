import { describe, it, expect } from "vitest";
import { parseParaList, formatParaList } from "./paraRanges";

describe("parseParaList", () => {
  it("reads a single para and a plain list", () => {
    expect(parseParaList("7")).toEqual([7]);
    expect(parseParaList("1, 3, 5")).toEqual([1, 3, 5]);
  });

  it("expands ranges and merges overlaps", () => {
    expect(parseParaList("1-4")).toEqual([1, 2, 3, 4]);
    expect(parseParaList("1-3, 2-5")).toEqual([1, 2, 3, 4, 5]);
  });

  it("accepts a backwards range — a teacher typing 30-28 means Amma", () => {
    expect(parseParaList("30-28")).toEqual([28, 29, 30]);
  });

  it("accepts how the school actually writes it", () => {
    // en/em dashes, the word "to", Urdu "تا", Urdu comma.
    expect(parseParaList("1–10")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(parseParaList("1 to 3")).toEqual([1, 2, 3]);
    expect(parseParaList("1 تا 3")).toEqual([1, 2, 3]);
    expect(parseParaList("1، 2")).toEqual([1, 2]);
  });

  it("accepts Arabic-Indic and Urdu digits", () => {
    expect(parseParaList("١-٣")).toEqual([1, 2, 3]);   // ١-٣
    expect(parseParaList("۲۹")).toEqual([29]);          // ۲۹
  });

  it("treats empty input as an empty set, not an error", () => {
    expect(parseParaList("")).toEqual([]);
    expect(parseParaList("   ")).toEqual([]);
  });

  it("refuses anything outside 1..30 rather than silently dropping it", () => {
    // Silently ignoring these would understate a child's exam portion.
    expect(parseParaList("31")).toBeNull();
    expect(parseParaList("0")).toBeNull();
    expect(parseParaList("1-40")).toBeNull();
    expect(parseParaList("Para 1")).toBeNull();
    expect(parseParaList("1..3")).toBeNull();
  });
});

describe("formatParaList", () => {
  it("collapses consecutive runs and keeps gaps", () => {
    expect(formatParaList([1, 2, 3])).toBe("1–3");
    expect(formatParaList([1, 2, 3, 28, 29, 30])).toBe("1–3, 28–30");
    expect(formatParaList([5])).toBe("5");
  });

  it("sorts, de-dupes and drops out-of-range values", () => {
    expect(formatParaList([3, 1, 2, 2])).toBe("1–3");
    expect(formatParaList([31, 4, 0])).toBe("4");
    expect(formatParaList([])).toBe("");
    expect(formatParaList(null)).toBe("");
  });

  it("round-trips with the parser", () => {
    for (const text of ["1–10, 30", "7", "28–30"]) {
      expect(formatParaList(parseParaList(text)!)).toBe(text);
    }
  });
});
