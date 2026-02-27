import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useFamily } from '../contexts/FamilyContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Brain, Trophy, Clock, Star, ChevronRight, Plus, PlusCircle, Trash2, Award, BarChart3, PlayCircle } from 'lucide-react';

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

export function Quizzes() {
  const navigate = useNavigate();
  const { isParentMode, userId, accessToken } = useAuth();
  const { selectedChildId, getCurrentChild } = useFamily();
  const selectedChild = getCurrentChild();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  // Quiz form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [questions, setQuestions] = useState<Question[]>([
    { question: '', options: ['', '', '', ''], correctAnswer: 0, points: 10 }
  ]);

  useEffect(() => {
    loadQuizzes();
    if (selectedChildId && !isParentMode) {
      loadAttempts();
    }
  }, [selectedChildId, isParentMode]);

  const loadQuizzes = async () => {
    if (!accessToken) {
      console.error('❌ No access token available for quizzes');
      setQuizzes([]);
      setLoading(false);
      return;
    }

    console.log('🔑 Loading quizzes with access token:', {
      hasToken: !!accessToken,
      tokenLength: accessToken.length,
      tokenPreview: accessToken.substring(0, 30) + '...'
    });

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quizzes`,
        {
          headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('📡 Quiz API response:', {
        status: response.status,
        ok: response.ok
      });
      
      if (!response.ok) {
        console.error('Failed to load quizzes:', response.status);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        setQuizzes([]);
        return;
      }
      
      const data = await response.json();
      
      // Ensure data is an array
      if (Array.isArray(data)) {
        setQuizzes(data);
      } else {
        console.error('Quizzes data is not an array:', data);
        setQuizzes([]);
      }
    } catch (error) {
      console.error('Load quizzes error:', error);
      toast.error('Failed to load quizzes');
      setQuizzes([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAttempts = async () => {
    if (!selectedChild || !selectedChild.id || !accessToken) return;
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${selectedChild.id}/quiz-attempts`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );
      
      if (!response.ok) {
        console.error('Failed to load attempts:', response.status);
        setAttempts([]);
        return;
      }
      
      const data = await response.json();
      
      // Ensure data is an array
      if (Array.isArray(data)) {
        setAttempts(data);
      } else {
        console.error('Attempts data is not an array:', data);
        setAttempts([]);
      }
    } catch (error) {
      console.error('Load attempts error:', error);
      setAttempts([]);
    }
  };

  const addQuestion = () => {
    setQuestions([...questions, { 
      question: '', 
      options: ['', '', '', ''], 
      correctAnswer: 0, 
      points: 10 
    }]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const updated = [...questions];
    const newOptions = [...updated[questionIndex].options];
    newOptions[optionIndex] = value;
    updated[questionIndex] = { ...updated[questionIndex], options: newOptions };
    setQuestions(updated);
  };

  const handleCreateQuiz = async () => {
    if (!title.trim()) {
      toast.error('Please enter a quiz title');
      return;
    }

    if (!accessToken) {
      toast.error('Authentication required');
      return;
    }

    const validQuestions = questions.filter(q => 
      q.question.trim() && 
      q.options.every(opt => opt.trim())
    );

    if (validQuestions.length === 0) {
      toast.error('Please add at least one complete question');
      return;
    }

    const totalPoints = validQuestions.reduce((sum, q) => sum + q.points, 0);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quizzes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            title,
            description,
            questions: validQuestions,
            totalPoints,
            difficulty,
            createdBy: userId
          })
        }
      );

      if (response.ok) {
        toast.success('Quiz created successfully!');
        setCreateDialogOpen(false);
        resetForm();
        loadQuizzes();
      } else {
        const errorText = await response.text();
        console.error('Create quiz error:', errorText);
        toast.error('Failed to create quiz');
      }
    } catch (error) {
      console.error('Create quiz error:', error);
      toast.error('Failed to create quiz');
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (!accessToken) {
      toast.error('Authentication required');
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/quizzes/${quizId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        toast.success('Quiz deleted');
        loadQuizzes();
      } else {
        const errorText = await response.text();
        console.error('Delete quiz error:', errorText);
        toast.error('Failed to delete quiz');
      }
    } catch (error) {
      console.error('Delete quiz error:', error);
      toast.error('Failed to delete quiz');
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDifficulty('medium');
    setQuestions([{ question: '', options: ['', '', '', ''], correctAnswer: 0, points: 10 }]);
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'easy': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'hard': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getQuizAttempts = (quizId: string) => {
    return attempts.filter(a => a.quizId === quizId);
  };

  const getBestScore = (quizId: string) => {
    const quizAttempts = getQuizAttempts(quizId);
    if (quizAttempts.length === 0) return null;
    return Math.max(...quizAttempts.map(a => a.score));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading quizzes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600" />
            {isParentMode ? 'Manage Quizzes' : 'Knowledge Quizzes'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isParentMode 
              ? 'Create educational quizzes for your children'
              : 'Test your knowledge and earn points!'
            }
          </p>
        </div>

        {isParentMode && (
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <PlusCircle className="h-4 w-4" />
                Create Quiz
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Quiz</DialogTitle>
                <DialogDescription>
                  Create an educational quiz with multiple choice questions
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Quiz Details */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Quiz Title *</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g., Islamic History Quiz"
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of the quiz"
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label>Difficulty Level</Label>
                    <div className="flex gap-2 mt-2">
                      {(['easy', 'medium', 'hard'] as const).map((level) => (
                        <Button
                          key={level}
                          type="button"
                          variant={difficulty === level ? 'default' : 'outline'}
                          onClick={() => setDifficulty(level)}
                          className="capitalize"
                        >
                          {level}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Questions */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base">Questions</Label>
                    <Button type="button" onClick={addQuestion} size="sm" variant="outline">
                      <PlusCircle className="h-4 w-4 mr-1" />
                      Add Question
                    </Button>
                  </div>

                  {questions.map((question, qIndex) => (
                    <Card key={qIndex}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base">Question {qIndex + 1}</CardTitle>
                          {questions.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeQuestion(qIndex)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <Label>Question Text *</Label>
                          <Input
                            value={question.question}
                            onChange={(e) => updateQuestion(qIndex, 'question', e.target.value)}
                            placeholder="Enter the question"
                          />
                        </div>

                        <div>
                          <Label>Answer Options *</Label>
                          <div className="space-y-2 mt-2">
                            {question.options.map((option, oIndex) => (
                              <div key={oIndex} className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`correct-${qIndex}`}
                                  checked={question.correctAnswer === oIndex}
                                  onChange={() => updateQuestion(qIndex, 'correctAnswer', oIndex)}
                                  className="h-4 w-4"
                                />
                                <Input
                                  value={option}
                                  onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                                  placeholder={`Option ${oIndex + 1}`}
                                  className="flex-1"
                                />
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Select the radio button next to the correct answer
                          </p>
                        </div>

                        <div>
                          <Label>Points for Correct Answer</Label>
                          <Input
                            type="number"
                            value={question.points}
                            onChange={(e) => updateQuestion(qIndex, 'points', parseInt(e.target.value) || 0)}
                            min="1"
                            className="w-32"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateQuiz}>
                    Create Quiz
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Quizzes Grid */}
      {quizzes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {isParentMode 
                ? 'No quizzes created yet. Create your first quiz!'
                : 'No quizzes available yet. Ask your parents to create some!'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((quiz) => {
            const quizAttempts = getQuizAttempts(quiz.id);
            const bestScore = getBestScore(quiz.id);
            const hasAttempted = quizAttempts.length > 0;

            return (
              <Card key={quiz.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <Badge className={getDifficultyColor(quiz.difficulty)}>
                      {quiz.difficulty}
                    </Badge>
                    {isParentMode && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Quiz?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this quiz and all attempt records.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteQuiz(quiz.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                  <CardTitle className="line-clamp-2">{quiz.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {quiz.description || 'No description'}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="flex-1">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-muted-foreground" />
                      <span>{quiz.questions.length} questions</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-muted-foreground" />
                      <span>{quiz.totalPoints} total points</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{new Date(quiz.createdAt).toLocaleDateString()}</span>
                    </div>
                    
                    {!isParentMode && hasAttempted && (
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Award className="h-4 w-4 text-yellow-600" />
                        <span className="font-medium">
                          Best: {bestScore}% ({quizAttempts.length} {quizAttempts.length === 1 ? 'attempt' : 'attempts'})
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="flex gap-2">
                  {isParentMode ? (
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => navigate(`/quizzes/${quiz.id}/stats`)}
                    >
                      <BarChart3 className="h-4 w-4" />
                      View Stats
                    </Button>
                  ) : (
                    <Button
                      className="flex-1 gap-2"
                      onClick={() => navigate(`/quizzes/${quiz.id}/play`)}
                      disabled={!selectedChild}
                    >
                      <PlayCircle className="h-4 w-4" />
                      {hasAttempted ? 'Play Again' : 'Start Quiz'}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}