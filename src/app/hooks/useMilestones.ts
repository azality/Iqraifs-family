import { useState, useEffect } from 'react';
import { getMilestones, createMilestone } from '../../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { getStorage } from '../../utils/storage';

export interface Milestone {
  id: string;
  points: number;
  name: string;
}

export function useMilestones() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
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
        getStorage('user_role'),
        getStorage('user_mode'),
      ]);
      if (userRole === 'child' || userMode === 'kid') {
        const token =
          (await getStorage('kid_access_token')) ||
          (await getStorage('kid_session_token'));
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

  const loadMilestones = async () => {
    // Don't try to load data if we don't have an access token
    if (!accessToken) {
      console.log('⏸️ Skipping milestones load - no access token');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getMilestones();
      setMilestones(data);
      setError(null);
    } catch (err) {
      console.error('Error loading milestones:', err);
      setError('Failed to load milestones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMilestones();
  }, [accessToken]); // Reload when accessToken becomes available

  const addMilestone = async (milestoneData: Omit<Milestone, 'id'>) => {
    try {
      await createMilestone(milestoneData);
      await loadMilestones(); // Reload to get the new milestone
    } catch (err) {
      console.error('Error adding milestone:', err);
      throw err;
    }
  };

  return { milestones, loading, error, addMilestone };
}