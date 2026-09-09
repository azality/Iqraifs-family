// Shared formatter + option list for hifz_progress.juz_extent — the
// "how much of the para" marker on para-based entries.
//
// Extents name SEGMENTS of the para, not just cumulative stops: pilot
// feedback (7 Sep) was that "to half" left teachers asking WHICH half
// the student recited — first quarter or ruba-to-nisf? So alongside
// the original start→X values there are explicit segment values, and
// every label spells out its range in the teachers' own vocabulary
// (ruba ¼ · nisf ½ · salasa ¾).
//
// Stored values (DB CHECK mirrors this list — keep them in lockstep):
//   'full'                        the whole para
//   'quarter'                     start → ruba      (first quarter)
//   'second_quarter'              ruba → nisf
//   'third_quarter'               nisf → salasa
//   'last_quarter'                salasa → end
//   'half'                        start → nisf      (first half)
//   'second_half'                 nisf → end
//   'three_quarters'              start → salasa
//   'to_surah:<n>'                start → surah n

import i18n from '../i18n';
import { getSurah } from './quranSurahs';

/** The extents a teacher can pick for a para portion, in menu order.
 *  Values are stored verbatim in juz_extent. 'to_surah' is appended
 *  separately by the pickers that support it. */
export const PARA_EXTENT_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: 'full', labelKey: 'hifzTeach.extFull' },
  { value: 'quarter', labelKey: 'hifzTeach.extQuarter' },
  { value: 'second_quarter', labelKey: 'hifzTeach.extSecondQuarter' },
  { value: 'third_quarter', labelKey: 'hifzTeach.extThirdQuarter' },
  { value: 'last_quarter', labelKey: 'hifzTeach.extLastQuarter' },
  { value: 'half', labelKey: 'hifzTeach.extHalf' },
  { value: 'second_half', labelKey: 'hifzTeach.extSecondHalf' },
  { value: 'three_quarters', labelKey: 'hifzTeach.extThreeQuarters' },
  // Ranges starting at ruba (Muneeb, 10 Sep): ¼ → ¾ and ¼ → end.
  { value: 'middle_half', labelKey: 'hifzTeach.extMiddleHalf' },
  { value: 'last_three_quarters', labelKey: 'hifzTeach.extLastThreeQuarters' },
];

const SHORT_KEY: Record<string, string> = {
  full: 'hifzTeach.extShortFull',
  quarter: 'hifzTeach.extShortQuarter',
  second_quarter: 'hifzTeach.extShortSecondQuarter',
  third_quarter: 'hifzTeach.extShortThirdQuarter',
  last_quarter: 'hifzTeach.extShortLastQuarter',
  half: 'hifzTeach.extShortHalf',
  second_half: 'hifzTeach.extShortSecondHalf',
  three_quarters: 'hifzTeach.extShortThreeQuarters',
  middle_half: 'hifzTeach.extShortMiddleHalf',
  last_three_quarters: 'hifzTeach.extShortLastThreeQuarters',
};

/** Short display key for one extent value, or null when unknown. */
export function juzExtentShortKey(extent: string): string | null {
  return SHORT_KEY[extent] ?? null;
}

/** Returns a leading " — …" suffix to append after "Juz N", or ""
 *  when absent/unknown.
 *
 *  Pass `juzNumber` when known: a `to_surah:<n>` whose surah falls
 *  outside that juz is a stored default artifact (early rows saved
 *  "up to Al-Fatiha" on Juz 18 — the picker's untouched default), and
 *  showing it reads as nonsense, so the suffix is dropped. */
export function formatJuzExtent(
  extent: string | null | undefined,
  juzNumber?: number | null,
): string {
  if (!extent) return '';
  if (SHORT_KEY[extent]) return ` — ${i18n.t(SHORT_KEY[extent])}`;
  const m = extent.match(/^to_surah:(\d{1,3})$/);
  if (m) {
    const n = Number(m[1]);
    if (juzNumber && juzNumber >= 1 && juzNumber <= 30) {
      const startSurah = JUZ_START_SURAHS[juzNumber - 1];
      const endSurah = JUZ_START_SURAHS[juzNumber] ?? 114;
      if (n < startSurah || n > endSurah) return '';
    }
    const su = getSurah(n);
    const name = su ? su.nameTransliterated : `#${m[1]}`;
    return ` — ${i18n.t('hifzTeach.extShortToSurah', { name })}`;
  }
  return '';
}

// First surah of each juz (Hafs) — mirrors JUZ_STARTS in hifzTargets;
// only the surah component is needed for the sanity check above.
const JUZ_START_SURAHS: ReadonlyArray<number> = [
  1, 2, 2, 3, 4, 4, 5, 6, 7, 8, 9, 11, 12, 15, 17,
  18, 21, 23, 25, 27, 29, 33, 36, 39, 41, 46, 51, 58, 67, 78,
];
