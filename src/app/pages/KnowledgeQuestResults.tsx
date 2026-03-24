import { useLocation, useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Trophy, Star, Brain, Target, Zap, TrendingUp, Award, Home, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { Confetti } from '../components/effects/Confetti';
import { getCurrentMode } from '../utils/auth';

interface Session {
  id: string;
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
  rawPoints?: number; // Points earned in-game
  pointsAwarded: number; // Actual points added to account
}

export function KnowledgeQuestResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = (location.state as any)?.session as Session;
  
  // Get the base path based on current mode
  const mode = getCurrentMode();
  const basePath = mode === 'kid' ? '/kid/knowledge-quest' : '/knowledge-quest';

  if (!session) {
    navigate(basePath);
    return null;
  }

  const score = session.questionsAnswered > 0
    ? Math.round((session.correctAnswers / session.questionsAnswered) * 100)
    : 0;

  const getScoreMessage = (score: number) => {
    if (score === 100) return '🌟 Perfect! You\'re a Knowledge Master! 🌟';
    if (score >= 80) return '🎉 Amazing Work! You\'re brilliant! 🎉';
    if (score >= 60) return '⭐ Great Job! Keep learning! ⭐';
    return '💪 Awesome Effort! Every quest makes you smarter! 💪';
  };

  const getEncouragement = (score: number) => {
    if (score === 100) return 'You got everything right! You\'re unstoppable! 🚀';
    if (score >= 80) return 'Excellent work! You really know your stuff! 🧠';
    if (score >= 60) return 'Great effort! Every question teaches you something new! 📚';
    return 'Every expert was once a beginner. Keep practicing and you\'ll ace it! 🌱';
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      {/* Celebration Banner */}
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="overflow-hidden bg-gradient-to-br from-[#FFF8E7] via-[#FFE5CC] to-[#FFD4A3] border-4 border-[#F4C430]">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-purple-500 via-pink-500 to-yellow-500"></div>
          
          <CardHeader className="text-center pb-4">
            {/* Animated Trophy */}
            <motion.div 
              className="flex justify-center mb-4"
              animate={{ 
                rotate: [0, -10, 10, -10, 0],
                scale: [1, 1.1, 1.1, 1.1, 1]
              }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              {score === 100 ? (
                <div className="relative">
                  <Award className="h-20 w-20 text-yellow-500 drop-shadow-lg" />
                  <motion.div
                    className="absolute -top-2 -right-2"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    <TrendingUp className="h-8 w-8 text-yellow-400" />
                  </motion.div>
                </div>
              ) : score >= 80 ? (
                <Trophy className="h-20 w-20 text-yellow-500 drop-shadow-lg" />
              ) : score >= 60 ? (
                <Star className="h-20 w-20 text-blue-500 drop-shadow-lg" />
              ) : (
                <Brain className="h-20 w-20 text-purple-500 drop-shadow-lg" />
              )}
            </motion.div>
            
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
            >
              <CardTitle className="text-4xl font-bold text-[#2D1810] mb-2">
                {getScoreMessage(score)}
              </CardTitle>
              <p className="text-lg text-[#5D4E37] font-medium">
                {getEncouragement(score)}
              </p>
            </motion.div>
          </CardHeader>
          
          <CardContent className="space-y-6 pb-6">
            {/* Score Display */}
            <motion.div 
              className="text-center space-y-3"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: "spring" }}
            >
              <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg">
                <div className="text-7xl font-black text-purple-600 mb-2">
                  {score}%
                </div>
                <p className="text-lg text-[#5D4E37] font-medium">
                  ✨ {session.correctAnswers} out of {session.questionsAnswered} correct! ✨
                </p>
              </div>
            </motion.div>

            {/* Points Earned - BIG CELEBRATION */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.7, type: "spring", stiffness: 150 }}
              className="relative"
            >
              <div className="bg-gradient-to-r from-[#F4C430] via-[#FFD700] to-[#F4C430] rounded-2xl p-8 text-center shadow-xl border-4 border-white">
                {/* Floating stars */}
                <div className="absolute -top-3 -left-3">
                  <motion.div
                    animate={{ y: [-5, 5, -5], rotate: [0, 360] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <Star className="h-8 w-8 text-white fill-white" />
                  </motion.div>
                </div>
                <div className="absolute -top-3 -right-3">
                  <motion.div
                    animate={{ y: [5, -5, 5], rotate: [360, 0] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <TrendingUp className="h-8 w-8 text-white fill-white" />
                  </motion.div>
                </div>
                
                <Trophy className="h-12 w-12 mx-auto mb-3 text-white drop-shadow-lg" />
                <div className="text-5xl font-black text-white mb-2 drop-shadow-lg">
                  +{session.pointsAwarded} ⭐
                </div>
                <p className="text-xl font-bold text-white drop-shadow">
                  Points Earned!
                </p>
                <p className="text-sm text-white/90 mt-2">
                  🎯 Added to your adventure points!
                </p>
              </div>
            </motion.div>

            {/* Stats Breakdown */}
            <div className="space-y-3">
              <h3 className="font-bold text-lg text-[#2D1810] flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                Your Performance:
              </h3>
              
              <div className="grid grid-cols-3 gap-3">
                {session.easyAttempted > 0 && (
                  <div className="bg-green-50 border-2 border-green-300 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-green-700">
                      {session.easyCorrect}/{session.easyAttempted}
                    </div>
                    <div className="text-xs text-green-600 font-medium">🟢 Easy</div>
                  </div>
                )}
                
                {session.mediumAttempted > 0 && (
                  <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-yellow-700">
                      {session.mediumCorrect}/{session.mediumAttempted}
                    </div>
                    <div className="text-xs text-yellow-600 font-medium">🟡 Medium</div>
                  </div>
                )}
                
                {session.hardAttempted > 0 && (
                  <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-red-700">
                      {session.hardCorrect}/{session.hardAttempted}
                    </div>
                    <div className="text-xs text-red-600 font-medium">🔴 Hard</div>
                  </div>
                )}
              </div>

              {/* Categories */}
              {session.categories.length > 0 && (
                <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
                  <div className="font-bold text-sm text-purple-900 mb-2">
                    📚 Topics Practiced:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {session.categories.map((cat) => (
                      <Badge key={cat} className="bg-purple-500 text-white">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Hints */}
              {session.hintsUsed > 0 && (
                <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
                  <div className="text-sm text-yellow-800">
                    💡 Used {session.hintsUsed} hint{session.hintsUsed > 1 ? 's' : ''}
                  </div>
                </div>
              )}
            </div>

            {/* Encouraging Message */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl p-5 text-center border-2 border-purple-200"
            >
              <p className="text-lg font-bold text-purple-900 mb-1">
                {score === 100 && '🌟 You\'re a knowledge superstar! Keep shining! ✨'}
                {score >= 80 && score < 100 && '🎯 Excellent work! You\'re getting really good at this! 🚀'}
                {score >= 60 && score < 80 && '📚 Great effort! Every quest makes you smarter! 💪'}
                {score < 60 && '🌱 Every expert was once a beginner! Keep practicing! 🌟'}
              </p>
              <p className="text-sm text-purple-700">
                Remember: Learning is an adventure, not a race! 🎒
              </p>
            </motion.div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              {mode === 'kid' && (
                <Button
                  variant="outline"
                  className="flex-1 gap-2 h-14 text-base font-bold border-2 hover:scale-105 transition-transform"
                  onClick={() => navigate('/kid/home')}
                >
                  <ArrowLeft className="h-5 w-5" />
                  Back to Dashboard
                </Button>
              )}
              <Button
                variant="outline"
                className="flex-1 gap-2 h-14 text-base font-bold border-2 hover:scale-105 transition-transform"
                onClick={() => navigate(basePath)}
              >
                <Home className="h-5 w-5" />
                Quest Home
              </Button>
              <Button
                className="flex-1 gap-2 h-14 text-base font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 hover:scale-105 transition-transform shadow-lg"
                onClick={() => navigate(basePath)}
              >
                <Zap className="h-5 w-5" />
                Another Quest!
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}