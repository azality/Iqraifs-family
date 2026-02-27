import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useFamilyContext } from "../contexts/FamilyContext";
import { useMilestones } from "../hooks/useMilestones";
import { useRewards } from "../hooks/useRewards";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Gift, Lock, Star, Award, Sparkles, Bell } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router";

export function Rewards() {
  const { getCurrentChild, updateChildPoints } = useFamilyContext();
  const { milestones } = useMilestones();
  const { rewards } = useRewards();
  const child = getCurrentChild();
  const navigate = useNavigate();

  if (!child) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select a child to view rewards.</p>
      </div>
    );
  }

  const handleRedeem = (rewardId: string) => {
    const reward = rewards.find(r => r.id === rewardId);
    if (!reward) return;

    if (child.currentPoints < reward.pointCost) {
      toast.error("Not enough points to redeem this reward");
      return;
    }

    const confirmed = window.confirm(
      `Redeem ${reward.name} for ${reward.pointCost} points?\n\nThis will reduce ${child.name}'s points from ${child.currentPoints} to ${child.currentPoints - reward.pointCost}.`
    );

    if (confirmed) {
      updateChildPoints(child.id, -reward.pointCost);
      toast.success(`${reward.name} redeemed! 🎉`);
    }
  };

  // Remove duplicates by keeping only the first occurrence of each unique name
  const deduplicateItems = (items: any[], itemType: string) => {
    const seen = new Map();
    return items.filter(item => {
      if (seen.has(item.name)) {
        console.log(`🗑️ Removing duplicate ${itemType}: ${item.name} (id: ${item.id})`);
        return false;
      }
      seen.set(item.name, true);
      return true;
    });
  };

  // Deduplicate milestones and rewards
  const uniqueMilestones = deduplicateItems(milestones, 'milestone');
  const uniqueRewards = deduplicateItems(rewards, 'reward');

  console.log('📊 Item counts after deduplication:', {
    milestones: uniqueMilestones.length,
    rewards: uniqueRewards.length,
    originalMilestones: milestones.length,
    originalRewards: rewards.length
  });

  // Recategorize rewards based on actual point values (not stored category)
  const smallRewards = uniqueRewards.filter(r => r.pointCost < 100);
  const mediumRewards = uniqueRewards.filter(r => r.pointCost >= 100 && r.pointCost < 500);
  const largeRewards = uniqueRewards.filter(r => r.pointCost >= 500);

  const unlockedMilestones = uniqueMilestones.filter(m => child.highestMilestone >= m.points);
  const nextMilestone = uniqueMilestones.find(m => m.points > child.currentPoints);

  return (
    <div className="space-y-6" data-testid="page-parent-rewards">
      {/* NEW FEATURES BANNER */}
      <div className="grid md:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/wishlist')}
          className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-4 text-left hover:border-purple-300 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Kids' Wishlist</p>
              <p className="text-sm text-gray-600">Review wishes & create rewards</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate('/redemption-requests')}
          className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4 text-left hover:border-blue-300 transition-all hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-400 rounded-full flex items-center justify-center">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Reward Requests</p>
              <p className="text-sm text-gray-600">Approve & track deliveries</p>
            </div>
          </div>
        </button>
      </div>

      {/* Current Points & Progress */}
      <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-6 w-6 text-yellow-600" />
            Points Balance
          </CardTitle>
          <CardDescription>Current points available for rewards</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-4xl font-bold text-yellow-700">{child.currentPoints}</p>
              <p className="text-sm text-muted-foreground mt-1">Available points</p>
            </div>
            <Award className="h-16 w-16 text-yellow-500 opacity-50" />
          </div>

          {nextMilestone && (
            <div className="space-y-2 pt-4 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Progress to {nextMilestone.name}</span>
                <span className="text-muted-foreground">
                  {child.currentPoints} / {nextMilestone.points}
                </span>
              </div>
              <Progress value={(child.currentPoints / nextMilestone.points) * 100} className="h-3" />
              <p className="text-xs text-center text-muted-foreground">
                Only {nextMilestone.points - child.currentPoints} points away! 🎯
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Milestones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-600" />
            Milestones Achieved
          </CardTitle>
          <CardDescription>Special achievements unlocked through hard work</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {uniqueMilestones.map(milestone => {
              const unlocked = child.highestMilestone >= milestone.points;
              return (
                <div 
                  key={milestone.id}
                  className={`p-4 border rounded-lg text-center transition-all transform hover:scale-105 ${
                    unlocked 
                      ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-300 shadow-md' 
                      : 'bg-gray-50 opacity-60 border-gray-200'
                  }`}
                >
                  {unlocked ? (
                    <Star className="h-10 w-10 mx-auto mb-2 text-yellow-600" fill="currentColor" />
                  ) : (
                    <Lock className="h-10 w-10 mx-auto mb-2 text-gray-400" />
                  )}
                  <p className="font-semibold text-sm">{milestone.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{milestone.points} pts</p>
                  {unlocked && (
                    <Badge variant="secondary" className="mt-2 bg-yellow-100 text-yellow-800 text-xs">
                      Unlocked! ✨
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Small Rewards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Small Rewards
          </CardTitle>
          <CardDescription>Quick rewards for consistent effort</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {smallRewards.map(reward => {
              const canAfford = child.currentPoints >= reward.pointCost;
              const isTarget = child.targetRewardId === reward.id;
              const progress = (child.currentPoints / reward.pointCost) * 100;
              
              return (
                <div 
                  key={reward.id}
                  className={`p-4 border rounded-lg ${isTarget ? 'border-blue-500 bg-blue-50' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-medium">{reward.name}</p>
                      {reward.description && (
                        <p className="text-sm text-muted-foreground">{reward.description}</p>
                      )}
                    </div>
                    {isTarget && <Badge variant="outline">Target</Badge>}
                  </div>
                  
                  {!canAfford && (
                    <div className="my-3">
                      <Progress value={progress} />
                      <p className="text-xs text-muted-foreground mt-1">
                        {reward.pointCost - child.currentPoints} points to go
                      </p>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between mt-3">
                    <Badge variant="secondary">{reward.pointCost} points</Badge>
                    <Button 
                      size="sm"
                      disabled={!canAfford}
                      onClick={() => handleRedeem(reward.id)}
                    >
                      {canAfford ? 'Redeem' : 'Locked'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Medium Rewards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Medium Rewards
          </CardTitle>
          <CardDescription>Meaningful rewards for sustained progress</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {mediumRewards.map(reward => {
              const canAfford = child.currentPoints >= reward.pointCost;
              const isTarget = child.targetRewardId === reward.id;
              const progress = (child.currentPoints / reward.pointCost) * 100;
              
              return (
                <div 
                  key={reward.id}
                  className={`p-4 border rounded-lg ${isTarget ? 'border-blue-500 bg-blue-50' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-medium">{reward.name}</p>
                      {reward.description && (
                        <p className="text-sm text-muted-foreground">{reward.description}</p>
                      )}
                    </div>
                    {isTarget && <Badge variant="outline">Target</Badge>}
                  </div>
                  
                  {!canAfford && (
                    <div className="my-3">
                      <Progress value={progress} />
                      <p className="text-xs text-muted-foreground mt-1">
                        {reward.pointCost - child.currentPoints} points to go
                      </p>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between mt-3">
                    <Badge variant="secondary">{reward.pointCost} points</Badge>
                    <Button 
                      size="sm"
                      disabled={!canAfford}
                      onClick={() => handleRedeem(reward.id)}
                    >
                      {canAfford ? 'Redeem' : 'Locked'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Large Rewards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-6 w-6" />
            Large Rewards
          </CardTitle>
          <CardDescription>Premium rewards for exceptional achievement</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {largeRewards.map(reward => {
              const canAfford = child.currentPoints >= reward.pointCost;
              const isTarget = child.targetRewardId === reward.id;
              const progress = (child.currentPoints / reward.pointCost) * 100;
              
              return (
                <div 
                  key={reward.id}
                  className={`p-4 border rounded-lg ${isTarget ? 'border-blue-500 bg-blue-50' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-medium text-lg">{reward.name}</p>
                      {reward.description && (
                        <p className="text-sm text-muted-foreground">{reward.description}</p>
                      )}
                    </div>
                    {isTarget && <Badge variant="outline">Target</Badge>}
                  </div>
                  
                  {!canAfford && (
                    <div className="my-3">
                      <Progress value={progress} />
                      <p className="text-xs text-muted-foreground mt-1">
                        {reward.pointCost - child.currentPoints} points to go
                      </p>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between mt-3">
                    <Badge variant="secondary" className="text-base">{reward.pointCost} points</Badge>
                    <Button 
                      size="sm"
                      disabled={!canAfford}
                      onClick={() => handleRedeem(reward.id)}
                    >
                      {canAfford ? 'Redeem' : 'Locked'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}