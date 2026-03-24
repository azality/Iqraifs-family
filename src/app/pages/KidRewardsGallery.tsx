import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useFamilyContext } from '../contexts/FamilyContext';
import { ArrowLeft, Gift, Sparkles, Lock, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '../components/ui/button';
import { RewardRequestCard } from '../components/kid-mode/RewardRequestCard';
import { projectId } from '../../../utils/supabase/info';
import { toast } from 'sonner';
import { getRewards } from '../../utils/api';
import { getKidToken, getKidInfo } from '../utils/auth';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

export function KidRewardsGallery() {
  const { getCurrentChild, familyId } = useFamilyContext();
  const { accessToken } = useAuth();
  const child = getCurrentChild();
  const navigate = useNavigate();

  // Get kid token for API calls
  const kidToken = getKidToken();
  const kidInfo = getKidInfo();
  const authToken = kidToken || accessToken;

  const [rewards, setRewards] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Load rewards and pending requests
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load rewards
        const rewardsData = await getRewards();
        setRewards(rewardsData || []);

        // Load pending requests - only if we have valid auth and child
        if (child && authToken && familyId) {
          // Validate child ID is not a mock ID
          if (child.id.startsWith('child:')) {
            console.warn('⚠️ Mock child ID detected, skipping API calls:', child.id);
            setLoading(false);
            return;
          }

          const response = await fetch(
            `${API_BASE}/families/${familyId}/redemption-requests?status=pending`,
            {
              headers: { 'Authorization': `Bearer ${authToken}` }
            }
          );

          if (response.ok) {
            const allRequests = await response.json();
            const myRequests = allRequests.filter((req: any) => req.childId === child.id);
            setPendingRequests(myRequests);
          } else if (response.status === 401) {
            console.warn('⚠️ Kid session expired, please log in again');
            toast.error('Your session has expired. Please log in again.');
            // Redirect to kid login after a short delay
            setTimeout(() => {
              navigate('/kid/login');
            }, 2000);
          } else {
            console.error('Failed to load pending requests:', response.status);
          }
        }
      } catch (error) {
        console.error('Failed to load rewards:', error);
        toast.error('Failed to load rewards');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [child, authToken, familyId]);

  // Handle reward request submission
  const handleRequestReward = async (rewardId: string, notes?: string) => {
    if (!child || !authToken) {
      toast.error('Please log in first');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/redemption-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
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
            headers: { 'Authorization': `Bearer ${authToken}` }
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
      <div className="min-h-screen bg-[var(--kid-soft-cream)] flex items-center justify-center">
        <p className="text-gray-600">Please select a child to view rewards.</p>
      </div>
    );
  }

  // Categorize rewards by point cost
  const smallRewards = rewards.filter(r => r.pointCost < 100);
  const mediumRewards = rewards.filter(r => r.pointCost >= 100 && r.pointCost < 500);
  const largeRewards = rewards.filter(r => r.pointCost >= 500);

  return (
    <div className="min-h-screen bg-[var(--kid-soft-cream)] pb-12">
      {/* Header */}
      <div className="bg-gradient-to-br from-[var(--kid-midnight-blue)] to-[#2C3E50] pt-8 pb-12 px-4 md:px-6 rounded-b-[2rem] shadow-lg mb-8">
        <div className="max-w-6xl mx-auto">
          <Button
            onClick={() => navigate('/kid/home')}
            variant="ghost"
            className="text-white hover:bg-white/20 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
              <Gift className="w-10 h-10" />
              Treasure Gallery 🎁
            </h1>
            <p className="text-white/80 text-lg">
              Explore amazing rewards you can earn!
            </p>
            <div className="mt-4 bg-white/20 backdrop-blur-sm rounded-2xl p-4 inline-block">
              <p className="text-white text-sm font-medium">Your Points</p>
              <p className="text-4xl font-bold text-[var(--kid-warm-gold)]">
                {child.currentPoints}
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 space-y-8">
        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-[1.5rem] p-6 border-2 border-yellow-300"
          >
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-4 flex items-center gap-2">
              <Clock className="w-6 h-6 text-amber-600" />
              Waiting for Parent Approval ⏳
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingRequests.map((request) => {
                const reward = rewards.find(r => r.id === request.rewardId);
                if (!reward) return null;
                
                return (
                  <div key={request.id} className="bg-white rounded-xl p-4 border-2 border-amber-300">
                    <div className="text-center">
                      <div className="text-4xl mb-2">🎁</div>
                      <h3 className="font-bold text-lg text-gray-800">{reward.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">{reward.description}</p>
                      <div className="mt-3 flex items-center justify-center gap-2 text-amber-600">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-semibold">Pending</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Small Rewards */}
        {smallRewards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-4 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-green-500" />
              Quick Wins ✨
              <span className="text-sm font-normal text-gray-600">(Under 100 points)</span>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {smallRewards.map((reward) => {
                const isPending = pendingRequests.some(req => req.rewardId === reward.id);
                const canAfford = child.currentPoints >= reward.pointCost;
                
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

        {/* Medium Rewards */}
        {mediumRewards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-4 flex items-center gap-2">
              <Gift className="w-6 h-6 text-blue-500" />
              Amazing Treasures 🌟
              <span className="text-sm font-normal text-gray-600">(100-499 points)</span>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mediumRewards.map((reward) => {
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

        {/* Large Rewards */}
        {largeRewards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-2xl font-bold text-[var(--kid-midnight-blue)] mb-4 flex items-center gap-2">
              <Gift className="w-6 h-6 text-purple-500" />
              Epic Rewards 👑
              <span className="text-sm font-normal text-gray-600">(500+ points)</span>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {largeRewards.map((reward) => {
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

        {/* Empty State */}
        {rewards.length === 0 && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[1.5rem] p-12 text-center"
          >
            <Gift className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-700 mb-2">No Rewards Yet</h3>
            <p className="text-gray-600 mb-6">
              Ask your parents to add some awesome rewards! 🎁
            </p>
            <Button
              onClick={() => navigate('/kid/wishlist')}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Add to Wishlist Instead
            </Button>
          </motion.div>
        )}

        {/* Info Card */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-[1.5rem] p-6 border-2 border-blue-200"
        >
          <h3 className="font-bold text-lg text-[var(--kid-midnight-blue)] mb-3">
            How Rewards Work 🎯
          </h3>
          <ul className="space-y-2 text-gray-700">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Pick a reward you like and send a request to your parents</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Your parents will review and approve your request</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Once approved, you'll get your amazing reward! 🎉</span>
            </li>
            <li className="flex items-start gap-2">
              <Lock className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <span>Keep earning points to unlock bigger treasures!</span>
            </li>
          </ul>
        </motion.div>

        {/* Bottom CTA */}
        <div className="text-center py-8">
          <p className="text-lg text-gray-600 italic mb-4">
            "Every good deed brings you closer to your dreams!" 🌟
          </p>
          <Button
            onClick={() => navigate('/kid/wishlist')}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-6 text-lg rounded-full shadow-lg hover:shadow-xl transition-all"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Add Your Own Wishes
          </Button>
        </div>
      </div>
    </div>
  );
}