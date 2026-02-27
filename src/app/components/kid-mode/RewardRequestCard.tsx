import { useState } from 'react';
import { motion } from 'motion/react';
import { Gift, Sparkles, Lock, Send, Clock } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';

interface RewardRequestCardProps {
  rewardId: string;
  rewardName: string;
  rewardDescription?: string;
  pointCost: number;
  currentPoints: number;
  isPending?: boolean;
  onRequestSubmit: (rewardId: string, notes?: string) => Promise<void>;
}

export function RewardRequestCard({
  rewardId,
  rewardName,
  rewardDescription,
  pointCost,
  currentPoints,
  isPending,
  onRequestSubmit
}: RewardRequestCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canAfford = currentPoints >= pointCost;
  const progress = Math.min((currentPoints / pointCost) * 100, 100);

  const handleSubmitRequest = async () => {
    try {
      setSubmitting(true);
      await onRequestSubmit(rewardId, notes.trim() || undefined);
      setDialogOpen(false);
      setNotes('');
    } catch (error) {
      console.error('Failed to submit request:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // Size category based on points
  const category = pointCost < 100 ? 'small' : pointCost < 500 ? 'medium' : 'large';
  const categoryColor = {
    small: 'from-green-400 to-emerald-500',
    medium: 'from-blue-400 to-indigo-500',
    large: 'from-purple-400 to-pink-500'
  }[category];

  return (
    <>
      <motion.div
        whileHover={{ scale: canAfford ? 1.03 : 1 }}
        className={`relative bg-white rounded-[1.5rem] p-4 border-2 shadow-md transition-all ${
          canAfford
            ? 'border-[var(--kid-warm-gold)] hover:shadow-xl cursor-pointer'
            : 'border-gray-200 opacity-75'
        }`}
      >
        {/* Points Badge */}
        <div className={`absolute -top-3 -right-3 bg-gradient-to-br ${categoryColor} text-white px-4 py-2 rounded-full font-bold text-sm shadow-lg flex items-center gap-1`}>
          <Sparkles className="w-4 h-4" />
          {pointCost}
        </div>

        {/* Reward Content */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Gift className={`w-6 h-6 ${canAfford ? 'text-[var(--kid-warm-gold)]' : 'text-gray-400'}`} />
            <h3 className="font-bold text-[var(--kid-midnight-blue)] text-lg">
              {rewardName}
            </h3>
          </div>
          
          {rewardDescription && (
            <p className="text-sm text-gray-600 mb-3">
              {rewardDescription}
            </p>
          )}

          {/* Progress Bar */}
          {!canAfford && (
            <div className="mb-3">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${categoryColor} transition-all duration-500`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                {pointCost - currentPoints} more points needed!
              </p>
            </div>
          )}
        </div>

        {/* Action Button */}
        {isPending ? (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 flex items-center gap-2 justify-center">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">
              Waiting for parent...
            </span>
          </div>
        ) : canAfford ? (
          <Button
            onClick={() => setDialogOpen(true)}
            className="w-full bg-gradient-to-r from-[var(--kid-warm-gold)] to-yellow-500 hover:from-yellow-500 hover:to-[var(--kid-warm-gold)] text-[var(--kid-midnight-blue)] font-bold shadow-lg"
          >
            <Send className="w-4 h-4 mr-2" />
            Ask Parent
          </Button>
        ) : (
          <div className="bg-gray-100 border-2 border-gray-200 rounded-xl p-3 flex items-center gap-2 justify-center opacity-50">
            <Lock className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-600">
              Keep earning!
            </span>
          </div>
        )}
      </motion.div>

      {/* Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <Gift className="w-6 h-6 text-[var(--kid-warm-gold)]" />
              Ask for {rewardName}?
            </DialogTitle>
            <DialogDescription className="text-base">
              This will send a request to your parents. You can add a special message if you'd like!
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Message (Optional) 💬
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Please can we go after Jummah? 🥺"
              rows={4}
              maxLength={200}
              className="resize-none border-2 border-gray-200 rounded-xl focus:border-[var(--kid-warm-gold)]"
            />
            <p className="text-xs text-gray-500 mt-2">
              {notes.length}/200 characters
            </p>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitRequest}
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-[var(--kid-warm-gold)] to-yellow-500 hover:from-yellow-500 hover:to-[var(--kid-warm-gold)] text-[var(--kid-midnight-blue)] font-bold"
            >
              {submitting ? (
                'Sending...'
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}