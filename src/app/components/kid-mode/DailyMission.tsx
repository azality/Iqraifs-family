/**
 * v26: Daily Mission card.
 *
 * The first thing a kid sees on their dashboard once they tap
 * "Start My Day". Tells them — in their own voice — what's left to
 * do today. Fully derived from data already on the dashboard
 * (today's events, salah items, active quest); no new endpoints.
 *
 * Two states:
 *   - Collapsed (default): a single big "Start My Day" CTA.
 *   - Expanded: the checklist of what's left.
 *
 * The collapsed state is the v26 "kid UX simpler" item — one big
 * obvious button when a kid opens the app, instead of a wall of
 * tiles. Expanded state is the v26 "kid as driver" item — a
 * concrete plan, in plain language, for the next 60 minutes.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ChevronRight, Check } from 'lucide-react';

interface DailyMissionTask {
  id: string;
  emoji: string;
  label: string;
  done: boolean;
  // Optional sub-line (e.g. "1 prayer left" / "7-day streak so far!")
  detail?: string;
}

interface DailyMissionProps {
  childName: string;
  // Pre-computed task list from KidDashboard. Keeping the component
  // pure (no fetching) so it can be reused inside other kid surfaces
  // later without dragging fetch logic with it.
  tasks: DailyMissionTask[];
  // When the kid taps a task we navigate to the relevant page. The
  // parent owns the routes; this component just calls back.
  onSelectTask?: (taskId: string) => void;
}

export function DailyMission({ childName, tasks, onSelectTask }: DailyMissionProps) {
  const [open, setOpen] = useState(false);

  const remaining = tasks.filter(t => !t.done).length;
  const total = tasks.length;
  const allDone = remaining === 0 && total > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-br from-amber-300 via-orange-300 to-rose-300 p-1 shadow-lg"
    >
      <div className="rounded-xl bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Today
            </p>
            <p className="text-lg font-bold text-gray-900 truncate">
              {allDone
                ? `Mashallah, ${childName}! All done today.`
                : remaining === 1
                ? "One thing left today"
                : remaining > 0
                ? `${remaining} things left today`
                : "Let's go!"}
            </p>
          </div>
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold px-4 py-2 shadow-md text-sm shrink-0"
            >
              Start my day
            </button>
          )}
          {open && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-gray-500 hover:text-gray-700 px-2 shrink-0"
            >
              Hide
            </button>
          )}
        </div>

        <AnimatePresence>
          {open && tasks.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4 space-y-2 overflow-hidden"
            >
              {tasks.map(t => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={t.done}
                    onClick={() => !t.done && onSelectTask?.(t.id)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      t.done
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border border-amber-200 hover:bg-amber-100 text-gray-900'
                    }`}
                  >
                    <span className="text-2xl shrink-0" aria-hidden>{t.emoji}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold">{t.label}</span>
                      {t.detail && (
                        <span className="block text-xs text-gray-600 mt-0.5">{t.detail}</span>
                      )}
                    </span>
                    {t.done ? (
                      <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-amber-600 shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        {open && allDone && (
          <p className="mt-4 text-center text-sm text-emerald-700">
            🌸 You finished everything for today. Beautiful!
          </p>
        )}
      </div>
    </motion.div>
  );
}
