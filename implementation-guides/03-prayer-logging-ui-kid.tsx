// ============================================================================
// PRAYER LOGGING UI - KID MODE
// ============================================================================
// File: /src/app/components/prayers/KidPrayerLogger.tsx
// Purpose: Kid-friendly prayer logging interface
// ============================================================================

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

interface Prayer {
  name: string;
  icon: string;
  time: string;
  color: string;
}

const PRAYERS: Prayer[] = [
  { name: 'Fajr', icon: '🌅', time: 'Dawn', color: 'from-blue-400 to-blue-600' },
  { name: 'Dhuhr', icon: '☀️', time: 'Noon', color: 'from-yellow-400 to-yellow-600' },
  { name: 'Asr', icon: '🌤️', time: 'Afternoon', color: 'from-orange-400 to-orange-600' },
  { name: 'Maghrib', icon: '🌇', time: 'Sunset', color: 'from-red-400 to-red-600' },
  { name: 'Isha', icon: '🌙', time: 'Night', color: 'from-purple-400 to-purple-600' }
];

interface PrayerClaim {
  id: string;
  prayer: string;
  date: string;
  status: 'pending' | 'partially_approved' | 'fully_approved' | 'denied';
  approvals: Array<{
    parent: { display_name: string; email: string };
    approved_at: string;
    points_awarded: number;
  }>;
}

export function KidPrayerLogger() {
  const [claims, setClaims] = useState<PrayerClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPrayer, setSelectedPrayer] = useState<string | null>(null);

  // Fetch existing claims for today
  useEffect(() => {
    fetchTodaysClaims();
  }, []);

  async function fetchTodaysClaims() {
    try {
      const token = localStorage.getItem('access_token');
      const childId = localStorage.getItem('child_id');

      const response = await fetch(
        `/api/prayer-claims?child_id=${childId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const data = await response.json();
      
      // Filter to today's claims
      const today = new Date().toISOString().split('T')[0];
      const todaysClaims = data.filter((c: PrayerClaim) => c.date === today);
      
      setClaims(todaysClaims);
    } catch (error) {
      console.error('Error fetching claims:', error);
    }
  }

  async function handlePrayerClick(prayer: Prayer) {
    // Check if already claimed
    const existing = claims.find(c => c.prayer === prayer.name);
    if (existing) {
      alert(`You already claimed ${prayer.name}! Status: ${existing.status}`);
      return;
    }

    setSelectedPrayer(prayer.name);
    setLoading(true);

    try {
      const token = localStorage.getItem('access_token');
      const childId = localStorage.getItem('child_id');

      const response = await fetch('/api/prayer-claims', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          child_id: childId,
          prayer: prayer.name
        })
      });

      if (response.ok) {
        // Success animation
        await showSuccessAnimation(prayer);
        
        // Refresh claims
        await fetchTodaysClaims();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to log prayer');
      }
    } catch (error) {
      console.error('Error claiming prayer:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
      setSelectedPrayer(null);
    }
  }

  async function showSuccessAnimation(prayer: Prayer) {
    return new Promise(resolve => {
      // Trigger celebration animation
      setTimeout(resolve, 1500);
    });
  }

  function getPrayerStatus(prayerName: string) {
    const claim = claims.find(c => c.prayer === prayerName);
    if (!claim) return null;

    const approvalCount = claim.approvals?.length || 0;

    if (claim.status === 'fully_approved') {
      return {
        icon: '✅',
        text: 'Approved by both parents!',
        color: 'text-green-600',
        points: claim.approvals.reduce((sum, a) => sum + a.points_awarded, 0)
      };
    } else if (claim.status === 'partially_approved') {
      return {
        icon: '⏳',
        text: `Approved by ${claim.approvals[0]?.parent?.display_name || 'one parent'}`,
        color: 'text-yellow-600',
        points: claim.approvals[0]?.points_awarded || 0
      };
    } else if (claim.status === 'pending') {
      return {
        icon: '⏳',
        text: 'Waiting for parent approval...',
        color: 'text-blue-600',
        points: 0
      };
    }

    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50 p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">
          🕌 Prayer Tracker
        </h1>
        <p className="text-gray-600">
          Tap a prayer when you complete it!
        </p>
      </div>

      {/* Prayer Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {PRAYERS.map((prayer, index) => {
          const status = getPrayerStatus(prayer.name);
          const isLogged = !!status;
          const isLoading = loading && selectedPrayer === prayer.name;

          return (
            <motion.div
              key={prayer.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative"
            >
              <button
                onClick={() => !isLogged && handlePrayerClick(prayer)}
                disabled={isLogged || loading}
                className={`
                  w-full p-8 rounded-2xl shadow-lg
                  transition-all duration-300 transform
                  ${isLogged 
                    ? 'bg-white border-2 border-green-300 cursor-default' 
                    : `bg-gradient-to-br ${prayer.color} hover:scale-105 hover:shadow-xl active:scale-95`
                  }
                  ${loading && !isLoading ? 'opacity-50' : ''}
                `}
                data-testid={`prayer-${prayer.name.toLowerCase()}`}
              >
                {/* Prayer Icon */}
                <div className="text-6xl mb-4">
                  {isLoading ? '⏳' : isLogged ? status.icon : prayer.icon}
                </div>

                {/* Prayer Name */}
                <h3 className={`text-2xl font-bold mb-2 ${isLogged ? 'text-gray-800' : 'text-white'}`}>
                  {prayer.name}
                </h3>

                {/* Prayer Time */}
                <p className={`text-sm mb-4 ${isLogged ? 'text-gray-600' : 'text-white/80'}`}>
                  {prayer.time}
                </p>

                {/* Status */}
                {status ? (
                  <div className="mt-4 p-3 bg-white/90 rounded-lg">
                    <p className={`text-sm font-semibold ${status.color}`}>
                      {status.text}
                    </p>
                    {status.points > 0 && (
                      <p className="text-lg font-bold text-green-600 mt-1">
                        +{status.points} points
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-white/90 font-semibold">
                    Tap to log
                  </div>
                )}
              </button>

              {/* Celebration Animation */}
              {isLogged && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  className="absolute -top-2 -right-2 text-4xl"
                >
                  ⭐
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Today's Summary */}
      <div className="mt-12 max-w-2xl mx-auto bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          📊 Today's Progress
        </h2>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Prayers Logged:</span>
            <span className="font-bold text-xl text-blue-600">
              {claims.length} / 5
            </span>
          </div>

          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Fully Approved:</span>
            <span className="font-bold text-xl text-green-600">
              {claims.filter(c => c.status === 'fully_approved').length}
            </span>
          </div>

          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Points Earned:</span>
            <span className="font-bold text-xl text-purple-600">
              {claims.reduce((sum, c) => 
                sum + (c.approvals?.reduce((s, a) => s + a.points_awarded, 0) || 0), 
                0
              )}
            </span>
          </div>
        </div>

        {/* Encouragement */}
        {claims.length === 5 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="mt-6 p-4 bg-gradient-to-r from-green-400 to-blue-500 rounded-lg text-center"
          >
            <p className="text-white font-bold text-lg">
              🎉 Amazing! You logged all 5 prayers today! 🎉
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default KidPrayerLogger;
