// Sabaq targets that span two surahs (Muneeb, 10 Sep): "part of a
// surah (last part) that's finishing up and give a new surah that's
// starting". The progression rule is the subtle bit — a segment that
// closed its surah must drop out rather than roll forward, or tomorrow
// would duplicate the segment that already opened the next surah.
import { describe, it, expect } from "vitest";
import {
  serializeNextSabaqParts,
  parseNextSabaqParts,
  nextSabaqPartsAfter,
  serializeNextSabaq,
  parseNextSabaq,
  parseSabaqParaRevision,
  type SabaqPart,
} from "./hifzTargets";

// Yunus (10) has 109 ayahs; Hud (11) has 123.
const YUNUS_TAIL: SabaqPart = { surahNumber: 10, from: 107, to: 109 };
const HUD_START: SabaqPart = { surahNumber: 11, from: 1, to: 5 };

describe("sabaq target serialization", () => {
  it("round-trips a two-surah lesson", () => {
    const text = serializeNextSabaqParts([YUNUS_TAIL, HUD_START]);
    expect(text).toBe("Sabaq: Yunus 107–109 + Hud 1–5");
    expect(parseNextSabaqParts(text)).toEqual([YUNUS_TAIL, HUD_START]);
  });

  it("still reads single-segment targets written before this existed", () => {
    expect(parseNextSabaqParts("Sabaq: Yunus 98–106")).toEqual([
      { surahNumber: 10, from: 98, to: 106 },
    ]);
  });

  it("heals a reversed range on the way in and out", () => {
    expect(serializeNextSabaq(10, 106, 98)).toBe("Sabaq: Yunus 98–106");
    expect(parseNextSabaq("Sabaq: An-Nur 57–51")).toEqual({
      surahNumber: 24, from: 51, to: 57,
    });
  });

  it("gives single-slot consumers the first segment", () => {
    expect(parseNextSabaq("Sabaq: Yunus 107–109 + Hud 1–5")).toEqual(YUNUS_TAIL);
  });

  it("leaves the para-revision shape to its own parser", () => {
    const rev = "Sabaq: Revise Para 11 — then Hud 1–5";
    expect(parseNextSabaqParts(rev)).toBeNull();
    expect(parseSabaqParaRevision(rev)?.juz).toBe(11);
  });

  it("rejects text that isn't a sabaq target", () => {
    expect(parseNextSabaqParts("Manzil: Para 19 (first ½ — nisf)")).toBeNull();
    expect(parseNextSabaqParts("Sabaq: Notasurah 1–5")).toBeNull();
  });
});

describe("sabaq progression across two surahs", () => {
  it("repeat keeps both segments exactly", () => {
    expect(nextSabaqPartsAfter([YUNUS_TAIL, HUD_START], true)).toEqual([
      YUNUS_TAIL, HUD_START,
    ]);
  });

  it("advance drops the surah that finished and continues the new one", () => {
    // Yunus ended on 109, its last ayah -> done. Hud 1–5 -> 6–10.
    expect(nextSabaqPartsAfter([YUNUS_TAIL, HUD_START], false)).toEqual([
      { surahNumber: 11, from: 6, to: 10 },
    ]);
  });

  it("advance continues BOTH when neither surah finished", () => {
    expect(
      nextSabaqPartsAfter(
        [{ surahNumber: 10, from: 98, to: 106 }, HUD_START],
        false,
      ),
    ).toEqual([
      { surahNumber: 10, from: 107, to: 109 },
      { surahNumber: 11, from: 6, to: 10 },
    ]);
  });

  it("a lone finished segment rolls into the next surah, as before", () => {
    expect(nextSabaqPartsAfter([{ surahNumber: 10, from: 101, to: 109 }], false))
      .toEqual([{ surahNumber: 11, from: 1, to: 9 }]);
  });

  it("a lone unfinished segment just continues, as before", () => {
    expect(nextSabaqPartsAfter([{ surahNumber: 10, from: 98, to: 106 }], false))
      .toEqual([{ surahNumber: 10, from: 107, to: 109 }]);
  });

  it("rates each segment on its own: lesson excellent, extra weak", () => {
    // An-Nur (24) has 64 ayahs. Assigned 53–61 passed; the extra 62–64
    // the child ran ahead with was weak, so it stands again tomorrow
    // while the assigned part moves on — and moving on lands on the
    // same portion, which must not appear twice.
    expect(
      nextSabaqPartsAfter(
        [{ surahNumber: 24, from: 53, to: 61 }, { surahNumber: 24, from: 62, to: 64 }],
        [false, true],
      ),
    ).toEqual([{ surahNumber: 24, from: 62, to: 64 }]);
  });

  it("keeps two distinct segments when only one is repeated", () => {
    // Yunus finished (dropped on advance); Hud 1–5 was weak, so it stays.
    expect(
      nextSabaqPartsAfter([YUNUS_TAIL, HUD_START], [false, true]),
    ).toEqual([HUD_START]);
  });

  it("advances the extra but repeats the lesson when the ratings flip", () => {
    expect(
      nextSabaqPartsAfter(
        [{ surahNumber: 24, from: 53, to: 61 }, { surahNumber: 11, from: 1, to: 5 }],
        [true, false],
      ),
    ).toEqual([
      { surahNumber: 24, from: 53, to: 61 },
      { surahNumber: 11, from: 6, to: 10 },
    ]);
  });

  it("returns null past the end of the Quran", () => {
    // An-Nas (114) has 6 ayahs — nothing follows it.
    expect(nextSabaqPartsAfter([{ surahNumber: 114, from: 1, to: 6 }], false))
      .toBeNull();
  });
});
