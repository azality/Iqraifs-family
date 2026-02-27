import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { supabase } from '/utils/supabase/client';

interface QuestSettingsProps {
  familyId: string | null;
  accessToken: string | null;
  compact?: boolean; // Compact mode for embedded use
  onSettingsChange?: (enabled: boolean) => void; // Callback when settings change
}

export function QuestSettings({ 
  familyId, 
  accessToken, 
  compact = false,
  onSettingsChange 
}: QuestSettingsProps) {
  const [questEnabled, setQuestEnabled] = useState(true);
  const [dailyBonus, setDailyBonus] = useState("20");
  const [weeklyBonus, setWeeklyBonus] = useState("50");
  const [easyMultiplier, setEasyMultiplier] = useState("1");
  const [mediumMultiplier, setMediumMultiplier] = useState("1.5");
  const [hardMultiplier, setHardMultiplier] = useState("2");
  const [loading, setLoading] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  // Load quest settings
  useEffect(() => {
    if (familyId && accessToken) {
      loadQuestSettings();
    }
  }, [familyId, accessToken]);

  const loadQuestSettings = async () => {
    if (!familyId || !accessToken) return;
    
    setIsLoadingSettings(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/quest-settings`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          }
        }
      );

      if (response.ok) {
        const settings = await response.json();
        setQuestEnabled(settings.enabled ?? true);
        setDailyBonus(String(settings.dailyBonusPoints ?? 20));
        setWeeklyBonus(String(settings.weeklyBonusPoints ?? 50));
        setEasyMultiplier(String(settings.difficultyMultipliers?.easy ?? 1));
        setMediumMultiplier(String(settings.difficultyMultipliers?.medium ?? 1.5));
        setHardMultiplier(String(settings.difficultyMultipliers?.hard ?? 2));
        
        // Notify parent component
        if (onSettingsChange) {
          onSettingsChange(settings.enabled ?? true);
        }
      }
    } catch (error) {
      console.error('Load quest settings error:', error);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const handleSaveQuestSettings = async () => {
    if (!familyId || !accessToken) return;
    
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/quest-settings`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          },
          body: JSON.stringify({
            enabled: questEnabled,
            dailyBonusPoints: parseInt(dailyBonus) || 20,
            weeklyBonusPoints: parseInt(weeklyBonus) || 50,
            difficultyMultipliers: {
              easy: parseFloat(easyMultiplier) || 1,
              medium: parseFloat(mediumMultiplier) || 1.5,
              hard: parseFloat(hardMultiplier) || 2
            }
          })
        }
      );

      if (response.ok) {
        toast.success('Quest settings saved!');
        
        // Notify parent component
        if (onSettingsChange) {
          onSettingsChange(questEnabled);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save quest settings');
      }
    } catch (error) {
      console.error('Save quest settings error:', error);
      toast.error('Failed to save quest settings');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleQuests = async () => {
    const newEnabled = !questEnabled;
    setQuestEnabled(newEnabled);
    
    // Auto-save the toggle
    if (!familyId || !accessToken) return;
    
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('No valid session');
        return;
      }

      console.log('🔧 Saving quest settings:', {
        familyId,
        enabled: newEnabled,
        url: `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/quest-settings`
      });

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/quest-settings`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': publicAnonKey
          },
          body: JSON.stringify({
            enabled: newEnabled,
            dailyBonusPoints: parseInt(dailyBonus) || 20,
            weeklyBonusPoints: parseInt(weeklyBonus) || 50,
            difficultyMultipliers: {
              easy: parseFloat(easyMultiplier) || 1,
              medium: parseFloat(mediumMultiplier) || 1.5,
              hard: parseFloat(hardMultiplier) || 2
            }
          })
        }
      );

      console.log('🔧 Quest settings response:', {
        status: response.status,
        ok: response.ok
      });

      if (response.ok) {
        toast.success(newEnabled ? 'Quests enabled!' : 'Quests disabled!');
        
        // Notify parent component
        if (onSettingsChange) {
          onSettingsChange(newEnabled);
        }
      } else {
        // Revert on error
        setQuestEnabled(!newEnabled);
        const error = await response.json();
        console.error('❌ Failed to update quest settings:', error);
        toast.error(error.error || 'Failed to update quest settings');
      }
    } catch (error) {
      // Revert on error
      setQuestEnabled(!newEnabled);
      console.error('Toggle quest settings error:', error);
      toast.error('Failed to update quest settings');
    } finally {
      setLoading(false);
    }
  };

  if (isLoadingSettings) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    // Compact mode - just the enable/disable toggle (auto-saves)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5" />
            Quest System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-purple-50 border-2 border-purple-200 rounded-lg">
            <div className="flex-1">
              <Label htmlFor="quest-toggle" className="font-semibold text-purple-900 cursor-pointer">
                Enable Quest System
              </Label>
              <p className="text-sm text-purple-700">
                {questEnabled 
                  ? "Kids can accept and complete bonus challenges" 
                  : "Allow kids to accept bonus challenges"}
              </p>
            </div>
            <Switch
              id="quest-toggle"
              checked={questEnabled}
              onCheckedChange={handleToggleQuests}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full mode - all settings
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Quest & Challenge Settings
        </CardTitle>
        <CardDescription>
          Configure bonus point rewards for daily and weekly quests
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Quest System */}
        <div className="flex items-center justify-between p-4 bg-purple-50 border-2 border-purple-200 rounded-lg">
          <div className="flex-1">
            <h3 className="font-semibold text-purple-900">Enable Quest System</h3>
            <p className="text-sm text-purple-700">
              Allow kids to accept and complete bonus challenges
            </p>
          </div>
          <Button
            variant={questEnabled ? "default" : "outline"}
            size="sm"
            onClick={handleToggleQuests}
          >
            {questEnabled ? "Enabled" : "Disabled"}
          </Button>
        </div>

        {/* Base Bonus Points */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Base Bonus Points</h3>
          <p className="text-sm text-muted-foreground">
            These are the base bonus points awarded for completing quests. Difficulty multipliers will be applied on top of these values.
          </p>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dailyBonus">Daily Quest Bonus</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="dailyBonus"
                  type="number"
                  min="0"
                  max="1000"
                  value={dailyBonus}
                  onChange={(e) => setDailyBonus(e.target.value)}
                  disabled={!questEnabled}
                />
                <span className="text-sm text-muted-foreground">points</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended: 10-30 points
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="weeklyBonus">Weekly Quest Bonus</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="weeklyBonus"
                  type="number"
                  min="0"
                  max="1000"
                  value={weeklyBonus}
                  onChange={(e) => setWeeklyBonus(e.target.value)}
                  disabled={!questEnabled}
                />
                <span className="text-sm text-muted-foreground">points</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended: 30-100 points
              </p>
            </div>
          </div>
        </div>

        {/* Difficulty Multipliers */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Difficulty Multipliers</h3>
          <p className="text-sm text-muted-foreground">
            Multipliers are applied to base bonus points based on quest difficulty.
          </p>
          
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="easyMultiplier">
                <Badge className="bg-green-500 mb-1">Easy</Badge>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="easyMultiplier"
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={easyMultiplier}
                  onChange={(e) => setEasyMultiplier(e.target.value)}
                  disabled={!questEnabled}
                />
                <span className="text-sm text-muted-foreground">×</span>
              </div>
              <p className="text-xs text-green-700 font-mono">
                = {Math.round(parseInt(dailyBonus || "0") * parseFloat(easyMultiplier || "1"))} pts (daily)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mediumMultiplier">
                <Badge className="bg-yellow-500 mb-1">Medium</Badge>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="mediumMultiplier"
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={mediumMultiplier}
                  onChange={(e) => setMediumMultiplier(e.target.value)}
                  disabled={!questEnabled}
                />
                <span className="text-sm text-muted-foreground">×</span>
              </div>
              <p className="text-xs text-yellow-700 font-mono">
                = {Math.round(parseInt(dailyBonus || "0") * parseFloat(mediumMultiplier || "1"))} pts (daily)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hardMultiplier">
                <Badge className="bg-red-500 mb-1">Hard</Badge>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="hardMultiplier"
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={hardMultiplier}
                  onChange={(e) => setHardMultiplier(e.target.value)}
                  disabled={!questEnabled}
                />
                <span className="text-sm text-muted-foreground">×</span>
              </div>
              <p className="text-xs text-red-700 font-mono">
                = {Math.round(parseInt(dailyBonus || "0") * parseFloat(hardMultiplier || "1"))} pts (daily)
              </p>
            </div>
          </div>
        </div>

        {/* Example Preview */}
        <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg space-y-2">
          <h3 className="font-semibold text-blue-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Example Quest Rewards
          </h3>
          <div className="space-y-1 text-sm text-blue-800">
            <p>🌅 <strong>Easy Daily Quest:</strong> Pray Fajr on time → +{Math.round(parseInt(dailyBonus || "0") * parseFloat(easyMultiplier || "1"))} bonus points</p>
            <p>🕌 <strong>Medium Daily Quest:</strong> Complete all 5 prayers → +{Math.round(parseInt(dailyBonus || "0") * parseFloat(mediumMultiplier || "1"))} bonus points</p>
            <p>🌟 <strong>Hard Daily Quest:</strong> Earn 30+ points → +{Math.round(parseInt(dailyBonus || "0") * parseFloat(hardMultiplier || "1"))} bonus points</p>
            <p className="pt-2 border-t border-blue-300">
              📚 <strong>Easy Weekly Quest:</strong> Complete homework 5 times → +{Math.round(parseInt(weeklyBonus || "0") * parseFloat(easyMultiplier || "1"))} bonus points
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button 
            onClick={handleSaveQuestSettings}
            disabled={loading || !questEnabled}
            className="min-w-32"
          >
            {loading ? "Saving..." : "Save Quest Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}