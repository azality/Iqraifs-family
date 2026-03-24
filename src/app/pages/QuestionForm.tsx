import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info.tsx';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { ArrowLeft, Save, Plus, X } from 'lucide-react';

interface QuestionData {
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
  source?: string;
  tags?: string[];
  isPublic?: boolean;
}

export function QuestionForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { accessToken } = useAuth();
  const isEdit = !!id;

  const [formData, setFormData] = useState<QuestionData>({
    category: 'islamic',
    difficulty: 'easy',
    questionText: '',
    questionType: 'multiple_choice',
    options: ['', '', '', ''],
    correctAnswerIndex: 0,
    basePoints: 5,
    hintPenalty: 2,
    isPublic: false
  });

  const [loading, setLoading] = useState(false);
  const [hintReducedIndices, setHintReducedIndices] = useState<number[]>([0]);

  useEffect(() => {
    if (isEdit && accessToken) {
      loadQuestion();
    }
  }, [id, accessToken]);

  // Auto-set base points based on difficulty
  useEffect(() => {
    const pointsMap = { easy: 5, medium: 10, hard: 20 };
    const penaltyMap = { easy: 2, medium: 5, hard: 8 };
    setFormData(prev => ({
      ...prev,
      basePoints: pointsMap[prev.difficulty],
      hintPenalty: penaltyMap[prev.difficulty]
    }));
  }, [formData.difficulty]);

  const loadQuestion = async () => {
    if (!accessToken || !id) return;

    setLoading(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/questions/${id}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        const question = await response.json();
        setFormData(question);
        
        // Set hint reduced indices
        if (question.hintReducedOptions && question.options) {
          const indices = question.hintReducedOptions.map((opt: string) => 
            question.options.indexOf(opt)
          );
          setHintReducedIndices(indices);
        }
      } else {
        toast.error('Failed to load question');
        navigate('/question-bank');
      }
    } catch (error) {
      console.error('Load error:', error);
      toast.error('Failed to load question');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.questionText.trim()) {
      toast.error('Question text is required');
      return;
    }

    if (formData.questionType === 'multiple_choice') {
      const validOptions = formData.options?.filter(o => o.trim()) || [];
      if (validOptions.length < 2) {
        toast.error('Multiple choice needs at least 2 options');
        return;
      }
    }

    setLoading(true);
    try {
      // Build hint reduced options from indices
      let hintReducedOptions = undefined;
      if (formData.questionType === 'multiple_choice' && formData.hint && formData.options) {
        hintReducedOptions = hintReducedIndices.map(i => formData.options![i]).filter(Boolean);
      }

      const payload = {
        ...formData,
        hintReducedOptions,
        // Clean up options for multiple choice
        options: formData.questionType === 'multiple_choice' 
          ? formData.options?.filter(o => o.trim())
          : undefined
      };

      const url = isEdit
        ? `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/questions/${id}`
        : `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/questions`;

      const response = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast.success(isEdit ? 'Question updated!' : 'Question created!');
        navigate('/question-bank');
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to save question');
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save question');
    } finally {
      setLoading(false);
    }
  };

  const addOption = () => {
    setFormData(prev => ({
      ...prev,
      options: [...(prev.options || []), '']
    }));
  };

  const removeOption = (index: number) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options?.filter((_, i) => i !== index),
      correctAnswerIndex: prev.correctAnswerIndex === index ? 0 : prev.correctAnswerIndex
    }));
  };

  const updateOption = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options?.map((opt, i) => i === index ? value : opt)
    }));
  };

  const toggleHintOption = (index: number) => {
    if (hintReducedIndices.includes(index)) {
      setHintReducedIndices(prev => prev.filter(i => i !== index));
    } else {
      setHintReducedIndices(prev => [...prev, index]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={() => navigate('/question-bank')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">
            {isEdit ? 'Edit Question' : 'New Question'}
          </h1>
          <p className="text-muted-foreground">
            Create engaging questions for Knowledge Quest
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="islamic, math, science..."
                  required
                />
              </div>

              <div>
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select
                  value={formData.difficulty}
                  onValueChange={(value: any) => setFormData(prev => ({ ...prev, difficulty: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">🟢 Easy (5 pts)</SelectItem>
                    <SelectItem value="medium">🟡 Medium (10 pts)</SelectItem>
                    <SelectItem value="hard">🔴 Hard (20 pts)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="questionType">Question Type</Label>
                <Select
                  value={formData.questionType}
                  onValueChange={(value: any) => setFormData(prev => ({ ...prev, questionType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                    <SelectItem value="true_false">True/False</SelectItem>
                    <SelectItem value="short_answer">Short Answer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="questionText">Question Text *</Label>
              <Textarea
                id="questionText"
                value={formData.questionText}
                onChange={(e) => setFormData(prev => ({ ...prev, questionText: e.target.value }))}
                placeholder="What is the first pillar of Islam?"
                rows={3}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Answer Options */}
        <Card>
          <CardHeader>
            <CardTitle>Answer Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Multiple Choice */}
            {formData.questionType === 'multiple_choice' && (
              <div className="space-y-3">
                <Label>Options (mark the correct one)</Label>
                {formData.options?.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1 flex gap-2">
                      <input
                        type="radio"
                        name="correctAnswer"
                        checked={formData.correctAnswerIndex === index}
                        onChange={() => setFormData(prev => ({ ...prev, correctAnswerIndex: index }))}
                        className="mt-2"
                      />
                      <Input
                        value={option}
                        onChange={(e) => updateOption(index, e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + index)}`}
                      />
                    </div>
                    {(formData.options?.length || 0) > 2 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeOption(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                
                {(formData.options?.length || 0) < 6 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addOption}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Option
                  </Button>
                )}
              </div>
            )}

            {/* True/False */}
            {formData.questionType === 'true_false' && (
              <div>
                <Label>Correct Answer</Label>
                <Select
                  value={formData.correctBoolean?.toString()}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, correctBoolean: value === 'true' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">✓ TRUE</SelectItem>
                    <SelectItem value="false">✗ FALSE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Short Answer */}
            {formData.questionType === 'short_answer' && (
              <div>
                <Label htmlFor="acceptedAnswers">Accepted Answers (comma-separated)</Label>
                <Input
                  id="acceptedAnswers"
                  value={formData.acceptedAnswers?.join(', ') || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    acceptedAnswers: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  }))}
                  placeholder="Shahada, Shahadah, Declaration of Faith"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  List all acceptable answer variations
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hint System */}
        <Card>
          <CardHeader>
            <CardTitle>Hint System (Optional)</CardTitle>
            <CardDescription>
              Help kids who get stuck (-{formData.hintPenalty} points penalty)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="hint">Hint Text</Label>
              <Textarea
                id="hint"
                value={formData.hint || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, hint: e.target.value }))}
                placeholder="It's the declaration of belief..."
                rows={2}
              />
            </div>

            {formData.questionType === 'multiple_choice' && formData.hint && (
              <div>
                <Label>Options to Show with Hint (select 2-3)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Choose which options to keep visible when hint is used
                </p>
                <div className="space-y-2">
                  {formData.options?.map((option, index) => (
                    option.trim() && (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={hintReducedIndices.includes(index)}
                          onChange={() => toggleHintOption(index)}
                        />
                        <span className="text-sm">{option}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Additional Info */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="explanation">Explanation (shown after answering)</Label>
              <Textarea
                id="explanation"
                value={formData.explanation || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, explanation: e.target.value }))}
                placeholder="The Shahada is the first pillar of Islam and is the declaration that there is no god but Allah..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="source">Source/Reference</Label>
              <Input
                id="source"
                value={formData.source || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value }))}
                placeholder="Five Pillars of Islam, Quran 2:255, Basic Arithmetic..."
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="isPublic"
                checked={formData.isPublic}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isPublic: checked }))}
              />
              <Label htmlFor="isPublic" className="cursor-pointer">
                Make this question public (visible to all families)
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/question-bank')}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : (isEdit ? 'Update Question' : 'Create Question')}
          </Button>
        </div>
      </form>
    </div>
  );
}
