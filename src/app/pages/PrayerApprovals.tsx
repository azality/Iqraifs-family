/**
 * Prayer Approvals Page (Parent Mode)
 * 
 * Parents review and approve/deny prayer claims from children.
 * Builds accountability and parent-child trust.
 */

import { useState, useEffect } from 'react';
import { clearStorage, getStorage, setStorage, removeStorage } from '../../../utils/storage';
import { projectId } from '../../../utils/supabase/info';
import { ArrowLeft, CheckCircle, XCircle, Clock, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';

// Prayer name to emoji mapping
const PRAYER_ICONS: Record<string, string> = {
  'Fajr': '🌅',
  'Dhuhr': '☀️',
  'Asr': '🌤️',
  'Maghrib': '🌆',
  'Isha': '🌙',
  'Jummah': '🕌',
};

type PrayerClaim = {
  id: string;
  childId: string;
  childName: string;
  prayerName: string;
  claimedAt: string;
  backdatedTo?: string;
  status: 'pending' | 'approved' | 'denied';
  reviewedAt?: string;
  reviewedBy?: string;
  denyReason?: string;
  pointsAwarded?: number;
};

export function PrayerApprovals() {
  const [pendingClaims, setPendingClaims] = useState<PrayerClaim[]>([]);
  const [recentClaims, setRecentClaims] = useState<PrayerClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDenyModal, setShowDenyModal] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const { accessToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (accessToken) {
      loadClaims();
    }
  }, [accessToken]);

  async function loadClaims() {
    try {
      setLoading(true);
      setError(null);

      // Load pending claims
      const pendingRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/prayer-claims/family/pending`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!pendingRes.ok) {
        throw new Error('Failed to load pending claims');
      }

      const pending = await pendingRes.json();
      setPendingClaims(pending);

      // Load recent approved/denied claims (for history)
      // We'll get all family children and their recent claims
      const familyId = await getStorage('familyId');
      if (familyId) {
        // For now, we'll just show pending claims
        // In a full implementation, you could fetch recent claims here
        setRecentClaims([]);
      }
    } catch (err: any) {
      console.error('Error loading claims:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function approveClaim(claimId: string) {
    if (!accessToken) return;

    try {
      setProcessing(claimId);
      setError(null);

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/prayer-claims/${claimId}/approve`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to approve claim');
      }

      // Reload claims
      await loadClaims();
    } catch (err: any) {
      console.error('Error approving claim:', err);
      setError(err.message);
    } finally {
      setProcessing(null);
    }
  }

  async function denyClaim(claimId: string, reason?: string) {
    if (!accessToken) return;

    try {
      setProcessing(claimId);
      setError(null);

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/prayer-claims/${claimId}/deny`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason })
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to deny claim');
      }

      // Close modal and reload
      setShowDenyModal(null);
      setDenyReason('');
      await loadClaims();
    } catch (err: any) {
      console.error('Error denying claim:', err);
      setError(err.message);
    } finally {
      setProcessing(null);
    }
  }

  function formatTime(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">📋 Prayer Approvals</h1>
          <p className="text-gray-600">Review and approve your children's prayer claims</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Stats Summary */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-600">{pendingClaims.length}</div>
              <div className="text-sm text-gray-600">Pending Approval</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{recentClaims.filter(c => c.status === 'approved').length}</div>
              <div className="text-sm text-gray-600">Recently Approved</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-600">{recentClaims.filter(c => c.status === 'denied').length}</div>
              <div className="text-sm text-gray-600">Recently Denied</div>
            </div>
          </div>
        </div>

        {/* Pending Claims */}
        {pendingClaims.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center border border-gray-200">
            <div className="text-6xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">All caught up!</h3>
            <p className="text-gray-600">No pending prayer claims to review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Pending Claims ({pendingClaims.length})
            </h2>
            
            {pendingClaims.map((claim, index) => {
              const icon = PRAYER_ICONS[claim.prayerName] || '🕌';
              const isProcessing = processing === claim.id;

              return (
                <motion.div
                  key={claim.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white rounded-lg shadow-md p-6 border-2 border-yellow-200 hover:border-yellow-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">{icon}</span>
                        <div>
                          <h3 className="font-bold text-lg text-gray-900">
                            {claim.childName || 'Child'} - {claim.prayerName}
                          </h3>
                          <p className="text-sm text-gray-500">
                            Claimed {formatTime(claim.claimedAt)}
                          </p>
                          {claim.backdatedTo && (
                            <p className="text-sm text-orange-600 font-medium mt-1">
                              ⏪ Backdated to {claim.backdatedTo}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          {claim.pointsAwarded} points
                        </span>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          ⏳ Pending Review
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 ml-4">
                      <button
                        onClick={() => approveClaim(claim.id)}
                        disabled={isProcessing}
                        className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? 'Processing...' : `✓ Approve ${claim.pointsAwarded}pts`}
                      </button>
                      <button
                        onClick={() => setShowDenyModal(claim.id)}
                        disabled={isProcessing}
                        className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ✗ Deny
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Tips Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-bold text-lg text-gray-900 mb-3">💡 Approval Guidelines</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>✅ Approve claims when you've confirmed your child prayed</li>
            <li>💬 Add a reason when denying to help them understand</li>
            <li>⏪ Backdated claims show when the prayer was actually performed</li>
            <li>🎯 Each approved prayer awards points to your child</li>
            <li>🔒 All claims are secure and tracked in the audit log</li>
          </ul>
        </div>
      </div>

      {/* Deny Modal */}
      {showDenyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-4">Deny Prayer Claim</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Would you like to add a reason for denying this claim? This will help your child understand.
            </p>

            <textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Optional: Why are you denying this claim?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
              rows={3}
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDenyModal(null);
                  setDenyReason('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => denyClaim(showDenyModal, denyReason || undefined)}
                disabled={processing === showDenyModal}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {processing === showDenyModal ? 'Processing...' : 'Deny Claim'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}