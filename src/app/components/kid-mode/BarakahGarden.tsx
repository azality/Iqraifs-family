/**
 * v26: Barakah Garden — central feature, MVP.
 *
 * Every good deed (Salah, akhlaq, sadaqa, knowledge) is a flower.
 * The garden grows visibly across all reading levels in v26 (in v25
 * it was only shown for pre-readers; in v26 it's promoted to the
 * core kid surface for everyone).
 *
 * Keeping the visualization simple: emoji-based plants laid out in
 * a "soil" panel, with weather/decoration changing as the kid
 * accumulates deeds. v27 can replace this with hand-drawn art —
 * the data model stays the same.
 *
 * Counts are derived from `pointEvents` to avoid a new endpoint.
 */

import { useMemo } from 'react';
import { motion } from 'motion/react';

interface BarakahGardenProps {
  childName: string;
  // Total positive events ever logged for this kid (proxy for "deeds").
  // Keeps the garden growing across days so a kid sees long-term
  // progress, not just today's effort.
  totalDeeds: number;
  // Today's positive events — used for "today's blooms" sub-line.
  todayDeeds: number;
}

// Garden growth tiers. Each tier unlocks a new visual layer. We cap
// at level 12 so a kid can finish the garden in roughly a season of
// daily practice (with realistic back-off for missed days).
function gardenLevel(totalDeeds: number): {
  level: number;
  flowers: number;     // count of 🌸 flowers to show
  trees: number;       // count of 🌳 trees
  decor: string[];     // one-off decorations like 🦋 🐦 🌈
  bg: string;          // tailwind classes for the soil panel
  label: string;       // friendly name for this tier
} {
  if (totalDeeds < 5)  return { level: 1,  flowers: Math.max(1, totalDeeds), trees: 0, decor: [],                      bg: 'from-amber-100 to-emerald-50',  label: 'A new garden' };
  if (totalDeeds < 15) return { level: 2,  flowers: Math.min(8, totalDeeds), trees: 0, decor: [],                      bg: 'from-emerald-100 to-emerald-50', label: 'Growing roots' };
  if (totalDeeds < 30) return { level: 3,  flowers: 10, trees: 1, decor: ['🦋'],                                       bg: 'from-emerald-100 to-emerald-50', label: 'A young garden' };
  if (totalDeeds < 50) return { level: 4,  flowers: 12, trees: 1, decor: ['🦋', '🐝'],                                 bg: 'from-emerald-100 to-green-50',   label: 'A friendly garden' };
  if (totalDeeds < 80) return { level: 5,  flowers: 12, trees: 2, decor: ['🦋', '🐝', '🐦'],                            bg: 'from-emerald-100 to-green-50',   label: 'A lively garden' };
  if (totalDeeds < 120) return { level: 6, flowers: 14, trees: 2, decor: ['🦋', '🐝', '🐦', '🌈'],                      bg: 'from-emerald-100 to-sky-50',     label: 'A blessed garden' };
  if (totalDeeds < 180) return { level: 7, flowers: 14, trees: 3, decor: ['🦋', '🐝', '🐦', '🌈', '🦌'],                bg: 'from-emerald-200 to-sky-50',     label: 'A flourishing garden' };
  if (totalDeeds < 260) return { level: 8, flowers: 16, trees: 3, decor: ['🦋', '🐝', '🐦', '🌈', '🦌', '⛲'],          bg: 'from-emerald-200 to-blue-50',    label: 'A garden with a fountain' };
  if (totalDeeds < 360) return { level: 9, flowers: 16, trees: 4, decor: ['🦋', '🐝', '🐦', '🌈', '🦌', '⛲', '🕊️'],   bg: 'from-emerald-200 to-blue-50',    label: 'A garden of peace' };
  if (totalDeeds < 500) return { level: 10, flowers: 18, trees: 4, decor: ['🦋', '🐝', '🐦', '🌈', '🦌', '⛲', '🕊️', '🕌'], bg: 'from-emerald-200 to-blue-100', label: 'A garden by the masjid' };
  if (totalDeeds < 700) return { level: 11, flowers: 20, trees: 5, decor: ['🦋', '🐝', '🐦', '🌈', '🦌', '⛲', '🕊️', '🕌', '🌟'], bg: 'from-emerald-300 to-blue-100', label: 'A radiant garden' };
  return                       { level: 12, flowers: 22, trees: 6, decor: ['🦋', '🐝', '🐦', '🌈', '🦌', '⛲', '🕊️', '🕌', '🌟', '🌅'], bg: 'from-emerald-300 to-blue-200', label: 'A garden of Jannah' };
}

export function BarakahGarden({ childName, totalDeeds, todayDeeds }: BarakahGardenProps) {
  const garden = useMemo(() => gardenLevel(totalDeeds), [totalDeeds]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-3xl shadow-md ring-1 ring-emerald-200 overflow-hidden bg-white"
    >
      <div className="px-5 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
            🌱 {childName}'s Barakah Garden
          </h3>
          <p className="text-xs text-emerald-700 mt-0.5">
            Level {garden.level} · {garden.label}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold text-emerald-700 leading-none">
            {totalDeeds}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-emerald-600 mt-0.5">
            total deeds
          </p>
        </div>
      </div>

      {/* The garden panel — simple emoji rendering. Trees first
          (background layer), then flowers, then decorations
          (foreground). Sky/soil gradient changes with the level. */}
      <div className={`relative bg-gradient-to-b ${garden.bg} px-4 py-6`}>
        {garden.decor.length > 0 && (
          <div className="mb-1 flex justify-end gap-1 text-2xl select-none" aria-hidden>
            {garden.decor.slice(0, 4).map((d, i) => (
              <motion.span
                key={`decor-${i}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: [0, -4, 0] }}
                transition={{ delay: 0.1 + i * 0.1, duration: 2, repeat: Infinity, repeatType: 'mirror' }}
              >
                {d}
              </motion.span>
            ))}
          </div>
        )}

        {garden.trees > 0 && (
          <div className="mb-1 flex flex-wrap gap-1 text-3xl select-none" aria-hidden>
            {Array.from({ length: garden.trees }).map((_, i) => (
              <span key={`tree-${i}`}>🌳</span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1 text-2xl leading-none select-none" aria-hidden>
          {Array.from({ length: garden.flowers }).map((_, i) => (
            <span key={`flower-${i}`}>🌸</span>
          ))}
        </div>

        {garden.decor.slice(4).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 text-2xl select-none" aria-hidden>
            {garden.decor.slice(4).map((d, i) => (
              <span key={`decor2-${i}`}>{d}</span>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 py-3 bg-white border-t border-emerald-100 flex items-center justify-between">
        <p className="text-sm text-emerald-800">
          {todayDeeds === 0 && 'Plant your first flower today.'}
          {todayDeeds === 1 && '🌸 +1 flower today!'}
          {todayDeeds > 1 && `🌸 ${todayDeeds} flowers today!`}
        </p>
        {garden.level < 12 && (
          <p className="text-xs text-emerald-600">
            Next level at {nextLevelThreshold(garden.level)} deeds
          </p>
        )}
        {garden.level >= 12 && (
          <p className="text-xs font-semibold text-emerald-700">
            ✨ Garden complete — alhamdulillah!
          </p>
        )}
      </div>
    </motion.div>
  );
}

function nextLevelThreshold(level: number): number {
  const thresholds = [5, 15, 30, 50, 80, 120, 180, 260, 360, 500, 700, 700];
  return thresholds[level - 1] ?? 700;
}
