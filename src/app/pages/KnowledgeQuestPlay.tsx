import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info.tsx';
import { useAuth } from '../contexts/AuthContext';
import { useFamilyContext } from '../contexts/FamilyContext';
import { getCurrentMode } from '../utils/auth';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Brain, Lightbulb, CheckCircle2, XCircle, ChevronRight, Star, Sparkles, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../components/ui/utils';

// Knowledge Quest Play - Question answering interface
interface Question {
  id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionText: string;
  questionType: 'multiple_choice' | 'true_false' | 'short_answer';
  options?: string[];
  correctAnswerIndex?: number;
  correctBoolean?: boolean;
  acceptedAnswers?: string[];
  hint?: string;
  hintReducedOptions?: string[];
  basePoints: number;
  hintPenalty: number;
  explanation?: string;
}

export function KnowledgeQuestPlay() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { accessToken } = useAuth();
  const { children, selectedChildId } = useFamilyContext();
  const child = children.find(c => c.id === selectedChildId);
  
  const selectedCategories = (location.state as any)?.categories || [];
  
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<any>(null);
  const [showHint, setShowHint] = useState(false);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | null>(null);
  const [loading, setLoading] = useState(false);

  const loadQuestion = async (selectedDifficulty: 'easy' | 'medium' | 'hard') => {
    if (!accessToken) return;

    setLoading(true);
    setDifficulty(selectedDifficulty);

    try {
      // Build query params
      let url = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/questions/random/${selectedDifficulty}`;
      
      // Add category filter if categories selected
      if (selectedCategories.length > 0) {
        const randomCategory = selectedCategories[Math.floor(Math.random() * selectedCategories.length)];
        url += `?category=${encodeURIComponent(randomCategory)}`;
      }

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
        const errorText = await response.text();
        if (response.status === 404) {
          toast.error('No questions found for this difficulty/category. Try another!');
        } else {
          console.error('Load question error:', errorText);
          toast.error('Failed to load question');
        }
        setDifficulty(null);
      }
    } catch (error) {
      console.error('Load question error:', error);
      toast.error('Failed to load question');
      setDifficulty(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = async () => {
    if (!currentQuestion || selectedAnswer === null || !accessToken || !sessionId) return;

    // Determine if answer is correct
    let correct = false;
    
    if (currentQuestion.questionType === 'multiple_choice') {
      correct = selectedAnswer === currentQuestion.correctAnswerIndex;
    } else if (currentQuestion.questionType === 'true_false') {
      correct = selectedAnswer === currentQuestion.correctBoolean;
    } else if (currentQuestion.questionType === 'short_answer') {
      const userAnswer = selectedAnswer.toLowerCase().trim();
      correct = currentQuestion.acceptedAnswers?.some(
        answer => answer.toLowerCase().trim() === userAnswer
      ) || false;
    }

    setIsCorrect(correct);
    setIsAnswered(true);

    // Calculate points
    let points = 0;
    if (correct) {
      points = showHint 
        ? currentQuestion.basePoints - currentQuestion.hintPenalty
        : currentQuestion.basePoints;
    }

    setPointsEarned(points);

    // Submit answer to backend
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/knowledge-sessions/${sessionId}/answer`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionId,
            questionId: currentQuestion.id,
            difficulty: difficulty,
            selectedAnswer,
            isCorrect: correct,
            hintUsed: showHint,
            pointsEarned: points
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        setTotalPoints(data.session.totalPointsEarned);
        setQuestionsAnswered(data.session.questionsAnswered);
        setCorrectCount(data.session.correctAnswers);
      }
    } catch (error) {
      console.error('Submit answer error:', error);
    }
  };

  const handleNextQuestion = () => {
    setDifficulty(null);
    setCurrentQuestion(null);
  };

  const handleEndQuest = async () => {
    if (!accessToken || !sessionId) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/knowledge-sessions/${sessionId}/complete`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        const session = await response.json();
        // Navigate to results - use kid route if in kid mode
        const mode = getCurrentMode();
        const basePath = mode === 'kid' ? '/kid/knowledge-quest' : '/knowledge-quest';
        navigate(`${basePath}/results`, { state: { session } });
      }
    } catch (error) {
      console.error('End quest error:', error);
      toast.error('Failed to end quest');
    }
  };

  // Difficulty Selection Screen
  if (!difficulty || !currentQuestion) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-2xl mx-auto space-y-6"
      >
        {/* Progress Header */}
        <Card className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-4 border-white">
          <CardHeader>
            <CardTitle className="text-center">
              <div className="text-4xl font-bold">Knowledge Quest 🌟</div>
              <div className="text-lg mt-2">
                Question #{questionsAnswered + 1} • {totalPoints} Points ⭐
              </div>
            </CardTitle>
          </CardHeader>
        </Card>

        {/* Difficulty Selection */}
        <Card className="border-4 border-[#F4C430]">
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              Choose Your Challenge! 🎯
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <motion.button
              onClick={() => loadQuestion('easy')}
              whileHover={{ scale: 1.05, x: 10 }}
              whileTap={{ scale: 0.95 }}
              disabled={loading}
              className="w-full p-6 rounded-2xl border-4 border-green-400 bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 transition-all shadow-lg disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <div className="text-3xl font-bold text-green-700">🟢 EASY</div>
                  <div className="text-sm text-green-600 mt-1">Quick Win!</div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-black text-green-700">5</div>
                  <div className="text-xs text-green-600">points</div>
                </div>
              </div>
            </motion.button>

            <motion.button
              onClick={() => loadQuestion('medium')}
              whileHover={{ scale: 1.05, x: 10 }}
              whileTap={{ scale: 0.95 }}
              disabled={loading}
              className="w-full p-6 rounded-2xl border-4 border-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50 hover:from-yellow-100 hover:to-orange-100 transition-all shadow-lg disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <div className="text-3xl font-bold text-yellow-700">🟡 MEDIUM</div>
                  <div className="text-sm text-yellow-600 mt-1">Good Challenge!</div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-black text-yellow-700">10</div>
                  <div className="text-xs text-yellow-600">points</div>
                </div>
              </div>
            </motion.button>

            <motion.button
              onClick={() => loadQuestion('hard')}
              whileHover={{ scale: 1.05, x: 10 }}
              whileTap={{ scale: 0.95 }}
              disabled={loading}
              className="w-full p-6 rounded-2xl border-4 border-red-400 bg-gradient-to-r from-red-50 to-rose-50 hover:from-red-100 hover:to-rose-100 transition-all shadow-lg disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <div className="text-3xl font-bold text-red-700">🔴 HARD</div>
                  <div className="text-sm text-red-600 mt-1">Expert Level! 🔥</div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-black text-red-700">20</div>
                  <div className="text-xs text-red-600">points</div>
                </div>
              </div>
            </motion.button>

            <Button
              variant="outline"
              onClick={handleEndQuest}
              className="w-full h-12 text-base font-bold border-2"
            >
              ✋ End Quest
            </Button>
          </CardContent>
        </Card>

        {loading && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-2"></div>
            <p className="text-muted-foreground">Loading question...</p>
          </div>
        )}
      </motion.div>
    );
  }

  // Question Screen
  const pointsForQuestion = showHint 
    ? currentQuestion.basePoints - currentQuestion.hintPenalty
    : currentQuestion.basePoints;

  const difficultyColor = {
    easy: 'text-green-700',
    medium: 'text-yellow-700',
    hard: 'text-red-700'
  }[difficulty!];

  const difficultyBg = {
    easy: 'from-green-50 to-emerald-50',
    medium: 'from-yellow-50 to-orange-50',
    hard: 'from-red-50 to-rose-50'
  }[difficulty!];

  const difficultyBorder = {
    easy: 'border-green-400',
    medium: 'border-yellow-400',
    hard: 'border-red-400'
  }[difficulty!];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-3xl mx-auto space-y-6"
    >
      {/* Header */}
      <Card className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-4 border-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-bold">Question #{questionsAnswered + 1}</div>
              <div className="text-sm opacity-90">{currentQuestion.category}</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black">{totalPoints} ⭐</div>
              <div className="text-xs opacity-90">{correctCount} Correct</div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Question Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -50, opacity: 0 }}
        >
          <Card className={`border-4 ${difficultyBorder} bg-gradient-to-br ${difficultyBg}`}>
            <CardHeader>
              <div className="flex items-center justify-between mb-3">
                <Badge className="bg-white/80 text-gray-900 font-bold text-base px-4 py-2">
                  {difficulty?.toUpperCase()} • {pointsForQuestion} points{showHint && ' (hint used)'}
                </Badge>
                {isAnswered && (
                  <Badge className={isCorrect ? 'bg-green-500' : 'bg-orange-500'}>
                    {isCorrect ? '✅ Correct!' : '💡 Learn from this'}
                  </Badge>
                )}
              </div>
              <CardTitle className={`text-2xl ${difficultyColor} leading-relaxed`}>
                {currentQuestion.questionText}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Multiple Choice Options */}
              {currentQuestion.questionType === 'multiple_choice' && (
                <>
                  {(showHint && currentQuestion.hintReducedOptions ? currentQuestion.hintReducedOptions : currentQuestion.options)?.map((option, index) => {
                    const originalIndex = currentQuestion.options?.indexOf(option) ?? index;
                    const isSelected = selectedAnswer === originalIndex;
                    const showCorrect = isAnswered && originalIndex === currentQuestion.correctAnswerIndex;
                    const showWrong = isAnswered && isSelected && originalIndex !== currentQuestion.correctAnswerIndex;

                    return (
                      <motion.button
                        key={index}
                        onClick={() => !isAnswered && setSelectedAnswer(originalIndex)}
                        disabled={isAnswered}
                        whileHover={!isAnswered ? { scale: 1.02, x: 5 } : {}}
                        whileTap={!isAnswered ? { scale: 0.98 } : {}}
                        className={cn(
                          "w-full text-left p-5 rounded-2xl border-4 transition-all font-medium text-base shadow-md",
                          isSelected && !isAnswered && "border-purple-500 bg-gradient-to-r from-purple-50 to-pink-50 shadow-lg",
                          !isSelected && !isAnswered && "border-gray-300 bg-white hover:border-[#F4C430] hover:bg-[#FFF8E7]",
                          showCorrect && "border-green-500 bg-gradient-to-r from-green-50 to-emerald-50 shadow-lg",
                          showWrong && "border-orange-500 bg-gradient-to-r from-orange-50 to-red-50 shadow-lg",
                          isAnswered && "cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "flex-shrink-0 w-8 h-8 rounded-full border-4 flex items-center justify-center font-bold",
                            isSelected && !isAnswered && "border-purple-500 bg-purple-500 text-white",
                            !isSelected && !isAnswered && "border-gray-400 bg-white text-gray-600",
                            showCorrect && "border-green-500 bg-green-500 text-white",
                            showWrong && "border-orange-500 bg-orange-500 text-white"
                          )}>
                            {!isAnswered && String.fromCharCode(65 + index)}
                            {showCorrect && <CheckCircle2 className="h-5 w-5" />}
                            {showWrong && <XCircle className="h-5 w-5" />}
                          </div>
                          <span className={cn(
                            "flex-1",
                            isSelected && !isAnswered && "text-purple-900 font-bold",
                            showCorrect && "text-green-900 font-bold",
                            showWrong && "text-orange-900"
                          )}>
                            {option}
                          </span>
                        </div>
                      </motion.button>
                    );
                  })}
                </>
              )}

              {/* True/False */}
              {currentQuestion.questionType === 'true_false' && (
                <div className="grid grid-cols-2 gap-4">
                  {[true, false].map((value) => {
                    const isSelected = selectedAnswer === value;
                    const showCorrect = isAnswered && value === currentQuestion.correctBoolean;
                    const showWrong = isAnswered && isSelected && value !== currentQuestion.correctBoolean;

                    return (
                      <motion.button
                        key={value.toString()}
                        onClick={() => !isAnswered && setSelectedAnswer(value)}
                        disabled={isAnswered}
                        whileHover={!isAnswered ? { scale: 1.05 } : {}}
                        whileTap={!isAnswered ? { scale: 0.95 } : {}}
                        className={cn(
                          "p-6 rounded-2xl border-4 transition-all font-bold text-lg shadow-md",
                          isSelected && !isAnswered && "border-purple-500 bg-purple-500 text-white",
                          !isSelected && !isAnswered && "border-gray-300 bg-white hover:border-[#F4C430]",
                          showCorrect && "border-green-500 bg-green-500 text-white",
                          showWrong && "border-orange-500 bg-orange-500 text-white"
                        )}
                      >
                        {value ? '✓ TRUE' : '✗ FALSE'}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* Hint Button */}
              {!isAnswered && currentQuestion.hint && !showHint && currentQuestion.questionType !== 'true_false' && (
                <Button
                  variant="outline"
                  onClick={() => setShowHint(true)}
                  className="w-full border-2 border-yellow-400 hover:bg-yellow-50"
                >
                  <Lightbulb className="h-4 w-4 mr-2" />
                  💡 Need a Hint? (-{currentQuestion.hintPenalty} points)
                </Button>
              )}

              {/* Hint Display */}
              {showHint && currentQuestion.hint && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4"
                >
                  <div className="flex items-start gap-2">
                    <Lightbulb className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-yellow-900">Hint:</div>
                      <div className="text-yellow-800">{currentQuestion.hint}</div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Explanation (after answering) */}
              {isAnswered && currentQuestion.explanation && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className={cn(
                    "rounded-lg p-4 border-2",
                    isCorrect 
                      ? "bg-green-50 border-green-300" 
                      : "bg-blue-50 border-blue-300"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Brain className={cn(
                      "h-5 w-5 flex-shrink-0 mt-0.5",
                      isCorrect ? "text-green-600" : "text-blue-600"
                    )} />
                    <div>
                      <div className={cn(
                        "font-bold",
                        isCorrect ? "text-green-900" : "text-blue-900"
                      )}>
                        {isCorrect ? '✨ Great job!' : '💭 Learn More:'}
                      </div>
                      <div className={cn(
                        isCorrect ? "text-green-800" : "text-blue-800"
                      )}>
                        {currentQuestion.explanation}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Points Earned */}
              {isAnswered && isCorrect && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="bg-gradient-to-r from-yellow-400 to-orange-400 rounded-2xl p-6 text-center text-white shadow-xl"
                >
                  <div className="text-5xl font-black mb-2">+{pointsEarned} ⭐</div>
                  <div className="text-xl font-bold">Points Earned!</div>
                </motion.div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                {!isAnswered ? (
                  <Button
                    onClick={handleAnswer}
                    disabled={selectedAnswer === null}
                    className="flex-1 h-14 text-lg font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg"
                  >
                    Submit Answer 🚀
                  </Button>
                ) : (
                  <Button
                    onClick={handleNextQuestion}
                    className="flex-1 h-14 text-lg font-bold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg"
                  >
                    Next Question ➡️
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleEndQuest}
                  className="h-14 px-6 font-bold border-2"
                >
                  ✋ End Quest
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}