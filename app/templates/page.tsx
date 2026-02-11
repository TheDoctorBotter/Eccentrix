'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Edit, Trash2, Plus, Save, Upload } from 'lucide-react';
import { Template, NoteType, NOTE_TYPE_LABELS, StyleSettings } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState<Partial<Template>>({
    name: '',
    note_type: 'daily_soap',
    content: '',
    style_settings: {
      verbosity: 'concise',
      tone: 'outpatient',
      avoid_acronyms: false,
    },
    is_default: false,
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const url = editingTemplate
        ? `/api/templates/${editingTemplate.id}`
        : '/api/templates';
      const method = editingTemplate ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await fetchTemplates();
        setDialogOpen(false);
        resetForm();
      }
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setTemplates(templates.filter((t) => t.id !== id));
      }
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const openEditDialog = (template: Template) => {
    setEditingTemplate(template);
    setFormData(template);
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      note_type: 'daily_soap',
      content: '',
      style_settings: {
        verbosity: 'concise',
        tone: 'outpatient',
        avoid_acronyms: false,
      },
      is_default: false,
    });
  };

  const updateStyleSetting = (key: keyof StyleSettings, value: any) => {
    setFormData({
      ...formData,
      style_settings: {
        ...formData.style_settings!,
        [key]: value,
      },
    });
  };

  const groupedTemplates = templates.reduce((acc, template) => {
    if (!acc[template.note_type]) {
      acc[template.note_type] = [];
    }
    acc[template.note_type].push(template);
    return acc;
  }, {} as Record<string, Template[]>);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Template Manager
            </h1>
            <p className="text-slate-600">
              Create and edit note templates with custom formatting
            </p>
          </div>
          <div className="flex gap-3">
          <Link href="/templates/manage">
            <Button variant="outline" size="lg">
              <Upload className="mr-2 h-5 w-5" />
              Upload DOCX Template
            </Button>
          </Link>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" onClick={openCreateDialog}>
                <Plus className="mr-2 h-5 w-5" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingTemplate ? 'Edit' : 'Create'} Template
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Template Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., Standard Daily SOAP"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="note_type">Note Type</Label>
                  <Select
                    value={formData.note_type}
                    onValueChange={(value) =>
                      setFormData({ ...formData, note_type: value as NoteType })
                    }
                  >
                    <SelectTrigger id="note_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(NOTE_TYPE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Template Content</Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    placeholder="Enter template with placeholders like {{subjective}}, {{objective}}, etc."
                    rows={12}
                    className="font-mono text-sm"
                  />
                  <p className="text-sm text-slate-500">
                    Use placeholders: {'{{'} subjective {'}}'},  {'{{'} objective {'}}'},  {'{{'} assessment {'}}'},  {'{{'} plan {'}}'}
                  </p>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <h3 className="font-semibold">Style Settings</h3>

                  <div className="space-y-2">
                    <Label htmlFor="verbosity">Verbosity</Label>
                    <Select
                      value={formData.style_settings?.verbosity}
                      onValueChange={(value) =>
                        updateStyleSetting('verbosity', value)
                      }
                    >
                      <SelectTrigger id="verbosity">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="concise">
                          Concise - Brief, to-the-point
                        </SelectItem>
                        <SelectItem value="detailed">
                          Detailed - Comprehensive descriptions
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tone">Tone</Label>
                    <Select
                      value={formData.style_settings?.tone}
                      onValueChange={(value) => updateStyleSetting('tone', value)}
                    >
                      <SelectTrigger id="tone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outpatient">
                          Outpatient - Clinical PT setting
                        </SelectItem>
                        <SelectItem value="school_based">
                          School-Based - Educational IEP focus
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label htmlFor="avoid_acronyms">Avoid Acronyms</Label>
                      <p className="text-sm text-slate-500">
                        Spell out all medical terms
                      </p>
                    </div>
                    <Switch
                      id="avoid_acronyms"
                      checked={formData.style_settings?.avoid_acronyms}
                      onCheckedChange={(checked) =>
                        updateStyleSetting('avoid_acronyms', checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50">
                    <div>
                      <Label htmlFor="is_default">Set as Default</Label>
                      <p className="text-sm text-slate-500">
                        Use this template by default for this note type
                      </p>
                    </div>
                    <Switch
                      id="is_default"
                      checked={formData.is_default}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_default: checked })
                      }
                    />
                  </div>
                </div>

                <Button onClick={handleSave} className="w-full" size="lg">
                  <Save className="mr-2 h-5 w-5" />
                  Save Template
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">
            Loading templates...
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(NOTE_TYPE_LABELS).map(([noteType, label]) => (
              <div key={noteType}>
                <h2 className="text-2xl font-bold text-slate-900 mb-4">
                  {label}
                </h2>
                {groupedTemplates[noteType]?.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    {groupedTemplates[noteType].map((template) => (
                      <Card key={template.id} className="relative">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg">
                                {template.name}
                              </CardTitle>
                              <CardDescription className="mt-1">
                                {template.style_settings?.verbosity === 'detailed'
                                  ? 'Detailed'
                                  : 'Concise'}{' '}
                                •{' '}
                                {template.style_settings?.tone === 'school_based'
                                  ? 'School-Based'
                                  : 'Outpatient'}
                              </CardDescription>
                            </div>
                            {template.is_default && (
                              <Badge variant="default">Default</Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(template)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(template.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="text-center py-8 text-slate-500">
                      No templates for this note type yet.
                    </CardContent>
                  </Card>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
