'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X, Sparkles } from 'lucide-react';

export interface ICD10Code {
  code: string;
  description: string;
}

interface ICD10CodeInputProps {
  label: string;
  description?: string;
  codes: ICD10Code[];
  onChange: (codes: ICD10Code[]) => void;
  maxCodes?: number;
  diagnosisText?: string;
}

export function ICD10CodeInput({
  label,
  description,
  codes,
  onChange,
  maxCodes = 5,
  diagnosisText,
}: ICD10CodeInputProps) {
  const [newCode, setNewCode] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newCode.trim() || !newDescription.trim()) {
      setError('Both code and description are required');
      return;
    }

    if (codes.length >= maxCodes) {
      setError(`Maximum ${maxCodes} codes allowed`);
      return;
    }

    const newCodeObj: ICD10Code = {
      code: newCode.trim().toUpperCase(),
      description: newDescription.trim(),
    };

    onChange([...codes, newCodeObj]);
    setNewCode('');
    setNewDescription('');
    setError(null);
  };

  const handleRemove = (index: number) => {
    onChange(codes.filter((_, i) => i !== index));
  };

  const handleSuggest = async () => {
    if (!diagnosisText || !diagnosisText.trim()) {
      setError('Please enter a diagnosis first');
      return;
    }

    setSuggesting(true);
    setError(null);

    try {
      const response = await fetch('/api/icd10/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagnosis: diagnosisText }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to suggest codes');
      }

      const data = await response.json();

      // Replace existing codes with suggestions (up to maxCodes)
      onChange(data.codes.slice(0, maxCodes));
    } catch (err) {
      console.error('Error suggesting ICD-10 codes:', err);
      setError(err instanceof Error ? err.message : 'Failed to suggest codes');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
        </div>
        {diagnosisText && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSuggest}
            disabled={suggesting || codes.length >= maxCodes}
            className="gap-2"
          >
            {suggesting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {suggesting ? 'Suggesting...' : 'Auto-fill'}
          </Button>
        )}
      </div>

      {/* Display existing codes */}
      {codes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {codes.map((code, index) => (
            <Badge
              key={index}
              variant="secondary"
              className="pl-2 pr-1 py-1 flex items-center gap-2"
            >
              <span className="font-mono font-semibold">{code.code}</span>
              <span className="text-xs">{code.description}</span>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="ml-1 hover:bg-slate-200 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Add new code form */}
      {codes.length < maxCodes && (
        <div className="flex gap-2">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <Input
              placeholder="ICD-10 Code (e.g., M54.5)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="font-mono"
              maxLength={10}
            />
            <Input
              placeholder="Description (e.g., Low back pain)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {codes.length >= maxCodes && (
        <p className="text-xs text-slate-500">
          Maximum {maxCodes} codes reached
        </p>
      )}
    </div>
  );
}
