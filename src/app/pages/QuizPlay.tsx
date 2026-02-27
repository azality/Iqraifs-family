import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info.tsx';
import { useAuth } from '../contexts/AuthContext';
import { useFamily } from '../contexts/FamilyContext';
import { cn } from '../components/ui/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Brain, Trophy, Award, CheckCircle, XCircle, Home, ArrowRight, Sparkles, Star, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Question {
  question: string;
  options: string[];
  correctAnswer: number;
  points: number;
}

interface Quiz {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  totalPoints: number;
  difficulty: 'easy' | 'medium' | 'hard';
  createdBy: string;
  createdAt: string;
}

export function QuizPlay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { selectedChildId, getCurrentChild } = useFamily();
  const { accessToken } = useAuth();
  const selectedChild = getCurrentChild();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);
  const [pointsEarned, setPointsEarned] = useState(0);

  useEffect(() => {
    if (!selectedChild) {
      toast.error('Please select a child first');
      navigate('/quizzes');
      return;
    }
    if (accessToken) {
      loadQuiz();
    }
  }, [id, selectedChild, accessToken]);

  const loadQuiz = async () => {
    if (!accessToken) return;
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quizzes/${id}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setQuiz(data);
        setSelectedAnswers(new Array(data.questions.length).fill(-1));
      } else {
        toast.error('Quiz not found');
        navigate('/quizzes');
      }
    } catch (error) {
      console.error('Load quiz error:', error);
      toast.error('Failed to load quiz');
      navigate('/quizzes');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAnswer = (answerIndex: number) => {
    if (isSubmitted) return;
    
    const newAnswers = [...selectedAnswers];
    newAnswers[currentQuestionIndex] = answerIndex;
    setSelectedAnswers(newAnswers);
  };

  const handleNextQuestion = () => {
    if (quiz && currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!quiz || !selectedChild) return;

    // Check if all questions are answered
    if (selectedAnswers.includes(-1)) {
      toast.error('Please answer all questions before submitting');
      return;
    }

    setIsSubmitted(true);

    /**
     * QUIZ SCORING SYSTEM:
     * 
     * 1. Points per Question: Each question has its own point value (set by parent when creating quiz)
     *    - Parents can customize points (e.g., harder questions = more points)
     *    - Default is 10 points per question
     * 
     * 2. Points Earned: Kids only earn points for CORRECT answers
     *    - If you get a question right: +[question.points] to your total
     *    - If you get a question wrong: 0 points for that question
     * 
     * 3. Total Points Earned: Sum of all points from correctly answered questions
     *    - Example: 5 questions worth 10 points each
     *    - If you get 3 correct: 30 points earned (3 × 10)
     * 
     * 4. Score Percentage: (Correct Answers / Total Questions) × 100
     *    - This shows how well you did overall
     *    - Example: 3 out of 5 = 60%
     * 
     * 5. Both values are saved:
     *    - Score percentage: For progress tracking and achievements
     *    - Points earned: Added to child's total points for rewards
     */
    
    // Calculate score
    let correctCount = 0;
    let earnedPoints = 0;

    quiz.questions.forEach((question, index) => {
      if (selectedAnswers[index] === question.correctAnswer) {
        correctCount++;
        earnedPoints += question.points; // Add points only for correct answers
      }
    });

    const scorePercentage = Math.round((correctCount / quiz.questions.length) * 100);
    setScore(scorePercentage);
    setPointsEarned(earnedPoints);

    // Submit attempt to backend
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quiz-attempts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            quizId: quiz.id,
            childId: selectedChild.id,
            answers: selectedAnswers,
            score: scorePercentage,
            pointsEarned: earnedPoints
          })
        }
      );

      if (response.ok) {
        setShowResults(true);
        if (earnedPoints > 0) {
          toast.success(`Great job! You earned ${earnedPoints} points!`);
        }
      } else {
        toast.error('Failed to save quiz results');
      }
    } catch (error) {
      console.error('Submit quiz error:', error);
      toast.error('Failed to save quiz results');
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreMessage = (score: number) => {
    if (score === 100) return 'Perfect! Outstanding work! 🌟';
    if (score >= 80) return 'Excellent! Great job! 🎉';
    if (score >= 60) return 'Good effort! Keep it up! 👍';
    return 'Keep practicing! You can do it! 💪';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (!quiz) {
    return null;
  }

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / quiz.questions.length) * 100;
  const isLastQuestion = currentQuestionIndex === quiz.questions.length - 1;
  const hasAnsweredCurrent = selectedAnswers[currentQuestionIndex] !== -1;

  // Results View - Make it CELEBRATORY and FUN!
  if (showResults) {
    const correctAnswers = quiz.questions.filter((q, i) => selectedAnswers[i] === q.correctAnswer).length;
    
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
          className="relative"
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
                      <Sparkles className="h-8 w-8 text-yellow-400" />
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
                  {score === 100 && '🌟 Perfect Score! 🌟'}
                  {score >= 80 && score < 100 && '🎉 Amazing Work! 🎉'}
                  {score >= 60 && score < 80 && '⭐ Good Job! ⭐'}
                  {score < 60 && '💪 Keep Learning! 💪'}
                </CardTitle>
                <CardDescription className="text-lg text-[#5D4E37] font-medium">
                  {getScoreMessage(score)}
                </CardDescription>
              </motion.div>
            </CardHeader>
            
            <CardContent className="space-y-6 pb-6">
              {/* Score Display with Animation */}
              <motion.div 
                className="text-center space-y-3"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring" }}
              >
                <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg">
                  <div className={cn("text-7xl font-black mb-2", getScoreColor(score))}>
                    {score}%
                  </div>
                  <p className="text-lg text-[#5D4E37] font-medium">
                    ✨ {correctAnswers} out of {quiz.questions.length} correct! ✨
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
                      <Sparkles className="h-8 w-8 text-white fill-white" />
                    </motion.div>
                  </div>
                  
                  <Trophy className="h-12 w-12 mx-auto mb-3 text-white drop-shadow-lg" />
                  <div className="text-5xl font-black text-white mb-2 drop-shadow-lg">
                    +{pointsEarned} ⭐
                  </div>
                  <p className="text-xl font-bold text-white drop-shadow">
                    Points Earned!
                  </p>
                  <p className="text-sm text-white/90 mt-2">
                    🎯 Added to your adventure points!
                  </p>
                </div>
              </motion.div>

              {/* Answer Review - Simplified and Encouraging */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg text-[#2D1810] flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-600" />
                  Let's Review Your Answers:
                </h3>
                <div className="space-y-2">
                  {quiz.questions.map((question, index) => {
                    const isCorrect = selectedAnswers[index] === question.correctAnswer;
                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.8 + index * 0.1 }}
                        className={cn(
                          "flex items-start gap-3 p-4 rounded-xl border-2",
                          isCorrect ? "bg-green-50 border-green-300" : "bg-orange-50 border-orange-300"
                        )}
                      >
                        <div className="flex-shrink-0 mt-1">
                          {isCorrect ? (
                            <div className="bg-green-500 rounded-full p-1">
                              <CheckCircle className="h-5 w-5 text-white" />
                            </div>
                          ) : (
                            <div className="bg-orange-500 rounded-full p-1">
                              <XCircle className="h-5 w-5 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-[#2D1810] mb-1">
                            Question {index + 1}: {isCorrect ? '✨ Correct!' : '💡 Learning Moment'}
                          </p>
                          <p className="text-sm text-[#5D4E37]">
                            {question.question}
                          </p>
                          {!isCorrect && (
                            <div className="mt-2 p-2 bg-white/60 rounded-lg">
                              <p className="text-xs font-medium text-orange-800">
                                💭 The right answer is: <span className="font-bold">{question.options[question.correctAnswer]}</span>
                              </p>
                            </div>
                          )}
                          {isCorrect && (
                            <p className="text-xs text-green-700 mt-1 font-medium">
                              +{question.points} points! 🌟
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
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
                  {score >= 60 && score < 80 && '📚 Great effort! Every quiz makes you smarter! 💪'}
                  {score < 60 && '🌱 Every expert was once a beginner! Keep practicing! 🌟'}
                </p>
                <p className="text-sm text-purple-700">
                  Remember: Learning is an adventure, not a race! 🎒
                </p>
              </motion.div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1 gap-2 h-14 text-base font-bold border-2 hover:scale-105 transition-transform"
                  onClick={() => navigate('/quizzes')}
                >
                  <Home className="h-5 w-5" />
                  More Quizzes
                </Button>
                <Button
                  className="flex-1 gap-2 h-14 text-base font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 hover:scale-105 transition-transform shadow-lg"
                  onClick={() => window.location.reload()}
                >
                  <Zap className="h-5 w-5" />
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    );
  }

  // Quiz Taking View - Make it FUN and ADVENTUROUS!
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-3xl mx-auto space-y-6"
    >
      {/* Fun Header with Adventure Vibe */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="space-y-3 bg-gradient-to-r from-[#FFF8E7] to-[#FFE5CC] p-6 rounded-2xl border-2 border-[#F4C430] shadow-lg"
      >
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: [0, 10, 0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Brain className="h-8 w-8 text-purple-600 drop-shadow" />
          </motion.div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#2D1810]">
            {quiz.title}
          </h1>
        </div>
        {quiz.description && (
          <p className="text-[#5D4E37] text-sm sm:text-base font-medium">
            📖 {quiz.description}
          </p>
        )}
        <div className="flex items-center gap-4 text-sm">
          <Badge className="bg-[#F4C430] text-[#2D1810] font-bold">
            🏆 {quiz.totalPoints} Total Points
          </Badge>
          <span className="text-[#5D4E37] font-medium">
            ⏱️ {quiz.questions.length} Questions
          </span>
        </div>
      </motion.div>

      {/* Animated Progress Bar */}
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="space-y-2"
      >
        <div className="flex justify-between text-sm font-bold">
          <span className="text-purple-700 flex items-center gap-1">
            <Star className="h-4 w-4" />
            Question {currentQuestionIndex + 1} of {quiz.questions.length}
          </span>
          <span className="text-[#F4C430]">
            {Math.round(progress)}% Complete 🎯
          </span>
        </div>
        <div className="relative">
          <Progress value={progress} className="h-3 bg-gray-200" />
          <motion.div
            className="absolute top-0 left-0 h-full w-full pointer-events-none"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="h-full bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full" 
              style={{ width: `${progress}%` }}
            />
          </motion.div>
        </div>
      </motion.div>

      {/* Question Card - FUN VERSION */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestionIndex}
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -50, opacity: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <Card className="border-4 border-[#F4C430] shadow-xl bg-gradient-to-br from-white to-[#FFF8E7]">
            <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-t-lg">
              <div className="flex items-start justify-between mb-3">
                <Badge className="bg-white/20 backdrop-blur text-white font-bold text-base px-4 py-2">
                  ⭐ {currentQuestion.points} points
                </Badge>
                <Badge className="bg-white/20 backdrop-blur text-white font-bold text-base px-4 py-2">
                  #{currentQuestionIndex + 1}
                </Badge>
              </div>
              <CardTitle className="text-2xl text-white leading-relaxed">
                {currentQuestion.question}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-3">
              {currentQuestion.options.map((option, optionIndex) => {
                const isSelected = selectedAnswers[currentQuestionIndex] === optionIndex;
                const showCorrect = isSubmitted && optionIndex === currentQuestion.correctAnswer;
                const showWrong = isSubmitted && isSelected && optionIndex !== currentQuestion.correctAnswer;

                return (
                  <motion.button
                    key={optionIndex}
                    onClick={() => handleSelectAnswer(optionIndex)}
                    disabled={isSubmitted}
                    whileHover={!isSubmitted ? { scale: 1.02, x: 5 } : {}}
                    whileTap={!isSubmitted ? { scale: 0.98 } : {}}
                    className={cn(
                      "w-full text-left p-5 rounded-2xl border-4 transition-all font-medium text-base shadow-md",
                      isSelected && !isSubmitted && "border-purple-500 bg-gradient-to-r from-purple-50 to-pink-50 shadow-lg",
                      !isSelected && !isSubmitted && "border-gray-300 bg-white hover:border-[#F4C430] hover:bg-[#FFF8E7]",
                      showCorrect && "border-green-500 bg-gradient-to-r from-green-50 to-emerald-50 shadow-lg",
                      showWrong && "border-red-500 bg-gradient-to-r from-red-50 to-orange-50 shadow-lg",
                      isSubmitted && "cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <motion.div
                        animate={isSelected && !isSubmitted ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 0.3 }}
                        className={cn(
                          "flex-shrink-0 w-8 h-8 rounded-full border-4 flex items-center justify-center font-bold",
                          isSelected && !isSubmitted && "border-purple-500 bg-purple-500 text-white",
                          !isSelected && !isSubmitted && "border-gray-400 bg-white text-gray-600",
                          showCorrect && "border-green-500 bg-green-500 text-white",
                          showWrong && "border-red-500 bg-red-500 text-white"
                        )}
                      >
                        {!isSubmitted && (
                          <span className="text-sm">{String.fromCharCode(65 + optionIndex)}</span>
                        )}
                        {showCorrect && <CheckCircle className="h-5 w-5 text-white" />}
                        {showWrong && <XCircle className="h-5 w-5 text-white" />}
                      </motion.div>
                      <span className={cn(
                        "flex-1",
                        isSelected && !isSubmitted && "text-purple-900 font-bold",
                        showCorrect && "text-green-900 font-bold",
                        showWrong && "text-red-900"
                      )}>
                        {option}
                      </span>
                      {isSelected && !isSubmitted && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="flex-shrink-0"
                        >
                          <Sparkles className="h-5 w-5 text-purple-500" />
                        </motion.div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Navigation - More Fun and Clear */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex items-center justify-between gap-4"
      >
        <Button
          variant="outline"
          onClick={handlePreviousQuestion}
          disabled={currentQuestionIndex === 0 || isSubmitted}
          className="h-12 px-6 font-bold border-2"
        >
          ← Previous
        </Button>

        <div className="flex items-center gap-2 text-sm font-bold bg-white px-4 py-2 rounded-full border-2 border-gray-200 shadow">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-gray-700">
            {selectedAnswers.filter(a => a !== -1).length} / {quiz.questions.length}
          </span>
        </div>

        {isLastQuestion ? (
          <Button
            onClick={handleSubmitQuiz}
            disabled={isSubmitted || !hasAnsweredCurrent}
            className="h-12 px-6 gap-2 font-bold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg"
          >
            Finish Quiz! 🎉
            <Trophy className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            onClick={handleNextQuestion}
            disabled={!hasAnsweredCurrent}
            className="h-12 px-6 gap-2 font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg"
          >
            Next →
            <ArrowRight className="h-5 w-5" />
          </Button>
        )}
      </motion.div>

      {/* Quick Navigation - Visual and Fun */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="bg-gradient-to-br from-white to-purple-50 border-2 border-purple-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-purple-900 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Jump to Any Question:
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {quiz.questions.map((_, index) => {
                const isAnswered = selectedAnswers[index] !== -1;
                const isCurrent = currentQuestionIndex === index;
                
                return (
                  <motion.button
                    key={index}
                    onClick={() => !isSubmitted && setCurrentQuestionIndex(index)}
                    disabled={isSubmitted}
                    whileHover={!isSubmitted ? { scale: 1.1 } : {}}
                    whileTap={!isSubmitted ? { scale: 0.9 } : {}}
                    className={cn(
                      "w-12 h-12 rounded-xl border-3 font-bold transition-all text-base shadow-md",
                      isCurrent && "border-purple-500 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg scale-110",
                      !isCurrent && isAnswered && "border-green-500 bg-green-100 text-green-700 hover:bg-green-200",
                      !isCurrent && !isAnswered && "border-gray-300 bg-white text-gray-500 hover:border-[#F4C430] hover:bg-[#FFF8E7]",
                      isSubmitted && "cursor-not-allowed opacity-50"
                    )}
                  >
                    {isCurrent ? '✨' : isAnswered ? '✓' : index + 1}
                  </motion.button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>
      
      {/* Encouraging Footer Message */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-center"
      >
        <p className="text-sm text-[#5D4E37] font-medium bg-gradient-to-r from-purple-100 to-pink-100 rounded-full px-6 py-3 inline-block border-2 border-purple-200">
          {hasAnsweredCurrent ? '🌟 Great job! Keep going!' : '💭 Take your time and choose carefully!'}
        </p>
      </motion.div>
    </motion.div>
  );
}