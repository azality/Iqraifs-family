/**
 * Prayer Logging Page (Kid Mode)
 * 
 * Kids can claim prayers and see their approval status.
 * Teaches accountability and builds parent-child trust.
 */

import { useState, useEffect } from 'react';
import { clearStorageSync, getStorageSync, setStorageSync, removeStorageSync } from '../../utils/storage';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';

interface PrayerClaim {
  id: string;
  childId: string;
  prayerName: string;
  claimedAt: string;
  claimedDate: string;
  status: 'pending' | 'approved' | 'denied';
  points: number;
  onTime?: boolean; // NEW: Track if prayer was on time
  approvedBy?: string;
  approvedAt?: string;
  deniedBy?: string;
  deniedAt?: string;
  denialReason?: string;
  backdated?: boolean;
  backdateDate?: string;
}

interface PrayerTime {
  start: string;
  end: string;
  label: string;
}

interface PrayerStats {
  totalClaimed: number;
  totalApproved: number;
  totalDenied: number;
  pendingCount: number;
  approvalRate: number;
  streak: number;
  byPrayer: Record<string, { claimed: number; approved: number }>;
}

const PRAYER_ICONS: Record<string, string> = {
  Fajr: '☀️',
  Dhuhr: '☀️',
  Asr: '☀️',
  Maghrib: '🌙',
  Isha: '🌙'
};

// v27: parent-logged salah events also count as "prayed today." The
// page used to only look at prayer-claims, so when a parent logged Asr
// from Log Behavior the kid still saw the "I Prayed" button — felt
// broken. Now we also pull point events and treat any approved prayer
// event for today as already-credited.
interface CreditedPrayer {
  prayerName: string;
  points: number;
  bonusPoints: number;
  bonusReason: string | null;
  source: 'claim' | 'parent-log';
  state?: 'ontime' | 'qadha' | 'missed' | null;
}

export function PrayerLogging() {
  const navigate = useNavigate();
  const [prayers, setPrayers] = useState<string[]>([]);
  const [prayerTimes, setPrayerTimes] = useState<Record<string, PrayerTime>>({});
  const [todaysClaims, setTodaysClaims] = useState<PrayerClaim[]>([]);
  const [stats, setStats] = useState<PrayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // v27: today's credited prayer events from the kid's event log.
  // Indexed by prayer name (e.g. "Asr") so the prayer card can show
  // the actual points + bonus the kid earned.
  const [creditedToday, setCreditedToday] = useState<Record<string, CreditedPrayer>>({});

  // CRITICAL: Use correct localStorage keys for kid mode
  const childId = getStorageSync('kid_id') || getStorageSync('child_id');
  const sessionToken = getStorageSync('kid_access_token') || getStorageSync('kid_session_token');

  // DEBUG: Log what we're loading
  console.log('🕌 PrayerLogging component:', {
    childId,
    hasSessionToken: !!sessionToken,
    sessionTokenPreview: sessionToken ? sessionToken.substring(0, 30) + '...' : null,
    loading,
    prayersCount: prayers.length,
    claimsCount: todaysClaims.length
  });

  useEffect(() => {
    if (childId && sessionToken) {
      loadData();
    } else {
      console.warn('⚠️ PrayerLogging: Missing childId or sessionToken:', {
        childId,
        hasSessionToken: !!sessionToken
      });
      setLoading(false);
      setError('Please log in to view prayers');
    }
  }, [childId, sessionToken]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      // Load prayer configuration
      const configRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/prayers/config`,
        {
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!configRes.ok) {
        throw new Error('Failed to load prayer configuration');
      }

      const config = await configRes.json();
      setPrayers(config.prayers);
      setPrayerTimes(config.times);

      // Load today's claims
      const today = new Date().toISOString().split('T')[0];
      const claimsRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/prayer-claims/child/${childId}/date/${today}`,
        {
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (claimsRes.ok) {
        const claims = await claimsRes.json();
        setTodaysClaims(claims);
      }

      // Load stats
      const statsRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/prayer-claims/child/${childId}/stats?days=7`,
        {
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // v27: pull today's point events and surface any salah credits
      // (whether they came from a kid claim or a parent direct log).
      // The kid's prayer card then shows "MashAllah for praying Asr —
      // +3 points" instead of still offering the "I Prayed" button.
      try {
        const eventsRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${childId}/events`,
          {
            headers: {
              'Authorization': `Bearer ${sessionToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (eventsRes.ok) {
          const events = await eventsRes.json();
          const todayStr = new Date().toDateString();
          const credited: Record<string, CreditedPrayer> = {};
          // Sum base + bonus per prayer for today.
          for (const e of events as any[]) {
            const isToday = new Date(e.timestamp).toDateString() === todayStr;
            if (!isToday || e.points <= 0) continue;
            // Identify prayer events: prefer event.itemName / notes
            // ("Prayer: Asr"), fall back to salahState presence.
            const text = `${e.itemName || ''} ${e.notes || ''}`;
            const m = text.match(/Prayer:\s*([A-Za-z]+)/i);
            const prayerName = m
              ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()
              : null;
            if (!prayerName) continue;

            const existing = credited[prayerName] || {
              prayerName,
              points: 0,
              bonusPoints: 0,
              bonusReason: null as string | null,
              source: 'parent-log' as const,
              state: null as any,
            };
            if (e.isBonus) {
              existing.bonusPoints += e.points;
              if (!existing.bonusReason) {
                existing.bonusReason = e.bonusReason || e.notes || null;
              }
            } else {
              existing.points += e.points;
              if (e.salahState) existing.state = e.salahState;
            }
            // If this came from a prayer-claim approval, label as 'claim'.
            if ((e.itemName || '').includes('Prayer:') && (e.notes || '').includes('claim')) {
              existing.source = 'claim';
            }
            credited[prayerName] = existing;
          }
          setCreditedToday(credited);
        }
      } catch (eventsErr) {
        // Non-fatal — the page still works, kid just won't see the
        // parent-logged prayers reflected as already-credited.
        console.warn('Could not load events for prayer recognition:', eventsErr);
      }
    } catch (err: any) {
      console.error('Error loading prayer data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function claimPrayer(prayerName: string) {
    if (!childId || !sessionToken) return;

    try {
      setSubmitting(prayerName);
      setError(null);

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/prayer-claims`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            childId,
            prayerName,
            points: 5
          })
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to claim prayer');
      }

      // Reload data
      await loadData();
    } catch (err: any) {
      console.error('Error claiming prayer:', err);
      setError(err.message);
    } finally {
      setSubmitting(null);
    }
  }

  function getClaimForPrayer(prayerName: string): PrayerClaim | undefined {
    return todaysClaims.find(c => c.prayerName === prayerName);
  }

  function getStatusBadge(claim: PrayerClaim | undefined) {
    if (!claim) return null;

    if (claim.status === 'pending') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          ⏳ Pending
        </span>
      );
    }

    if (claim.status === 'approved') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          ✅ Approved (+{claim.points}pts)
        </span>
      );
    }

    if (claim.status === 'denied') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          ❌ Not approved
        </span>
      );
    }

    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-blue-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-20 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-blue-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate('/kid/home')}
          className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back to Dashboard</span>
        </button>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">🌙 Daily Prayers</h1>
          <p className="text-gray-600">Claim your prayers and earn points!</p>
        </div>

        {/* Stats Card */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-lg p-6 mb-6 border-2 border-purple-200"
          >
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{stats.totalApproved}</div>
                <div className="text-sm text-gray-600">Approved</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{stats.pendingCount}</div>
                <div className="text-sm text-gray-600">Pending</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">{stats.streak}</div>
                <div className="text-sm text-gray-600">Day Streak 🔥</div>
              </div>
            </div>
            {stats.streak > 0 && (
              <div className="mt-4 text-center text-sm text-gray-600">
                Amazing! You've prayed for {stats.streak} day{stats.streak > 1 ? 's' : ''} in a row!
              </div>
            )}
          </motion.div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Prayer List */}
        <div className="space-y-3">
          {prayers.map((prayerName, index) => {
            const claim = getClaimForPrayer(prayerName);
            const icon = PRAYER_ICONS[prayerName] || '🕌';
            const time = prayerTimes[prayerName];
            const isSubmitting = submitting === prayerName;
            // v27: a prayer is "done today" if EITHER there's a claim
            // OR there's a credited point event (parent direct-logged it).
            const credited = creditedToday[prayerName];
            const isClaimed = !!claim || !!credited;
            const isApproved = claim?.status === 'approved' || !!credited;
            const isPending = claim?.status === 'pending' && !credited;
            const isDenied = claim?.status === 'denied' && !credited;

            return (
              <motion.div
                key={prayerName}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`bg-white rounded-xl shadow-md p-5 border-2 ${
                  isApproved ? 'border-green-300' : 
                  isPending ? 'border-yellow-300' : 
                  isDenied ? 'border-red-300' :
                  'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{icon}</span>
                      <div>
                        <h3 className="font-bold text-lg text-gray-900">{prayerName}</h3>
                        {time && (
                          <p className="text-sm text-gray-500">
                            {time.start} - {time.end}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* v27: when a prayer is credited (claim approved OR
                        parent direct-logged), show a celebratory line
                        instead of just an emoji. The kid sees exactly
                        why they got the points and any bonus reason. */}
                    {isApproved && credited && (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm font-semibold text-green-800">
                          🌟 MashAllah for praying {prayerName}!
                        </p>
                        <p className="text-sm text-green-700">
                          You earned <strong>+{credited.points}</strong> point{credited.points === 1 ? '' : 's'}
                          {credited.state === 'qadha' && ' (qadha)'}
                          {credited.bonusPoints > 0 && (
                            <>
                              {' '}plus <strong>+{credited.bonusPoints}</strong> bonus
                            </>
                          )}
                          .
                        </p>
                        {credited.bonusPoints > 0 && credited.bonusReason && (
                          <p className="text-xs text-amber-700">
                            ✨ Bonus: {credited.bonusReason}
                          </p>
                        )}
                      </div>
                    )}
                    {isApproved && !credited && claim && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        ✅ Approved (+{claim.points}pts)
                      </span>
                    )}
                    {isPending && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        ⏳ Waiting for your grown-up to approve
                      </span>
                    )}
                    {isDenied && (
                      <>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          ❌ Not approved
                        </span>
                        {claim?.denialReason && (
                          <p className="text-sm text-gray-600 mt-2">
                            💬 {claim.denialReason}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div>
                    {!isClaimed ? (
                      <button
                        onClick={() => claimPrayer(prayerName)}
                        disabled={isSubmitting}
                        className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? 'Claiming...' : 'I Prayed! 🙏'}
                      </button>
                    ) : (
                      <div className="text-3xl">
                        {isApproved && '✅'}
                        {isPending && '⏳'}
                        {isDenied && '❌'}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Tips Section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 bg-blue-50 border-2 border-blue-200 rounded-xl p-6"
        >
          <h3 className="font-bold text-lg text-gray-900 mb-3">💡 Prayer Points System</h3>
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-4 border-2 border-green-300">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">⏰</span>
                <h4 className="font-bold text-green-700">On Time = Full Points!</h4>
              </div>
              <ul className="space-y-1 text-sm text-gray-700 ml-9">
                <li>🌅 Fajr: <strong className="text-green-600">5 points</strong></li>
                <li>☀️ Dhuhr, Asr, Maghrib, Isha: <strong className="text-green-600">3 points each</strong></li>
              </ul>
            </div>
            
            <div className="bg-white rounded-lg p-4 border-2 border-amber-300">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">⏳</span>
                <h4 className="font-bold text-amber-700">Late (Qadha) = 1 Point</h4>
              </div>
              <p className="text-sm text-gray-700 ml-9">
                All prayers after their time: <strong className="text-amber-600">1 point</strong>
              </p>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-blue-200">
            <ul className="space-y-2 text-sm text-gray-700">
              <li>✅ Claim your prayer right after you finish</li>
              <li>⏳ Your parent will approve it and you'll get points</li>
              <li>🔥 Pray every day to build your streak!</li>
              <li>🎯 Pray on time for maximum points!</li>
            </ul>
          </div>
        </motion.div>
      </div>
    </div>
  );
}