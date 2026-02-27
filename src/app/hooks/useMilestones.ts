import { useState, useEffect } from 'react';
import { getMilestones, createMilestone } from '../../utils/api';
import { useAuth } from '../contexts/AuthContext';

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
  
  // CRITICAL: Support kid mode tokens from localStorage
  const accessToken = (() => {
    if (authToken) return authToken;
    
    const userRole = localStorage.getItem('user_role');
    const userMode = localStorage.getItem('user_mode');
    
    if (userRole === 'child' || userMode === 'kid') {
      return localStorage.getItem('kid_access_token') || localStorage.getItem('kid_session_token');
    }
    
    return null;
  })();

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