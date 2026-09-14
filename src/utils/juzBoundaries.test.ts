// The school's para table, written out in full as the authority for
// every para boundary. It exists so the end-of-para consolidation can
// never silently drift: if anyone edits JUZ_STARTS, these 30 rows fail.
//
// Indo-Pak mushaf (14 Sep 2026). The first version of this table (10 Sep)
// was the Madani juz list, and six rows disagreed with the paras the
// qaris actually teach — Muhammad Umar finished At-Tawbah 93, the end of
// Para 10 in his Quran, and was handed ayah 94 instead of the revision.
// Each para opens on the words it is NAMED for, which is how every row
// below can be checked by eye: "Ya'tazirun" is 9:94, not 9:93.
//
// Each row is the para, its traditional name, where it STARTS and where
// it FINISHES. The finish of one and the start of the next must be
// adjacent — the test proves that too, so the table cannot disagree
// with itself.
import { describe, it, expect } from "vitest";
import {
  JUZ_STARTS,
  juzOfPosition,
  paraFinishedBySabaq,
} from "./hifzTargets";
import { getSurah } from "./quranSurahs";

type Row = {
  juz: number;
  name: string;
  start: [number, number];
  finish: [number, number];
};

const SCHOOL_TABLE: Row[] = [
  { juz: 1,  name: "Alif Lam Meem",        start: [1, 1],    finish: [2, 141] },
  { juz: 2,  name: "Sayaqool",             start: [2, 142],  finish: [2, 252] },
  { juz: 3,  name: "Tilkal Rusul",         start: [2, 253],  finish: [3, 91] },
  { juz: 4,  name: "Lan Tana Loo",         start: [3, 92],   finish: [4, 23] },
  { juz: 5,  name: "Wal Mohsanat",         start: [4, 24],   finish: [4, 147] },
  { juz: 6,  name: "La Yuhibbullah",       start: [4, 148],  finish: [5, 82] },
  { juz: 7,  name: "Wa Iza Samiu",         start: [5, 83],   finish: [6, 110] },
  { juz: 8,  name: "Wa Lau Annana",        start: [6, 111],  finish: [7, 87] },
  { juz: 9,  name: "Qalal Malao",          start: [7, 88],   finish: [8, 40] },
  { juz: 10, name: "Wa A'lamu",            start: [8, 41],   finish: [9, 93] },
  { juz: 11, name: "Yatazeroon",           start: [9, 94],   finish: [11, 5] },
  { juz: 12, name: "Wa Mamin Da'abat",     start: [11, 6],   finish: [12, 52] },
  { juz: 13, name: "Wa Ma Ubrioo",         start: [12, 53],  finish: [14, 52] },
  { juz: 14, name: "Rubama",               start: [15, 1],   finish: [16, 128] },
  { juz: 15, name: "Subhanallazi",         start: [17, 1],   finish: [18, 74] },
  { juz: 16, name: "Qal Alam",             start: [18, 75],  finish: [20, 135] },
  { juz: 17, name: "Aqtarabo",             start: [21, 1],   finish: [22, 78] },
  { juz: 18, name: "Qadd Aflaha",          start: [23, 1],   finish: [25, 20] },
  { juz: 19, name: "Wa Qalallazina",       start: [25, 21],  finish: [27, 59] },
  { juz: 20, name: "A'man Khalaq",         start: [27, 60],  finish: [29, 44] },
  { juz: 21, name: "Utlu Ma Oohi",         start: [29, 45],  finish: [33, 30] },
  { juz: 22, name: "Wa Man Yaqnut",        start: [33, 31],  finish: [36, 21] },
  { juz: 23, name: "Wa Ma Li",             start: [36, 22],  finish: [39, 31] },
  { juz: 24, name: "Faman Azlamu",         start: [39, 32],  finish: [41, 46] },
  { juz: 25, name: "Ilayhi Yuruddu",       start: [41, 47],  finish: [45, 37] },
  { juz: 26, name: "Ha Meem",              start: [46, 1],   finish: [51, 30] },
  { juz: 27, name: "Qala Fama Khatbukum",  start: [51, 31],  finish: [57, 29] },
  { juz: 28, name: "Qadd Sami Allah",      start: [58, 1],   finish: [66, 12] },
  { juz: 29, name: "Tabaraka lladhi",      start: [67, 1],   finish: [77, 50] },
  // The school's message was cut off at juz 30's finish; it ends where
  // the Quran does, An-Nas 6.
  { juz: 30, name: "Amma",                 start: [78, 1],   finish: [114, 6] },
];

describe("the school's para table", () => {
  it("covers all 30 juz", () => {
    expect(SCHOOL_TABLE).toHaveLength(30);
    expect(SCHOOL_TABLE.map((r) => r.juz)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
  });

  it("agrees with JUZ_STARTS, row for row", () => {
    for (const row of SCHOOL_TABLE) {
      const ours = JUZ_STARTS[row.juz - 1];
      expect(
        [ours.surah, ours.ayah],
        `juz ${row.juz} (${row.name}) start`,
      ).toEqual(row.start);
    }
  });

  it("is internally consistent: each finish is the ayah before the next start", () => {
    for (let i = 0; i < SCHOOL_TABLE.length - 1; i++) {
      const [fs, fa] = SCHOOL_TABLE[i].finish;
      const [ns, na] = SCHOOL_TABLE[i + 1].start;
      if (fs === ns) {
        // Same surah — the next juz picks up on the very next ayah.
        expect(na, `juz ${SCHOOL_TABLE[i].juz} -> ${SCHOOL_TABLE[i + 1].juz}`).toBe(fa + 1);
      } else {
        // Crossed into a later surah — the finish must be that surah's
        // last ayah, and the next juz starts at an ayah 1 boundary or
        // partway into a surah the previous juz did not reach.
        const count = getSurah(fs)?.ayahCount;
        expect(fa, `juz ${SCHOOL_TABLE[i].juz} finish is end of surah ${fs}`).toBe(count);
        expect(ns, `juz ${SCHOOL_TABLE[i + 1].juz} starts after surah ${fs}`).toBeGreaterThan(fs);
      }
    }
  });

  it("places every start and finish in the right juz", () => {
    for (const row of SCHOOL_TABLE) {
      expect(juzOfPosition(row.start[0], row.start[1]), `start of juz ${row.juz}`)
        .toBe(row.juz);
      expect(juzOfPosition(row.finish[0], row.finish[1]), `finish of juz ${row.juz}`)
        .toBe(row.juz);
    }
  });

  it("fires the consolidation break exactly on each para's last ayah", () => {
    for (const row of SCHOOL_TABLE) {
      const [fs, fa] = row.finish;
      const from = Math.max(1, fa - 4);
      expect(paraFinishedBySabaq(fs, from, fa), `juz ${row.juz} (${row.name}) completed`)
        .toBe(row.juz);
      // One ayah short of the boundary must NOT trigger it.
      if (fa - 1 >= from) {
        expect(paraFinishedBySabaq(fs, from, fa - 1), `juz ${row.juz} not yet finished`)
          .toBeNull();
      }
    }
  });

  it("Muhammad Zakariya's case: Adh-Dhariyat 22–30 closes Para 26", () => {
    // The worked example the school sent (10 Sep). Their own table says
    // juz 26 finishes at 51:30 and juz 27 opens at 51:31.
    expect(paraFinishedBySabaq(51, 22, 30)).toBe(26);
    expect(juzOfPosition(51, 31)).toBe(27);
  });

  it("Muhammad Umar's case: At-Tawbah 84–93 closes Para 10", () => {
    // Pilot, 14 Sep: "Para 10 finishes on ayah 93" — tomorrow must be the
    // Para 10 revision, not At-Tawbah 94.
    expect(paraFinishedBySabaq(9, 84, 93)).toBe(10);
    expect(juzOfPosition(9, 94)).toBe(11);
  });

  it("a portion that runs past a para's end still closes that para", () => {
    // At-Tawbah 88–97 reads through 9:93 into Para 11.
    expect(paraFinishedBySabaq(9, 88, 97)).toBe(10);
    // Staying inside one para never fires.
    expect(paraFinishedBySabaq(9, 94, 103)).toBeNull();
    expect(paraFinishedBySabaq(9, 75, 83)).toBeNull();
  });
});
