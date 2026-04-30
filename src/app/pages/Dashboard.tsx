import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Button } from "../components/ui/button";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useTrackableItems } from "../hooks/useTrackableItems";
import { useMilestones } from "../hooks/useMilestones";
import { useRewards } from "../hooks/useRewards";
import { useAuth } from "../contexts/AuthContext";
import { logPointEvent, voidEvent } from "../../utils/api";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Link } from "react-router";
import { motion } from "motion/react";
import { RecoveryDialog } from "../components/RecoveryDialog";
import { PrayerApprovalsWidget } from "../components/PrayerApprovalsWidget";
import { WishlistWidget } from "../components/WishlistWidget";
import { GettingStartedCard } from "../components/GettingStartedCard";
import { PointEvent } from "../data/mockData";
import { 
  Award, 
  Calendar, 
  Flame, 
  TrendingUp, 
  Trophy, 
  Gift, 
  Heart,
  Settings,
  FileText,
  ArrowRight,
  Brain
} from "lucide-react";

export function Dashboard() {
  const { getCurrentChild, getChildEvents, children, isLoading: familyLoading } = useFamilyContext();
  const { items: trackableItems } = useTrackableItems();
  const { milestones } = useMilestones();
  const { rewards } = useRewards();
  const { isParentMode, user } = useAuth();
  const child = getCurrentChild();

  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [selectedNegativeEvent, setSelectedNegativeEvent] = useState<PointEvent | null>(null);
  const [pointEvents, setPointEvents] = useState<PointEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // v20: Recent Activity is now expandable. We show 5 by default and
  // reveal +10 each time the parent taps "Load more". `voidTarget`
  // drives the inline void confirmation dialog used to clean up
  // duplicates or wrong entries directly from the dashboard.
  // v25: parents can opt to surface voided events struck-through
  // (instead of having them disappear) so the audit trail reads
  // honestly. Off by default — most-of-the-time the parent wants the
  // active feed.
  const [showVoided, setShowVoided] = useState(false);
  const [activityVisible, setActivityVisible] = useState(5);
  const [voidTarget, setVoidTarget] = useState<{ event: PointEvent; itemName: string } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  // v25: refetch when showVoided toggles so the activity feed actually
  // reflects the choice. Calling getChildEvents with includeVoided=true
  // hits the new ?include_voided=true backend flag.
  useEffect(() => {
    if (child?.id) {
      setLoadingEvents(true);
      getChildEvents(child.id, { includeVoided: showVoided })
        .then(events => setPointEvents(events || []))
        .catch(err => {
          console.error('Error loading events:', err);
          setPointEvents([]);
        })
        .finally(() => setLoadingEvents(false));
    } else {
      setPointEvents([]);
    }
  }, [child?.id, getChildEvents, showVoided]);

  // Point values awarded for each recovery action. Must match RecoveryDialog.tsx.
  const RECOVERY_POINTS: Record<'apology' | 'reflection' | 'correction', number> = {
    apology: 2,
    reflection: 3,
    correction: 5,
  };

  const submitRecovery = async (
    eventId: string,
    recoveryAction: 'apology' | 'reflection' | 'correction',
    recoveryNotes: string,
  ) => {
    if (!child?.id) {
      throw new Error('No child selected');
    }
    const originalEvent = pointEvents.find(e => e.id === eventId);
    if (!originalEvent) {
      throw new Error('Original negative event not found');
    }

    // Recovery is modelled as a positive point event with isRecovery=true.
    // The backend (supabase/functions/server/index.tsx) skips daily-cap and
    // singleton/dedupe checks when isRecovery is true.
    await logPointEvent({
      childId: child.id,
      trackableItemId: originalEvent.trackableItemId,
      points: RECOVERY_POINTS[recoveryAction],
      loggedBy: user?.name || user?.id || child.name,
      isRecovery: true,
      recoveryFromEventId: eventId,
      recoveryAction,
      recoveryNotes,
      notes: `Recovery (${recoveryAction}): ${recoveryNotes}`,
      timestamp: new Date().toISOString(),
    });

    // Reload events so the new recovery entry shows in the timeline
    const events = await getChildEvents(child.id, { includeVoided: showVoided });
    setPointEvents(events || []);
  };

  // Show loading state while family data is loading
  if (familyLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-muted-foreground">Loading family data...</p>
        </div>
      </div>
    );
  }

  if (!child) {
    return (
      <div className="space-y-6">
        {isParentMode && <GettingStartedCard />}
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="text-4xl mb-2">👨‍👩‍👧‍👦</div>
              <div>
                <h3 className="font-semibold text-lg mb-2">Select a Child</h3>
                <p className="text-muted-foreground">
                  {children.length === 0
                    ? "No children found. Please add a child in Settings."
                    : "Please select a child from the dropdown to view their dashboard."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const childEvents = pointEvents.filter(e => e.childId === child.id);

  // v20: Resolve a stable display name for an event. Order of preference:
  //   1. event.itemName    — snapshot at write time (set in v20+ writes
  //                          and by all prayer-claim approvals)
  //   2. trackableItems    — current catalog lookup (works unless the
  //                          item was renamed / smart-deleted)
  //   3. notes parse       — old salah events sometimes carry the prayer
  //                          name only inside notes ("Prayer: Asr - On Time")
  //   4. category fallback — say "Salah" / "Adjustment" / "Recovery Bonus"
  //                          before falling back to "Unknown"
  const resolveItemName = (event: any): string => {
    if (event.itemName) return event.itemName;
    const item = trackableItems.find(i => i.id === event.trackableItemId);
    if (item?.name) return item.name;
    if (typeof event.notes === 'string') {
      const m = event.notes.match(/Prayer:\s*([A-Za-z]+)/i);
      if (m) return `Prayer: ${m[1]}`;
    }
    if (event.isAdjustment) return 'Adjustment';
    if (event.isRecovery) return 'Recovery Bonus';
    if (event.type === 'habit') return 'Habit';
    if (event.type === 'behavior') return 'Behavior';
    return 'Unknown';
  };

  // v20: Collapse near-duplicate rows for display only (the underlying
  // events are still in the database). Two events are treated as
  // duplicates if they share childId, trackableItemId (or itemName when
  // the trackable id has shifted), points, and notes, AND were logged
  // within 5 seconds of each other. The kept row carries the dupCount
  // and the IDs of the collapsed siblings so the parent can void them
  // in one go from the row's "..." menu. This is purely a render-side
  // safety net for events that already exist; v19 prevents new ones.
  type ActivityRow = { event: PointEvent; dupCount: number; dupIds: string[]; itemName: string };
  const dedupedActivity: ActivityRow[] = (() => {
    const out: ActivityRow[] = [];
    for (const e of childEvents) {
      const itemName = resolveItemName(e);
      const eTime = new Date(e.timestamp).getTime();
      const last = out[out.length - 1];
      if (
        last &&
        last.event.childId === e.childId &&
        last.event.points === e.points &&
        (last.event.notes || '') === (e.notes || '') &&
        (last.event.trackableItemId === e.trackableItemId || last.itemName === itemName) &&
        Math.abs(new Date(last.event.timestamp).getTime() - eTime) <= 5000
      ) {
        last.dupCount += 1;
        last.dupIds.push(e.id);
      } else {
        out.push({ event: e, dupCount: 0, dupIds: [], itemName });
      }
    }
    return out;
  })();

  const recentEvents = dedupedActivity.slice(0, activityVisible);
  const hasMoreActivity = dedupedActivity.length > activityVisible;

  // v21: Group visible activity rows by date for legibility. Today /
  // Yesterday / weekday name / full date — much easier to skim than
  // 30+ rows each carrying a full ISO timestamp.
  const groupActivityByDate = (rows: ActivityRow[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const weekAgo = today - 6 * 86400000;
    const labelFor = (ts: string) => {
      const d = new Date(ts);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (dayStart === today) return 'Today';
      if (dayStart === yesterday) return 'Yesterday';
      if (dayStart >= weekAgo) {
        return d.toLocaleDateString(undefined, { weekday: 'long' });
      }
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: dayStart < new Date(now.getFullYear(), 0, 1).getTime() ? 'numeric' : undefined });
    };
    const groups: { label: string; rows: ActivityRow[] }[] = [];
    for (const r of rows) {
      const lbl = labelFor(r.event.timestamp);
      const last = groups[groups.length - 1];
      if (last && last.label === lbl) last.rows.push(r);
      else groups.push({ label: lbl, rows: [r] });
    }
    return groups;
  };
  const activityGroups = groupActivityByDate(recentEvents);

  const handleVoid = async () => {
    if (!voidTarget) return;
    if (voidReason.trim().length < 10) {
      toast.error('Please give a reason of at least 10 characters.');
      return;
    }
    setVoiding(true);
    try {
      // Void the displayed event, then void any collapsed duplicate
      // siblings so the parent can clean up "Tantrum × 3" with one
      // confirmation. Backend is idempotent so re-runs are safe.
      const targetRow = dedupedActivity.find(r => r.event.id === voidTarget.event.id);
      const idsToVoid = [voidTarget.event.id, ...(targetRow?.dupIds || [])];
      for (const id of idsToVoid) {
        await voidEvent(id, voidReason.trim());
      }
      toast.success(idsToVoid.length > 1
        ? `Voided ${idsToVoid.length} entries.`
        : 'Entry voided.'
      );
      setVoidTarget(null);
      setVoidReason('');
      // Reload events so the row disappears (and points reverse).
      const events = await getChildEvents(child.id);
      setPointEvents(events || []);
    } catch (err: any) {
      console.error('Void failed:', err);
      toast.error(err?.message || 'Could not void this entry.');
    } finally {
      setVoiding(false);
    }
  };


  const todayEvents = childEvents.filter(e => {
    const eventDate = new Date(e.timestamp);
    const today = new Date();
    return eventDate.toDateString() === today.toDateString();
  });

  const todayPositive = todayEvents.filter(e => e.points > 0).reduce((sum, e) => sum + e.points, 0);
  const todayNegative = todayEvents.filter(e => e.points < 0).reduce((sum, e) => sum + e.points, 0);
  const todayNet = todayPositive + todayNegative; // net change today (negative if penalties outweigh gains)

  // Calculate this week's events for ratio
  const weekEvents = childEvents.filter(e => {
    const eventDate = new Date(e.timestamp);
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    return eventDate >= weekAgo;
  });

  const weekPositive = weekEvents.filter(e => e.points > 0).length;
  const weekNegative = weekEvents.filter(e => e.points < 0).length;
  const weekRatio = weekNegative > 0 ? (weekPositive / weekNegative).toFixed(1) : weekPositive;

  const nextMilestone = milestones.find(m => m.points > child.currentPoints);
  const progressToNext = nextMilestone 
    ? ((child.currentPoints / nextMilestone.points) * 100)
    : 100;

  const targetReward = rewards.find(r => r.id === child.targetRewardId);
  const progressToReward = targetReward
    ? ((child.currentPoints / targetReward.pointCost) * 100)
    : 0;

  // Calculate streak for Fajr (example) - using backend streak data
  const fajrItem = trackableItems.find(i => i.name === 'Fajr');
  const fajrStreak = child.currentStreak?.[fajrItem?.id || ''] || 0;
  const fajrLongestStreak = child.longestStreak?.[fajrItem?.id || ''] || 0;

  // Child-friendly mode
  const isChildView = !isParentMode;

  return (
    <div className="space-y-6">
      {/* Getting Started checklist (parents only, dismissible, hides when complete) */}
      {isParentMode && <GettingStartedCard />}

      {/* v20: Prayer Approvals hoisted to the TOP of the parent dashboard so
          pending kid prayer claims are the first thing a parent sees. The
          widget renders null when there are zero pending claims (no
          empty-state clutter). When approvals are present this card is
          impossible to miss above the stats grid. */}
      {isParentMode && <PrayerApprovalsWidget priority />}

      {/* Child-Friendly Hero Section */}
      {isChildView && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-8 text-white shadow-2xl"
        >
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20" />
          <div className="relative z-10">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="inline-block"
            >
              <h1 className="text-4xl md:text-5xl font-bold mb-2">
                🎮 Welcome, {child.name}! 🌟
              </h1>
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-xl md:text-2xl opacity-90 mb-6"
            >
              You're doing amazing! Keep up the great work! 🚀
            </motion.p>
            <div className="flex flex-wrap gap-4">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link to="/rewards">
                  <Button size="lg" className="bg-purple-400 text-white hover:bg-purple-300 shadow-lg font-bold text-lg">
                    <Gift className="mr-2 h-5 w-5" />
                    🎁 View Rewards
                  </Button>
                </Link>
              </motion.div>
            </div>
          </div>
          {/* Floating decorations */}
          <motion.div
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute top-10 right-10 text-6xl"
          >
            ⭐
          </motion.div>
          <motion.div
            animate={{ y: [0, 20, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute bottom-10 left-20 text-5xl"
          >
            🎯
          </motion.div>
        </motion.div>
      )}

      {/* Header Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: isChildView ? 0.6 : 0 }}
        >
          <Card className={isChildView ? "bg-gradient-to-br from-yellow-100 to-yellow-200 border-yellow-300 shadow-lg" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={isChildView ? "text-yellow-900" : ""}>
                {isChildView ? "🏆 My Points" : "Total Points"}
              </CardTitle>
              <Award className={`h-4 w-4 ${isChildView ? "text-yellow-600" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${isChildView ? "text-yellow-900" : ""}`}>
                {isChildView ? `⭐ ${child.currentPoints}` : child.currentPoints}
              </div>
              <p className={`text-xs ${isChildView ? "text-yellow-700" : "text-muted-foreground"}`}>
                {isChildView ? `🎯 Best: ${child.highestMilestone || 0}` : `Highest: ${child.highestMilestone || 0}`}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: isChildView ? 0.7 : 0 }}
        >
          <Card className={isChildView ? "bg-gradient-to-br from-green-100 to-green-200 border-green-300 shadow-lg" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={isChildView ? "text-green-900" : ""}>
                {isChildView ? "📅 Today's Score" : "Today"}
              </CardTitle>
              <Calendar className={`h-4 w-4 ${isChildView ? "text-green-600" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${
                isChildView
                  ? "text-green-700"
                  : todayNet > 0
                    ? "text-green-600"
                    : todayNet < 0
                      ? "text-red-600"
                      : "text-muted-foreground"
              }`}>
                {isChildView
                  ? `🌟 +${todayPositive}`
                  : todayNet > 0
                    ? `+${todayNet}`
                    : `${todayNet}`}
              </div>
              <p className={`text-xs ${isChildView ? "text-green-700" : "text-muted-foreground"}`}>
                {isChildView
                  ? (todayNegative < 0 ? `⚠️ ${todayNegative}` : "✨ Perfect day!")
                  : (todayPositive === 0 && todayNegative === 0
                      ? "No activity yet"
                      : `+${todayPositive} earned${todayNegative < 0 ? ` · ${todayNegative} deducted` : ''}`)}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: isChildView ? 0.8 : 0 }}
        >
          <Card className={isChildView ? "bg-gradient-to-br from-orange-100 to-red-200 border-orange-300 shadow-lg" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={`flex items-center gap-1 ${isChildView ? "text-orange-900" : ""}`}>
                <Flame className={`h-4 w-4 ${isChildView ? "text-orange-600" : "text-orange-500"}`} />
                {isChildView ? "🔥 Fajr Streak" : "Fajr Streak"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${isChildView ? "text-orange-900" : ""}`}>
                {isChildView ? `${fajrStreak} 🎯` : `${fajrStreak} days`}
              </div>
              <p className={`text-xs ${isChildView ? "text-orange-700" : "text-muted-foreground"}`}>
                {isChildView ? `👑 Record: ${fajrLongestStreak} days` : `Best: ${fajrLongestStreak} days`}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: isChildView ? 0.9 : 0 }}
        >
          <Card className={isChildView ? "bg-gradient-to-br from-blue-100 to-purple-200 border-blue-300 shadow-lg" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={isChildView ? "text-blue-900" : ""}>
                {isChildView ? "📊 This Week" : "Weekly Ratio"}
              </CardTitle>
              <TrendingUp className={`h-4 w-4 ${isChildView ? "text-blue-600" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              {isChildView ? (
                // Kid-friendly visual representation instead of ratio
                <div className="space-y-3">
                  {weekPositive > 0 && (
                    <div>
                      <p className="text-xs font-medium text-blue-700 mb-1">😊 Good Choices:</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {Array.from({ length: Math.min(10, weekPositive) }).map((_, i) => (
                          <span key={`good-${i}`} className="text-2xl">⭐</span>
                        ))}
                        {weekPositive > 10 && (
                          <span className="text-sm font-bold text-blue-700 ml-1">+{weekPositive - 10} more!</span>
                        )}
                      </div>
                    </div>
                  )}
                  {weekNegative > 0 && (
                    <div>
                      <p className="text-xs font-medium text-orange-700 mb-1">😐 Oops Moments:</p>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, weekNegative) }).map((_, i) => (
                          <span key={`bad-${i}`} className="text-lg opacity-70">⚠️</span>
                        ))}
                        {weekNegative > 5 && (
                          <span className="text-xs font-medium text-orange-700 ml-1">+{weekNegative - 5}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {weekPositive === 0 && weekNegative === 0 ? (
                    <p className="text-sm font-bold text-blue-800 text-center">
                      🌟 Let's make this week awesome!
                    </p>
                  ) : weekNegative === 0 ? (
                    <p className="text-sm font-bold text-green-800 text-center bg-green-50 rounded-lg py-2 px-3 border border-green-200">
                      🎉 Perfect week! All stars! ✨
                    </p>
                  ) : weekPositive > weekNegative * 2 ? (
                    <p className="text-sm font-bold text-blue-800 text-center">
                      💪 Way more good than oops!
                    </p>
                  ) : weekPositive > weekNegative ? (
                    <p className="text-sm font-bold text-blue-700 text-center">
                      👍 More good than oops!
                    </p>
                  ) : (
                    <p className="text-sm font-bold text-orange-700 text-center">
                      🌈 Keep trying! You can do it!
                    </p>
                  )}
                </div>
              ) : (
                // Parent view: Keep the ratio
                <>
                  <div className="text-2xl font-bold">{weekRatio}:1</div>
                  <p className="text-xs text-muted-foreground">Positive to negative</p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Progress Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {nextMilestone && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: isChildView ? 1 : 0 }}
          >
            <Card className={isChildView ? "bg-gradient-to-br from-purple-50 to-pink-100 border-purple-200 shadow-lg" : ""}>
              <CardHeader>
                <CardTitle className={isChildView ? "text-purple-900 flex items-center gap-2" : ""}>
                  {isChildView && <Trophy className="h-5 w-5 text-purple-600" />}
                  {isChildView ? "🎯 Next Goal!" : "Next Milestone"}
                </CardTitle>
                <CardDescription className={isChildView ? "text-purple-700 font-medium" : ""}>
                  {isChildView ? `🏆 ${nextMilestone.name}` : `${nextMilestone.name} - ${nextMilestone.points} points`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Progress 
                    value={progressToNext} 
                    className={isChildView ? "h-4 bg-purple-200" : ""}
                  />
                  <p className={`text-sm ${isChildView ? "text-purple-700 font-semibold text-center" : "text-muted-foreground"}`}>
                    {isChildView 
                      ? `Only ${nextMilestone.points - child.currentPoints} points left! 💪` 
                      : `${nextMilestone.points - child.currentPoints} points to go`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {targetReward && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: isChildView ? 1.1 : 0 }}
          >
            <Card className={isChildView ? "bg-gradient-to-br from-blue-50 to-cyan-100 border-blue-200 shadow-lg" : ""}>
              <CardHeader>
                <CardTitle className={isChildView ? "text-blue-900 flex items-center gap-2" : ""}>
                  {isChildView && <Gift className="h-5 w-5 text-blue-600" />}
                  {isChildView ? "🎁 Saving For..." : "Saving For"}
                </CardTitle>
                <CardDescription className={isChildView ? "text-blue-700 font-medium" : ""}>
                  {isChildView ? `✨ ${targetReward.name}` : `${targetReward.name} - ${targetReward.pointCost} points`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Progress 
                    value={progressToReward} 
                    className={isChildView ? "h-4 bg-blue-200" : "bg-blue-100"} 
                  />
                  <p className={`text-sm ${isChildView ? "text-blue-700 font-semibold text-center" : "text-muted-foreground"}`}>
                    {isChildView 
                      ? `${targetReward.pointCost - child.currentPoints} points until yours! 🎉` 
                      : `${targetReward.pointCost - child.currentPoints} points to go`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{isChildView ? "📜 My Recent Activities" : "Recent Activity"}</CardTitle>
              <CardDescription>{isChildView ? "See what you've been up to!" : "Latest events and behaviors"}</CardDescription>
            </div>
            {/* v25: parent-only "Show voided" toggle. Surfaces previously
                voided events struck-through with their reason on hover —
                that IS the audit signal. Off by default to keep the daily
                feed clean. */}
            {isParentMode && (
              <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={showVoided}
                  onChange={(e) => setShowVoided(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Show voided
              </label>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentEvents.length === 0 ? (
              // v21: empty-state CTA. The previous "No recent activity"
              // line was inert. New parents need to know what comes
              // next — the cheapest place to teach them is here.
              <div className="text-center py-8 space-y-3">
                <div className="text-4xl">📜</div>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  {isChildView
                    ? "Your story will appear here as you log Salah, do good things, and complete quests."
                    : "Nothing logged yet for this child. Start by logging a prayer or behavior."}
                </p>
                {isParentMode && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/log-behavior">Log first event →</Link>
                  </Button>
                )}
              </div>
            ) : (
              // v21: grouped by date (Today / Yesterday / weekday / Mar 12).
              activityGroups.flatMap((group) => [
                <div key={`hdr-${group.label}`} className="flex items-center gap-2 pt-2 first:pt-0">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{group.label}</span>
                  <span className="flex-1 border-t border-gray-100" />
                </div>,
                ...group.rows.map(({ event, dupCount, itemName }) => {
                const hasRecovery = pointEvents.some(e => e.recoveryFromEventId === event.id);
                const canRecover = isChildView && event.points < 0 && !hasRecovery;
                const isVoided = (event as any).status === 'voided';
                const canVoid = isParentMode && !isVoided;
                // v25: voided rows render struck-through with reduced
                // contrast and a tooltip carrying the void reason.
                const rowBase = 'flex items-center justify-between border-b pb-3 last:border-0';
                const rowMod = isVoided
                  ? 'opacity-60'
                  : canRecover
                    ? 'bg-red-50 p-3 rounded-lg border border-red-200'
                    : '';
                const textMod = isVoided ? 'line-through decoration-gray-400' : '';

                return (
                  <div
                    key={event.id}
                    className={`${rowBase} ${rowMod} ${textMod}`.trim()}
                    title={isVoided ? `Voided${(event as any).voidReason ? `: ${(event as any).voidReason}` : ''}` : undefined}
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{itemName}</p>
                        {dupCount > 0 && (
                          <Badge variant="outline" className="text-xs bg-amber-50 border-amber-300 text-amber-800">
                            ×{dupCount + 1} (likely duplicates)
                          </Badge>
                        )}
                        {event.isAdjustment && (
                          <Badge variant="outline" className="text-xs">Adjustment</Badge>
                        )}
                        {event.isRecovery && (
                          <Badge variant="outline" className="text-xs bg-green-50">
                            <Heart className="h-3 w-3 mr-1 inline" />
                            Recovery
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                      {event.notes && (
                        <p className="text-sm italic text-muted-foreground">{event.notes}</p>
                      )}
                      {event.recoveryNotes && (
                        <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                          <p className="text-xs font-semibold text-green-900">Recovery Notes:</p>
                          <p className="text-sm text-green-800 italic">{event.recoveryNotes}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={event.points > 0 ? "default" : "destructive"}
                        className={event.points > 0 ? "bg-green-600" : ""}
                      >
                        {event.points > 0 ? '+' : ''}{event.points}
                      </Badge>
                      {canRecover && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-white border-pink-500 text-pink-700 hover:bg-pink-50 font-semibold"
                          onClick={() => {
                            setSelectedNegativeEvent(event);
                            setRecoveryDialogOpen(true);
                          }}
                        >
                          <Heart className="h-4 w-4 mr-1" />
                          Make It Right
                        </Button>
                      )}
                      {canVoid && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-gray-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setVoidTarget({ event, itemName });
                            setVoidReason(dupCount > 0 ? 'Duplicate entries from a double-tap.' : '');
                          }}
                          aria-label="Void this entry"
                          title={dupCount > 0 ? `Void this and ${dupCount} duplicate(s)` : 'Void this entry'}
                        >
                          {dupCount > 0 ? `Void all ×${dupCount + 1}` : 'Void'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
              ])
            )}

            {/* v20: Load more / show less controls. Also count any
                duplicates that have been collapsed into visible rows so
                the parent knows the actual underlying row count. */}
            {dedupedActivity.length > 5 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Showing {Math.min(activityVisible, dedupedActivity.length)} of {dedupedActivity.length}
                  {(() => {
                    const collapsed = dedupedActivity
                      .slice(0, Math.min(activityVisible, dedupedActivity.length))
                      .reduce((s, r) => s + r.dupCount, 0);
                    return collapsed > 0 ? ` (${collapsed} duplicate${collapsed === 1 ? '' : 's'} hidden)` : '';
                  })()}
                </p>
                <div className="flex gap-2">
                  {hasMoreActivity && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActivityVisible(v => v + 10)}
                    >
                      Load more
                    </Button>
                  )}
                  {activityVisible > 5 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActivityVisible(5)}
                    >
                      Show less
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* v20: Void confirmation dialog. Backend requires a >= 10-char
          reason for the audit trail. The dialog also voids all
          collapsed duplicate siblings of the targeted row so the
          parent does not have to chase each one. */}
      <AlertDialog open={!!voidTarget} onOpenChange={(open) => { if (!open) { setVoidTarget(null); setVoidReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {voidTarget && (() => {
                const row = dedupedActivity.find(r => r.event.id === voidTarget.event.id);
                const total = (row?.dupCount || 0) + 1;
                return total > 1 ? `Void ${total} entries?` : 'Void this entry?';
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {voidTarget && (
                <>
                  <span className="block mb-1">
                    <strong>{voidTarget.itemName}</strong> ({voidTarget.event.points > 0 ? '+' : ''}{voidTarget.event.points}) — {new Date(voidTarget.event.timestamp).toLocaleString()}
                  </span>
                  Voiding reverses the points and writes a void marker into the audit trail. The original entry stays visible with the void reason.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (10+ characters)</label>
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Duplicate from a double-tap; recorded twice by accident."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{voidReason.trim().length} / 10</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voiding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVoid}
              disabled={voiding || voidReason.trim().length < 10}
              className="bg-red-600 hover:bg-red-700"
            >
              {voiding ? 'Voiding…' : 'Void'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recovery Dialog */}
      {child && selectedNegativeEvent && (
        <RecoveryDialog
          open={recoveryDialogOpen}
          onOpenChange={setRecoveryDialogOpen}
          negativeEvent={selectedNegativeEvent}
          childName={child.name}
          itemName={trackableItems.find(i => i.id === selectedNegativeEvent.trackableItemId)?.name || 'Unknown'}
          onSubmitRecovery={async (recoveryAction, notes) => {
            await submitRecovery(selectedNegativeEvent.id, recoveryAction, notes);
          }}
        />
      )}

      {/* v20: Prayer Approvals moved to TOP of dashboard. Removed the
          duplicate render here so parents do not see the same widget
          twice when there are pending claims. */}

      {/* Wishlist Widget (Parents Only) */}
      {isParentMode && <WishlistWidget maxItems={3} />}

      {/* Quick Actions for Parents */}
      <QuickActionsCard />
    </div>
  );
}

function QuickActionsCard() {
  const { isParentMode } = useAuth();

  if (!isParentMode) {
    return null;
  }

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Parent Quick Actions
        </CardTitle>
        <CardDescription>Customize your family's growth system</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid sm:grid-cols-3 gap-3">
          <Link to="/log">
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-white">
              <FileText className="h-6 w-6 text-blue-600" />
              <div className="text-center">
                <p className="font-semibold">Log Behavior</p>
                <p className="text-xs text-muted-foreground">Track habits & behaviors</p>
              </div>
            </Button>
          </Link>

          <Link to="/prayer-approvals">
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-white">
              <span className="text-2xl">🕌</span>
              <div className="text-center">
                <p className="font-semibold">Prayer Approvals</p>
                <p className="text-xs text-muted-foreground">Review prayer claims</p>
              </div>
            </Button>
          </Link>

          <Link to="/wishlist">
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-white">
              <Gift className="h-6 w-6 text-amber-600" />
              <div className="text-center">
                <p className="font-semibold">Kids' Wishlist</p>
                <p className="text-xs text-muted-foreground">Review & create rewards</p>
              </div>
            </Button>
          </Link>

          <Link to="/rewards">
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-white">
              <Gift className="h-6 w-6 text-purple-600" />
              <div className="text-center">
                <p className="font-semibold">View Rewards</p>
                <p className="text-xs text-muted-foreground">Browse & manage rewards</p>
              </div>
            </Button>
          </Link>

          <Link to="/settings">
            <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-white border-blue-300 bg-blue-100">
              <Settings className="h-6 w-6 text-green-600" />
              <div className="text-center">
                <p className="font-semibold">Customize System</p>
                <p className="text-xs text-muted-foreground">Add rewards & behaviors</p>
              </div>
              <ArrowRight className="h-4 w-4 text-green-600" />
            </Button>
          </Link>
        </div>

        <div className="mt-4 p-3 bg-white rounded-lg border">
          <p className="text-sm text-gray-700">
            <strong>💡 Pro Tip:</strong> Visit <Link to="/settings" className="text-blue-600 hover:underline font-semibold">Settings</Link> to add custom rewards, 
            habits, and behaviors tailored to your family's values and goals!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
