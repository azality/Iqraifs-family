import { describe, it, expect } from "vitest";
import { expandExerciseLine, parseTopicLines } from "./docxText";

// The lines below are copied verbatim out of the school's own file,
// "mathematics syllabus 2026-2027 2nd Assessment.docx" (28 Sep 2026).
describe("expandExerciseLine", () => {
  it("splits a comma-and-'and' list into one item per exercise", () => {
    expect(expandExerciseLine("Ex 3.1 ,3.2 ,3.3 and 3.4")).toEqual([
      "Exercise 3.1", "Exercise 3.2", "Exercise 3.3", "Exercise 3.4",
    ]);
    expect(expandExerciseLine("Ex : 4.1 , 4.2 ,4.3, 4.4 and 4.5")).toEqual([
      "Exercise 4.1", "Exercise 4.2", "Exercise 4.3", "Exercise 4.4", "Exercise 4.5",
    ]);
  });

  it("expands a dash range inside one chapter", () => {
    // Class 8's "Ex16.1-16.2" — no space after Ex, no space around the dash.
    expect(expandExerciseLine("Ex16.1-16.2")).toEqual(["Exercise 16.1", "Exercise 16.2"]);
  });

  it("reads the school's ellipsis as a range", () => {
    // Class 10 wrote "Ex :20.1,20.2 ,20.3 ,20.4,…….20.7" meaning 20.1 to 20.7.
    expect(expandExerciseLine("Ex :20.1,20.2 ,20.3 ,20.4,…….20.7")).toEqual([
      "Exercise 20.1", "Exercise 20.2", "Exercise 20.3", "Exercise 20.4",
      "Exercise 20.5", "Exercise 20.6", "Exercise 20.7",
    ]);
  });

  it("handles a lettered range and a whole-chapter exercise", () => {
    expect(expandExerciseLine("Ex: 13a 13c")).toEqual(["Exercise 13a", "Exercise 13c"]);
    expect(expandExerciseLine("Ex: 8")).toEqual(["Exercise 8"]);
    expect(expandExerciseLine("Ex 3")).toEqual(["Exercise 3"]);
  });

  it("leaves prose alone rather than inventing exercises", () => {
    // "Theorems : as given in book" is a real line in this file.
    expect(expandExerciseLine("Ex: as given in book")).toBeNull();
    expect(expandExerciseLine("Theorems : as given in book")).toBeNull();
    expect(expandExerciseLine("Chapter 4.     Factorization")).toBeNull();
    expect(expandExerciseLine("Exercises and revision work")).toBeNull();
  });

  it("never repeats an exercise the school listed twice", () => {
    expect(expandExerciseLine("Ex 5.1, 5.1 ,5.2")).toEqual(["Exercise 5.1", "Exercise 5.2"]);
  });
});

describe("parseTopicLines", () => {
  it("keeps the chapter AND ticks each exercise separately", () => {
    const topics = parseTopicLines(
      "Chapter 3.       Algebraic expressions and formulas\nEx 3.1 ,3.2 ,3.3 and 3.4",
    );
    // The chapter keeps its number — a teacher ticking "Chapter 3" wants to
    // see which chapter. Word's run of spaces is collapsed to one.
    expect(topics.map((t) => t.name)).toEqual([
      "Chapter 3. Algebraic expressions and formulas",
      "Exercise 3.1", "Exercise 3.2", "Exercise 3.3", "Exercise 3.4",
    ]);
  });

  it("splits a table cell's bullet-joined paragraphs into separate topics", () => {
    // blockLines joins a cell's paragraphs with " · ". Before 28 Sep this
    // arrived space-joined and became ONE untickable topic — the bug the
    // school reported as "only chapters, no bullet points".
    const cell = "Chapter no 7 · Geometry · Topics: · Angle types of angles"
      + " · majoring angles using the protractor · drawing angles · circle · quadrilateral";
    expect(parseTopicLines(cell).map((t) => t.name)).toEqual([
      "Chapter no 7", "Geometry", "Topics:", "Angle types of angles",
      "majoring angles using the protractor", "drawing angles", "circle", "quadrilateral",
    ]);
  });

  it("still reads tab-separated name and description", () => {
    expect(parseTopicLines("Fractions\tadding unlike denominators")).toEqual([
      { name: "Fractions", description: "adding unlike denominators" },
    ]);
  });

  it("strips list markers without swallowing a numeric topic", () => {
    expect(parseTopicLines("1. Fractions").map((t) => t.name)).toEqual(["Fractions"]);
    // A bare "16.1" is the topic itself — stripping it would leave nothing.
    expect(parseTopicLines("16.1").map((t) => t.name)).toEqual(["16.1"]);
  });
});

describe("the school's own typos", () => {
  it("reads '30. 2' as 30.2, not chapter 30 and exercise 2", () => {
    // Verbatim from the Class 10 line in the maths file.
    expect(expandExerciseLine("Ex 30.1,30. 2 ,30.3 ,30.4 ,30.5")).toEqual([
      "Exercise 30.1", "Exercise 30.2", "Exercise 30.3",
      "Exercise 30.4", "Exercise 30.5",
    ]);
  });

  it("keeps a tab as the name/description split", () => {
    // Collapsing every run of whitespace once destroyed this.
    expect(parseTopicLines("Arithmetic\t\tAlgebra")).toEqual([
      { name: "Arithmetic", description: "Algebra" },
    ]);
  });

  it("expands lettered exercises written side by side", () => {
    expect(expandExerciseLine("Ex 9a 9b")).toEqual(["Exercise 9a", "Exercise 9b"]);
  });
});
