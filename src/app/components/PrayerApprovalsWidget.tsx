/**
 * Prayer Approvals Widget
 * Shows pending prayer claims that need parent approval
 * Can be used on Dashboard and Log Behavior pages
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { projectId } from '../../../utils/supabase/info';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
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
  points: number;
  onTime?: boolean; // NEW: Track if prayer was on time
};

interface PrayerApprovalsWidgetProps {
  compact?: boolean; // For dashboard widget
  maxItems?: number; // Limit number of items shown
  // v20: When true, render NULL when there are zero pending claims
  // (no "No pending prayer approvals" empty card cluttering the page),
  // and lift the visual emphasis (yellow ring + pulse on the count
  // badge) so the card is impossible to miss when it does appear.
  // Used at the TOP of the parent dashboard.
  priority?: boolean;
}

export function PrayerApprovalsWidget({ compact = false, maxItems, priority = false }: PrayerApprovalsWidgetProps) {
  const [pendingClaims, setPendingClaims] = useState<PrayerClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [showDenyModal, setShowDenyModal] = useState<string | null>(null);
  const [showApproveModal, setShowApproveModal] = useState<PrayerClaim | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const { accessToken } = useAuth();

  useEffect(() => {
    if (accessToken) {
      loadClaims();
    }
  }, [accessToken]);

  async function loadClaims() {
    try {
      setLoading(true);

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
    } catch (err: any) {
      console.error('Error loading claims:', err);
    } finally {
      setLoading(false);
    }
  }

  async function approveClaim(claimId: string, onTime: boolean) {
    if (!accessToken) return;

    try {
      setProcessing(claimId);

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/prayer-claims/${claimId}/approve`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ onTime })
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to approve claim');
      }

      toast.success(`✅ Prayer approved! ${onTime ? 'Full points awarded!' : '1 point awarded (late)'}`);
      setShowApproveModal(null);
      await loadClaims();
    } catch (err: any) {
      console.error('Error approving claim:', err);
      toast.error(err.message || 'Failed to approve claim');
    } finally {
      setProcessing(null);
    }
  }

  async function denyClaim(claimId: string, reason?: string) {
    if (!accessToken) return;

    try {
      setProcessing(claimId);

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

      toast.success('Prayer claim denied');
      setShowDenyModal(null);
      setDenyReason('');
      await loadClaims();
    } catch (err: any) {
      console.error('Error denying claim:', err);
      toast.error(err.message || 'Failed to deny claim');
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

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString();
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Prayer Approvals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayClaims = maxItems ? pendingClaims.slice(0, maxItems) : pendingClaims;

  // v20: priority mode renders nothing when there are zero pending
  // claims, so the dashboard is not cluttered with a permanent
  // "No pending prayer approvals" empty card. Non-priority placements
  // keep the empty card for explicit prayer-approval pages.
  if (pendingClaims.length === 0) {
    if (priority) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Prayer Approvals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-sm text-muted-foreground">No pending prayer approvals</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={priority ? 'border-2 border-yellow-400 bg-yellow-50/40 shadow-lg' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Clock className={priority ? "h-5 w-5 text-yellow-700" : "h-5 w-5"} />
            {priority
              ? `${pendingClaims.length} prayer${pendingClaims.length === 1 ? '' : 's'} waiting for your approval`
              : 'Prayer Approvals'}
            {!priority && (
              <span className="ml-2 inline-flex items-center justify-center h-6 w-6 rounded-full bg-yellow-500 text-white text-xs font-bold">
                {pendingClaims.length}
              </span>
            )}
            {priority && (
              <span className="ml-2 inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-yellow-500 text-white text-xs font-bold animate-pulse">
                {pendingClaims.length} new
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {displayClaims.map((claim, index) => {
            const icon = PRAYER_ICONS[claim.prayerName] || '🕌';
            const isProcessing = processing === claim.id;

            return (
              <motion.div
                key={claim.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="border border-yellow-200 bg-yellow-50 rounded-lg p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-2xl">{icon}</span>
                    <div>
                      <p className="font-semibold text-sm">
                        {claim.childName} - {claim.prayerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(claim.claimedAt)}
                        {claim.backdatedTo && ` • ⏪ Backdated to ${claim.backdatedTo}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => setShowApproveModal(claim)}
                      disabled={isProcessing}
                      className="bg-green-500 hover:bg-green-600 text-white"
                    >
                      {isProcessing ? '...' : `✓ ${claim.points}pts`}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowDenyModal(claim.id)}
                      disabled={isProcessing}
                    >
                      ✗
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {maxItems && pendingClaims.length > maxItems && (
            <p className="text-xs text-center text-muted-foreground pt-2">
              +{pendingClaims.length - maxItems} more prayer{pendingClaims.length - maxItems !== 1 ? 's' : ''} to review
            </p>
          )}
        </div>
      </CardContent>

      {/* Deny Modal */}
      {showDenyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full"
          >
            <h3 className="text-lg font-bold mb-3">Deny Prayer Claim</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add a reason to help your child understand:
            </p>

            <textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Optional: Why are you denying this claim?"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 mb-4 text-sm"
              rows={3}
            />

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDenyModal(null);
                  setDenyReason('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => denyClaim(showDenyModal, denyReason || undefined)}
                disabled={processing === showDenyModal}
                className="flex-1 bg-red-500 hover:bg-red-600"
              >
                {processing === showDenyModal ? 'Processing...' : 'Deny'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full"
          >
            <h3 className="text-lg font-bold mb-2">Approve Prayer: {showApproveModal.prayerName}</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {showApproveModal.childName} - {formatTime(showApproveModal.claimedAt)}
            </p>

            <div className="space-y-3 mb-6">
              <button
                onClick={() => approveClaim(showApproveModal.id, true)}
                disabled={!!processing}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">⏰</span>
                    <div className="text-left">
                      <div className="text-lg">On Time</div>
                      <div className="text-sm opacity-90">
                        {showApproveModal.prayerName === 'Fajr' ? '5 points' : '3 points'}
                      </div>
                    </div>
                  </div>
                  <CheckCircle className="w-6 h-6" />
                </div>
              </button>

              <button
                onClick={() => approveClaim(showApproveModal.id, false)}
                disabled={!!processing}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">⏳</span>
                    <div className="text-left">
                      <div className="text-lg">Late (Qadha)</div>
                      <div className="text-sm opacity-90">1 point</div>
                    </div>
                  </div>
                  <CheckCircle className="w-6 h-6" />
                </div>
              </button>
            </div>

            <Button
              variant="outline"
              onClick={() => setShowApproveModal(null)}
              className="w-full"
              disabled={!!processing}
            >
              Cancel
            </Button>
          </motion.div>
        </div>
      )}
    </Card>
  );
}