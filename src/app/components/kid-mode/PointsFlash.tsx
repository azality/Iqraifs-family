/**
 * v26: PointsFlash — instant feedback animation.
 *
 * Watches the kid's `pointEvents` and surfaces a transient "+X" or
 * "-X" floating chip whenever a NEW positive event arrives. This is
 * the "tighter game loop" item: action → feedback → progress. The
 * existing isBonus celebration covers the bonus-only case; this
 * component covers the every-day case (any new credit, +5 prayed
 * Asr on time, +10 helped sibling, etc).
 *
 * Pure presentational + a small ref of "seen ids" so re-renders
 * don't re-fire. Mounted once at the top of KidDashboard.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getStorageSync, setStorageSync } from '../../../utils/storage';

interface PointsFlashProps {
  childId: string;
  pointEvents: any[];
}

interface FlashItem {
  id: string;
  points: number;
  itemName: string;
}

const STORAGE_PREFIX = 'pointsflash-seen:';
const STORAGE_LIMIT = 200;

export function PointsFlash({ childId, pointEvents }: PointsFlashProps) {
  const [active, setActive] = useState<FlashItem[]>([]);
  // Track ids we've already animated so a re-render or a poll doesn't
  // re-fire. Persist across reloads so the kid only sees each event
  // pop once, ever.
  const seenRef = useRef<Set<string>>(new Set());
  // Lazy-init seen ids from storage on first mount per child.
  const initedFor = useRef<string | null>(null);
  if (initedFor.current !== childId) {
    initedFor.current = childId;
    const stored = (getStorageSync(STORAGE_PREFIX + childId) as string[] | null) || [];
    seenRef.current = new Set(stored);
  }

  useEffect(() => {
    if (!childId) return;
    const myEvents = pointEvents.filter((e) => e.childId === childId);
    const fresh = myEvents
      .filter((e) => !seenRef.current.has(e.id))
      // Skip negatives (kids never see those represented anywhere).
      // Skip bonuses (handled by the existing celebration banner).
      .filter((e) => e.points > 0 && !e.isBonus)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (fresh.length === 0) return;

    // Mark seen
    for (const e of fresh) seenRef.current.add(e.id);
    setStorageSync(
      STORAGE_PREFIX + childId,
      Array.from(seenRef.current).slice(-STORAGE_LIMIT)
    );

    // Stagger: drop one chip every 350ms so a batch of approvals feels
    // like a celebration, not a wall.
    fresh.forEach((e, i) => {
      window.setTimeout(() => {
        setActive((prev) => [
          ...prev,
          {
            id: e.id,
            points: e.points,
            itemName: e.itemName || 'Points',
          },
        ]);
        // Remove after 1.6s
        window.setTimeout(() => {
          setActive((prev) => prev.filter((x) => x.id !== e.id));
        }, 1600);
      }, i * 350);
    });
  }, [pointEvents, childId]);

  return (
    <div className="fixed top-24 right-4 z-[55] pointer-events-none flex flex-col items-end gap-2">
      <AnimatePresence>
        {active.map((f) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, x: 40, scale: 0.85 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.9 }}
            transition={{ duration: 0.25 }}
            className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold px-4 py-2 shadow-lg ring-2 ring-white/40 flex items-center gap-2 select-none"
          >
            <span className="text-lg">+{f.points}</span>
            <span className="text-xs font-medium opacity-90">{f.itemName}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
