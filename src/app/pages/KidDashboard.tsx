import { motion } from "motion/react";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useTrackableItems } from "../hooks/useTrackableItems";
import { useMilestones } from "../hooks/useMilestones";
import { useRewards } from "../hooks/useRewards";
import { useChallenges } from "../hooks/useChallenges";
import { PointsDisplay } from "../components/kid-mode/PointsDisplay";
import { AdventureMap } from "../components/kid-mode/AdventureMap";
import { QuestCard } from "../components/kid-mode/QuestCard";
import { MosqueBuild } from "../components/kid-mode/MosqueBuild";
import { GentleCorrection } from "../components/kid-mode/GentleCorrection";
import { RewardRequestCard } from "../components/kid-mode/RewardRequestCard";
import { Confetti } from "../components/effects/Confetti";
import { FloatingActionButton } from "../components/mobile/FloatingActionButton";
import { useState, useEffect } from "react";
import { Flame, Award, Heart, UserCog, Gift, Sparkles, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { useAuth } from "../contexts/AuthContext";
import { projectId } from "../../../utils/supabase/info";
import { toast } from "sonner";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

export function KidDashboard() {
  const { getCurrentChild, pointEvents, submitRecovery, familyId } = useFamilyContext();
  const { items: trackableItems } = useTrackableItems();
  const { milestones } = useMilestones();
  const { rewards } = useRewards();
  const { challenges } = useChallenges();
  const { accessToken } = useAuth();
  const child = getCurrentChild();
  const navigate = useNavigate();

  // DEBUG: Log what we're getting
  console.log('🎮 KidDashboard render:', {
    hasChild: !!child,
    childId: child?.id,
    childName: child?.name,
    trackableItemsCount: trackableItems.length,
    milestonesCount: milestones.length,
    rewardsCount: rewards.length,
    challengesCount: challenges.length,
    hasAccessToken: !!accessToken
  });
  
  // DEBUG: Check localStorage and FamilyContext state
  console.log('🔍 KidDashboard localStorage check:', {
    kid_id: localStorage.getItem('kid_id'),
    child_id: localStorage.getItem('child_id'),
    user_role: localStorage.getItem('user_role'),
    user_mode: localStorage.getItem('user_mode'),
    family_id: localStorage.getItem('fgs_family_id'),
    session_token: localStorage.getItem('kid_session_token')?.substring(0, 20) + '...'
  });

  // Track pending redemption requests
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

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

  // Handle reward request submission
  const handleRequestReward = async (rewardId: string, notes?: string) => {
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
      {/* Floating Action Button - Mobile Only */}
      <FloatingActionButton />

      {/* Header Section */}
      <div className="bg-gradient-to-br from-[var(--kid-midnight-blue)] to-[#2C3E50] pt-8 pb-12 px-4 md:px-6 rounded-b-[2rem] shadow-lg mb-8 relative">
        {/* Parent Mode Button - Top Right */}
        <div className="absolute top-4 right-4">
          <Button
            onClick={() => {
              // Clear ONLY kid-specific session data, keep family ID
              localStorage.removeItem('child_id');
              localStorage.removeItem('kid_id');
              localStorage.removeItem('kid_access_token');
              localStorage.removeItem('kid_session_token');
              localStorage.removeItem('kid_pin_session');
              // Clear user_role to allow fresh parent login
              localStorage.removeItem('user_role');
              localStorage.removeItem('fgs_user_mode');
              // Navigate to parent login
              navigate('/login');
            }}
            variant="outline"
            size="sm"
            className="bg-white/20 hover:bg-white/30 text-white border-white/40"
          >
            Parent Mode
          </Button>
        </div>

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
        </motion.div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 space-y-8">
        {/* Quick Access Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 gap-4 md:grid-cols-4"
        >
          <button
            onClick={() => navigate('/titles-badges')}
            className="bg-gradient-to-br from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)] rounded-[1rem] p-4 text-white shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <Award className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm font-semibold">My Badges</p>
          </button>

          <button
            onClick={() => navigate('/sadqa')}
            className="bg-gradient-to-br from-green-500 to-green-700 rounded-[1rem] p-4 text-white shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <Heart className="w-8 h-8 mx-auto mb-2 fill-white" />
            <p className="text-sm font-semibold">Give Sadqa</p>
          </button>

          <button
            onClick={() => navigate('/challenges')}
            className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-[1rem] p-4 text-white shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <span className="text-3xl block mb-1">⚔️</span>
            <p className="text-sm font-semibold">Quests</p>
          </button>

          <button
            onClick={() => navigate('/kid/prayers')}
            className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-[1rem] p-4 text-white shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <span className="text-3xl block mb-1">🕌</span>
            <p className="text-sm font-semibold">Prayers</p>
          </button>

          <button
            onClick={() => navigate('/kid/wishlist')}
            className="bg-gradient-to-br from-[var(--kid-warm-gold)] to-[var(--kid-lantern-glow)] rounded-[1rem] p-4 text-white shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <Gift className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm font-semibold">My Wishlist</p>
          </button>
        </motion.div>

        {/* Streaks Section */}
        {habitStreaks.length > 0 && (
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
        )}

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
                  const timeAgo = getTimeAgo(event.timestamp);
                  
                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className={`flex items-center justify-between p-3 rounded-xl border-2 ${
                        isPositive
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isPositive ? (
                          <TrendingUp className="w-5 h-5 text-green-600" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-red-600" />
                        )}
                        <div>
                          <p className="font-semibold text-gray-800">
                            {item?.name || 'Activity'}
                          </p>
                          <p className="text-xs text-gray-500">{timeAgo}</p>
                          {event.notes && (
                            <p className="text-xs text-gray-600 italic mt-1">"{event.notes}"</p>
                          )}
                        </div>
                      </div>
                      <div className={`text-lg font-bold ${
                        isPositive ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {isPositive ? '+' : ''}{event.points}
                      </div>
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
                onClick={() => navigate('/kid/wishlist')}
                className="text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-full hover:shadow-lg transition-all flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                My Wishlist
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