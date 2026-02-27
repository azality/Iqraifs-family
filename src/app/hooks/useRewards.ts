import { useState, useEffect, useMemo } from 'react';
import { getRewards, createReward } from '../../utils/api';
import { useAuth } from '../contexts/AuthContext';

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
  
  // CRITICAL: Support kid mode tokens from localStorage - memoize to prevent infinite loops
  const accessToken = useMemo(() => {
    if (authToken) return authToken;
    
    const userRole = localStorage.getItem('user_role');
    const userMode = localStorage.getItem('user_mode');
    
    if (userRole === 'child' || userMode === 'kid') {
      return localStorage.getItem('kid_access_token') || localStorage.getItem('kid_session_token');
    }
    
    return null;
  }, [authToken]);

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

  return { rewards, loading, error, addReward };
}