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
};

/** Short display key for one extent value, or null when unknown. */
export function juzExtentShortKey(extent: string): string | null {
  return SHORT_KEY[extent] ?? null;
}

/** Returns a leading " — …" suffix to append after "Juz N", or ""
 *  when absent/unknown. */
export function formatJuzExtent(extent: string | null | undefined): string {
  if (!extent) return '';
  if (SHORT_KEY[extent]) return ` — ${i18n.t(SHORT_KEY[extent])}`;
  const m = extent.match(/^to_surah:(\d{1,3})$/);
  if (m) {
    const su = getSurah(Number(m[1]));
    const name = su ? su.nameTransliterated : `#${m[1]}`;
    return ` — ${i18n.t('hifzTeach.extShortToSurah', { name })}`;
  }
  return '';
}
