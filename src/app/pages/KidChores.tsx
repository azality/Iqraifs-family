/**
 * v27: Kid Chores page.
 *
 * Pattern mirrors PrayerLogging: kid taps "I did this!" on a positive
 * trackable item, claim goes into pending state, parent approves
 * from their dashboard. On approval, a real point event is written
 * with proper itemName snapshot so the home/garden/feeds all reflect
 * the credit immediately.
 *
 * Lists every active positive (points > 0) non-Salah trackable item
 * the family has configured, plus its current claim status for today.
 * Kids never see negatives; that's by design (and matches the rest
 * of the kid surface).
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Sparkles, Check, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { useFamilyContext } from '../contexts/FamilyContext';
import { useAuth } from '../contexts/AuthContext';
import { useTrackableItems } from '../hooks/useTrackableItems';
import { createChoreClaim, getTodayChoreClaims } from '../../utils/api';
import { toast } from 'sonner';

interface ChoreClaim {
  id: string;
  trackableItemId: string;
  itemName: string;
  points: number;
  status: 'pending' | 'approved' | 'denied';
  claimedAt: string;
  denialReason?: string | null;
}

export function KidChores() {
  const navigate = useNavigate();
  const { getCurrentChild } = useFamilyContext();
  const { accessToken } = useAuth();
  const { items: trackableItems, loading: itemsLoading } = useTrackableItems();
  const child = getCurrentChild();

  const [claims, setClaims] = useState<ChoreClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  // v28: explicit "submitted to your grown-up" banner. Kid taps
  // "I did this!" → 6s confirmation that their tap reached us and
  // tells them what happens next.
  const [justSubmitted, setJustSubmitted] = useState<string | null>(null);

  useEffect(() => {
    if (!child || !accessToken) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await getTodayChoreClaims(child.id);
        if (!cancelled) setClaims(res || []);
      } catch (err) {
        // Silent — kid surface should never error-toast on a poll.
        console.warn('Failed to load chore claims:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    refresh();
    const interval = setInterval(refresh, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [child, accessToken]);

  // Filter to positive non-Salah items. Salah has its own page.
  const choreItems = trackableItems.filter(
    (i) => typeof i.points === 'number' && i.points > 0 && i.category !== 'salah'
  );

  const claimByItemId = (itemId: string): ChoreClaim | undefined =>
    claims.find((c) => c.trackableItemId === itemId);

  const handleClaim = async (item: any) => {
    if (!child) return;
    setSubmitting(item.id);
    try {
      await createChoreClaim({ childId: child.id, trackableItemId: item.id });
      const fresh = await getTodayChoreClaims(child.id);
      setClaims(fresh || []);
      // v28: dual confirmation — toast for the immediate "got it",
      // plus a banner at the top of the page so the kid can see
      // exactly what was sent and what happens next.
      toast.success(`MashAllah! "${item.name}" sent for approval.`);
      setJustSubmitted(item.name);
      setTimeout(() => setJustSubmitted(null), 6000);
    } catch (err: any) {
      console.error('Chore claim error:', err);
      toast.error(err?.message || 'Could not log this. Try again.');
    } finally {
      setSubmitting(null);
    }
  };

  if (!child) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-amber-50 to-orange-50">
        <p className="text-gray-700">Please log in as a kid first.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 p-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/kid/home')}
          className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back to Dashboard</span>
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            ✨ My Chores
          </h1>
          <p className="text-gray-700">
            Did something good? Tap "I did this!" and your grown-up will give you the points.
          </p>
        </div>

        {/* v28: confirmation banner — kid sees it after each "I did
            this!" tap so they know it was sent and what comes next. */}
        {justSubmitted && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 bg-gradient-to-r from-amber-100 to-yellow-100 border-2 border-amber-300 rounded-xl px-4 py-3 flex items-start gap-3 shadow-md"
          >
            <span className="text-2xl shrink-0">📬</span>
            <div className="text-sm">
              <p className="font-bold text-amber-900">
                Sent to your grown-up — {justSubmitted}
              </p>
              <p className="text-amber-800 mt-0.5">
                They'll see it on their screen and approve. You'll get
                your points then!
              </p>
            </div>
          </motion.div>
        )}

        {(loading || itemsLoading) && (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto mb-3"></div>
            <p className="text-gray-600 text-sm">Loading chores…</p>
          </div>
        )}

        {!loading && !itemsLoading && choreItems.length === 0 && (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <p className="text-gray-700 font-semibold mb-1">No chores set up yet</p>
            <p className="text-gray-500 text-sm">Ask a parent to add some positive habits in Settings.</p>
          </div>
        )}

        <div className="space-y-3">
          {choreItems.map((item, index) => {
            const claim = claimByItemId(item.id);
            const isPending = claim?.status === 'pending';
            const isApproved = claim?.status === 'approved';
            const isDenied = claim?.status === 'denied';
            const isClaimed = !!claim;
            const isSubmitting = submitting === item.id;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className={`bg-white rounded-xl shadow-md p-5 border-2 ${
                  isApproved ? 'border-green-300' :
                  isPending ? 'border-yellow-300' :
                  isDenied ? 'border-red-200' :
                  'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg text-gray-900 truncate">{item.name}</h3>
                    <p className="text-sm text-gray-600">
                      <span className="text-green-700 font-semibold">+{item.points}</span> points when approved
                    </p>
                    {isApproved && (
                      <p className="mt-2 text-sm font-semibold text-green-800">
                        🌟 MashAllah! You earned +{item.points} points.
                      </p>
                    )}
                    {isPending && (
                      <p className="mt-2 inline-flex items-center gap-1 text-sm text-amber-800">
                        <Clock className="w-4 h-4" /> Waiting for your grown-up
                      </p>
                    )}
                    {isDenied && (
                      <>
                        <p className="mt-2 text-sm text-red-700">Not approved this time.</p>
                        {claim?.denialReason && (
                          <p className="text-xs text-gray-600 mt-1">💬 {claim.denialReason}</p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="shrink-0">
                    {!isClaimed ? (
                      <button
                        onClick={() => handleClaim(item)}
                        disabled={isSubmitting}
                        className="px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-lg shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50"
                      >
                        {isSubmitting ? '…' : 'I did this!'}
                      </button>
                    ) : isApproved ? (
                      <Check className="w-8 h-8 text-green-600" />
                    ) : isPending ? (
                      <Clock className="w-8 h-8 text-amber-500" />
                    ) : (
                      <span className="text-3xl">❌</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 bg-amber-50 border-2 border-amber-200 rounded-xl p-5"
        >
          <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> How this works
          </h3>
          <ul className="text-sm text-amber-900 space-y-1.5">
            <li>1. Did a chore? Tap "I did this!"</li>
            <li>2. Your grown-up sees it and approves.</li>
            <li>3. Points get added to your total — and your Garden grows 🌸</li>
          </ul>
        </motion.div>
      </div>
    </div>
  );
}
