import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info.tsx';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../components/ui/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Brain, Trophy, BarChart3, ArrowLeft, Award, Users, Calendar } from 'lucide-react';

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

interface QuizAttempt {
  id: string;
  quizId: string;
  childId: string;
  answers: number[];
  score: number;
  pointsEarned: number;
  completedAt: string;
}

interface Child {
  id: string;
  name: string;
}

export function QuizStats() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (accessToken) {
      loadData();
    }
  }, [id, accessToken]);

  const loadData = async () => {
    if (!accessToken) return;
    
    try {
      // Load quiz
      const quizResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quizzes/${id}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );
      
      if (quizResponse.ok) {
        const quizData = await quizResponse.json();
        setQuiz(quizData);
      } else {
        toast.error('Quiz not found');
        navigate('/quizzes');
        return;
      }

      // Load attempts
      const attemptsResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quizzes/${id}/attempts`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );
      
      if (attemptsResponse.ok) {
        const attemptsData = await attemptsResponse.json();
        setAttempts(attemptsData);

        // Load children who have attempted
        const uniqueChildIds = [...new Set(attemptsData.map((a: QuizAttempt) => a.childId))];
        const childrenData: Child[] = [];
        
        for (const childId of uniqueChildIds) {
          try {
            const childResponse = await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${childId}`,
              {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              }
            );
            
            if (childResponse.ok) {
              const childData = await childResponse.json();
              childrenData.push(childData);
            }
          } catch (err) {
            console.error('Error loading child:', err);
          }
        }
        
        setChildren(childrenData);
      }
    } catch (error) {
      console.error('Load quiz stats error:', error);
      toast.error('Failed to load quiz statistics');
    } finally {
      setLoading(false);
    }
  };

  const getChildName = (childId: string) => {
    return children.find(c => c.id === childId)?.name || 'Unknown';
  };

  const getAverageScore = () => {
    if (attempts.length === 0) return 0;
    const sum = attempts.reduce((acc, a) => acc + a.score, 0);
    return Math.round(sum / attempts.length);
  };

  const getTotalPointsAwarded = () => {
    return attempts.reduce((acc, a) => acc + a.pointsEarned, 0);
  };

  const getChildStats = (childId: string) => {
    const childAttempts = attempts.filter(a => a.childId === childId);
    if (childAttempts.length === 0) return null;

    const scores = childAttempts.map(a => a.score);
    const bestScore = Math.max(...scores);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const totalPoints = childAttempts.reduce((acc, a) => acc + a.pointsEarned, 0);

    return {
      attempts: childAttempts.length,
      bestScore,
      avgScore,
      totalPoints,
      lastAttempt: childAttempts[0].completedAt
    };
  };

  const getQuestionStats = () => {
    if (!quiz || attempts.length === 0) return [];

    return quiz.questions.map((question, index) => {
      const correctCount = attempts.filter(
        attempt => attempt.answers[index] === question.correctAnswer
      ).length;
      const correctPercentage = Math.round((correctCount / attempts.length) * 100);

      return {
        questionNumber: index + 1,
        question: question.question,
        correctPercentage,
        correctCount,
        totalAttempts: attempts.length
      };
    });
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'easy': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'hard': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (!quiz) {
    return null;
  }

  const questionStats = getQuestionStats();
  const averageScore = getAverageScore();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/quizzes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold">{quiz.title}</h1>
            <Badge className={getDifficultyColor(quiz.difficulty)}>
              {quiz.difficulty}
            </Badge>
          </div>
          <p className="text-muted-foreground">Quiz Performance Analytics</p>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Attempts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              <span className="text-2xl font-bold">{attempts.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <span className={cn("text-2xl font-bold", getScoreColor(averageScore))}>
                {averageScore}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Points Awarded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-600" />
              <span className="text-2xl font-bold">{getTotalPointsAwarded()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unique Children
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-600" />
              <span className="text-2xl font-bold">{children.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Child Performance */}
      {children.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Performance by Child</CardTitle>
            <CardDescription>
              Individual performance statistics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {children.map(child => {
                const stats = getChildStats(child.id);
                if (!stats) return null;

                return (
                  <div key={child.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{child.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {stats.attempts} {stats.attempts === 1 ? 'attempt' : 'attempts'}
                        </p>
                      </div>
                      {stats.bestScore === 100 && (
                        <Award className="h-6 w-6 text-yellow-500" />
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className={cn("text-2xl font-bold", getScoreColor(stats.bestScore))}>
                          {stats.bestScore}%
                        </div>
                        <div className="text-xs text-muted-foreground">Best Score</div>
                      </div>
                      <div>
                        <div className={cn("text-2xl font-bold", getScoreColor(stats.avgScore))}>
                          {stats.avgScore}%
                        </div>
                        <div className="text-xs text-muted-foreground">Average</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-purple-600">
                          {stats.totalPoints}
                        </div>
                        <div className="text-xs text-muted-foreground">Points</div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Last attempt: {new Date(stats.lastAttempt).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Question Analysis */}
      {questionStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Question Analysis</CardTitle>
            <CardDescription>
              Success rate for each question
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {questionStats.map((stat, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        Question {stat.questionNumber}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {stat.question}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={cn("text-lg font-bold", getScoreColor(stat.correctPercentage))}>
                        {stat.correctPercentage}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stat.correctCount}/{stat.totalAttempts}
                      </div>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all",
                        stat.correctPercentage >= 80 ? "bg-green-500" :
                        stat.correctPercentage >= 60 ? "bg-yellow-500" :
                        "bg-red-500"
                      )}
                      style={{ width: `${stat.correctPercentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Attempts */}
      {attempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Attempts</CardTitle>
            <CardDescription>
              Latest quiz submissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {attempts.slice(0, 10).map((attempt) => (
                <div
                  key={attempt.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{getChildName(attempt.childId)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(attempt.completedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-lg font-bold", getScoreColor(attempt.score))}>
                      {attempt.score}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {attempt.pointsEarned} points
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {attempts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No attempts yet. Share this quiz with your children!
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}