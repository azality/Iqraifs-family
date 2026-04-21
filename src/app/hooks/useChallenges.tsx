import { useState, useEffect } from 'react';
import { Challenge } from '../data/mockData';
import { useFamilyContext } from '../contexts/FamilyContext';
import { useAuth } from '../contexts/AuthContext';
import { projectId } from '../../../utils/supabase/info';
import { getStorageSync } from '../../utils/storage';

export function useChallenges() {
  const { getCurrentChild } = useFamilyContext();
  const { accessToken: authToken } = useAuth();
  const child = getCurrentChild();

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // CRITICAL: Support kid mode tokens from storage (hoisted to useEffect)
  useEffect(() => {
    const initializeToken = async () => {
      if (authToken) {
        setAccessToken(authToken);
        return;
      }

      const userRole = getStorageSync('user_role');
      const userMode = getStorageSync('user_mode');

      if (userRole === 'child' || userMode === 'kid') {
        const kidToken = (getStorageSync('kid_access_token')) || (getStorageSync('kid_session_token'));
        setAccessToken(kidToken);
      } else {
        setAccessToken(null);
      }
    };
    initializeToken();
  }, [authToken]);

  useEffect(() => {
    if (!child || !accessToken) {
      setChallenges([]);
      return;
    }

    loadChallenges();
  }, [child?.id, accessToken]);

  const loadChallenges = async () => {
    if (!child || !accessToken) return;
    
    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${child.id}/challenges`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setChallenges(data);
      } else {
        console.error('Failed to load challenges:', await response.text());
        setChallenges([]);
      }
    } catch (error) {
      console.error('Load challenges error:', error);
      setChallenges([]);
    } finally {
      setLoading(false);
    }
  };

  return {
    challenges,
    loading,
    refetch: loadChallenges
  };
}