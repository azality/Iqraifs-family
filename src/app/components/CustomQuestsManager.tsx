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

export function CustomQuestsManager({ familyId }: CustomQuestsManagerProps) {
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
        toast.success(quest.active ? 'Custom quest paused' : 'Custom quest activated!');
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

  const handleCreateNew = () => {
    setEditingQuest(null);
    setShowCreator(true);
  };

  const handleCreatorClose = () => {
    setShowCreator(false);
    setEditingQuest(null);
    loadCustomQuests();
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

                    <div className="flex gap-2 pt-2">
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
