/**
 * v27: ChoreApprovalsWidget — parent-side approval queue for kid-
 * claimed chores. Mirrors PrayerApprovalsWidget structurally (same
 * priority mode, same "renders null when empty"), but simpler — no
 * On-time vs Late branching, just approve/deny.
 *
 * Lives at the top of the parent dashboard alongside Prayer Approvals
 * so anything waiting on the parent is visible immediately.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  getPendingChoreClaims,
  approveChoreClaim,
  denyChoreClaim,
} from '../../utils/api';

interface ChoreClaim {
  id: string;
  childId: string;
  childName?: string;
  trackableItemId: string;
  itemName: string;
  points: number;
  note: string | null;
  status: 'pending' | 'approved' | 'denied';
  claimedAt: string;
}

interface ChoreApprovalsWidgetProps {
  // Same priority semantics as PrayerApprovalsWidget: when true and
  // there are zero pending claims, render NULL (no clutter card).
  priority?: boolean;
  maxItems?: number;
}

export function ChoreApprovalsWidget({ priority = false, maxItems }: ChoreApprovalsWidgetProps) {
  const [pending, setPending] = useState<ChoreClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [denyTarget, setDenyTarget] = useState<ChoreClaim | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const refresh = async () => {
    try {
      setLoading(true);
      const list = await getPendingChoreClaims();
      setPending(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Could not load chore claims:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // Refresh every 30s — same cadence as prayer approvals.
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, []);

  const approve = async (claim: ChoreClaim) => {
    setBusyId(claim.id);
    try {
      await approveChoreClaim(claim.id);
      toast.success(`Approved — +${claim.points} for ${claim.childName || 'kid'}.`);
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Could not approve.');
    } finally {
      setBusyId(null);
    }
  };

  const deny = async () => {
    if (!denyTarget) return;
    setBusyId(denyTarget.id);
    try {
      await denyChoreClaim(denyTarget.id, denyReason || undefined);
      toast.success('Denied.');
      setDenyTarget(null);
      setDenyReason('');
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Could not deny.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && priority) return null;
  if (pending.length === 0) {
    if (priority) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> Chore Approvals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const display = maxItems ? pending.slice(0, maxItems) : pending;

  return (
    <>
      <Card className={priority ? 'border-2 border-amber-400 bg-amber-50/40 shadow-lg' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sparkles className={priority ? "h-5 w-5 text-amber-700" : "h-5 w-5"} />
              {priority
                ? `${pending.length} chore${pending.length === 1 ? '' : 's'} waiting for approval`
                : 'Chore Approvals'}
              {priority && (
                <span className="ml-2 inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-amber-500 text-white text-xs font-bold animate-pulse">
                  {pending.length} new
                </span>
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {display.map((cl, i) => {
              const busy = busyId === cl.id;
              return (
                <motion.div
                  key={cl.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="border border-amber-200 bg-amber-50 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">
                        {cl.childName || 'Kid'} — {cl.itemName}
                      </p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        +{cl.points} pts on approve
                        {cl.note && ` · "${cl.note}"`}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => approve(cl)}
                        className="bg-green-500 hover:bg-green-600 text-white"
                      >
                        ✓ +{cl.points}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setDenyTarget(cl)}
                        className="text-gray-500 hover:text-red-700"
                        aria-label="Deny chore claim"
                      >
                        ✗
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {maxItems && pending.length > maxItems && (
              <p className="text-xs text-center text-muted-foreground pt-1">
                +{pending.length - maxItems} more to review
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Deny modal — keep optional reason short */}
      {denyTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-2">Deny chore claim</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {denyTarget.childName || 'Kid'} claimed <strong>{denyTarget.itemName}</strong>.
              Add a short reason if you want — they'll see it.
            </p>
            <textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Optional reason"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 mb-4 text-sm"
              rows={3}
            />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setDenyTarget(null); setDenyReason(''); }} className="flex-1">
                Cancel
              </Button>
              <Button onClick={deny} disabled={!!busyId} className="flex-1 bg-red-500 hover:bg-red-600">
                {busyId ? '…' : 'Deny'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
