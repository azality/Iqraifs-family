/**
 * v28: Barakah Garden — honest revamp.
 *
 * Previous version showed phantom stats (Ayahs: 0, Helped: 0) for
 * categories we don't actually track, and item descriptions ("Grows
 * when you learn new Quranic verses") that didn't tie to anything
 * real. The garden was a fiction layered on top of a single number.
 *
 * The new model:
 *   - Single source of truth: lifetime positive `pointEvents` for
 *     this kid (same source as the home BarakahGarden + the level).
 *   - Garden items each have a real deed-count threshold. When the
 *     kid's lifetime deed count crosses that threshold, the item
 *     unlocks.
 *   - Each unlocked item shows EXACTLY which event triggered it
 *     ("Unlocked on Apr 28 — when you logged 'Homework Complete'")
 *     by indexing into the events array sorted oldest-first.
 *   - Stats panel shows only what we genuinely track: total deeds,
 *     this week's deeds, best streak (any habit), and the kid's
 *     most-logged activity. No fake "Ayahs" or "Helped" counters.
 *
 * Backend untouched.
 */

import { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { ArrowLeft, Info } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useFamilyContext } from "../contexts/FamilyContext";
import { toast } from "sonner";
import { getChildEvents } from "../../utils/api";

// ---------- Garden tier model -----------------------------------------------

// Deed-count threshold for each level. Same curve the home BarakahGarden
// uses, so both surfaces report the same number. Index 0 = Level 1, etc.
const LEVEL_THRESHOLDS = [1, 5, 15, 30, 50, 80, 120, 180, 260, 360, 500, 700];

function gardenLevelFromDeeds(totalDeeds: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalDeeds >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}
function nextLevelThreshold(level: number): number {
  return LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
}

// Garden items, in the order they unlock. Each one's `unlocksAtDeeds`
// is the lifetime deed count at which it appears. Names + emojis are
// generic ("First Sapling" rather than "Oak of Knowledge") so the
// unlock criterion ("you logged your 5th good deed") matches what the
// description claims.
interface GardenItemDef {
  id: string;
  emoji: string;
  name: string;
  // The threshold this item represents. Unlocked when the kid's
  // lifetime good-deed count reaches this number.
  unlocksAtDeeds: number;
  // Position on the visual garden (percent x/y).
  position: { x: number; y: number };
}

const GARDEN_ITEMS: GardenItemDef[] = [
  { id: 'sprout-1',  emoji: '🌱', name: 'First Sapling',     unlocksAtDeeds: 1,   position: { x: 18, y: 70 } },
  { id: 'flower-1',  emoji: '🌸', name: 'Pink Blossom',       unlocksAtDeeds: 3,   position: { x: 32, y: 75 } },
  { id: 'flower-2',  emoji: '🌼', name: 'Daisy',              unlocksAtDeeds: 5,   position: { x: 48, y: 78 } },
  { id: 'tree-1',    emoji: '🌳', name: 'Young Tree',          unlocksAtDeeds: 10,  position: { x: 70, y: 30 } },
  { id: 'flower-3',  emoji: '🌺', name: 'Rose',                unlocksAtDeeds: 15,  position: { x: 60, y: 75 } },
  { id: 'bird-1',    emoji: '🦋', name: 'Butterfly Visit',     unlocksAtDeeds: 20,  position: { x: 22, y: 22 } },
  { id: 'tree-2',    emoji: '🌴', name: 'Palm Tree',           unlocksAtDeeds: 30,  position: { x: 18, y: 30 } },
  { id: 'fountain-1',emoji: '⛲', name: 'Stone Fountain',       unlocksAtDeeds: 50,  position: { x: 45, y: 45 } },
  { id: 'rainbow-1', emoji: '🌈', name: 'Rainbow After Rain',  unlocksAtDeeds: 80,  position: { x: 50, y: 12 } },
  { id: 'tree-3',    emoji: '🌲', name: 'Pine Grove',          unlocksAtDeeds: 120, position: { x: 80, y: 35 } },
  { id: 'bird-2',    emoji: '🐦', name: 'Songbird',            unlocksAtDeeds: 180, position: { x: 75, y: 18 } },
  { id: 'masjid-1',  emoji: '🕌', name: 'Garden Masjid',       unlocksAtDeeds: 260, position: { x: 35, y: 28 } },
];

// Friendly date formatter for the "unlocked when" line.
const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return ''; }
};

// ---------- Component -------------------------------------------------------

export function JannahGarden() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { getCurrentChild } = useFamilyContext();
  const child = getCurrentChild();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<GardenItemDef | null>(null);

  useEffect(() => {
    if (!child || !accessToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const all = await getChildEvents(child.id);
        if (!cancelled) setEvents(Array.isArray(all) ? all : []);
      } catch (err) {
        console.error('Garden load failed:', err);
        toast.error('Could not load your garden');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [child, accessToken]);

  // ---------- Derived data ----------
  const data = useMemo(() => {
    // Positive, non-bonus, non-recovery events in chronological order
    // (oldest first). Bonus events are "extras" on the same deed —
    // counting them would double-credit the same action. Recoveries
    // are repair credits, not new deeds.
    const myDeeds = (events || [])
      .filter((e: any) => e?.points > 0 && !e.isBonus && !e.isRecovery && e?.status !== 'voided')
      .sort((a: any, b: any) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    const totalDeeds = myDeeds.length;
    const level = gardenLevelFromDeeds(totalDeeds);

    // This-week count (last 7 days)
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = myDeeds.filter(
      (e: any) => new Date(e.timestamp).getTime() >= weekAgo
    ).length;

    // Most-logged activity by item name
    const byName = new Map<string, number>();
    for (const e of myDeeds) {
      const name = (e.itemName as string) || 'Unknown';
      byName.set(name, (byName.get(name) || 0) + 1);
    }
    const mostLogged = [...byName.entries()].sort((a, b) => b[1] - a[1])[0];

    // For each garden item, figure out the trigger event.
    // unlocksAtDeeds is 1-indexed → events[N-1] is the deed that
    // crossed it. Items above totalDeeds remain locked and we say
    // exactly how many more deeds are needed.
    const itemsWithTrigger = GARDEN_ITEMS.map((it) => {
      const idx = it.unlocksAtDeeds - 1;
      const trigger = idx < myDeeds.length ? myDeeds[idx] : null;
      return {
        def: it,
        unlocked: trigger != null,
        trigger,
        deedsToGo: Math.max(0, it.unlocksAtDeeds - totalDeeds),
      };
    });

    return {
      myDeeds,
      totalDeeds,
      level,
      thisWeek,
      mostLogged: mostLogged ? { name: mostLogged[0], count: mostLogged[1] } : null,
      items: itemsWithTrigger,
    };
  }, [events]);

  if (!child) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-50 to-green-100">
        <p className="text-emerald-900">Please log in to see your garden.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-200 via-green-100 to-emerald-200 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-emerald-800">Loading your garden…</p>
        </div>
      </div>
    );
  }

  const { totalDeeds, level, thisWeek, mostLogged, items, myDeeds } = data;
  const unlockedCount = items.filter(i => i.unlocked).length;
  const completionPct = Math.round((unlockedCount / items.length) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-200 via-green-100 to-emerald-200">
      {/* ---------- Header ---------- */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate('/kid/adventure-world')}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">Back</span>
            </button>
            <div className="text-right">
              <p className="text-sm text-green-100">Garden Level</p>
              <p className="text-2xl font-bold">{level}</p>
            </div>
          </div>

          <h1 className="text-3xl font-bold mb-2">Your Barakah Garden 🌺</h1>
          <p className="text-green-100 text-sm mb-4">
            Every good thing you log plants a flower. Tap any plant to see
            when you grew it.
          </p>

          {/* Progress bar — fraction of garden items unlocked */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="flex justify-between text-sm mb-2">
              <span>Garden Progress</span>
              <span>{unlockedCount}/{items.length} plants · {completionPct}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-3">
              <div
                className="bg-white rounded-full h-3 transition-all duration-500"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ---------- "How does my garden grow?" ---------- */}
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg ring-1 ring-emerald-200 p-5 mb-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center text-white shrink-0">
              <Info className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-emerald-900 mb-1">How does my garden grow?</h3>
              <p className="text-sm text-emerald-800 leading-relaxed">
                Every good thing you log — Salah, helping at home,
                kindness, sadaqa, learning — counts as one good deed and
                plants something new in your garden. New plants unlock
                at <strong>1, 3, 5, 10, 15, 20, 30, 50, 80, 120, 180,
                and 260</strong> deeds.
              </p>
              {level < LEVEL_THRESHOLDS.length && (
                <p className="text-sm text-emerald-700 mt-2">
                  You have <strong>{totalDeeds}</strong> good
                  deed{totalDeeds === 1 ? '' : 's'} so far.
                  {' '}
                  <strong>{Math.max(0, nextLevelThreshold(level) - totalDeeds)}</strong>
                  {' '}more to reach Level {level + 1}!
                </p>
              )}
              {level >= LEVEL_THRESHOLDS.length && (
                <p className="text-sm text-emerald-700 mt-2 font-semibold">
                  ✨ You've grown the full Jannah garden — alhamdulillah!
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Honest stats panel (only what we track) ---------- */}
      <div className="max-w-4xl mx-auto px-6 pb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-3xl mb-1">⭐</div>
            <p className="text-2xl font-bold text-yellow-900">{totalDeeds}</p>
            <p className="text-xs text-gray-600">Total deeds</p>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-3xl mb-1">📅</div>
            <p className="text-2xl font-bold text-blue-900">{thisWeek}</p>
            <p className="text-xs text-gray-600">This week</p>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-3xl mb-1">🌸</div>
            <p className="text-2xl font-bold text-pink-900">{unlockedCount}</p>
            <p className="text-xs text-gray-600">Plants grown</p>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-lg flex flex-col">
            <div className="text-3xl mb-1">🏆</div>
            {mostLogged ? (
              <>
                <p className="text-sm font-bold text-emerald-900 truncate" title={mostLogged.name}>
                  {mostLogged.name}
                </p>
                <p className="text-xs text-gray-600">Most logged · {mostLogged.count}×</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-gray-400">—</p>
                <p className="text-xs text-gray-500">No deeds yet</p>
              </>
            )}
          </div>
        </div>

        {/* ---------- Garden visualization ---------- */}
        <div className="bg-gradient-to-b from-sky-200 via-green-300 to-green-500 rounded-2xl shadow-2xl overflow-hidden mb-6 relative h-[26rem]">
          <div className="absolute top-4 right-4 w-12 h-12 bg-yellow-300 rounded-full shadow-lg animate-pulse" />
          <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-b from-green-400 to-green-600" />

          {items.map((it) => (
            <motion.button
              key={it.def.id}
              type="button"
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: it.unlocked ? 1 : 0.45,
                opacity: it.unlocked ? 1 : 0.35,
              }}
              transition={{ duration: 0.5 }}
              onClick={() => setSelectedItem(it.def)}
              className={`absolute cursor-pointer transition-transform hover:scale-110 ${
                it.unlocked ? '' : 'grayscale'
              }`}
              style={{ left: `${it.def.position.x}%`, top: `${it.def.position.y}%` }}
              aria-label={it.unlocked ? `${it.def.name} (unlocked)` : `Locked plant — ${it.deedsToGo} more deeds`}
            >
              <div className="text-5xl filter drop-shadow-lg select-none">
                {it.unlocked ? it.def.emoji : '🔒'}
              </div>
            </motion.button>
          ))}
        </div>

        {/* ---------- Item detail card ---------- */}
        {selectedItem && (() => {
          const it = items.find(x => x.def.id === selectedItem.id);
          if (!it) return null;
          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-6 shadow-2xl mb-6"
            >
              <div className="flex items-start gap-4">
                <div className="text-6xl shrink-0">{it.def.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-2xl font-bold text-gray-900">{it.def.name}</h3>
                    {it.unlocked ? (
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                        Unlocked ✓
                      </span>
                    ) : (
                      <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                        Locked
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">
                    Unlocks at <strong>{it.def.unlocksAtDeeds}</strong>
                    {' '}good deed{it.def.unlocksAtDeeds === 1 ? '' : 's'}.
                  </p>

                  {/* This is the heart of the v28 fix: when an item is
                      unlocked, we say EXACTLY which event triggered it
                      and when. No more "Grows when you learn new
                      Quranic verses" with no evidence. */}
                  {it.unlocked && it.trigger ? (
                    <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
                      <p className="text-emerald-900">
                        🌱 You grew this on <strong>{fmtDate(it.trigger.timestamp)}</strong>
                        {' '}— it was your <strong>{it.def.unlocksAtDeeds}{ordinalSuffix(it.def.unlocksAtDeeds)}</strong> good deed.
                      </p>
                      <p className="text-emerald-800 mt-1">
                        That deed was: <strong>{it.trigger.itemName || 'Untitled'}</strong>
                        {it.trigger.points ? <> (<span>+{it.trigger.points}</span> points)</> : null}.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                      <strong>{it.deedsToGo}</strong> more good deed{it.deedsToGo === 1 ? '' : 's'} to grow this!
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="mt-4 text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </motion.div>
          );
        })()}

        {/* ---------- Recent deeds list (audit trail) ---------- */}
        {myDeeds.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-6">
            <h3 className="font-bold text-emerald-900 mb-3">Recent good deeds</h3>
            <ul className="space-y-2">
              {[...myDeeds].reverse().slice(0, 8).map((e: any) => (
                <li key={e.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0">
                  <span className="text-gray-900 truncate min-w-0 mr-3">{e.itemName || 'Unknown'}</span>
                  <span className="text-xs text-gray-500 shrink-0">{fmtDate(e.timestamp)}</span>
                </li>
              ))}
            </ul>
            {myDeeds.length > 8 && (
              <p className="text-xs text-gray-500 mt-2">
                Showing 8 most recent · {myDeeds.length} total
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// "1st", "2nd", "3rd", "4th", … helper for the unlock copy.
function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
