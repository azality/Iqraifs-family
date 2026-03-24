import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info.tsx';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Brain, Plus, Search, Filter, Edit, Trash2, Eye, TrendingUp, Database, Upload, MapPin, Info, Coins } from 'lucide-react';
import { motion } from 'motion/react';
import seedQuestions from '../../data/seedQuestions';
import { CSVImport } from '../components/CSVImport';

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
  basePoints: number;
  hintPenalty: number;
  explanation?: string;
  source?: string;
  tags?: string[];
  timesAnswered: number;
  timesCorrect: number;
  createdAt: string;
  isPublic?: boolean;
}

interface Category {
  name: string;
  total: number;
  easy: number;
  medium: number;
  hard: number;
}

export function QuestionBank() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (accessToken) {
      loadData();
    }
  }, [accessToken]);

  const loadData = async () => {
    if (!accessToken) return;

    try {
      // Load questions
      const questionsResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/questions`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (questionsResponse.ok) {
        const questionsData = await questionsResponse.json();
        setQuestions(questionsData);
      }

      // Load categories
      const categoriesResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/question-categories`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json();
        setCategories(categoriesData);
      }
    } catch (error) {
      console.error('Load data error:', error);
      toast.error('Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (questionId: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/questions/${questionId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        toast.success('Question deleted!');
        setQuestions(prev => prev.filter(q => q.id !== questionId));
      } else {
        toast.error('Failed to delete question');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete question');
    }
  };

  const handleBulkImport = async () => {
    if (!confirm(`Import ${seedQuestions.length} Starter Questions?\n\nThis will add starter questions across Islamic knowledge, Math, and Science to your question bank. Questions that already exist will be skipped.\n\nContinue?`)) return;

    setImporting(true);
    let imported = 0;
    let failed = 0;
    let skipped = 0;

    try {
      // Show initial progress toast
      toast.info(`Starting import of ${seedQuestions.length} questions...`);

      for (const question of seedQuestions) {
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/questions`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(question)
            }
          );

          if (response.ok) {
            imported++;
          } else if (response.status === 409) {
            // Question already exists
            skipped++;
          } else {
            failed++;
            const errorData = await response.json().catch(() => ({}));
            console.error('Import failed for question:', question.questionText, errorData);
          }
        } catch (error) {
          console.error('Import error for question:', question.questionText, error);
          failed++;
        }
      }

      // Show detailed success message
      if (imported > 0) {
        toast.success(
          `✅ Successfully imported ${imported} new question${imported !== 1 ? 's' : ''}!` +
          (skipped > 0 ? `\n📋 Skipped ${skipped} duplicate${skipped !== 1 ? 's' : ''}` : '') +
          (failed > 0 ? `\n⚠️ Failed to import ${failed} question${failed !== 1 ? 's' : ''}` : ''),
          { duration: 5000 }
        );
      } else if (skipped > 0) {
        toast.info(
          `All ${skipped} questions already exist in your question bank. No new questions imported.`,
          { duration: 5000 }
        );
      } else {
        toast.error(`Failed to import questions. Please try again or check the console for errors.`);
      }

      loadData(); // Reload to show new questions
    } catch (error) {
      console.error('Bulk import error:', error);
      toast.error('Failed to import questions. Please check your connection and try again.');
    } finally {
      setImporting(false);
    }
  };

  // Filter questions
  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.questionText.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         q.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || q.category === filterCategory;
    const matchesDifficulty = filterDifficulty === 'all' || q.difficulty === filterDifficulty;
    const matchesType = filterType === 'all' || q.questionType === filterType;
    
    return matchesSearch && matchesCategory && matchesDifficulty && matchesType;
  });

  const totalQuestions = questions.length;
  const averageAccuracy = questions.length > 0
    ? Math.round((questions.reduce((sum, q) => sum + (q.timesAnswered > 0 ? (q.timesCorrect / q.timesAnswered) : 0), 0) / questions.length) * 100)
    : 0;

  // Adventure World Zone Configuration
  const adventureZones = [
    {
      id: 'makkah',
      name: 'Makkah',
      nameArabic: 'مكة المكرمة',
      icon: '🕋',
      color: 'from-amber-500 to-orange-600',
      categories: ['kaaba', 'hajj', 'ibrahim', 'islamic'],
      description: 'Stories of Prophet Ibrahim ﷺ and the sacred Kaaba'
    },
    {
      id: 'madinah',
      name: 'Madinah',
      nameArabic: 'المدينة المنورة',
      icon: '🕌',
      color: 'from-emerald-500 to-teal-600',
      categories: ['prophet', 'hadith', 'companions', 'islamic'],
      description: 'Life and teachings of Prophet Muhammad ﷺ'
    },
    {
      id: 'quran-valley',
      name: 'Quran Valley',
      nameArabic: 'وادي القرآن',
      icon: '📖',
      color: 'from-blue-500 to-indigo-600',
      categories: ['quran', 'tafsir', 'memorization', 'islamic'],
      description: 'Memorize beautiful ayahs and Quranic wisdom'
    },
    {
      id: 'desert-trials',
      name: 'Desert of Trials',
      nameArabic: 'صحراء الاختبارات',
      icon: '🏜️',
      color: 'from-yellow-600 to-amber-700',
      categories: ['fiqh', 'akhlaq', 'dua', 'islamic'],
      description: 'Test Islamic knowledge and character'
    },
    {
      id: 'barakah-garden',
      name: 'Barakah Garden',
      nameArabic: 'حديقة البركة',
      icon: '🌺',
      color: 'from-green-500 to-emerald-600',
      categories: ['all'],
      description: 'Personal garden that grows with good deeds'
    }
  ];

  // Calculate zone stats
  const getZoneStats = (zoneCategories: string[]) => {
    const zoneQuestions = questions.filter(q => 
      zoneCategories.includes('all') || zoneCategories.includes(q.category.toLowerCase())
    );
    return {
      total: zoneQuestions.length,
      easy: zoneQuestions.filter(q => q.difficulty === 'easy').length,
      medium: zoneQuestions.filter(q => q.difficulty === 'medium').length,
      hard: zoneQuestions.filter(q => q.difficulty === 'hard').length
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading question bank...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="h-8 w-8 text-purple-600" />
            Question Bank
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your Knowledge Quest questions
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleBulkImport}
            disabled={importing}
            variant="outline"
            className="border-blue-500 text-blue-600 hover:bg-blue-50"
          >
            <Upload className="h-4 w-4 mr-2" />
            {importing ? 'Importing...' : `Import ${seedQuestions.length} Starter Questions`}
          </Button>
          <Button
            onClick={() => navigate('/question-bank/new')}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Question
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{totalQuestions}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {categories.length} categories
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Times Answered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {questions.reduce((sum, q) => sum + q.timesAnswered, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total attempts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {averageAccuracy}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Correct rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Adventure World Zone Guide */}
      <Card className="border-4 border-gradient-to-r from-amber-500 to-purple-500">
        <CardHeader className="bg-gradient-to-r from-amber-50 to-purple-50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <MapPin className="h-6 w-6 text-amber-600" />
                Adventure World Zone Guide
              </CardTitle>
              <CardDescription className="text-base mt-2">
                Add questions to specific categories to populate the Adventure World zones where kids earn points!
              </CardDescription>
            </div>
            <Info className="h-8 w-8 text-amber-600" />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Points System Guide */}
          <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl p-6 mb-6">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
              <Coins className="h-5 w-5 text-purple-600" />
              Points & Rewards System
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl mb-2">🟢</div>
                <div className="font-bold text-green-600 mb-1">Easy Questions</div>
                <div className="text-2xl font-bold text-green-700">10 Points</div>
                <p className="text-xs text-gray-600 mt-1">Perfect for young learners</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl mb-2">🟡</div>
                <div className="font-bold text-yellow-600 mb-1">Medium Questions</div>
                <div className="text-2xl font-bold text-yellow-700">25 Points</div>
                <p className="text-xs text-gray-600 mt-1">Test their knowledge</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl mb-2">🔴</div>
                <div className="font-bold text-red-600 mb-1">Hard Questions</div>
                <div className="text-2xl font-bold text-red-700">50 Points</div>
                <p className="text-xs text-gray-600 mt-1">Master level challenge</p>
              </div>
            </div>
            <p className="text-sm text-purple-800 mt-4 bg-white/50 rounded-lg p-3">
              💡 <strong>Tip:</strong> Kids can redeem earned points for rewards in the Wishlist system!
            </p>
          </div>

          {/* Zone Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {adventureZones.map((zone, index) => {
              const stats = getZoneStats(zone.categories);
              const hasQuestions = stats.total > 0;
              
              return (
                <motion.div
                  key={zone.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`rounded-xl overflow-hidden shadow-lg border-2 ${
                    hasQuestions ? 'border-green-400' : 'border-amber-400'
                  }`}
                >
                  <div className={`bg-gradient-to-r ${zone.color} text-white p-5`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="text-4xl">{zone.icon}</div>
                        <div>
                          <h3 className="text-xl font-bold">{zone.name}</h3>
                          <p className="text-sm opacity-90">{zone.nameArabic}</p>
                        </div>
                      </div>
                      {hasQuestions ? (
                        <Badge className="bg-green-500 text-white">✓ Active</Badge>
                      ) : (
                        <Badge className="bg-amber-500 text-white">⚠ Empty</Badge>
                      )}
                    </div>
                    <p className="text-sm opacity-90">{zone.description}</p>
                  </div>
                  
                  <div className="bg-white p-5">
                    <div className="mb-4">
                      <div className="text-xs font-semibold text-gray-600 mb-2">Required Categories:</div>
                      <div className="flex flex-wrap gap-1">
                        {zone.categories.map((cat) => (
                          <Badge key={cat} variant="outline" className="text-xs capitalize">
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">{stats.total}</div>
                        <div className="text-xs text-gray-600">Total</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{stats.easy}</div>
                        <div className="text-xs text-gray-600">Easy</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-600">{stats.medium}</div>
                        <div className="text-xs text-gray-600">Medium</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">{stats.hard}</div>
                        <div className="text-xs text-gray-600">Hard</div>
                      </div>
                    </div>
                    
                    {!hasQuestions && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                        <p className="text-sm text-amber-800 font-medium">
                          ⚠️ Add questions to activate this zone!
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* CSV Import */}
      <CSVImport onImportComplete={loadData} />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search questions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.name} value={cat.name}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
              <SelectTrigger>
                <SelectValue placeholder="All Difficulties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Difficulties</SelectItem>
                <SelectItem value="easy">🟢 Easy</SelectItem>
                <SelectItem value="medium">🟡 Medium</SelectItem>
                <SelectItem value="hard">🔴 Hard</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                <SelectItem value="true_false">True/False</SelectItem>
                <SelectItem value="short_answer">Short Answer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Questions List */}
      <Card>
        <CardHeader>
          <CardTitle>
            Questions ({filteredQuestions.length})
          </CardTitle>
          <CardDescription>
            {filteredQuestions.length !== totalQuestions && `Filtered from ${totalQuestions} total`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredQuestions.length === 0 ? (
            <div className="text-center py-12">
              <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                {questions.length === 0 
                  ? 'No questions yet. Add your first question to get started!'
                  : 'No questions match your filters.'
                }
              </p>
              {questions.length === 0 && (
                <Button onClick={() => navigate('/question-bank/new')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Question
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQuestions.map((question) => {
                const accuracy = question.timesAnswered > 0
                  ? Math.round((question.timesCorrect / question.timesAnswered) * 100)
                  : 0;

                return (
                  <motion.div
                    key={question.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg border-2 border-gray-200 hover:border-purple-300 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={
                            question.difficulty === 'easy' ? 'bg-green-500' :
                            question.difficulty === 'medium' ? 'bg-yellow-500' :
                            'bg-red-500'
                          }>
                            {question.difficulty.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {question.category}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {question.questionType.replace('_', ' ')}
                          </Badge>
                          {question.isPublic && (
                            <Badge variant="outline" className="bg-blue-50">
                              Public
                            </Badge>
                          )}
                        </div>

                        <p className="font-medium text-sm mb-2 line-clamp-2">
                          {question.questionText}
                        </p>

                        {question.questionType === 'multiple_choice' && question.options && (
                          <div className="text-xs text-muted-foreground mb-2">
                            {question.options.length} options • Correct: {question.options[question.correctAnswerIndex!]}
                          </div>
                        )}

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>📊 {question.timesAnswered} attempts</span>
                          {question.timesAnswered > 0 && (
                            <span className={
                              accuracy >= 80 ? 'text-green-600 font-medium' :
                              accuracy >= 50 ? 'text-yellow-600 font-medium' :
                              'text-red-600 font-medium'
                            }>
                              ✓ {accuracy}% correct
                            </span>
                          )}
                          {question.hint && <span>💡 Has hint</span>}
                          {question.explanation && <span>📖 Has explanation</span>}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/question-bank/${question.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/question-bank/${question.id}/edit`)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(question.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}