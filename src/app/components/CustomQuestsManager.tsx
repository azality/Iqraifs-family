import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Plus, Edit, Trash2, Play, Pause } from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { supabase } from '/utils/supabase/client';
import { CustomQuestCreator } from './CustomQuestCreator';

interface CustomQuestsManagerProps {
  familyId: string;
  // v27: list of children in the current family. When a parent creates
  // or activates a custom quest we now auto-generate a challenge for
  // every kid so the quest actually shows up in their feed (the older
  // flow created the quest *definition* only, leaving kids with
  // nothing to see). Optional so existing call sites that don't pass
  // this still work — but they'll just skip the auto-generation.
  childIds?: string[];
}

interface CustomQuest {
  id: string;
  familyId: string;
  title: string;
  description: string;
  type: 'daily' | 'weekly';
  behaviorIds: string[];
  targetCount: number;
  bonusPoints: number;
  difficulty: 'easy' | 'medium' | 'hard';
  icon: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// v27: helper that loops every kid in the family and POSTs to the
// per-child generate endpoint. Idempotent on the server (a new
// challenge id is created per call) so calling repeatedly does not
// fail — but we still surface "already running" duplicates by
// returning early on 4xx. Returns { ok: count, failed: count }.
async function fanOutGenerate(
  familyId: string,
  childIds: string[],
  customQuestId: string,
  accessToken: string
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const childId of childIds) {
    try {
      const res = await fetch(
        `https://${(await import('/utils/supabase/info.tsx')).projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${childId}/custom-quests/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ customQuestId, familyId }),
        }
      );
      if (res.ok) ok += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}

export function CustomQuestsManager({ familyId, childIds = [] }: CustomQuestsManagerProps) {
  const [customQuests, setCustomQuests] = useState<CustomQuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreator, setShowCreator] = useState(false);
  const [editingQuest, setEditingQuest] = useState<CustomQuest | null>(null);

  useEffect(() => {
    if (familyId) {
      loadCustomQuests();
    }
  }, [familyId]);

  const loadCustomQuests = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/custom-quests`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCustomQuests(data);
      }
    } catch (error) {
      console.error('Load custom quests error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (quest: CustomQuest) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/custom-quests/${quest.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          },
          body: JSON.stringify({
            ...quest,
            active: !quest.active
          })
        }
      );

      if (response.ok) {
        const isActivating = !quest.active; // we're flipping FROM the old value
        if (isActivating && childIds.length > 0) {
          // v27: when a parent activates a custom quest, fan out the
          // generate call to every kid in the family. Without this the
          // quest is just a definition; nothing actually shows up in
          // the kid view. The toast tells the parent how many kids
          // got it (so they notice if it failed for some).
          const { ok, failed } = await fanOutGenerate(
            familyId,
            childIds,
            quest.id,
            session.access_token
          );
          if (failed === 0) {
            toast.success(`Activated — sent to ${ok} kid${ok === 1 ? '' : 's'}.`);
          } else {
            toast.warning(`Activated — sent to ${ok} of ${ok + failed} kids. Try refreshing.`);
          }
        } else {
          toast.success(quest.active ? 'Custom quest paused' : 'Custom quest activated!');
        }
        loadCustomQuests();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update custom quest');
      }
    } catch (error) {
      console.error('Toggle custom quest error:', error);
      toast.error('Failed to update custom quest');
    }
  };

  const handleDelete = async (quest: CustomQuest) => {
    if (!confirm(`Are you sure you want to delete "${quest.title}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/custom-quests/${quest.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (response.ok) {
        toast.success('Custom quest deleted');
        loadCustomQuests();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete custom quest');
      }
    } catch (error) {
      console.error('Delete custom quest error:', error);
      toast.error('Failed to delete custom quest');
    }
  };

  const handleEdit = (quest: CustomQuest) => {
    setEditingQuest(quest);
    setShowCreator(true);
  };

  // v29: "Generate now" — explicit fan-out trigger for the active
  // quest. Useful for:
  //   - Pre-v27 active customs whose definitions exist but no
  //     per-child challenge was ever created
  //   - Cases where the auto-fan-out at activate time silently
  //     failed (network blip, expired token, etc.)
  // Surfaces the per-child success/fail count in a toast so the
  // parent can see EXACTLY what reached which kid.
  const handleGenerateNow = async (quest: CustomQuest) => {
    if (!quest.active) {
      toast.error('Activate the quest first, then tap Generate.');
      return;
    }
    if (childIds.length === 0) {
      toast.error('Add at least one child to the family first.');
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please sign in again.');
        return;
      }
      const { ok, failed } = await fanOutGenerate(
        familyId,
        childIds,
        quest.id,
        session.access_token
      );
      if (failed === 0) {
        toast.success(`"${quest.title}" sent to ${ok} kid${ok === 1 ? '' : 's'}.`);
      } else if (ok > 0) {
        toast.warning(`"${quest.title}" sent to ${ok} of ${ok + failed} kids — try again for the rest.`);
      } else {
        toast.error(`Could not send "${quest.title}" to any kid. Check the parent permissions and try again.`);
      }
    } catch (err: any) {
      console.error('Generate now error:', err);
      toast.error(err?.message || 'Could not generate.');
    }
  };

  const handleCreateNew = () => {
    setEditingQuest(null);
    setShowCreator(true);
  };

  const handleCreatorClose = () => {
    setShowCreator(false);
    const wasEditing = !!editingQuest;
    setEditingQuest(null);
    // v27: after a brand-new (not edit) custom quest is created, fan
    // out to every kid in the family so the quest actually appears
    // in their feed. Reload first so we have the freshly-created
    // quest's id, then generate for active quests only. Edit flow
    // already triggers generate via the active toggle when needed.
    (async () => {
      const before = customQuests.map(q => q.id);
      await loadCustomQuests();
      if (wasEditing || childIds.length === 0) return;
      // Find the newly-added active quest. We re-read from state
      // after loadCustomQuests by querying the server one more time;
      // simpler than waiting for React to flush.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/custom-quests`,
          { headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': publicAnonKey } }
        );
        if (!res.ok) return;
        const all: CustomQuest[] = await res.json();
        const fresh = all.filter(q => !before.includes(q.id) && q.active);
        for (const q of fresh) {
          const { ok, failed } = await fanOutGenerate(familyId, childIds, q.id, session.access_token);
          if (failed === 0) {
            toast.success(`"${q.title}" sent to ${ok} kid${ok === 1 ? '' : 's'}.`);
          } else if (ok > 0) {
            toast.warning(`"${q.title}" sent to ${ok} of ${ok + failed} kids.`);
          }
        }
      } catch (err) {
        console.warn('Custom quest auto-generate after create failed:', err);
      }
    })();
  };

  const getDifficultyColor = (difficulty: 'easy' | 'medium' | 'hard') => {
    switch (difficulty) {
      case 'easy': return 'bg-green-100 text-green-700';
      case 'medium': return 'bg-yellow-100 text-yellow-700';
      case 'hard': return 'bg-red-100 text-red-700';
    }
  };

  return (
    <>
      <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                🎯 Custom Quests
              </CardTitle>
              <CardDescription>
                Create ongoing quests for behaviors you want to encourage
              </CardDescription>
            </div>
            <Button onClick={handleCreateNew} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Custom Quest
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
            </div>
          ) : customQuests.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-muted-foreground">No custom quests yet.</p>
              <p className="text-sm text-muted-foreground">
                Create recurring quests for important behaviors like daily prayers, homework, or helping with chores.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {customQuests.map((quest) => (
                <Card key={quest.id} className={`border-2 ${quest.active ? 'border-purple-300 bg-white' : 'border-gray-200 bg-gray-50'}`}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="text-3xl">{quest.icon}</span>
                      <div className="flex-1">
                        <h4 className="font-semibold">{quest.title}</h4>
                        <p className="text-sm text-muted-foreground">{quest.description}</p>
                      </div>
                      <Switch
                        checked={quest.active}
                        onCheckedChange={() => handleToggleActive(quest)}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge className={getDifficultyColor(quest.difficulty)}>
                        {quest.difficulty}
                      </Badge>
                      <Badge variant="outline" className="bg-green-100 text-green-700">
                        +{quest.bonusPoints} pts
                      </Badge>
                      <Badge variant="outline" className="bg-blue-100 text-blue-700">
                        {quest.type === 'daily' ? 'Daily' : 'Weekly'}
                      </Badge>
                      <Badge variant="outline">
                        {quest.targetCount}x target
                      </Badge>
                    </div>

                    {!quest.active && (
                      <p className="text-xs text-muted-foreground italic">
                        Quest is paused - won't generate new challenges
                      </p>
                    )}

                    <div className="flex gap-2 pt-2 flex-wrap">
                      {/* v29: "Generate now" — surfaces an explicit
                          fan-out trigger so existing active customs
                          can be retroactively pushed to kids. The
                          auto-fan-out at activate time still runs
                          first; this is the safety net + the answer
                          to "I made a quest yesterday and my kid
                          still doesn't see it." */}
                      {quest.active && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleGenerateNow(quest)}
                          className="flex-1 gap-1 bg-purple-600 hover:bg-purple-700"
                        >
                          <Play className="h-3 w-3" />
                          Generate now
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(quest)}
                        className="flex-1 gap-1"
                      >
                        <Edit className="h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(quest)}
                        className="flex-1 gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="mt-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              <strong>💡 Tip:</strong> Custom quests automatically create challenges for your kids based on configured behaviors. 
              For example, "Pray 5 times" tracks the "Salah" behavior and gives bonus points when completed!
            </p>
          </div>
        </CardContent>
      </Card>

      <CustomQuestCreator
        open={showCreator}
        onOpenChange={handleCreatorClose}
        familyId={familyId}
        onQuestCreated={handleCreatorClose}
        editQuest={editingQuest}
      />
    </>
  );
}
