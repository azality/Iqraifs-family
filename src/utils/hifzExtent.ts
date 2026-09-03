// Shared formatter for hifz_progress.juz_extent — the "how much of the
// para" marker on para-based sabqi entries ('quarter' | 'half' |
// 'three_quarters' | 'full' | 'to_surah:<n>'). Returns a leading
// " — …" suffix to append after "Juz N", or "" when absent.

import i18n from '../i18n';
import { getSurah } from './quranSurahs';

export function formatJuzExtent(extent: string | null | undefined): string {
  if (!extent) return '';
  const key: Record<string, string> = {
    full: 'hifzTeach.extShortFull',
    quarter: 'hifzTeach.extShortQuarter',
    half: 'hifzTeach.extShortHalf',
    three_quarters: 'hifzTeach.extShortThreeQuarters',
  };
  if (key[extent]) return ` — ${i18n.t(key[extent])}`;
  const m = extent.match(/^to_surah:(\d{1,3})$/);
  if (m) {
    const su = getSurah(Number(m[1]));
    const name = su ? su.nameTransliterated : `#${m[1]}`;
    return ` — ${i18n.t('hifzTeach.extShortToSurah', { name })}`;
  }
  return '';
}
