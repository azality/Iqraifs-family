import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { ArrowLeft, Sparkles, Trophy, Star, BookOpen, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamilyContext } from '../../contexts/FamilyContext';
import { projectId } from '/utils/supabase/info.tsx';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

interface ZoneStats {
  questionsCompleted: number;
  correctAnswers: number;
  pointsEarned: number;
  level: number;
}

export function MakkahZone() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { getCurrentChild } = useFamilyContext();
  const child = getCurrentChild();

  const [stats, setStats] = useState<ZoneStats>({
    questionsCompleted: 0,
    correctAnswers: 0,
    pointsEarned: 0,
    level: 1
  });
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard' | null>(null);
  const [loading, setLoading] = useState(true);

  const categories = [
    { id: 'kaaba', name: 'The Holy Kaaba', icon: '🕋', color: 'from-amber-500 to-orange-600' },
    { id: 'hajj', name: 'Hajj & Umrah', icon: '🧳', color: 'from-orange-500 to-red-600' },
    { id: 'ibrahim', name: 'Prophet Ibrahim ﷺ', icon: '👤', color: 'from-yellow-500 to-amber-600' },
    { id: 'history', name: 'Makkah History', icon: '📜', color: 'from-amber-600 to-orange-700' }
  ];

  const difficulties = [
    { 
      level: 'easy', 
      name: 'Beginner Path', 
      icon: '🌟', 
      points: 10,
      color: 'from-green-400 to-emerald-500',
      description: 'Perfect for young learners'
    },
    { 
      level: 'medium', 
      name: 'Scholar Path', 
      icon: '⭐', 
      points: 25,
      color: 'from-blue-400 to-indigo-500',
      description: 'Test your knowledge'
    },
    { 
      level: 'hard', 
      name: 'Expert Path', 
      icon: '💫', 
      points: 50,
      color: 'from-purple-500 to-pink-500',
      description: 'Master level challenge'
    }
  ];

  useEffect(() => {
    if (child && accessToken) {
      loadStats();
    }
  }, [child, accessToken]);

  const loadStats = async () => {
    if (!child || !accessToken) return;

    try {
      // Load zone-specific stats from backend
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${child.familyId}/adventure/zones/makkah/${child.id}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats || stats);
      }
    } catch (error) {
      console.error('Failed to load zone stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartQuest = (difficulty: 'easy' | 'medium' | 'hard') => {
    navigate(`/kid/adventure-zones/makkah/play`, {
      state: { 
        difficulty,
        zone: 'makkah',
        categories: categories.map(c => c.id)
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-amber-900">Entering the Sacred City...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 pb-20">
      {/* Header with Background */}
      <div className="relative bg-gradient-to-r from-amber-500 to-orange-600 text-white p-8 shadow-2xl overflow-hidden">
        {/* Decorative Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 text-9xl">🕋</div>
          <div className="absolute bottom-0 right-0 text-9xl">🌙</div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-9xl">✨</div>
        </div>

        <div className="max-w-4xl mx-auto relative z-10">
          <button
            onClick={() => navigate('/kid/adventure-world')}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back to World Map</span>
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className="text-7xl drop-shadow-lg">🕋</div>
            <div>
              <h1 className="text-5xl font-bold mb-2 drop-shadow-lg">Makkah</h1>
              <p className="text-2xl opacity-90">مكة المكرمة</p>
            </div>
          </div>

          <p className="text-lg mb-6 bg-white/10 backdrop-blur-sm rounded-lg p-4">
            Journey to the sacred city where Prophet Ibrahim ﷺ built the Kaaba. 
            Learn about the holiest place in Islam and earn blessings through knowledge!
          </p>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center">
              <Star className="w-6 h-6 mx-auto mb-1" />
              <div className="text-2xl font-bold">{stats.questionsCompleted}</div>
              <div className="text-xs opacity-90">Questions</div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center">
              <Trophy className="w-6 h-6 mx-auto mb-1" />
              <div className="text-2xl font-bold">{stats.correctAnswers}</div>
              <div className="text-xs opacity-90">Correct</div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center">
              <Sparkles className="w-6 h-6 mx-auto mb-1" />
              <div className="text-2xl font-bold">{stats.pointsEarned}</div>
              <div className="text-xs opacity-90">Points</div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center">
              <BookOpen className="w-6 h-6 mx-auto mb-1" />
              <div className="text-2xl font-bold">Level {stats.level}</div>
              <div className="text-xs opacity-90">Zone Level</div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Learning Topics */}
        <Card className="border-4 border-amber-400">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <BookOpen className="w-6 h-6 text-amber-600" />
              What You'll Learn
            </CardTitle>
            <CardDescription className="text-base">
              Explore the sacred knowledge of Makkah
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {categories.map((category, index) => (
                <motion.div
                  key={category.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`bg-gradient-to-br ${category.color} text-white rounded-xl p-6 shadow-lg`}
                >
                  <div className="text-5xl mb-3">{category.icon}</div>
                  <h3 className="text-lg font-bold">{category.name}</h3>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Difficulty Selection */}
        <Card className="border-4 border-orange-400">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Sparkles className="w-6 h-6 text-orange-600" />
              Choose Your Path
            </CardTitle>
            <CardDescription className="text-base">
              Select your difficulty level and begin your journey!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {difficulties.map((diff, index) => (
              <motion.button
                key={diff.level}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.15 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleStartQuest(diff.level as 'easy' | 'medium' | 'hard')}
                className={`w-full bg-gradient-to-r ${diff.color} text-white rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all border-4 border-white/50`}
              >
                <div className="flex items-center gap-6">
                  <div className="text-6xl">{diff.icon}</div>
                  <div className="flex-1 text-left">
                    <h3 className="text-2xl font-bold mb-1">{diff.name}</h3>
                    <p className="text-white/90 text-sm mb-2">{diff.description}</p>
                    <div className="flex items-center gap-2">
                      <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-bold">
                        +{diff.points} points per question
                      </div>
                    </div>
                  </div>
                  <div className="text-4xl">→</div>
                </div>
              </motion.button>
            ))}
          </CardContent>
        </Card>

        {/* Encouragement */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-6 text-white text-center">
          <div className="text-5xl mb-3">🌟</div>
          <h3 className="text-xl font-bold mb-2">Bismillah - Let's Begin!</h3>
          <p className="opacity-90">
            Every question you answer brings you closer to understanding the sacred city. 
            May Allah bless your journey of learning! 📚✨
          </p>
        </div>
      </div>
    </div>
  );
}
