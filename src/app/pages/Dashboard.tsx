import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Button } from "../components/ui/button";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useTrackableItems } from "../hooks/useTrackableItems";
import { useMilestones } from "../hooks/useMilestones";
import { useRewards } from "../hooks/useRewards";
import { useAuth } from "../contexts/AuthContext";
import { Badge } from "../components/ui/badge";
import { Link } from "react-router";
import { motion } from "motion/react";
import { RecoveryDialog } from "../components/RecoveryDialog";
import { PrayerApprovalsWidget } from "../components/PrayerApprovalsWidget";
import { WishlistWidget } from "../components/WishlistWidget";
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
  const { getCurrentChild, pointEvents, submitRecovery, children, loading: familyLoading } = useFamilyContext();
  const { items: trackableItems } = useTrackableItems();
  const { milestones } = useMilestones();
  const { rewards } = useRewards();
  const { isParentMode } = useAuth();
  const child = getCurrentChild();

  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [selectedNegativeEvent, setSelectedNegativeEvent] = useState<PointEvent | null>(null);

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
      <div className="flex items-center justify-center h-96">
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
    );
  }

  const childEvents = pointEvents.filter(e => e.childId === child.id);
  const recentEvents = childEvents.slice(0, 5);
  
  const todayEvents = childEvents.filter(e => {
    const eventDate = new Date(e.timestamp);
    const today = new Date();
    return eventDate.toDateString() === today.toDateString();
  });

  const todayPositive = todayEvents.filter(e => e.points > 0).reduce((sum, e) => sum + e.points, 0);
  const todayNegative = todayEvents.filter(e => e.points < 0).reduce((sum, e) => sum + e.points, 0);

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
                  <Button size="lg" className="bg-white text-purple-600 hover:bg-gray-100 shadow-lg font-bold text-lg">
                    <Gift className="mr-2 h-5 w-5" />
                    🎁 My Rewards
                  </Button>
                </Link>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link to="/quizzes">
                  <Button size="lg" className="bg-yellow-400 text-purple-900 hover:bg-yellow-300 shadow-lg font-bold text-lg">
                    <Brain className="mr-2 h-5 w-5" />
                    🧠 Play Quizzes
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
              <div className={`text-2xl font-bold ${isChildView ? "text-green-700" : "text-green-600"}`}>
                {isChildView ? `🌟 +${todayPositive}` : `+${todayPositive}`}
              </div>
              <p className={`text-xs ${isChildView ? "text-green-700" : "text-red-600"}`}>
                {todayNegative < 0 && (isChildView ? `⚠️ ${todayNegative}` : todayNegative)}
                {todayNegative === 0 && (isChildView ? "✨ Perfect day!" : "No penalties")}
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
          <CardTitle>{isChildView ? "📜 My Recent Activities" : "Recent Activity"}</CardTitle>
          <CardDescription>{isChildView ? "See what you've been up to!" : "Latest events and behaviors"}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No recent activity</p>
            ) : (
              recentEvents.map((event) => {
                const item = trackableItems.find(i => i.id === event.trackableItemId);
                const itemName = item?.name || (event.isAdjustment ? 'Adjustment' : event.isRecovery ? 'Recovery Bonus' : 'Unknown');
                const hasRecovery = pointEvents.some(e => e.recoveryFromEventId === event.id);
                const canRecover = isChildView && event.points < 0 && !hasRecovery;
                
                return (
                  <div key={event.id} className={`flex items-center justify-between border-b pb-3 last:border-0 ${canRecover ? 'bg-red-50 p-3 rounded-lg border border-red-200' : ''}`}>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{itemName}</p>
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
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recovery Dialog */}
      {child && selectedNegativeEvent && (
        <RecoveryDialog
          open={recoveryDialogOpen}
          onOpenChange={setRecoveryDialogOpen}
          negativeEvent={selectedNegativeEvent}
          childName={child.name}
          itemName={trackableItems.find(i => i.id === selectedNegativeEvent.trackableItemId)?.name || 'Unknown'}
          onSubmitRecovery={async (recoveryAction, notes) => {
            await submitRecovery(child.id, selectedNegativeEvent.id, recoveryAction, notes);
          }}
        />
      )}

      {/* Prayer Approvals Widget (Parents Only) */}
      {isParentMode && <PrayerApprovalsWidget maxItems={3} />}

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