import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { Challenge, ChallengeDifficulty } from "../data/mockData";
import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { useFamilyContext } from '../contexts/FamilyContext';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { toast } from 'sonner';
import { 
  Trophy, 
  Flame, 
  CheckCircle2, 
  Star, 
  Clock, 
  Target, 
  Sparkles, 
  Zap, 
  Award,
  Lock,
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  Play,
  Pause
} from 'lucide-react';
import { QuestSettings } from '../components/QuestSettings';
import { CustomQuestCreator } from '../components/CustomQuestCreator';
import { CustomQuestsManager } from '../components/CustomQuestsManager';

interface ChallengeProgress {
  current: number;
  target: number;
  percentage: number;
}

export function Challenges() {
  const { getCurrentChild, children, familyId } = useFamilyContext();
  const { isParentMode, accessToken } = useAuth();
  const navigate = useNavigate();
  const child = getCurrentChild();
  
  console.log('🎮 Challenges page - Auth status:', {
    isParentMode,
    hasAccessToken: !!accessToken,
    hasChild: !!child,
    childId: child?.id,
    pathname: window.location.pathname,
    renderingMode: isParentMode ? 'PARENT VIEW' : 'KID VIEW'
  });
  
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [allChildrenChallenges, setAllChildrenChallenges] = useState<{[childId: string]: Challenge[]}>({});
  const [sampleQuests, setSampleQuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [questsEnabled, setQuestsEnabled] = useState(true);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);
  const [showCustomQuestCreator, setShowCustomQuestCreator] = useState(false);
  const [customQuests, setCustomQuests] = useState<any[]>([]);
  const [editingCustomQuest, setEditingCustomQuest] = useState<any | null>(null);

  // Auto-select the first child if there's only one
  useEffect(() => {
    if (isParentMode && children && children.length === 1 && !expandedChildId) {
      setExpandedChildId(children[0].id);
    }
  }, [isParentMode, children, expandedChildId]);

  // Callback when quest settings change
  const handleQuestSettingsChange = (enabled: boolean) => {
    setQuestsEnabled(enabled);
    if (enabled) {
      // Reload challenges when quests are enabled
      if (isParentMode) {
        loadAllChildrenChallenges();
      } else if (child) {
        loadChallenges();
      }
    }
  };

  // Load quest settings to check if quests are enabled
  useEffect(() => {
    const loadQuestSettings = async () => {
      if (!accessToken || !familyId) return;
      
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${familyId}/quest-settings`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );
        
        if (response.ok) {
          const settings = await response.json();
          setQuestsEnabled(settings.enabled ?? true);
        }
      } catch (error) {
        console.error('Load quest settings error:', error);
      }
    };
    
    loadQuestSettings();
  }, [accessToken, familyId]);

  useEffect(() => {
    if (isParentMode) {
      // Load challenges for all children
      loadAllChildrenChallenges();
    } else if (child) {
      // Load challenges for selected child only (kid mode)
      loadChallenges();
      loadSampleQuests(); // Load sample quests for empty state
    }
  }, [child, isParentMode, children]);

  const loadSampleQuests = async () => {
    if (!child || !accessToken) return;
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${child.id}/challenges/samples`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setSampleQuests(data);
      }
    } catch (error) {
      console.error('Load sample quests error:', error);
    }
  };

  const loadAllChildrenChallenges = async () => {
    if (!accessToken || !children || children.length === 0) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const challengesData: {[childId: string]: Challenge[]} = {};
      
      // Load challenges for each child
      for (const childItem of children) {
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${childItem.id}/challenges`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            challengesData[childItem.id] = data;
          }
        } catch (error) {
          console.error(`Load challenges error for child ${childItem.id}:`, error);
        }
      }
      
      setAllChildrenChallenges(challengesData);
    } catch (error) {
      console.error('Load all children challenges error:', error);
      toast.error("Failed to load challenges");
    } finally {
      setLoading(false);
    }
  };

  const loadChallenges = async () => {
    if (!child || !accessToken) return;
    
    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${child.id}/challenges`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setChallenges(data);
      }
    } catch (error) {
      console.error('Load challenges error:', error);
      toast.error("Failed to load challenges");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptChallenge = async (challengeId: string) => {
    if (!accessToken) return;
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/challenges/${challengeId}/accept`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (response.ok) {
        toast.success("Challenge accepted! You've got this! 💪", {
          description: "Complete the challenge to earn bonus points!"
        });
        loadChallenges(); // Reload to update status
      }
    } catch (error) {
      console.error('Accept challenge error:', error);
      toast.error("Failed to accept challenge");
    }
  };

  const handleGenerateQuests = async (childId: string, type: 'daily' | 'weekly') => {
    if (!accessToken) return;
    
    try {
      setGeneratingFor(childId);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${childId}/challenges/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ type })
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        toast.success(`${data.count} ${type} quest${data.count > 1 ? 's' : ''} created! 🎉`, {
          description: "Kids can now accept and complete them"
        });
        // Reload all children challenges to show new quests
        await loadAllChildrenChallenges();
      } else {
        const error = await response.json();
        toast.error(error.message || error.error || "Failed to generate quests");
      }
    } catch (error) {
      console.error('Generate quests error:', error);
      toast.error("Failed to generate quests");
    } finally {
      setGeneratingFor(null);
    }
  };

  if (!child && !isParentMode) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select a child to view challenges.</p>
      </div>
    );
  }

  if (isParentMode) {
    // Parent view - show overview of all children's challenges
    const allChallenges = Object.values(allChildrenChallenges).flat();
    const totalActive = allChallenges.filter(c => c.status === 'accepted').length;
    const totalCompleted = allChallenges.filter(c => c.status === 'completed').length;

    // Single child view - more focused and detailed
    if (children && children.length === 1) {
      const singleChild = children[0];
      const childChallenges = allChildrenChallenges[singleChild.id] || [];
      const active = childChallenges.filter(c => c.status === 'accepted');
      const completed = childChallenges.filter(c => c.status === 'completed');
      const available = childChallenges.filter(c => c.status === 'available');

      return (
        <div className="space-y-6">
          {/* Single Child Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-8 text-white shadow-2xl"
            data-testid="page-parent-challenges"
          >
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <Trophy className="h-10 w-10" />
                <h1 className="text-3xl sm:text-4xl font-bold">{singleChild.name}'s Challenges</h1>
              </div>
              <p className="text-lg opacity-90 mb-4">
                Track progress on daily and weekly challenges
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                  <Flame className="h-5 w-5" />
                  <span className="font-semibold">{active.length} Active</span>
                </div>
                <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">{completed.length} Completed</span>
                </div>
                <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                  <Target className="h-5 w-5" />
                  <span className="font-semibold">{available.length} Available</span>
                </div>
              </div>
            </div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
          </motion.div>

          {/* Quest Settings */}
          <QuestSettings 
            familyId={familyId}
            accessToken={accessToken}
            compact={true}
            onSettingsChange={handleQuestSettingsChange}
          />

          {/* Generate Quest Buttons */}
          <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                Create New Quests
              </CardTitle>
              <CardDescription>
                Generate daily or weekly challenges for {singleChild.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 flex-wrap">
                <Button
                  onClick={() => handleGenerateQuests(singleChild.id, 'daily')}
                  disabled={generatingFor === singleChild.id || !questsEnabled}
                  className="gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
                >
                  <Sparkles className="h-4 w-4" />
                  {generatingFor === singleChild.id ? "Generating..." : "Generate Daily Quest"}
                </Button>
                <Button
                  onClick={() => handleGenerateQuests(singleChild.id, 'weekly')}
                  disabled={generatingFor === singleChild.id || !questsEnabled}
                  className="gap-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                >
                  <Sparkles className="h-4 w-4" />
                  {generatingFor === singleChild.id ? "Generating..." : "Generate Weekly Quest"}
                </Button>
              </div>
              {!questsEnabled && (
                <p className="text-sm text-muted-foreground mt-3">
                  Quest system is currently disabled. Enable it above to generate quests.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Active Challenges */}
          {active.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Flame className="h-6 w-6 text-orange-500" />
                <h2 className="text-2xl font-bold">Active Challenges</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {active.map((challenge) => (
                  <Card key={challenge.id} className="border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-yellow-50">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-2">
                        <span className="text-4xl">{challenge.icon}</span>
                        <div className="flex-1">
                          <CardTitle className="text-lg">{challenge.title}</CardTitle>
                          <CardDescription className="text-sm">{challenge.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">Progress</span>
                          <span className="text-muted-foreground">
                            {challenge.progress.current}/{challenge.progress.target}
                          </span>
                        </div>
                        <Progress value={challenge.progress.percentage} className="h-3" />
                        <p className="text-xs text-muted-foreground">
                          {challenge.progress.percentage}% complete
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className="bg-green-100 text-green-700">
                          <Star className="h-3 w-3 mr-1" />
                          +{challenge.bonusPoints} Bonus
                        </Badge>
                        <Badge className="bg-blue-100 text-blue-700">
                          <Clock className="h-3 w-3 mr-1" />
                          {challenge.type === 'daily' ? 'Daily' : 'Weekly'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Available Challenges */}
          {available.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Target className="h-6 w-6 text-blue-500" />
                <h2 className="text-2xl font-bold">Available Challenges</h2>
                <Badge variant="outline" className="ml-2">{available.length} waiting</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {available.map((challenge) => (
                  <Card key={challenge.id} className="border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-2">
                        <span className="text-4xl">{challenge.icon}</span>
                        <div className="flex-1">
                          <CardTitle className="text-lg">{challenge.title}</CardTitle>
                          <CardDescription className="text-sm">{challenge.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge className="bg-yellow-500 text-white">
                          <Sparkles className="h-3 w-3 mr-1" />
                          +{challenge.bonusPoints} Bonus
                        </Badge>
                        <Badge className="bg-purple-100 text-purple-700">
                          <Clock className="h-3 w-3 mr-1" />
                          {challenge.type === 'daily' ? 'Daily' : 'Weekly'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Waiting for {singleChild.name} to accept
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Completed Challenges */}
          {completed.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Award className="h-6 w-6 text-green-500" />
                <h2 className="text-2xl font-bold">Completed Challenges</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                {completed.map((challenge) => (
                  <Card key={challenge.id} className="border-2 border-green-300 bg-gradient-to-br from-green-50 to-emerald-50">
                    <CardContent className="pt-6 text-center">
                      <span className="text-4xl mb-2 block">{challenge.icon}</span>
                      <p className="font-semibold text-sm">{challenge.title}</p>
                      <Badge className="mt-2 bg-green-600 text-xs">
                        <CheckCircle2 className="h-2 w-2 mr-1" />
                        +{challenge.bonusPoints} Earned!
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {childChallenges.length === 0 && (
            <Card className="border-2 border-dashed">
              <CardContent className="pt-12 pb-12 text-center">
                <Trophy className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Challenges Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Click "Generate Daily Quest" or "Generate Weekly Quest" above to create {singleChild.name}'s first challenge!
                </p>
              </CardContent>
            </Card>
          )}

          {/* Info Card */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900 mb-1">About Challenges</h3>
                  <p className="text-sm text-blue-800">
                    Challenges are bonus activities that {singleChild.name} can accept and complete for extra points. 
                    They refresh daily and weekly, encouraging consistent positive behaviors.
                    Switch to Kid Mode to let {singleChild.name} accept and track their own challenges!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Multiple children view - show overview cards for each child
    return (
      <div className="space-y-6">
        {/* Parent Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-8 text-white shadow-2xl"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="h-10 w-10" />
              <h1 className="text-3xl sm:text-4xl font-bold">Family Challenges Overview</h1>
            </div>
            <p className="text-lg opacity-90 mb-4">
              Track your children's progress on daily and weekly challenges
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                <Flame className="h-5 w-5" />
                <span className="font-semibold">{totalActive} Active Across All Kids</span>
              </div>
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">{totalCompleted} Completed Today</span>
              </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
        </motion.div>

        {/* Quest Settings - Always show for parents */}
        <QuestSettings 
          familyId={familyId}
          accessToken={accessToken}
          compact={true}
          onSettingsChange={handleQuestSettingsChange}
        />

        {/* Custom Quests Manager */}
        <CustomQuestsManager familyId={familyId} />

        {/* Per-Child Challenge Cards */}
        {children && children.length > 0 ? (
          <div className="space-y-6">
            {children.map((childItem) => {
              const childChallenges = allChildrenChallenges[childItem.id] || [];
              const active = childChallenges.filter(c => c.status === 'accepted');
              const completed = childChallenges.filter(c => c.status === 'completed');
              const available = childChallenges.filter(c => c.status === 'available');

              return (
                <Card key={childItem.id} className="border-2">
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div>
                        <CardTitle className="text-2xl">{childItem.name}'s Challenges</CardTitle>
                        <CardDescription>
                          {active.length} active • {completed.length} completed • {available.length} available
                        </CardDescription>
                      </div>
                      <div className="flex gap-2 flex-wrap items-center">
                        {/* Generate Quest Buttons */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateQuests(childItem.id, 'daily')}
                          disabled={generatingFor === childItem.id || !questsEnabled}
                          className="gap-1"
                        >
                          <Sparkles className="h-3 w-3" />
                          {generatingFor === childItem.id ? "Generating..." : "Generate Daily"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateQuests(childItem.id, 'weekly')}
                          disabled={generatingFor === childItem.id || !questsEnabled}
                          className="gap-1"
                        >
                          <Sparkles className="h-3 w-3" />
                          {generatingFor === childItem.id ? "Generating..." : "Generate Weekly"}
                        </Button>
                        
                        {/* Status Badges */}
                        {active.length > 0 && (
                          <Badge className="bg-orange-500">
                            <Flame className="h-3 w-3 mr-1" />
                            {active.length} Active
                          </Badge>
                        )}
                        {completed.length > 0 && (
                          <Badge className="bg-green-500">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {completed.length} Done
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {childChallenges.length === 0 ? (
                      <div className="text-center py-8 space-y-3">
                        <p className="text-sm text-muted-foreground">
                          No challenges yet for {childItem.name}.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Click "Generate Daily" or "Generate Weekly" above to create quests!
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {/* Active Challenges First */}
                        {active.map((challenge) => (
                          <Card key={challenge.id} className="border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-yellow-50">
                            <CardContent className="pt-4">
                              <div className="flex items-start gap-2 mb-2">
                                <span className="text-2xl">{challenge.icon}</span>
                                <div className="flex-1">
                                  <p className="font-semibold text-sm">{challenge.title}</p>
                                  <p className="text-xs text-muted-foreground">{challenge.description}</p>
                                </div>
                              </div>
                              <Progress value={challenge.progress.percentage} className="h-2 mb-2" />
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">
                                  {challenge.progress.current}/{challenge.progress.target}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  <Star className="h-2 w-2 mr-1" />
                                  +{challenge.bonusPoints}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        
                        {/* Completed Challenges */}
                        {completed.slice(0, 3).map((challenge) => (
                          <Card key={challenge.id} className="border-2 border-green-300 bg-gradient-to-br from-green-50 to-emerald-50">
                            <CardContent className="pt-4 text-center">
                              <span className="text-3xl mb-1 block">{challenge.icon}</span>
                              <p className="font-semibold text-sm">{challenge.title}</p>
                              <Badge className="mt-2 bg-green-600 text-xs">
                                <CheckCircle2 className="h-2 w-2 mr-1" />
                                Completed!
                              </Badge>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-2 border-dashed">
            <CardContent className="pt-12 pb-12 text-center">
              <Trophy className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Children Yet</h3>
              <p className="text-muted-foreground">
                Add children to your family to start tracking challenges!
              </p>
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1">About Challenges</h3>
                <p className="text-sm text-blue-800">
                  Challenges are bonus activities that kids can accept and complete for extra points. 
                  They refresh daily and weekly, encouraging consistent positive behaviors.
                  Switch to Kid Mode to let your children accept and track their own challenges!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const availableChallenges = challenges.filter(c => c.status === 'available');
  const activeChallengesFiltered = challenges.filter(c => c.status === 'accepted');
  const completedChallenges = challenges.filter(c => c.status === 'completed');

  const getDifficultyColor = (difficulty: ChallengeDifficulty) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-500';
      case 'medium': return 'bg-yellow-500';
      case 'hard': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getDifficultyBadge = (difficulty: ChallengeDifficulty) => {
    const colors = {
      easy: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      hard: 'bg-red-100 text-red-700'
    };
    return colors[difficulty];
  };

  const isChildView = !isParentMode;

  return (
    <div className="space-y-6">
      {/* Back Button - Kid Mode Only */}
      {!isParentMode && (
        <Button
          variant="ghost"
          onClick={() => navigate('/kid/home')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      )}

      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-8 text-white shadow-2xl"
      >
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="h-10 w-10" />
            <h1 className="text-3xl sm:text-4xl font-bold">Daily Challenges!</h1>
          </div>
          <p className="text-lg opacity-90 mb-4">
            Complete challenges to earn BONUS points! 🎉
          </p>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
              <Flame className="h-5 w-5" />
              <span className="font-semibold">{activeChallengesFiltered.length} Active</span>
            </div>
            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">{completedChallenges.length} Completed</span>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
      </motion.div>

      {/* Active Challenges */}
      {activeChallengesFiltered.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Flame className="h-6 w-6 text-orange-500" />
            <h2 className="text-2xl font-bold">Active Challenges</h2>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence>
              {activeChallengesFiltered.map((challenge, index) => (
                <motion.div
                  key={challenge.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-yellow-50 shadow-lg hover:shadow-xl transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-4xl">{challenge.icon}</span>
                          <div>
                            <CardTitle className="text-xl">{challenge.title}</CardTitle>
                            <CardDescription className="text-sm mt-1">
                              {challenge.description}
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Progress */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">Progress</span>
                          <span className="text-muted-foreground">
                            {challenge.progress.current} / {challenge.progress.target}
                          </span>
                        </div>
                        <Progress value={challenge.progress.percentage} className="h-3" />
                        <p className="text-xs text-muted-foreground">
                          {challenge.progress.percentage}% complete
                        </p>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-2">
                        <Badge className={getDifficultyBadge(challenge.difficulty)}>
                          {challenge.difficulty.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="bg-green-100 text-green-700">
                          <Star className="h-3 w-3 mr-1" />
                          +{challenge.bonusPoints} Bonus
                        </Badge>
                        <Badge variant="outline" className="bg-blue-100 text-blue-700">
                          <Clock className="h-3 w-3 mr-1" />
                          {challenge.type === 'daily' ? 'Today' : 'This Week'}
                        </Badge>
                      </div>

                      {/* Requirements */}
                      <div className="space-y-1">
                        {challenge.requirements.map((req, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                            <span className="text-muted-foreground">{req.description}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Available Challenges */}
      {availableChallenges.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-6 w-6 text-blue-500" />
            <h2 className="text-2xl font-bold">Available Challenges</h2>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence>
              {availableChallenges.map((challenge, index) => (
                <motion.div
                  key={challenge.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="hover:shadow-lg transition-shadow border-2 border-dashed border-gray-300">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-4xl">{challenge.icon}</span>
                          <div>
                            <CardTitle className="text-xl">{challenge.title}</CardTitle>
                            <CardDescription className="text-sm mt-1">
                              {challenge.description}
                            </CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Badges */}
                      <div className="flex flex-wrap gap-2">
                        <Badge className={getDifficultyBadge(challenge.difficulty)}>
                          {challenge.difficulty.toUpperCase()}
                        </Badge>
                        <Badge className="bg-yellow-500 text-white">
                          <Sparkles className="h-3 w-3 mr-1" />
                          +{challenge.bonusPoints} Bonus
                        </Badge>
                        <Badge variant="outline" className="bg-purple-100 text-purple-700">
                          <Clock className="h-3 w-3 mr-1" />
                          {challenge.type === 'daily' ? 'Ends Tonight' : 'Ends This Week'}
                        </Badge>
                      </div>

                      {/* Requirements */}
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">Requirements:</p>
                        {challenge.requirements.map((req, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm">
                            <Target className="h-4 w-4 mt-0.5 text-blue-600" />
                            <span className="text-muted-foreground">{req.description}</span>
                          </div>
                        ))}
                      </div>

                      {/* Accept Button */}
                      <Button 
                        className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                        onClick={() => handleAcceptChallenge(challenge.id)}
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Accept Challenge!
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Completed Challenges */}
      {completedChallenges.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Award className="h-6 w-6 text-yellow-500" />
            <h2 className="text-2xl font-bold">Completed Challenges</h2>
          </div>
          
          <div className="grid gap-4 md:grid-cols-3">
            {completedChallenges.map((challenge) => (
              <Card key={challenge.id} className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300">
                <CardContent className="pt-6 text-center">
                  <span className="text-5xl mb-2 block">{challenge.icon}</span>
                  <p className="font-semibold">{challenge.title}</p>
                  <Badge className="mt-2 bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    +{challenge.bonusPoints} Earned!
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {challenges.length === 0 && !loading && (
        <div className="space-y-6">
          {/* Explanation Card */}
          <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
            <CardContent className="pt-8 pb-8">
              <div className="text-center mb-6">
                <Trophy className="h-16 w-16 mx-auto text-purple-500 mb-4" />
                <h3 className="text-2xl font-bold mb-2">What Are Quests?</h3>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Quests are special challenges your parents create for you! Complete them to earn BONUS points on top of your regular points. 
                  Quests can be daily (finish today) or weekly (finish this week).
                </p>
              </div>

              {/* Example Quest Cards */}
              <div className="max-w-4xl mx-auto">
                <h4 className="text-sm font-semibold text-center mb-4 text-purple-700">
                  {sampleQuests.length > 0 ? "Here's what YOUR quests will look like:" : "Here's what quests look like:"}
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  {sampleQuests.length > 0 ? (
                    // Show REAL quest samples based on configured behaviors
                    sampleQuests.map((quest, idx) => (
                      <Card key={idx} className="border-2 border-dashed border-purple-300 bg-white/50">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-3xl">{quest.icon}</span>
                            <div>
                              <CardTitle className="text-lg">{quest.title}</CardTitle>
                              <CardDescription className="text-xs">{quest.description}</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <Progress value={quest.progress.percentage} className="h-2" />
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {quest.progress.current} / {quest.progress.target}
                            </span>
                            <Badge className="bg-green-100 text-green-700 text-xs">
                              <Star className="h-2 w-2 mr-1" />
                              +{quest.bonusPoints} Bonus
                            </Badge>
                          </div>
                          <Badge className={quest.type === 'daily' ? 'bg-yellow-100 text-yellow-700 text-xs' : 'bg-blue-100 text-blue-700 text-xs'}>
                            <Clock className="h-2 w-2 mr-1" />
                            {quest.type === 'daily' ? 'Daily Quest' : 'Weekly Quest'}
                          </Badge>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    // Fallback to generic examples if no behaviors configured yet
                    <>
                      <Card className="border-2 border-dashed border-purple-300 bg-white/50">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-3xl">🕌</span>
                            <div>
                              <CardTitle className="text-lg">Prayer Champion</CardTitle>
                              <CardDescription className="text-xs">Pray all 5 prayers today</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <Progress value={60} className="h-2" />
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">3 / 5 prayers</span>
                            <Badge className="bg-green-100 text-green-700 text-xs">
                              <Star className="h-2 w-2 mr-1" />
                              +20 Bonus
                            </Badge>
                          </div>
                          <Badge className="bg-yellow-100 text-yellow-700 text-xs">
                            <Clock className="h-2 w-2 mr-1" />
                            Daily Quest
                          </Badge>
                        </CardContent>
                      </Card>

                      <Card className="border-2 border-dashed border-orange-300 bg-white/50">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-3xl">📚</span>
                            <div>
                              <CardTitle className="text-lg">Homework Hero</CardTitle>
                              <CardDescription className="text-xs">Complete homework 5 times</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <Progress value={40} className="h-2" />
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">2 / 5 times</span>
                            <Badge className="bg-green-100 text-green-700 text-xs">
                              <Star className="h-2 w-2 mr-1" />
                              +50 Bonus
                            </Badge>
                          </div>
                          <Badge className="bg-blue-100 text-blue-700 text-xs">
                            <Clock className="h-2 w-2 mr-1" />
                            Weekly Quest
                          </Badge>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Call to Action */}
          <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-start gap-4">
                <div className="bg-blue-100 p-3 rounded-full">
                  <Sparkles className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg mb-2">Ready to Start Your Quest Adventure?</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Ask your parents to create your first quest! They can make quests for anything - 
                    praying on time, helping with chores, reading Quran, being kind to siblings, and more!
                  </p>
                  <div className="bg-white border-2 border-dashed border-blue-300 rounded-lg p-4">
                    <p className="text-sm font-semibold text-blue-900 mb-1">💬 What to say:</p>
                    <p className="text-sm italic text-blue-800">
                      "Can you create a quest for me? I want to earn bonus points by completing challenges!"
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}