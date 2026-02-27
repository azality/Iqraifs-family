// ============================================================================
// PRAYER APPROVAL UI - PARENT MODE
// ============================================================================
// File: /src/app/components/prayers/ParentApprovalInbox.tsx
// Purpose: Parent interface for approving/denying kid prayer claims
// ============================================================================

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface PrayerClaim {
  id: string;
  prayer: string;
  date: string;
  status: 'pending' | 'partially_approved' | 'fully_approved' | 'denied';
  child: {
    id: string;
    name: string;
  };
  approvals: Array<{
    id: string;
    parent_id: string;
    parent: {
      display_name: string;
      email: string;
    };
    approved_at: string;
    points_awarded: number;
  }>;
  denials: Array<{
    id: string;
    parent_id: string;
    parent: {
      display_name: string;
      email: string;
    };
    denied_at: string;
    reason: string;
  }>;
  created_at: string;
}

const PRAYER_ICONS: Record<string, string> = {
  'Fajr': '🌅',
  'Dhuhr': '☀️',
  'Asr': '🌤️',
  'Maghrib': '🌇',
  'Isha': '🌙'
};

export function ParentApprovalInbox() {
  const [pendingClaims, setPendingClaims] = useState<PrayerClaim[]>([]);
  const [historyClaims, setHistoryClaims] = useState<PrayerClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchClaims();
  }, []);

  async function fetchClaims() {
    try {
      const token = localStorage.getItem('access_token');

      const response = await fetch('/api/prayer-claims', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const allClaims: PrayerClaim[] = await response.json();

      // Separate pending from history
      const pending = allClaims.filter(c => 
        c.status === 'pending' || c.status === 'partially_approved'
      );
      const history = allClaims.filter(c => 
        c.status === 'fully_approved' || c.status === 'denied'
      );

      setPendingClaims(pending);
      setHistoryClaims(history);
    } catch (error) {
      console.error('Error fetching claims:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(claimId: string) {
    if (!confirm('Approve this prayer claim?')) return;

    setProcessingId(claimId);

    try {
      const token = localStorage.getItem('access_token');

      const response = await fetch(`/api/prayer-claims/${claimId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        
        // Show success message
        alert(`✅ Approved! ${result.points_awarded} points awarded.`);
        
        // Refresh claims
        await fetchClaims();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to approve');
      }
    } catch (error) {
      console.error('Error approving:', error);
      alert('Something went wrong');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleDeny(claimId: string) {
    const reason = prompt('Reason for denial (optional):');
    if (reason === null) return; // User cancelled

    setProcessingId(claimId);

    try {
      const token = localStorage.getItem('access_token');

      const response = await fetch(`/api/prayer-claims/${claimId}/deny`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      });

      if (response.ok) {
        alert('❌ Prayer claim denied');
        await fetchClaims();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to deny');
      }
    } catch (error) {
      console.error('Error denying:', error);
      alert('Something went wrong');
    } finally {
      setProcessingId(null);
    }
  }

  function hasUserApproved(claim: PrayerClaim): boolean {
    const userId = localStorage.getItem('user_id');
    return claim.approvals?.some(a => a.parent_id === userId) || false;
  }

  function hasUserDenied(claim: PrayerClaim): boolean {
    const userId = localStorage.getItem('user_id');
    return claim.denials?.some(d => d.parent_id === userId) || false;
  }

  function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-gray-600">Loading prayer claims...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6" data-testid="parent-approvals-inbox">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          🕌 Prayer Approvals
        </h1>
        <p className="text-gray-600">
          Review and approve your children's prayer claims
        </p>

        {/* Tabs */}
        <div className="flex gap-4 mt-6">
          <button
            onClick={() => setShowHistory(false)}
            className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
              !showHistory
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Pending ({pendingClaims.length})
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
              showHistory
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            History ({historyClaims.length})
          </button>
        </div>
      </div>

      {/* Pending Claims */}
      {!showHistory && (
        <div className="max-w-4xl mx-auto space-y-4">
          {pendingClaims.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <div className="text-6xl mb-4">✅</div>
              <p className="text-gray-600 text-lg">
                No pending approvals!
              </p>
            </div>
          ) : (
            pendingClaims.map(claim => {
              const userApproved = hasUserApproved(claim);
              const userDenied = hasUserDenied(claim);
              const isProcessing = processingId === claim.id;

              return (
                <motion.div
                  key={claim.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-lg shadow-sm p-6"
                  data-testid="pending-claim"
                >
                  <div className="flex items-start justify-between">
                    {/* Left Side: Prayer Info */}
                    <div className="flex items-start gap-4">
                      <div className="text-5xl">
                        {PRAYER_ICONS[claim.prayer] || '🕌'}
                      </div>
                      
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">
                          {claim.child.name} - {claim.prayer}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {claim.date} • {formatTimeAgo(claim.created_at)}
                        </p>

                        {/* Approval Status */}
                        {claim.approvals && claim.approvals.length > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-sm text-green-600 font-semibold">
                              ✅ Approved by:
                            </span>
                            {claim.approvals.map((approval, i) => (
                              <span
                                key={approval.id}
                                className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded"
                              >
                                {approval.parent.display_name || approval.parent.email}
                                {i < claim.approvals.length - 1 && ','}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* User's Status */}
                        {userApproved && (
                          <div className="mt-2 text-sm text-green-600 font-semibold">
                            ✅ You already approved this
                          </div>
                        )}
                        {userDenied && (
                          <div className="mt-2 text-sm text-red-600 font-semibold">
                            ❌ You denied this
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Side: Actions */}
                    {!userApproved && !userDenied && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(claim.id)}
                          disabled={isProcessing}
                          className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                          data-testid="approve-button"
                        >
                          {isProcessing ? '⏳' : '✅ Approve'}
                        </button>
                        <button
                          onClick={() => handleDeny(claim.id)}
                          disabled={isProcessing}
                          className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                          data-testid="deny-button"
                        >
                          {isProcessing ? '⏳' : '❌ Deny'}
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* History */}
      {showHistory && (
        <div className="max-w-4xl mx-auto space-y-4">
          {historyClaims.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <div className="text-6xl mb-4">📜</div>
              <p className="text-gray-600 text-lg">
                No history yet
              </p>
            </div>
          ) : (
            historyClaims.map(claim => (
              <div
                key={claim.id}
                className="bg-white rounded-lg shadow-sm p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">
                      {PRAYER_ICONS[claim.prayer] || '🕌'}
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">
                        {claim.child.name} - {claim.prayer}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {claim.date}
                      </p>

                      {/* Final Status */}
                      {claim.status === 'fully_approved' && (
                        <div className="mt-2 text-sm text-green-600 font-semibold">
                          ✅ Fully Approved by {claim.approvals.length} parent(s)
                        </div>
                      )}
                      {claim.status === 'denied' && (
                        <div className="mt-2 text-sm text-red-600 font-semibold">
                          ❌ Denied
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right text-sm text-gray-500">
                    {formatTimeAgo(claim.created_at)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default ParentApprovalInbox;
