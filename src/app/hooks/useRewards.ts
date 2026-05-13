import { useState, useEffect } from 'react';
import { getRewards, createReward, updateReward, deleteReward } from '../../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { getStorageSync } from '../../utils/storage';

export interface Reward {
  id: string;
  name: string;
  category: 'small' | 'medium' | 'large';
  pointCost: number;
  description?: string;
}

export function useRewards() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { accessToken: authToken } = useAuth();
  
  // CRITICAL: Support kid mode tokens from storage.
  // Resolved asynchronously via the storage abstraction (Capacitor Preferences on native).
  const [kidToken, setKidToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [userRole, userMode] = await Promise.all([
        getStorageSync('user_role'),
        getStorageSync('user_mode'),
      ]);
      if (userRole === 'child' || userMode === 'kid') {
        const token =
          (getStorageSync('kid_access_token')) ||
          (getStorageSync('kid_session_token'));
        if (!cancelled) setKidToken(token ?? null);
      } else if (!cancelled) {
        setKidToken(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const accessToken = authToken || kidToken;

  const loadRewards = async () => {
    // Don't try to load data if we don't have an access token
    if (!accessToken) {
      console.log('⏸️ useRewards: Skipping rewards load - no access token');
      setLoading(false);
      return;
    }

    console.log('📦 useRewards: Loading rewards with token:', {
      hasToken: !!accessToken,
      tokenPreview: accessToken.substring(0, 30) + '...'
    });

    try {
      setLoading(true);
      const data = await getRewards();
      setRewards(data);
      setError(null);
      console.log('✅ useRewards: Loaded', data.length, 'rewards');
    } catch (err) {
      console.error('❌ useRewards: Error loading rewards:', err);
      setError('Failed to load rewards');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('🔄 useRewards: useEffect triggered, accessToken:', !!accessToken);
    loadRewards();
  }, [accessToken]); // Reload when accessToken becomes available

  const addReward = async (rewardData: Omit<Reward, 'id'>) => {
    try {
      await createReward(rewardData);
      await loadRewards(); // Reload to get the new reward
    } catch (err) {
      console.error('Error adding reward:', err);
      throw err;
    }
  };

  const editReward = async (rewardId: string, updates: Partial<Omit<Reward, 'id'>>) => {
    try {
      // Optimistic update so the list re-renders before the round-trip.
      // If the API call fails we reload to roll back.
      setRewards((prev) =>
        prev.map((r) => (r.id === rewardId ? { ...r, ...updates } as Reward : r)),
      );
      await updateReward(rewardId, updates);
      await loadRewards();
    } catch (err) {
      console.error('Error updating reward:', err);
      await loadRewards();
      throw err;
    }
  };

  const removeReward = async (rewardId: string) => {
    try {
      setRewards((prev) => prev.filter((r) => r.id !== rewardId));
      await deleteReward(rewardId);
    } catch (err) {
      console.error('Error deleting reward:', err);
      await loadRewards();
      throw err;
    }
  };

  return { rewards, loading, error, addReward, editReward, removeReward };
}