import { useState, useEffect, useRef } from "react";
import { clearStorageSync, getStorageSync, setStorageSync, removeStorageSync } from '../../utils/storage';
import { Flame, Award, Heart, Gift, Sparkles, TrendingUp, TrendingDown, Clock, Star } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { useAuth } from "../contexts/AuthContext";
import { useViewMode } from "../contexts/ViewModeContext";
import { useFamilyContext } from "../contexts/FamilyContext";
import { motion, AnimatePresence } from "motion/react";
import { Confetti } from "../components/effects/Confetti";
import { PointsDisplay } from "../components/kid-mode/PointsDisplay";
import { AdventureMap } from "../components/kid-mode/AdventureMap";
import { QuestCard } from "../components/kid-mode/QuestCard";
import { MosqueBuild } from "../components/kid-mode/MosqueBuild";
import { GentleCorrection } from "../components/kid-mode/GentleCorrection";
import { RewardRequestCard } from "../components/kid-mode/RewardRequestCard";
import { FloatingActionButton } from "../components/mobile/FloatingActionButton";
import { projectId } from "../../../utils/supabase/info";
import { toast } from "sonner";
import { getTrackableItems, getMilestones, getRewards, applyQadhaCorrection } from "../../utils/api";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

export function KidDashboard() {
  const { getCurrentChild, familyId } = useFamilyContext();
  const { accessToken } = useAuth();
  // When a parent is previewing the kid view, we must prevent any real
  // mutations (reward requests, recovery submissions, etc). The RootLayout
  // banner plus these guards keep the preview strictly read-only.
  const { isPreviewingAsKid } = useViewMode();
  const child = getCurrentChild();
  const navigate = useNavigate();

  // Local state for fetched data
  const [trackableItems, setTrackableItems] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pointEvents, setPointEvents] = useState<any[]>([]);

  // Track pending redemption requests
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // v21: track the kid's prayer claims that are still waiting on a parent.
  // Without this, the kid taps "I Prayed" and nothing visible changes —
  // a 6-year-old reads that as "the button didn't work". The pending
  // chip below the points header tells the kid the system saw it and
  // is waiting for their parent.
  const [pendingClaims, setPendingClaims] = useState<any[]>([]);

  // v15: track which missed-prayer event the kid is currently catching up on
  // (kid-initiated qadha correction). One in-flight correction at a time keeps
  // double-clicks from creating duplicate qadha events on the audit trail.
  const [qadhaSubmittingId, setQadhaSubmittingId] = useState<string | null>(null);

  // Game settings
  const [knowledgeQuestEnabled, setKnowledgeQuestEnabled] = useState(true);

  // Bonus-points celebration: when a new event with `isBonus: true` lands
  // (e.g. parent approved a prayer with bonus points for praying beautifully),
  // fire confetti + surface a banner showing the reason. `seenBonusIds` is a
  // ref so re-renders don't re-trigger; it's seeded from storage so we don't
  // re-celebrate events from previous sessions.
  const BONUS_SEEN_KEY = `bonus-seen:${child?.id || ''}`;
  const seenBonusIdsRef = useRef<Set<string>>(
    new Set(child ? (getStorageSync(BONUS_SEEN_KEY) as string[] | null) || [] : [])
  );
  const [celebration, setCelebration] = useState<{
    points: number;
    reason: string;
    itemName: string;
  } | null>(null);

  // Fetch data on mount
  useEffect(() => {
    if (!child) return;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        const [itemsData, milestonesData, rewardsData] = await Promise.all([
          getTrackableItems(),
          getMilestones(),
          getRewards()
        ]);
        
        setTrackableItems(itemsData || []);
        setMilestones(milestonesData || []);
        setRewards(rewardsData || []);
        
        // Fetch challenges if the child and familyId exist
        if (familyId && accessToken) {
          const response = await fetch(
            `${API_BASE}/families/${familyId}/challenges`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            }
          );
          if (response.ok) {
            const challengesData = await response.json();
            setChallenges(challengesData || []);
          }

          // Fetch game settings
          const gameSettingsResponse = await fetch(
            `${API_BASE}/families/${familyId}/game-settings`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            }
          );
          if (gameSettingsResponse.ok) {
            const gameSettings = await gameSettingsResponse.json();
            setKnowledgeQuestEnabled(gameSettings.knowledgeQuestEnabled ?? true);
          }
          
          // Fetch point events for this child
          // Server route is /children/:childId/events (no /families prefix —
          // the previous URL was 404ing, which silently hid the activity log).
          const eventsResponse = await fetch(
            `${API_BASE}/children/${child.id}/events`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            }
          );
          if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json();
            setPointEvents(eventsData || []);
          }
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [child, familyId, accessToken]);

  // Load pending redemption requests
  useEffect(() => {
    if (!child || !accessToken || !familyId) return;

    const loadPendingRequests = async () => {
      try {
        setLoadingRequests(true);
        const response = await fetch(
          `${API_BASE}/families/${familyId}/redemption-requests?status=pending`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );

        if (response.ok) {
          const allRequests = await response.json();
          // Filter to only show this child's requests
          const myRequests = allRequests.filter((req: any) => req.childId === child.id);
          setPendingRequests(myRequests);
        }
      } catch (error) {
        console.error('Failed to load pending requests:', error);
      } finally {
        setLoadingRequests(false);
      }
    };

    loadPendingRequests();
    // Refresh every 30 seconds
    const interval = setInterval(loadPendingRequests, 30000);
    return () => clearInterval(interval);
  }, [child, accessToken, familyId]);

  // v21: Poll the kid's own prayer claims so the "Waiting for Mama/Baba"
  // chip stays accurate without a manual refresh. Same 20s cadence as the
  // events poll. Filters out claims that are already approved/denied.
  useEffect(() => {
    if (!child || !accessToken) return;
    const today = new Date().toISOString().slice(0, 10);
    const refresh = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/prayer-claims/child/${child.id}/date/${today}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const claims = await res.json();
          const stillPending = (Array.isArray(claims) ? claims : [])
            .filter((c: any) => c.status === 'pending');
          setPendingClaims(stillPending);
        }
      } catch (err) {
        // Silent — kid surface should never error-toast on a background poll.
      }
    };
    refresh();
    const interval = setInterval(refresh, 20000);
    return () => clearInterval(interval);
  }, [child, accessToken]);

  // Poll point events so parent approvals (including bonus awards) show up
  // on the kid's dashboard in near-real-time without a manual refresh.
  useEffect(() => {
    if (!child || !accessToken || !familyId) return;
    const refreshEvents = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/children/${child.id}/events`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setPointEvents(data || []);
        }
      } catch (err) {
        // Silent — background refresh shouldn't break the page
        console.error('Event poll failed:', err);
      }
    };
    const interval = setInterval(refreshEvents, 20000); // 20s feels live-ish
    return () => clearInterval(interval);
  }, [child, accessToken, familyId]);

  // Handle reward request submission
  const handleRequestReward = async (rewardId: string, notes?: string) => {
    if (isPreviewingAsKid) {
      toast.info("You're previewing as a kid — actions are disabled 👀");
      return;
    }
    if (!child || !accessToken) {
      toast.error('Please log in first');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/redemption-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          childId: child.id,
          rewardId,
          notes
        })
      });

      if (response.ok) {
        toast.success('Request sent to your parents! 🎉');
        // Reload pending requests
        const loadResponse = await fetch(
          `${API_BASE}/families/${familyId}/redemption-requests?status=pending`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );
        if (loadResponse.ok) {
          const allRequests = await loadResponse.json();
          const myRequests = allRequests.filter((req: any) => req.childId === child.id);
          setPendingRequests(myRequests);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to send request');
      }
    } catch (error) {
      console.error('Failed to submit reward request:', error);
      toast.error('Failed to send request');
    }
  };

  // v15: kid-initiated "I prayed qadha" correction. Voids the missed event +
  // creates a new qadha event (audit trail only, no parent notification).
  const handleQadhaCorrection = async (eventId: string) => {
    if (isPreviewingAsKid) {
      toast.info("You're previewing as a kid — actions are disabled 👀");
      return;
    }
    if (!child || !accessToken) {
      toast.error('Please log in first');
      return;
    }
    if (qadhaSubmittingId) return; // already submitting
    setQadhaSubmittingId(eventId);
    try {
      await applyQadhaCorrection(eventId);
      toast.success("Alhamdulillah — counted as Qadha 🤲");
      // Refresh events so the missed row drops off and the new qadha row appears.
      const res = await fetch(
        `${API_BASE}/children/${child.id}/events`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setPointEvents(data || []);
      }
    } catch (err: any) {
      console.error('Qadha correction failed:', err);
      toast.error(err?.message || "Couldn't apply qadha correction");
    } finally {
      setQadhaSubmittingId(null);
    }
  };

  // Handle recovery submission
  const submitRecovery = async (eventId: string, childId: string, recoveryType: string) => {
    if (isPreviewingAsKid) {
      toast.info("You're previewing as a kid — actions are disabled 👀");
      return;
    }
    if (!accessToken || !familyId) {
      toast.error('Not authorized');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/families/${familyId}/recovery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          eventId,
          childId,
          recoveryType
        })
      });

      if (response.ok) {
        toast.success('Recovery submitted! Great job! 🌟');
        // Reload events (correct route — see fetchData comment above)
        const eventsResponse = await fetch(
          `${API_BASE}/children/${child.id}/events`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );
        if (eventsResponse.ok) {
          const eventsData = await eventsResponse.json();
          setPointEvents(eventsData || []);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to submit recovery');
      }
    } catch (error) {
      console.error('Failed to submit recovery:', error);
      toast.error('Failed to submit recovery');
    }
  };

  // Detect newly-arrived bonus events. When `pointEvents` refreshes, any event
  // flagged `isBonus: true` whose ID we haven't seen yet triggers the
  // celebration banner + confetti once, then is added to the seen set.
  useEffect(() => {
    if (!child) return;
    const myEvents = pointEvents.filter((e) => e.childId === child.id);
    const unseenBonuses = myEvents
      .filter((e) => e.isBonus && !seenBonusIdsRef.current.has(e.id))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (unseenBonuses.length > 0) {
      // Mark all as seen so we don't re-celebrate on next poll
      for (const ev of unseenBonuses) seenBonusIdsRef.current.add(ev.id);
      setStorageSync(BONUS_SEEN_KEY, Array.from(seenBonusIdsRef.current).slice(-200));
      // Celebrate the most recent one
      const latest = unseenBonuses[0];
      setCelebration({
        points: latest.points,
        reason: latest.bonusReason || latest.notes || 'Great job!',
        itemName: latest.itemName || 'Bonus'
      });
    }
  }, [pointEvents, child, BONUS_SEEN_KEY]);

  // Auto-dismiss the celebration banner ~4s after it appears
  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(() => setCelebration(null), 4000);
    return () => clearTimeout(t);
  }, [celebration]);

  // CRITICAL: Early return if no child (AFTER all hooks)
  if (!child) {
    return (
      <div className="flex items-center justify-center h-96 bg-gradient-to-br from-[var(--kid-midnight-blue)] to-[#2C3E50] rounded-[1.5rem] text-white">
        <p>Please select a child to view their adventure! 🌙</p>
      </div>
    );
  }

  // Calculate data
  const nextMilestone = milestones
    .filter((m) => m.points > child.currentPoints)
    .sort((a, b) => a.points - b.points)[0];

  const currentMilestone = milestones
    .filter((m) => m.points <= child.currentPoints)
    .sort((a, b) => b.points - a.points)[0];

  const targetReward = rewards.find((r) => r.id === child.targetRewardId);

  // Get active challenges
  const activeChallenges = challenges.filter(
    (c) => c.status === "available" || c.status === "accepted"
  );

  // Get today's events
  const childEvents = pointEvents.filter((e) => e.childId === child.id);
  const todayEvents = childEvents.filter((e) => {
    const eventDate = new Date(e.timestamp);
    const today = new Date();
    return eventDate.toDateString() === today.toDateString();
  });

  // Recent negative events with recovery options
  const recentNegativeEvents = todayEvents
    .filter((e) => e.points < 0 && !e.recoveryOffered)
    .slice(0, 2);

  // Calculate streaks for trackable items
  const habitStreaks = trackableItems
    .filter((item) => item.type === "habit")
    .map((item) => {
      const streakData = child.streaks?.[item.id];
      return {
        itemId: item.id,
        name: item.name,
        current: streakData?.current || 0,
        longest: streakData?.longest || 0,
      };
    })
    .filter((s) => s.current > 0)
    .sort((a, b) => b.current - a.current);

  // Adventure Map lands (based on milestones)
  const lands = milestones.map((milestone, index) => ({
    id: milestone.id,
    name: milestone.name,
    emoji: getMilestoneEmoji(milestone.name),
    pointsRequired: milestone.points,
    isUnlocked: child.currentPoints >= milestone.points,
    isCurrent:
      currentMilestone?.id === milestone.id ||
      (!currentMilestone && index === 0),
    description: milestone.title || "A land of growth and learning",
  }));

  // Map challenges to quest cards
  const quests = activeChallenges.map((challenge) => {
    const accepted = challenge.status === 'accepted' || challenge.status === 'completed';
    const completed = challenge.status === 'completed';

    // Use challenge progress
    const progress = challenge.progress.current;
    const total = challenge.progress.target;

    return {
      id: challenge.id,
      title: challenge.title,
      description: challenge.description,
      progress,
      total,
      icon: challenge.icon || getChallengeIcon(challenge.type),
      bonusPoints: challenge.bonusPoints,
      isCompleted: completed,
      isLocked: challenge.status === 'available',
    };
  });

  // Get singleton items for daily checklist (Salah)
  const salahItems = trackableItems.filter(
    (item) => item.type === "habit" && item.isSingleton
  );

  // Check which Salah were logged today
  const todaySalahEvents = todayEvents.filter((e) =>
    salahItems.some((s) => s.id === e.trackableItemId)
  );

  const salahProgress = todaySalahEvents.length;
  const salahTotal = salahItems.length;

  return (
    <div className="min-h-screen bg-[var(--kid-soft-cream)] pb-12">
      {/* Bonus celebration — confetti + banner on arrival of new bonus event */}
      <Confetti trigger={celebration !== null} onComplete={() => { /* particles cleared by component */ }} />
      <AnimatePresence>
        {celebration && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] max-w-md w-[92%] px-4"
          >
            <div className="bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 rounded-[1.25rem] shadow-2xl p-5 border-4 border-white">
              <div className="flex items-start gap-3">
                <div className="bg-white rounded-full p-2 shrink-0">
                  <Sparkles className="w-6 h-6 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-lg drop-shadow">
                    Bonus Points! +{celebration.points} ✨
                  </p>
                  <p className="text-white/95 text-sm font-medium mt-0.5 break-words">
                    {celebration.reason}
                  </p>
                </div>
                <button
                  onClick={() => setCelebration(null)}
                  aria-label="Dismiss"
                  className="bg-white/20 hover:bg-white/30 rounded-full w-7 h-7 flex items-center justify-center text-white font-bold shrink-0"
                >
                  ×
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button - Mobile Only */}
      <FloatingActionButton />

      {/* Header Section — Parent Mode / Exit Preview button now lives in
          KidLayout's header, so this hero is just the welcome + points. */}
      <div className="bg-gradient-to-br from-[var(--kid-midnight-blue)] to-[#2C3E50] pt-8 pb-12 px-4 md:px-6 rounded-b-[2rem] shadow-lg mb-8 relative">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-white text-center mb-2">
            Assalamu Alaikum, {child.name}! 🌙
          </h1>
          <p className="text-white/80 text-center mb-6">
            Continue your journey of growth and learning
          </p>

          {/* Points Display */}
          <div className="max-w-md mx-auto">
            <PointsDisplay
              currentPoints={child.currentPoints}
              nextMilestone={
                nextMilestone
                  ? { name: nextMilestone.name, points: nextMilestone.points }
                  : undefined
              }
              currentTitle={currentMilestone?.name || "Explorer"}
            />
          </div>

          {/* v21: Pending prayer claims chip. After a kid taps "I Prayed",
              the points don't move until a parent approves — the chip
              tells the kid the app saw it and someone is on the way.
              Words use a kid-friendly role label instead of names. */}
          {pendingClaims.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="max-w-md mx-auto mt-4"
            >
              <div className="bg-amber-100/95 border-2 border-amber-300 rounded-2xl px-4 py-3 flex items-start gap-3 shadow-md">
                <Clock className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-bold text-amber-900">
                    {pendingClaims.length === 1
                      ? '⏳ One prayer waiting to be approved'
                      : `⏳ ${pendingClaims.length} prayers waiting to be approved`}
                  </p>
                  <p className="text-amber-800 text-xs mt-0.5">
                    {pendingClaims.map((c: any) => c.prayerName).join(', ')}
                    {' '}— your grown-up will say nice prayer soon, then you'll get your stars!
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 space-y-8">
        {/* v25: Reading-level adaptive surface. Same KidDashboard for
            4–6, 7–9, 10–12. Pre-readers see fewer tiles, bigger type. */}
        {(() => {
          const level: 'pre-reader' | 'reader' | 'older' = (child as any).readingLevel || 'reader';
          const isPreReader = level === 'pre-reader';
          const tiles: { label: string; emoji?: string; icon?: any; gradient: string; route: string; iconClass?: string }[] = [
            { label: 'Prayers', emoji: '🕌', gradient: 'from-blue-500 to-blue-700', route: '/kid/prayers' },
            { label: 'Quests', emoji: '⚔️', gradient: 'from-purple-500 to-purple-700', route: '/kid/challenges' },
            { label: 'Give Sadqa', icon: Heart, gradient: 'from-green-500 to-green-700', route: '/kid/sadqa', iconClass: 'fill-white' },
            { label: 'My Wishlist', icon: Gift, gradient: 'from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)]', route: '/kid/wishlist' },
            ...(isPreReader ? [] : [
              { label: 'My Badges', icon: Award, gradient: 'from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)]', route: '/kid/titles-badges' },
              { label: 'Adventure World', emoji: '🗺️', gradient: 'from-purple-600 to-pink-600', route: '/kid/adventure-world' },
            ]),
          ];
          const gridCls = isPreReader ? 'grid grid-cols-2 gap-5' : 'grid grid-cols-2 gap-4 md:grid-cols-4';
          const tileCls = isPreReader
            ? 'rounded-2xl p-6 text-white shadow-lg active:scale-95 transition-transform'
            : 'rounded-[1rem] p-4 text-white shadow-lg hover:shadow-xl transition-all hover:scale-105';
          const labelCls = isPreReader ? 'text-base font-bold' : 'text-sm font-semibold';
          const iconCls = isPreReader ? 'w-10 h-10 mx-auto mb-2' : 'w-8 h-8 mx-auto mb-2';
          const emojiCls = isPreReader ? 'text-4xl block mb-1' : 'text-3xl block mb-1';
          return (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={gridCls}>
              {tiles.map(t => (
                <button key={t.label} onClick={() => navigate(t.route)} className={`bg-gradient-to-br ${t.gradient} ${tileCls}`}>
                  {t.icon ? <t.icon className={`${iconCls} ${t.iconClass || ''}`.trim()} /> : <span className={emojiCls}>{t.emoji}</span>}
                  <p className={labelCls}>{t.label}</p>
                </button>
              ))}
            </motion.div>
          );
        })()}

        {/* v25: Streaks → Garden for pre-readers. Streak counts are
            anxiety, not motivation, for a 5-year-old. We render a
            persistent garden metaphor — every consecutive day plants a
            flower; missing one fades into a sprout but the garden never
            resets to bare ground. Older kids keep the streak counter. */}
        {habitStreaks.length > 0 && ((child as any).readingLevel === 'pre-reader' ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-4 flex items-center gap-2">
              🌱 Your Garden
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {habitStreaks.map((streak) => {
                const flowers = Math.min(streak.current, 14);
                const empties = Math.max(0, 14 - flowers);
                return (
                  <div key={streak.itemId} className="bg-gradient-to-br from-emerald-50 to-green-100 rounded-2xl p-4 border-2 border-emerald-200 shadow-md">
                    <div className="font-bold text-emerald-900 mb-2">{streak.name}</div>
                    <div className="text-2xl leading-none flex flex-wrap gap-1">
                      {Array.from({ length: flowers }).map((_, i) => <span key={`f-${i}`} aria-hidden>🌸</span>)}
                      {Array.from({ length: empties }).map((_, i) => <span key={`e-${i}`} className="opacity-30" aria-hidden>🌱</span>)}
                    </div>
                    <div className="mt-2 text-xs text-emerald-800">
                      {streak.current === 0
                        ? 'Plant your first flower today!'
                        : `Your garden has ${streak.current} flower${streak.current === 1 ? '' : 's'} so far!`}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-4 flex items-center gap-2">
              <Flame className="w-6 h-6 text-orange-500" />
              Your Streaks 🔥
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {habitStreaks.map((streak) => (
                <motion.div
                  key={streak.itemId}
                  whileHover={{ scale: 1.02 }}
                  className="bg-gradient-to-br from-orange-50 to-red-50 rounded-[1rem] p-4 border-2 border-orange-200 shadow-md"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-800">
                      {streak.name}
                    </span>
                    <Flame className="w-5 h-5 text-orange-500" />
                  </div>
                  <div className="text-3xl font-bold text-orange-600">
                    {streak.current} days
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Best: {streak.longest} days
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}

        {/* Today's Prayer Quest */}
        {salahItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-4">
              Today's Prayers 🕌
            </h2>
            <QuestCard
              title="Prayer Warrior"
              description="Light all 5 lanterns by praying today!"
              progress={salahProgress}
              total={salahTotal}
              icon="🕌"
              bonusPoints={salahProgress === salahTotal ? 10 : 0}
              isCompleted={salahProgress === salahTotal}
            />
          </motion.div>
        )}

        {/* Adventure Map */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-[1.5rem] p-6 shadow-lg"
        >
          <AdventureMap lands={lands} currentPoints={child.currentPoints} />
        </motion.div>

        {/* Active Quests/Challenges */}
        {quests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-4">
              Your Quests ⚔️
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {quests.slice(0, 6).map((quest) => (
                <QuestCard key={quest.id} {...quest} />
              ))}
            </div>
          </motion.div>
        )}

        {/* How You Can Earn Points — transparency widget.
            Kids asked for visibility into *which* behaviors their parent can
            reward. We render the configured Trackable Items grouped by type
            (Salah / Habits / Positive / Negative) with their point values so
            the kid can see exactly what's on the menu. Pulled straight from
            the same /trackable-items endpoint the parent writes to. */}
        {trackableItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.44 }}
            className="bg-white rounded-[1.5rem] p-6 shadow-lg"
          >
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-1 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-500" />
              How You Can Earn Points 🎯
            </h2>
            <p className="text-sm text-[var(--kid-midnight-blue)]/70 mb-4">
              Here's what your parent is watching for. Ask them to log any of
              these!
            </p>

            {(() => {
              // Small inline grouping — keeps the JSX readable without
              // pulling out a new component file.
              const salah = trackableItems.filter(
                (i: any) => (i.category || '').toLowerCase() === 'salah'
              );
              const habits = trackableItems.filter(
                (i: any) => (i.category || '').toLowerCase() === 'habit'
              );
              const behaviors = trackableItems.filter(
                (i: any) => (i.category || '').toLowerCase() === 'behavior'
              );
              const positive = behaviors.filter((i: any) => (i.points ?? 0) >= 0);
              const negative = behaviors.filter((i: any) => (i.points ?? 0) < 0);

              const Group = ({
                title,
                emoji,
                items,
                tone,
              }: {
                title: string;
                emoji: string;
                items: any[];
                tone: 'blue' | 'green' | 'purple' | 'red';
              }) => {
                if (items.length === 0) return null;
                const toneBg = {
                  blue: 'from-blue-50 to-cyan-50 border-blue-200',
                  green: 'from-green-50 to-emerald-50 border-green-200',
                  purple: 'from-purple-50 to-pink-50 border-purple-200',
                  red: 'from-red-50 to-rose-50 border-red-200',
                }[tone];
                const chipTone = {
                  blue: 'bg-blue-500',
                  green: 'bg-green-500',
                  purple: 'bg-purple-500',
                  red: 'bg-red-500',
                }[tone];
                return (
                  <div className={`rounded-xl border-2 p-4 bg-gradient-to-br ${toneBg}`}>
                    <div className="font-bold text-[var(--kid-midnight-blue)] mb-3 flex items-center gap-2">
                      <span className="text-xl">{emoji}</span>
                      {title}
                      <span className="text-xs font-normal text-[var(--kid-midnight-blue)]/60">
                        ({items.length})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {items.map((item: any) => (
                        <div
                          key={item.id}
                          className="inline-flex items-center gap-2 bg-white rounded-full pl-3 pr-1 py-1 shadow-sm border border-black/5"
                        >
                          <span className="text-sm font-medium text-[var(--kid-midnight-blue)]">
                            {item.name}
                          </span>
                          <span
                            className={`text-xs font-bold text-white ${chipTone} rounded-full px-2 py-0.5`}
                          >
                            {(item.points ?? 0) > 0 ? '+' : ''}
                            {item.points ?? 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              };

              return (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Group title="Salah" emoji="🕌" items={salah} tone="blue" />
                  <Group title="Habits" emoji="🌱" items={habits} tone="green" />
                  <Group title="Positive" emoji="✨" items={positive} tone="purple" />
                  <Group title="Needs Work" emoji="⚠️" items={negative} tone="red" />
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* Recent Activity Log - How did I earn points? */}
        {childEvents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.48 }}
            className="bg-white rounded-[1.5rem] p-6 shadow-lg"
          >
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-4 flex items-center gap-2">
              <Clock className="w-6 h-6 text-blue-500" />
              How You Earned Points 📊
            </h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {childEvents
                .slice(0, 15) // Show last 15 events
                .reverse() // Most recent first
                .map((event, index) => {
                  const item = trackableItems.find(i => i.id === event.trackableItemId);
                  const isPositive = event.points > 0;
                  const isBonus = !!event.isBonus;
                  const timeAgo = getTimeAgo(event.timestamp);

                  // Prefer the server-sent itemName for bonus + prayer events
                  // (item lookup won't resolve 'prayer' / 'prayer_bonus' pseudo-IDs).
                  const displayName = item?.name || event.itemName || 'Activity';

                  // v15: kid-initiated qadha correction — only show on:
                  //   - missed Salah events (salahState === 'missed', or older
                  //     events with notes tagged '[Missed]')
                  //   - that aren't already voided / corrected
                  const isSalahItem =
                    item && (item.category || '').toLowerCase() === 'salah';
                  const isMissedSalah =
                    !event.voided &&
                    !event.correctionOf &&
                    isSalahItem &&
                    (event.salahState === 'missed' ||
                      (typeof event.notes === 'string' && event.notes.includes('[Missed]')));
                  const qadhaInFlight = qadhaSubmittingId === event.id;

                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className={`p-3 rounded-xl border-2 ${
                        isBonus
                          ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-300 shadow-[0_0_0_2px_rgba(251,191,36,0.15)]'
                          : isPositive
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {isBonus ? (
                            <div className="bg-amber-400 rounded-full p-1.5 shrink-0">
                              <Sparkles className="w-4 h-4 text-white" />
                            </div>
                          ) : isPositive ? (
                            <TrendingUp className="w-5 h-5 text-green-600 shrink-0" />
                          ) : (
                            <TrendingDown className="w-5 h-5 text-red-600 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 flex items-center gap-1.5 flex-wrap">
                              <span className="truncate">{displayName}</span>
                              {isBonus && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide bg-amber-400 text-white px-1.5 py-0.5 rounded">
                                  <Star className="w-2.5 h-2.5 fill-white" /> Bonus
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">{timeAgo}</p>
                            {(event.bonusReason || event.notes) && (
                              <p className={`text-xs italic mt-1 break-words ${isBonus ? 'text-amber-700 font-medium' : 'text-gray-600'}`}>
                                "{event.bonusReason || event.notes}"
                              </p>
                            )}
                          </div>
                        </div>
                        <div className={`text-lg font-bold shrink-0 ml-2 ${
                          isBonus
                            ? 'text-amber-600'
                            : isPositive ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {isPositive ? '+' : ''}{event.points}
                        </div>
                      </div>

                      {isMissedSalah && (
                        <div className="mt-3 pt-3 border-t border-red-200/70 flex items-center justify-between gap-3">
                          <p className="text-xs text-red-800">
                            Missed this prayer? You can still make it up.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={qadhaInFlight || isPreviewingAsKid}
                            onClick={() => handleQadhaCorrection(event.id)}
                            className="bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50 shrink-0"
                          >
                            {qadhaInFlight ? "Saving…" : "🤲 I prayed Qadha"}
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
            </div>
            {childEvents.length === 0 && (
              <p className="text-center text-gray-500 py-8">
                No activity yet. Start your journey! 🌟
              </p>
            )}
          </motion.div>
        )}

        {/* Available Rewards to Request */}
        {rewards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] flex items-center gap-2">
                <Gift className="w-6 h-6 text-[var(--kid-warm-gold)]" />
                Ask for Rewards 🎁
              </h2>
              <button
                onClick={() => navigate('/kid/rewards')}
                className="text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 rounded-full hover:shadow-lg transition-all flex items-center gap-2"
              >
                <Gift className="w-4 h-4" />
                See All Rewards
              </button>
            </div>
            <p className="text-gray-600 mb-4 text-sm">
              You have enough points to ask for these rewards! Click to send a request to your parents. ✨
            </p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rewards
                .filter(r => child.currentPoints >= r.pointCost * 0.5) // Show rewards they're at least 50% to affording
                .slice(0, 6)
                .map((reward) => {
                  const isPending = pendingRequests.some(req => req.rewardId === reward.id);
                  return (
                    <RewardRequestCard
                      key={reward.id}
                      rewardId={reward.id}
                      rewardName={reward.name}
                      rewardDescription={reward.description}
                      pointCost={reward.pointCost}
                      currentPoints={child.currentPoints}
                      isPending={isPending}
                      onRequestSubmit={handleRequestReward}
                    />
                  );
                })}
            </div>
          </motion.div>
        )}

        {/* Target Reward - Mosque Build */}
        {targetReward && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-4">
              Building Your Reward 🏗️
            </h2>
            <MosqueBuild
              currentContribution={child.currentPoints}
              targetAmount={targetReward.pointCost}
              rewardName={targetReward.name}
            />
          </motion.div>
        )}

        {/* Gentle Corrections (Recent Negative Events) */}
        {recentNegativeEvents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-4">
              Opportunities to Grow 🌱
            </h2>
            <div className="space-y-4">
              {recentNegativeEvents.map((event) => (
                <GentleCorrection
                  key={event.id}
                  behavior={
                    trackableItems.find((i) => i.id === event.trackableItemId)
                      ?.name || "Behavior"
                  }
                  points={event.points}
                  recoveryOptions={{
                    apology: true,
                    reflection: true,
                    correction: true,
                  }}
                  onRecover={async (type) => {
                    await submitRecovery(event.id, child.id, type);
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Pending Reward Requests */}
        {pendingRequests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-4">
              Pending Rewards 🎁
            </h2>
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <RewardRequestCard key={request.id} {...request} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Encouragement Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center py-8"
        >
          <p className="text-lg text-gray-600 italic">
            "Every good deed is a step closer to Jannah. Keep going!" 🌟
          </p>
        </motion.div>
      </div>
    </div>
  );
}

// Helper functions
function getMilestoneEmoji(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("makkah") || lowerName.includes("mecca"))
    return "🕋";
  if (lowerName.includes("madinah") || lowerName.includes("medina"))
    return "🕌";
  if (lowerName.includes("sinai") || lowerName.includes("mount"))
    return "⛰️";
  if (lowerName.includes("jerusalem") || lowerName.includes("aqsa"))
    return "🌙";
  if (lowerName.includes("scholar")) return "📚";
  if (lowerName.includes("guardian")) return "🛡️";
  if (lowerName.includes("star")) return "⭐";
  return "🗺️";
}

function getChallengeIcon(type: string): string {
  if (type === 'daily') return "⚔️";
  if (type === 'weekly') return "🏆";
  return "⭐";
}

function getTimeAgo(timestamp: string): string {
  const now = new Date();
  const eventTime = new Date(timestamp);
  const diff = now.getTime() - eventTime.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
  }
}
