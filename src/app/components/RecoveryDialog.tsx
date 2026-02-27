import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { toast } from "sonner";
import { Heart, Lightbulb, CheckCircle2, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { PointEvent } from "../data/mockData";

interface RecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  negativeEvent: PointEvent | null;
  childName: string;
  itemName: string;
  onSubmitRecovery: (recoveryAction: 'apology' | 'reflection' | 'correction', notes: string) => Promise<void>;
}

export function RecoveryDialog({ 
  open, 
  onOpenChange, 
  negativeEvent,
  childName,
  itemName,
  onSubmitRecovery 
}: RecoveryDialogProps) {
  const [recoveryAction, setRecoveryAction] = useState<'apology' | 'reflection' | 'correction'>('apology');
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!notes.trim()) {
      toast.error("Please write your thoughts before submitting");
      return;
    }

    if (notes.trim().length < 10) {
      toast.error("Please write at least a few sentences");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitRecovery(recoveryAction, notes);
      toast.success("Recovery submitted! Waiting for parent approval 🌟");
      setNotes("");
      setRecoveryAction('apology');
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to submit recovery");
    } finally {
      setSubmitting(false);
    }
  };

  const recoveryPoints = {
    'apology': 2,
    'reflection': 3,
    'correction': 5
  };

  const prompts = {
    apology: [
      "What did you do wrong?",
      "Who did it affect?",
      "How do you feel about it now?",
      "What will you do differently next time?"
    ],
    reflection: [
      "Why do you think this happened?",
      "What were you feeling at that moment?",
      "What could you have done instead?",
      "What did you learn from this?",
      "How can you avoid this in the future?"
    ],
    correction: [
      "What specific action happened?",
      "Why was it wrong?",
      "What have you already done to make it right?",
      "What will you do to prevent this in the future?",
      "How can you prove you've learned from this?"
    ]
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-purple-50 to-blue-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Heart className="h-6 w-6 text-pink-500" />
            Recovery Time! 💪
          </DialogTitle>
          <DialogDescription className="text-base">
            Everyone makes mistakes, {childName}! What matters is how we learn and grow from them. 🌱
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* What Happened Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-white rounded-lg border-2 border-red-200"
          >
            <p className="text-sm text-muted-foreground mb-1">What happened:</p>
            <p className="font-semibold text-red-700">{itemName}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Lost {Math.abs(negativeEvent?.points || 0)} points
            </p>
          </motion.div>

          {/* Choose Recovery Type */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">How do you want to make it better?</Label>
            <RadioGroup value={recoveryAction} onValueChange={(v: any) => setRecoveryAction(v)}>
              <motion.div
                whileHover={{ scale: 1.02 }}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  recoveryAction === 'apology' ? 'border-pink-500 bg-pink-50' : 'border-gray-200 bg-white'
                }`}
                onClick={() => setRecoveryAction('apology')}
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="apology" id="apology" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Heart className="h-5 w-5 text-pink-500" />
                      <Label htmlFor="apology" className="cursor-pointer font-semibold text-base">
                        Say Sorry (Apology)
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Acknowledge what happened and say you're sorry
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-medium text-pink-600">
                        +{recoveryPoints.apology} recovery points
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02 }}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  recoveryAction === 'reflection' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                }`}
                onClick={() => setRecoveryAction('reflection')}
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="reflection" id="reflection" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-blue-500" />
                      <Label htmlFor="reflection" className="cursor-pointer font-semibold text-base">
                        Think It Through (Reflection)
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Share what you learned and how you'll grow
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-medium text-blue-600">
                        +{recoveryPoints.reflection} recovery points
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02 }}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  recoveryAction === 'correction' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
                }`}
                onClick={() => setRecoveryAction('correction')}
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="correction" id="correction" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <Label htmlFor="correction" className="cursor-pointer font-semibold text-base">
                        Make It Right (Correction)
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Show what you did to fix the problem
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-medium text-green-600">
                        +{recoveryPoints.correction} recovery points
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </RadioGroup>
          </div>

          {/* Writing Prompts */}
          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="font-semibold text-yellow-900 mb-2">💭 Think about these questions:</p>
            <ul className="space-y-1">
              {prompts[recoveryAction].map((prompt, index) => (
                <li key={index} className="text-sm text-yellow-800">
                  • {prompt}
                </li>
              ))}
            </ul>
          </div>

          {/* Notes Textarea */}
          <div className="space-y-2">
            <Label htmlFor="recovery-notes" className="text-base font-semibold">
              Write your {recoveryAction}:
            </Label>
            <Textarea
              id="recovery-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={8}
              className="resize-none text-base"
              placeholder={`Write your ${recoveryAction} here... Be honest and thoughtful. Your parents will read this.`}
            />
            <p className="text-sm text-muted-foreground">
              {notes.length}/500 characters • At least 10 characters needed
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3">
            <Button
              onClick={handleSubmit}
              disabled={submitting || notes.trim().length < 10}
              className="flex-1 h-12 text-lg"
            >
              {submitting ? (
                <span>Submitting...</span>
              ) : (
                <span className="flex items-center gap-2">
                  <Heart className="h-5 w-5" />
                  Submit for Parent Approval
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-12"
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>

          {/* Encouragement */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="p-4 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg border border-purple-200 text-center"
          >
            <p className="text-sm text-purple-900">
              🌟 <strong>Remember:</strong> Everyone makes mistakes! What makes you special is learning from them. 
              Your parents will be proud of your growth! 💪✨
            </p>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
