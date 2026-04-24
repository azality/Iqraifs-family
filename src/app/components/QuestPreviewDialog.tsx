import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Sparkles, Star, Clock, Target } from 'lucide-react';
import { projectId } from '/utils/supabase/info.tsx';

interface QuestTemplate {
  id: string;
  type: 'daily' | 'weekly';
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  bonusPoints: number;
  category: string;
  icon: string;
  requirements: Array<{
    type: string;
    target: number;
    description: string;
  }>;
}

interface PreviewResponse {
  templates?: QuestTemplate[];
  type?: 'daily' | 'weekly';
  count?: number;
  error?: string;
  message?: string;
  code?: string;
  hint?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  childId: string | null;
  childName: string;
  questType: 'daily' | 'weekly';
  accessToken: string | null;
  onConfirmed?: () => void;
}

// Inspect and pick the quest templates that will be generated for a child
// before actually writing them to the backend.
//
// Flow:
//   1. Parent clicks "Preview Daily" / "Preview Weekly" on Challenges.
//   2. This dialog opens and fetches
//      GET /children/:childId/challenges/preview?type=daily|weekly.
//   3. If the backend returns NO_TRACKABLE_ITEMS, we surface the hint and
//      close the dialog so Challenges can show its inline helper card.
//   4. Otherwise: render the templates, let parent toggle any of them on/off
//      (all on by default), and confirm with "Create selected quests" →
//      POST /children/:childId/challenges/generate with `templateIds`.
export function QuestPreviewDialog({
  open,
  onOpenChange,
  childId,
  childName,
  questType,
  accessToken,
  onConfirmed,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<QuestTemplate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !childId || !accessToken) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        setTemplates([]);
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${childId}/challenges/preview?type=${questType}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const data: PreviewResponse = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setErrorMsg(data?.message || data?.error || 'Failed to load preview');
          return;
        }

        if (data.code === 'NO_TRACKABLE_ITEMS') {
          // Bubble this up as a toast and close — Challenges surfaces the
          // actionable inline helper card.
          toast.info(data.message || 'No behaviors configured yet', {
            description: data.hint,
          });
          onOpenChange(false);
          return;
        }

        const list = data.templates || [];
        setTemplates(list);
        // All selected by default so "just click Create" matches the old
        // random-generate behavior.
        setSelected(new Set(list.map((t) => t.id)));
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message || 'Failed to load preview');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, childId, accessToken, questType, onOpenChange]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === templates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(templates.map((t) => t.id)));
    }
  };

  const confirm = async () => {
    if (!childId || !accessToken) return;
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error('Pick at least one quest to create');
      return;
    }
    try {
      setCreating(true);
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${childId}/challenges/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ type: questType, templateIds: ids }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || data?.error || 'Failed to create quests');
        return;
      }
      toast.success(
        `Created ${data.count || ids.length} ${questType} quest${(data.count || ids.length) === 1 ? '' : 's'}!`,
        { description: `${childName} can now accept and complete them.` }
      );
      onOpenChange(false);
      onConfirmed?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create quests');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Preview {questType === 'daily' ? 'Daily' : 'Weekly'} Quests for {childName}
          </DialogTitle>
          <DialogDescription>
            These are the quests we can generate from your configured behaviors.
            Uncheck any you don't want, then tap <em>Create</em>.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-10 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-3"></div>
            <p className="text-sm text-muted-foreground">Loading preview…</p>
          </div>
        )}

        {!loading && errorMsg && (
          <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            {errorMsg}
          </div>
        )}

        {!loading && !errorMsg && templates.length > 0 && (
          <>
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-purple-700 hover:text-purple-900 underline"
              >
                {selected.size === templates.length ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-xs text-muted-foreground">
                {selected.size} of {templates.length} selected
              </span>
            </div>
            <div className="space-y-3 mt-1">
              {templates.map((t, idx) => {
                const isSelected = selected.has(t.id);
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`rounded-xl border-2 p-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-purple-400 bg-gradient-to-br from-purple-50 to-pink-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                    onClick={() => toggleOne(t.id)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <span className="text-3xl leading-none">{t.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{t.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {t.description}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <Badge variant="outline" className="text-[10px]">
                            <Target className="h-2.5 w-2.5 mr-1" />
                            {t.difficulty}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] bg-yellow-50">
                            <Star className="h-2.5 w-2.5 mr-1" />
                            +{t.bonusPoints}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            <Clock className="h-2.5 w-2.5 mr-1" />
                            {t.type}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={creating || loading || templates.length === 0 || selected.size === 0}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 gap-1"
          >
            <Sparkles className="h-4 w-4" />
            {creating ? 'Creating…' : `Create ${selected.size} Quest${selected.size === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
