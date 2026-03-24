import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Lightbulb, CheckCircle2, XCircle, Sparkles, Trophy, Brain } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFamilyContext } from '../../contexts/FamilyContext';
import { projectId } from '/utils/supabase/info.tsx';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

interface Question {
  id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionText: string;
  questionType: 'multiple_choice' | 'true_false';
  options?: string[];
  correctAnswerIndex?: number;
  correctBoolean?: boolean;
  hint?: string;
  basePoints: number;
  hintPenalty: number;
  explanation?: string;
}

const ZONE_CONFIG = {
  makkah: {
    name: 'Makkah',
    nameArabic: 'مكة المكرمة',
    icon: '🕋',
    color: 'from-amber-500 to-orange-600',
    bgGradient: 'from-amber-50 to-orange-100',
    categories: ['kaaba', 'hajj', 'ibrahim', 'islamic']
  },
  madinah: {
    name: 'Madinah',
    nameArabic: 'المدينة المنورة',
    icon: '🕌',
    color: 'from-emerald-500 to-teal-600',
    bgGradient: 'from-emerald-50 to-teal-100',
    categories: ['prophet', 'hadith', 'companions', 'islamic']
  },
  'quran-valley': {
    name: 'Quran Valley',
    nameArabic: 'وادي القرآن',
    icon: '📖',
    color: 'from-blue-500 to-indigo-600',
    bgGradient: 'from-blue-50 to-indigo-100',
    categories: ['quran', 'tafsir', 'memorization', 'islamic']
  },
  'desert-trials': {
    name: 'Desert of Trials',
    nameArabic: 'صحراء الاختبارات',
    icon: '🏜️',
    color: 'from-yellow-600 to-amber-700',
    bgGradient: 'from-yellow-50 to-amber-100',
    categories: ['fiqh', 'akhlaq', 'dua', 'islamic']
  }
};

export function ZonePlay() {
  const navigate = useNavigate();
  const location = useLocation();
  const { accessToken } = useAuth();
  const { getCurrentChild } = useFamilyContext();
  const child = getCurrentChild();

  const state = location.state as any;
  const difficulty = state?.difficulty || 'easy';
  const zoneName = state?.zone || 'makkah';
  const zoneConfig = ZONE_CONFIG[zoneName as keyof typeof ZONE_CONFIG];

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<any>(null);
  const [showHint, setShowHint] = useState(false);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sessionActive, setSessionActive] = useState(true);

  useEffect(() => {
    loadQuestion();
  }, []);

  const loadQuestion = async () => {
    if (!accessToken) return;

    setLoading(true);

    try {
      // Get random category from zone
      const randomCategory = zoneConfig.categories[
        Math.floor(Math.random() * zoneConfig.categories.length)
      ];

      const url = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/questions/random/${difficulty}?category=${encodeURIComponent(randomCategory)}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (response.ok) {
        const question = await response.json();
        setCurrentQuestion(question);
        setSelectedAnswer(null);
        setShowHint(false);
        setIsAnswered(false);
      } else {
        if (response.status === 404) {
          toast.error('No questions available. Let\'s seed some sample questions!');
          // Auto-seed if no questions
          await seedQuestions();
        } else {
          toast.error('Failed to load question');
        }
      }
    } catch (error) {
      console.error('Load question error:', error);
      toast.error('Failed to load question');
    } finally {
      setLoading(false);
    }
  };

  const seedQuestions = async () => {
    if (!accessToken) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/questions/seed-samples`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        toast.success('Sample questions added! Loading your first question...');
        await loadQuestion();
      }
    } catch (error) {
      console.error('Seed error:', error);
    }
  };

  const handleAnswer = async () => {
    if (!currentQuestion || selectedAnswer === null) return;

    // Determine if answer is correct
    let correct = false;

    if (currentQuestion.questionType === 'multiple_choice') {
      correct = selectedAnswer === currentQuestion.correctAnswerIndex;
    } else if (currentQuestion.questionType === 'true_false') {
      correct = selectedAnswer === currentQuestion.correctBoolean;
    }

    setIsCorrect(correct);
    setIsAnswered(true);

    // Calculate points
    let points = 0;
    if (correct) {
      points = showHint
        ? currentQuestion.basePoints - currentQuestion.hintPenalty
        : currentQuestion.basePoints;
      
      // Streak bonus
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak >= 3) {
        points += 10; // Streak bonus
      }
    } else {
      setStreak(0);
    }

    setPointsEarned(points);
    setTotalPoints(prev => prev + points);
    setQuestionsAnswered(prev => prev + 1);
    if (correct) {
      setCorrectCount(prev => prev + 1);
    }

    // Award XP to child's adventure profile
    if (correct && child) {
      try {
        await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/${child.familyId}/adventure/award-xp`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              childId: child.id,
              xpAmount: Math.floor(points / 2), // XP is half the points
              source: `${zoneConfig.name} Quest`
            })
          }
        );
      } catch (error) {
        console.error('Failed to award XP:', error);
      }
    }
  };

  const handleNextQuestion = () => {
    loadQuestion();
  };

  const handleEndQuest = () => {
    // Show completion summary
    toast.success(`Quest complete! You earned ${totalPoints} points! 🎉`);
    navigate(`/kid/adventure-zones/${zoneName}`);
  };

  if (!zoneConfig) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-700">Zone not found</p>
          <Button onClick={() => navigate('/kid/adventure-world')} className="mt-4">
            Back to Adventure World
          </Button>
        </div>
      </div>
    );
  }

  if (loading && !currentQuestion) {
    return (
      <div className={`min-h-screen bg-gradient-to-b ${zoneConfig.bgGradient} flex items-center justify-center`}>
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">{zoneConfig.icon}</div>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-gray-700">Loading your quest...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-b ${zoneConfig.bgGradient} pb-20`}>
      {/* Header */}
      <div className={`bg-gradient-to-r ${zoneConfig.color} text-white p-4 shadow-lg`}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={handleEndQuest}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">End Quest</span>
            </button>
            <div className="flex items-center gap-2">
              <div className="text-3xl">{zoneConfig.icon}</div>
              <div className="text-right">
                <h1 className="text-lg font-bold">{zoneConfig.name}</h1>
                <p className="text-xs opacity-90">{zoneConfig.nameArabic}</p>
              </div>
            </div>
          </div>

          {/* Progress Stats */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-2 text-center">
              <div className="text-xs opacity-80">Score</div>
              <div className="text-lg font-bold">{totalPoints}</div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-2 text-center">
              <div className="text-xs opacity-80">Questions</div>
              <div className="text-lg font-bold">{questionsAnswered}</div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-2 text-center">
              <div className="text-xs opacity-80">Correct</div>
              <div className="text-lg font-bold">{correctCount}</div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-2 text-center">
              <div className="text-xs opacity-80">Streak</div>
              <div className="text-lg font-bold">{streak} 🔥</div>
            </div>
          </div>
        </div>
      </div>

      {/* Question Card */}
      <div className="max-w-4xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {currentQuestion && (
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Card className="border-4 border-amber-400 shadow-2xl">
                <CardContent className="p-8">
                  {/* Question Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-purple-600" />
                      <span className="text-sm font-medium text-gray-600 capitalize">
                        {currentQuestion.difficulty}
                      </span>
                    </div>
                    <div className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-bold">
                      {showHint 
                        ? `${currentQuestion.basePoints - currentQuestion.hintPenalty} points`
                        : `${currentQuestion.basePoints} points`
                      }
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">
                      {currentQuestion.questionText}
                    </h2>
                  </div>

                  {/* Options */}
                  {currentQuestion.questionType === 'multiple_choice' && currentQuestion.options && (
                    <div className="space-y-3 mb-6">
                      {currentQuestion.options.map((option, index) => (
                        <motion.button
                          key={index}
                          whileHover={{ scale: isAnswered ? 1 : 1.02 }}
                          whileTap={{ scale: isAnswered ? 1 : 0.98 }}
                          onClick={() => !isAnswered && setSelectedAnswer(index)}
                          disabled={isAnswered}
                          className={`
                            w-full p-4 rounded-xl border-4 text-left font-medium transition-all
                            ${selectedAnswer === index 
                              ? isAnswered
                                ? isCorrect
                                  ? 'border-green-500 bg-green-50'
                                  : 'border-red-500 bg-red-50'
                                : 'border-purple-500 bg-purple-50'
                              : isAnswered && index === currentQuestion.correctAnswerIndex
                                ? 'border-green-500 bg-green-50'
                                : 'border-gray-300 bg-white hover:border-amber-400 hover:bg-amber-50'
                            }
                            ${isAnswered ? 'cursor-not-allowed' : 'cursor-pointer'}
                          `}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`
                              w-8 h-8 rounded-full flex items-center justify-center font-bold
                              ${selectedAnswer === index
                                ? isAnswered
                                  ? isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                                  : 'bg-purple-500 text-white'
                                : isAnswered && index === currentQuestion.correctAnswerIndex
                                  ? 'bg-green-500 text-white'
                                  : 'bg-gray-200 text-gray-700'
                              }
                            `}>
                              {String.fromCharCode(65 + index)}
                            </div>
                            <span>{option}</span>
                            {isAnswered && index === currentQuestion.correctAnswerIndex && (
                              <CheckCircle2 className="w-5 h-5 text-green-600 ml-auto" />
                            )}
                            {isAnswered && selectedAnswer === index && !isCorrect && (
                              <XCircle className="w-5 h-5 text-red-600 ml-auto" />
                            )}
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  )}

                  {currentQuestion.questionType === 'true_false' && (
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      {[true, false].map((value) => (
                        <motion.button
                          key={value.toString()}
                          whileHover={{ scale: isAnswered ? 1 : 1.05 }}
                          whileTap={{ scale: isAnswered ? 1 : 0.95 }}
                          onClick={() => !isAnswered && setSelectedAnswer(value)}
                          disabled={isAnswered}
                          className={`
                            p-6 rounded-xl border-4 font-bold text-xl transition-all
                            ${selectedAnswer === value
                              ? isAnswered
                                ? isCorrect
                                  ? 'border-green-500 bg-green-50'
                                  : 'border-red-500 bg-red-50'
                                : 'border-purple-500 bg-purple-50'
                              : isAnswered && value === currentQuestion.correctBoolean
                                ? 'border-green-500 bg-green-50'
                                : 'border-gray-300 bg-white hover:border-amber-400 hover:bg-amber-50'
                            }
                            ${isAnswered ? 'cursor-not-allowed' : 'cursor-pointer'}
                          `}
                        >
                          {value ? '✅ True' : '❌ False'}
                        </motion.button>
                      ))}
                    </div>
                  )}

                  {/* Hint */}
                  {currentQuestion.hint && !isAnswered && (
                    <div className="mb-6">
                      {!showHint ? (
                        <Button
                          onClick={() => setShowHint(true)}
                          variant="outline"
                          className="w-full border-2 border-yellow-400 hover:bg-yellow-50"
                        >
                          <Lightbulb className="w-4 h-4 mr-2" />
                          Need a hint? (-{currentQuestion.hintPenalty} points)
                        </Button>
                      ) : (
                        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="w-5 h-5 text-yellow-600 mt-0.5" />
                            <div>
                              <p className="font-semibold text-yellow-900 mb-1">Hint:</p>
                              <p className="text-yellow-800">{currentQuestion.hint}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Explanation */}
                  {isAnswered && currentQuestion.explanation && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-4 rounded-lg mb-6 ${
                        isCorrect 
                          ? 'bg-green-50 border-2 border-green-400' 
                          : 'bg-blue-50 border-2 border-blue-400'
                      }`}
                    >
                      <p className="font-semibold text-gray-900 mb-2">
                        {isCorrect ? '🎉 Excellent!' : '📚 Learn More:'}
                      </p>
                      <p className="text-gray-700">{currentQuestion.explanation}</p>
                    </motion.div>
                  )}

                  {/* Points Earned */}
                  {isAnswered && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="text-center mb-6"
                    >
                      <div className={`text-4xl font-bold mb-2 ${
                        isCorrect ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {isCorrect ? `+${pointsEarned} Points! 🌟` : 'Try the next one! 💪'}
                      </div>
                      {streak >= 3 && isCorrect && (
                        <div className="text-orange-600 font-bold animate-pulse">
                          🔥 {streak} Question Streak! +10 Bonus Points!
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-4">
                    {!isAnswered ? (
                      <Button
                        onClick={handleAnswer}
                        disabled={selectedAnswer === null}
                        className="flex-1 h-14 text-lg font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                      >
                        <Sparkles className="w-5 h-5 mr-2" />
                        Submit Answer
                      </Button>
                    ) : (
                      <>
                        <Button
                          onClick={handleNextQuestion}
                          className="flex-1 h-14 text-lg font-bold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                        >
                          Next Question →
                        </Button>
                        <Button
                          onClick={handleEndQuest}
                          variant="outline"
                          className="h-14 px-6 border-2"
                        >
                          <Trophy className="w-5 h-5 mr-2" />
                          Finish
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
