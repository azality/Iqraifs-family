import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Sparkles, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { supabase } from '/utils/supabase/client';

interface CustomQuestCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  familyId: string;
  onQuestCreated?: () => void;
  editQuest?: CustomQuest | null;
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

interface Behavior {
  id: string;
  name: string;
  points: number;
  category: string;
}

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy', color: 'bg-green-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'hard', label: 'Hard', color: 'bg-red-500' },
];

const ICON_OPTIONS = ['🎯', '⭐', '🏆', '🌟', '✨', '💎', '🔥', '🌙', '☀️', '📚', '🕌', '🤲', '💪', '🎨', '🎮'];

export function CustomQuestCreator({ open, onOpenChange, familyId, onQuestCreated, editQuest }: CustomQuestCreatorProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'daily' | 'weekly'>('daily');
  const [selectedBehaviorIds, setSelectedBehaviorIds] = useState<string[]>([]);
  const [targetCount, setTargetCount] = useState('5');
  const [bonusPoints, setBonusPoints] = useState('20');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [icon, setIcon] = useState('🎯');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [loadingBehaviors, setLoadingBehaviors] = useState(true);

  // Load behaviors
  useEffect(() => {
    if (open && familyId) {
      loadBehaviors();
    }
  }, [open, familyId]);

  // Populate form when editing
  useEffect(() => {
    if (editQuest) {
      setTitle(editQuest.title);
      setDescription(editQuest.description);
      setType(editQuest.type);
      setSelectedBehaviorIds(editQuest.behaviorIds);
      setTargetCount(String(editQuest.targetCount));
      setBonusPoints(String(editQuest.bonusPoints));
      setDifficulty(editQuest.difficulty);
      setIcon(editQuest.icon);
      setActive(editQuest.active);
    } else {
      resetForm();
    }
  }, [editQuest]);

  const loadBehaviors = async () => {
    setLoadingBehaviors(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/behaviors`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setBehaviors(data);
      }
    } catch (error) {
      console.error('Load behaviors error:', error);
    } finally {
      setLoadingBehaviors(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setType('daily');
    setSelectedBehaviorIds([]);
    setTargetCount('5');
    setBonusPoints('20');
    setDifficulty('medium');
    setIcon('🎯');
    setActive(true);
  };

  const toggleBehavior = (behaviorId: string) => {
    setSelectedBehaviorIds(prev => 
      prev.includes(behaviorId)
        ? prev.filter(id => id !== behaviorId)
        : [...prev, behaviorId]
    );
  };

  const handleSave = async () => {
    // Validation
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!description.trim()) {
      toast.error('Please enter a description');
      return;
    }
    if (selectedBehaviorIds.length === 0) {
      toast.error('Please select at least one behavior to track');
      return;
    }
    if (parseInt(targetCount) < 1) {
      toast.error('Target count must be at least 1');
      return;
    }
    if (parseInt(bonusPoints) < 1) {
      toast.error('Bonus points must be at least 1');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }

      const questData = {
        title: title.trim(),
        description: description.trim(),
        type,
        behaviorIds: selectedBehaviorIds,
        targetCount: parseInt(targetCount),
        bonusPoints: parseInt(bonusPoints),
        difficulty,
        icon,
        active
      };

      const url = editQuest
        ? `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/custom-quests/${editQuest.id}`
        : `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/custom-quests`;

      const response = await fetch(url, {
        method: editQuest ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': publicAnonKey
        },
        body: JSON.stringify(questData)
      });

      if (response.ok) {
        toast.success(editQuest ? 'Custom quest updated!' : 'Custom quest created!');
        resetForm();
        onOpenChange(false);
        if (onQuestCreated) {
          onQuestCreated();
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save custom quest');
      }
    } catch (error) {
      console.error('Save custom quest error:', error);
      toast.error('Failed to save custom quest');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-600" />
            {editQuest ? 'Edit Custom Quest' : 'Create Custom Quest'}
          </DialogTitle>
          <DialogDescription>
            Create a recurring quest that automatically generates challenges for your kids
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 p-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Quest Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Salah Champion"
              maxLength={50}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Complete all 5 daily prayers"
              maxLength={100}
            />
          </div>

          {/* Type and Icon */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type *</Label>
              <Select value={type} onValueChange={(value: 'daily' | 'weekly') => setType(value)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Quest</SelectItem>
                  <SelectItem value="weekly">Weekly Quest</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Icon *</Label>
              <div className="flex flex-wrap gap-2">
                {ICON_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIcon(emoji)}
                    className={`text-2xl p-2 rounded-lg transition-all ${
                      icon === emoji 
                        ? 'bg-purple-100 ring-2 ring-purple-500 scale-110' 
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Behaviors */}
          <div className="space-y-2">
            <Label>Select Behaviors to Track *</Label>
            {loadingBehaviors ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
              </div>
            ) : behaviors.length === 0 ? (
              <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg text-sm text-yellow-800">
                No behaviors configured yet. Please create behaviors first in the Behaviors page.
              </div>
            ) : (
              <div className="grid gap-2 max-h-48 overflow-y-auto p-2 border rounded-lg">
                {behaviors.map((behavior) => (
                  <label
                    key={behavior.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedBehaviorIds.includes(behavior.id)
                        ? 'bg-purple-100 border-2 border-purple-500'
                        : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedBehaviorIds.includes(behavior.id)}
                      onChange={() => toggleBehavior(behavior.id)}
                      className="rounded"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{behavior.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {behavior.category} • {behavior.points} points
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              The quest will track progress across all selected behaviors
            </p>
          </div>

          {/* Target Count and Bonus Points */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="targetCount">Target Count *</Label>
              <Input
                id="targetCount"
                type="number"
                min="1"
                max="100"
                value={targetCount}
                onChange={(e) => setTargetCount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                How many times to complete the behavior(s)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bonusPoints">Bonus Points *</Label>
              <Input
                id="bonusPoints"
                type="number"
                min="1"
                max="1000"
                value={bonusPoints}
                onChange={(e) => setBonusPoints(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Reward for completing the quest
              </p>
            </div>
          </div>

          {/* Difficulty */}
          <div className="space-y-2">
            <Label>Difficulty Level *</Label>
            <div className="flex gap-2">
              {DIFFICULTY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDifficulty(option.value as 'easy' | 'medium' | 'hard')}
                  className={`flex-1 p-3 rounded-lg transition-all ${
                    difficulty === option.value
                      ? 'ring-2 ring-offset-2 ring-purple-500 scale-105'
                      : 'hover:scale-105'
                  }`}
                >
                  <Badge className={`${option.color} text-white w-full justify-center`}>
                    {option.label}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between p-4 bg-purple-50 border-2 border-purple-200 rounded-lg">
            <div className="flex-1">
              <Label htmlFor="active-toggle" className="font-semibold text-purple-900 cursor-pointer">
                Active Quest
              </Label>
              <p className="text-sm text-purple-700">
                {active 
                  ? "Quest will auto-generate challenges for kids" 
                  : "Quest is paused (won't generate challenges)"}
              </p>
            </div>
            <Switch
              id="active-toggle"
              checked={active}
              onCheckedChange={setActive}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || loadingBehaviors}>
            {loading ? 'Saving...' : editQuest ? 'Update Quest' : 'Create Quest'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
