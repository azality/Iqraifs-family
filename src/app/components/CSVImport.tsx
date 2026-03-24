import { useState } from 'react';
import { toast } from 'sonner';
import { projectId } from '/utils/supabase/info.tsx';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Upload, FileText, Download, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';

interface CSVImportProps {
  onImportComplete: () => void;
}

export function CSVImport({ onImportComplete }: CSVImportProps) {
  const { accessToken } = useAuth();
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
        toast.error('Please select a CSV file');
        return;
      }
      setFile(selectedFile);
    }
  };

  const parseCSV = (csvText: string): any[] => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file is empty or invalid');
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const questions: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length < headers.length) continue;

      const question: any = {};
      headers.forEach((header, index) => {
        const value = values[index];
        
        // Parse based on header
        if (header === 'options') {
          question.options = value.split('|').map(o => o.trim());
        } else if (header === 'acceptedAnswers') {
          question.acceptedAnswers = value.split('|').map(a => a.trim());
        } else if (header === 'hintReducedOptions') {
          question.hintReducedOptions = value.split('|').map(o => o.trim());
        } else if (header === 'tags') {
          question.tags = value.split('|').map(t => t.trim());
        } else if (header === 'correctAnswerIndex') {
          question.correctAnswerIndex = parseInt(value);
        } else if (header === 'basePoints' || header === 'hintPenalty') {
          question[header] = parseInt(value);
        } else if (header === 'correctBoolean' || header === 'isPublic') {
          question[header] = value.toLowerCase() === 'true';
        } else {
          question[header] = value;
        }
      });

      questions.push(question);
    }

    return questions;
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Please select a CSV file first');
      return;
    }

    setImporting(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const csvText = e.target?.result as string;
        const questions = parseCSV(csvText);

        let imported = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const question of questions) {
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
            } else {
              failed++;
              const error = await response.json();
              errors.push(`Row ${imported + failed}: ${error.error || 'Unknown error'}`);
            }
          } catch (error) {
            failed++;
            errors.push(`Row ${imported + failed}: ${error}`);
          }
        }

        if (errors.length > 0 && errors.length <= 5) {
          errors.forEach(err => console.error(err));
        }

        toast.success(`Imported ${imported} questions!${failed > 0 ? ` (${failed} failed)` : ''}`);
        setFile(null);
        onImportComplete();
      } catch (error: any) {
        console.error('CSV parse error:', error);
        toast.error(`Failed to parse CSV: ${error.message}`);
      } finally {
        setImporting(false);
      }
    };

    reader.onerror = () => {
      toast.error('Failed to read file');
      setImporting(false);
    };

    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const template = `category,difficulty,questionText,questionType,options,correctAnswerIndex,correctBoolean,acceptedAnswers,hint,hintReducedOptions,basePoints,hintPenalty,explanation,source,tags,isPublic
islamic,easy,What is the first pillar of Islam?,multiple_choice,Shahada|Salah|Zakat|Hajj,0,,,It's about declaring your belief,Shahada|Salah,5,2,The Shahada is the declaration of faith,Five Pillars of Islam,pillars|basics,false
math,medium,What is 7 × 8?,multiple_choice,48|54|56|63,2,,,Between 50 and 60,54|56,10,5,7 × 8 = 56,Multiplication tables,multiplication|tables,false
science,easy,Plants need sunlight to make food,true_false,,,,true,,,5,2,Plants use photosynthesis,Biology basics,plants,false`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questions_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Template downloaded!');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          CSV Import
        </CardTitle>
        <CardDescription>
          Import questions in bulk from a CSV file
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>CSV Format:</strong> Use pipe (|) to separate multiple values in options, acceptedAnswers, hintReducedOptions, and tags fields.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={downloadTemplate}
            className="flex-1"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="csv-upload"
            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <FileText className="h-10 w-10 text-gray-400 mb-2" />
              <p className="mb-2 text-sm text-gray-500">
                {file ? (
                  <span className="font-semibold text-purple-600">{file.name}</span>
                ) : (
                  <>
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </>
                )}
              </p>
              <p className="text-xs text-gray-500">CSV file only</p>
            </div>
            <input
              id="csv-upload"
              type="file"
              className="hidden"
              accept=".csv"
              onChange={handleFileChange}
              disabled={importing}
            />
          </label>
        </div>

        {file && (
          <Button
            onClick={handleImport}
            disabled={importing}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            <Upload className="h-4 w-4 mr-2" />
            {importing ? 'Importing...' : `Import Questions from ${file.name}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
