import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info.tsx';
import { useAuth } from '../contexts/AuthContext';
import { useFamilyContext } from '../contexts/FamilyContext';
import { getCurrentMode } from '../utils/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Brain, Sparkles, Trophy, TrendingUp, Clock, Award, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';

interface Category {
  name: string;
  total: number;
  easy: number;
  medium: number;
  hard: number;
}

interface Session {
  id: string;
  childId: string;
  familyId: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'abandoned';
  questionsAnswered: number;
  correctAnswers: number;
  totalPointsEarned: number;
  easyAttempted: number;
  easyCorrect: number;
  mediumAttempted: number;
  mediumCorrect: number;
  hardAttempted: number;
  hardCorrect: number;
  hintsUsed: number;
  categories: string[];
  pointsAwarded?: number;
}

export function KnowledgeQuest() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { children, selectedChildId } = useFamilyContext();
  const child = children.find(c => c.id === selectedChildId);
  const mode = getCurrentMode();
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [needsSeeding, setNeedsSeeding] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [isParentMode, setIsParentMode] = useState(false);

  useEffect(() => {
    // Check if we're in parent mode
    const mode = getCurrentMode();
    setIsParentMode(mode === 'parent');
  }, []);

  useEffect(() => {
    if (child && accessToken) {
      loadData();
    }
  }, [child, accessToken]);

  const loadData = async () => {
    if (!accessToken || !child) return;

    try {
      // Load categories
      const catResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/question-categories`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (catResponse.ok) {
        const catData = await catResponse.json();
        setCategories(catData);
        
        // Check if we have any questions at all
        if (catData.length === 0 || catData.every((cat: Category) => cat.total === 0)) {
          setNeedsSeeding(true);
        }
      }

      // Load recent sessions
      const sessionsResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${child.id}/knowledge-sessions`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (sessionsResponse.ok) {
        const sessionsData = await sessionsResponse.json();
        setRecentSessions(sessionsData.slice(0, 5));
      }
    } catch (error) {
      console.error('Load data error:', error);
      toast.error('Failed to load knowledge quest data');
    } finally {
      setLoading(false);
    }
  };

  const handleStartQuest = async () => {
    if (!child || !accessToken) return;

    try {
      // Create new session
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/knowledge-sessions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            childId: child.id,
            familyId: child.familyId
          })
        }
      );

      if (response.ok) {
        const session = await response.json();
        // Navigate to quest play with selected categories - use kid route if in kid mode.
        // NOTE: we also pass the full `categories` catalog (with per-difficulty
        // counts). KnowledgeQuestPlay uses this to:
        //   - disable the Easy/Medium/Hard buttons when nothing is available,
        //   - show an accurate count next to each difficulty,
        //   - surface a precise "no X questions in Y" message instead of a
        //     generic error when it happens.
        const basePath = mode === 'kid' ? '/kid/knowledge-quest' : '/knowledge-quest';
        navigate(`${basePath}/${session.id}/play`, {
          state: {
            categories: selectedCategories,
            categoryCatalog: categories,
          }
        });
      } else {
        toast.error('Failed to start quest');
      }
    } catch (error) {
      console.error('Start quest error:', error);
      toast.error('Failed to start quest');
    }
  };

  const toggleCategory = (categoryName: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryName)
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    );
  };

  const handleSeedQuestions = async () => {
    if (!accessToken) return;
    
    setSeeding(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/questions/seed-samples`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        toast.success(`${data.count} sample questions added! 🎉`);
        setNeedsSeeding(false);
        // Reload data to show new questions
        await loadData();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to seed questions');
      }
    } catch (error) {
      console.error('Seed questions error:', error);
      toast.error('Failed to seed questions');
    } finally {
      setSeeding(false);
    }
  };

  if (!child) {
    return (
      <div className="flex items-center justify-center h-96 bg-gradient-to-br from-[var(--kid-midnight-blue)] to-[#2C3E50] rounded-[1.5rem] text-white">
        <p>Please select a child to start the Knowledge Quest! 🌙</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading Knowledge Quest...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button - Only show in kid mode */}
      {mode === 'kid' && (
        <Button
          variant="outline"
          onClick={() => navigate('/kid/home')}
          className="gap-2 border-2 hover:scale-105 transition-transform"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      )}
      
      {/* Hero Section */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-gradient-to-br from-[#FFF8E7] via-[#FFE5CC] to-[#FFD4A3] rounded-[1.5rem] p-8 border-4 border-[#F4C430] shadow-xl"
      >
        <div className="flex items-center gap-4 mb-4">
          <motion.div
            animate={{ rotate: [0, 10, 0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Brain className="h-12 w-12 text-purple-600 drop-shadow" />
          </motion.div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-[#2D1810]">
              🧠 Knowledge Quest
            </h1>
            <p className="text-[#5D4E37] font-medium mt-1">
              Choose your adventure and earn points!
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white/60 backdrop-blur rounded-xl p-4 text-center">
            <Trophy className="h-6 w-6 text-yellow-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-[#2D1810]">{child.currentPoints}</div>
            <div className="text-xs text-[#5D4E37]">Total Points</div>
          </div>
          <div className="bg-white/60 backdrop-blur rounded-xl p-4 text-center">
            <TrendingUp className="h-6 w-6 text-green-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-[#2D1810]">{recentSessions.length}</div>
            <div className="text-xs text-[#5D4E37]">Quests Completed</div>
          </div>
          <div className="bg-white/60 backdrop-blur rounded-xl p-4 text-center">
            <Award className="h-6 w-6 text-purple-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-[#2D1810]">
              {recentSessions.reduce((sum, s) => sum + s.questionsAnswered, 0)}
            </div>
            <div className="text-xs text-[#5D4E37]">Questions Answered</div>
          </div>
        </div>
      </motion.div>

      {/* Category Selection */}
      <Card className="border-4 border-[#F4C430]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-600" />
            Choose Your Topics
          </CardTitle>
          <CardDescription>
            Select categories you want to practice (or leave empty for all topics)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {categories.map((category) => {
              const isSelected = selectedCategories.includes(category.name);
              const icon = getCategoryIcon(category.name);
              
              return (
                <motion.button
                  key={category.name}
                  onClick={() => toggleCategory(category.name)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`
                    p-4 rounded-xl border-4 transition-all text-left
                    ${isSelected 
                      ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg' 
                      : 'border-gray-300 bg-white hover:border-[#F4C430] hover:bg-[#FFF8E7]'
                    }
                  `}
                >
                  <div className="text-3xl mb-2">{icon}</div>
                  <div className="font-bold text-sm capitalize mb-1">{category.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {category.total} questions
                  </div>
                  <div className="flex gap-1 mt-2">
                    <Badge variant="outline" className="text-xs">🟢 {category.easy}</Badge>
                    <Badge variant="outline" className="text-xs">🟡 {category.medium}</Badge>
                    <Badge variant="outline" className="text-xs">🔴 {category.hard}</Badge>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {selectedCategories.length > 0 && (
            <div className="mt-4 p-3 bg-purple-50 rounded-lg border-2 border-purple-200">
              <p className="text-sm font-medium text-purple-900">
                Selected: {selectedCategories.join(', ')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* No Questions Warning.
          - Parents see the actual "Add Sample Questions" seeder button.
          - Kids see a friendly "ask a parent" card instead — kids must never
            be able to mutate the question bank, and surfacing a button that
            does nothing for them was confusing. */}
      {needsSeeding && isParentMode && (
        <Card className="border-4 border-orange-400 bg-gradient-to-br from-orange-50 to-yellow-50">
          <CardHeader>
            <CardTitle className="text-orange-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Welcome to Knowledge Quest!
            </CardTitle>
            <CardDescription className="text-orange-700">
              No questions found. Click below to add sample Islamic & general knowledge questions to get started!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleSeedQuestions}
              disabled={seeding}
              size="lg"
              className="w-full h-14 text-lg font-bold bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600"
            >
              {seeding ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Adding Questions...
                </>
              ) : (
                <>
                  ✨ Add Sample Questions (Free!)
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {needsSeeding && !isParentMode && (
        <Card className="border-4 border-purple-300 bg-gradient-to-br from-purple-50 to-pink-50">
          <CardHeader>
            <CardTitle className="text-purple-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              No questions yet!
            </CardTitle>
            <CardDescription className="text-purple-700">
              Ask a parent to add some questions so you can start your quest.
              Once they do, you'll see topics to pick from here.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Start Button */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Button
          onClick={handleStartQuest}
          size="lg"
          className="w-full h-16 text-xl font-bold bg-gradient-to-r from-purple-500 via-pink-500 to-yellow-500 hover:from-purple-600 hover:via-pink-600 hover:to-yellow-600 shadow-xl"
        >
          <Sparkles className="h-6 w-6 mr-2" />
          🚀 Start Knowledge Quest! 🌟
        </Button>
      </motion.div>

      {/* Recent Sessions */}
      {recentSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Recent Quests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border-2 border-gray-200"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm">
                        {session.questionsAnswered} Questions
                      </span>
                      <span className="text-xs text-muted-foreground">
                        • {session.correctAnswers} Correct ({Math.round((session.correctAnswers / session.questionsAnswered) * 100)}%)
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(session.startedAt).toLocaleDateString()} • {session.categories.join(', ') || 'All Topics'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-yellow-600">
                      +{session.pointsAwarded || session.totalPointsEarned} ⭐
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    islamic: '🕌',
    math: '🔢',
    science: '🔬',
    history: '📜',
    geography: '🌍',
    language: '📖',
    quran: '📗',
    hadith: '📘',
    fiqh: '⚖️',
    general: '🧠'
  };
  
  return icons[category.toLowerCase()] || '📚';
}