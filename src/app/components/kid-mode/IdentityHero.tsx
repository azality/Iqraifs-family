/**
 * v26: Identity hero card.
 *
 * Surfaces the kid's current title / identity prominently and
 * gives Salah its own visual weight ("crown" treatment when the
 * kid has an active multi-day Salah streak).
 *
 * Replaces the old tiny "Streak King" footnote under the points
 * bar. Identity needs to feel like a thing the kid IS, not a
 * label tucked under a number.
 */

import { motion } from 'motion/react';
import { Crown, Star } from 'lucide-react';

interface IdentityHeroProps {
  title: string;            // current milestone title (e.g. "Adventurer")
  childName: string;
  // Points-on-time Salah streak (days). When >= 3 we show the crown.
  salahStreak: number;
  // Weekly salah score (this Mon→Sun). Number out of (5 prayers × 7 days)
  // = 35 max. We display as a clean ratio so kids can read at a glance
  // how the week is going. Pass 0 if no salah data yet.
  weeklySalahScore: number;
  weeklySalahMax: number;
}

export function IdentityHero({
  title,
  childName,
  salahStreak,
  weeklySalahScore,
  weeklySalahMax,
}: IdentityHeroProps) {
  const showCrown = salahStreak >= 3;
  const weeklyPct = weeklySalahMax > 0
    ? Math.round((weeklySalahScore / weeklySalahMax) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="rounded-2xl bg-white/90 backdrop-blur shadow-lg ring-1 ring-amber-100 px-5 py-4"
    >
      <div className="flex items-center gap-4">
        {/* Crown / star — kid's current identity badge. Crown only
            when Salah streak >= 3 days; otherwise a softer star.
            "I am a Streak King" lands harder when the icon means
            something the kid earned this week. */}
        <div
          className={`h-14 w-14 rounded-2xl flex items-center justify-center shadow-md shrink-0 ${
            showCrown
              ? 'bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 ring-4 ring-amber-200'
              : 'bg-gradient-to-br from-amber-200 to-orange-300'
          }`}
        >
          {showCrown ? (
            <Crown className="w-7 h-7 text-white" fill="white" />
          ) : (
            <Star className="w-7 h-7 text-white" fill="white" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            I am a
          </p>
          <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 truncate">
            {title}
          </p>
          {showCrown && (
            <p className="text-xs text-amber-700 mt-0.5">
              👑 {salahStreak}-day Salah streak — keep going, {childName}!
            </p>
          )}
        </div>
      </div>

      {/* Weekly Salah score — a separate, sacred metric. Salah is the
          most important habit, so we never roll it into the generic
          points number. Showing it as a labeled badge with its own
          progress bar reinforces "this is the most important thing." */}
      {weeklySalahMax > 0 && (
        <div className="mt-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                This week's Salah
              </p>
              <p className="text-sm text-emerald-900 mt-0.5">
                {weeklySalahScore} of {weeklySalahMax} prayers
                <span className="text-emerald-700 ml-1">({weeklyPct}%)</span>
              </p>
            </div>
            <div className="text-2xl">🕌</div>
          </div>
          <div className="mt-2 h-2 rounded-full bg-emerald-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
              style={{ width: `${weeklyPct}%` }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
