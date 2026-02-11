'use client';

import { useEffect, useState, useCallback } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  Upload,
  FileText,
  Trash2,
  Download,
  Star,
  Building2,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react';
import {
  DocumentTemplate,
  DocumentNoteType,
  DOCUMENT_NOTE_TYPE_LABELS,
} from '@/lib/templates/types';

export default function TemplateManagementPage() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Upload dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    clinic_name: '',
    note_type: '' as DocumentNoteType | '',
    template_name: '',
    description: '',
    is_default: false,
    file: null as File | null,
  });

  // Filter state
  const [filterClinic, setFilterClinic] = useState<string>('all');

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/templates/document');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      } else {
        setError('Failed to load templates');
      }
    } catch (err) {
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Get unique clinic names
  const clinicNames = Array.from(new Set(templates.map((t) => t.clinic_name))).sort();

  // Filter templates
  const filteredTemplates =
    filterClinic === 'all'
      ? templates
      : templates.filter((t) => t.clinic_name === filterClinic);

  // Group templates by clinic
  const templatesByClinic = filteredTemplates.reduce(
    (acc, template) => {
      if (!acc[template.clinic_name]) {
        acc[template.clinic_name] = [];
      }
      acc[template.clinic_name].push(template);
      return acc;
    },
    {} as Record<string, DocumentTemplate[]>
  );

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setUploadForm((prev) => ({ ...prev, file }));
  };

  // Handle upload
  const handleUpload = async () => {
    if (!uploadForm.file || !uploadForm.clinic_name || !uploadForm.note_type || !uploadForm.template_name) {
      setError('Please fill in all required fields');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadForm.file);
      formData.append('clinic_name', uploadForm.clinic_name);
      formData.append('note_type', uploadForm.note_type);
      formData.append('template_name', uploadForm.template_name);
      formData.append('description', uploadForm.description);
      formData.append('is_default', String(uploadForm.is_default));

      const response = await fetch('/api/templates/document', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setSuccess('Template uploaded successfully');
        setUploadOpen(false);
        setUploadForm({
          clinic_name: '',
          note_type: '',
          template_name: '',
          description: '',
          is_default: false,
          file: null,
        });
        fetchTemplates();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to upload template');
      }
    } catch (err) {
      setError('Failed to upload template');
    } finally {
      setUploading(false);
    }
  };

  // Handle delete
  const handleDelete = async (templateId: string) => {
    try {
      const response = await fetch(`/api/templates/document/${templateId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSuccess('Template deleted successfully');
        fetchTemplates();
      } else {
        setError('Failed to delete template');
      }
    } catch (err) {
      setError('Failed to delete template');
    }
  };

  // Handle set default
  const handleSetDefault = async (templateId: string) => {
    try {
      const response = await fetch(`/api/templates/document/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });

      if (response.ok) {
        setSuccess('Default template updated');
        fetchTemplates();
      } else {
        setError('Failed to update default template');
      }
    } catch (err) {
      setError('Failed to update default template');
    }
  };

  // Handle download
  const handleDownload = async (templateId: string, fileName: string) => {
    try {
      const response = await fetch(`/api/templates/document/${templateId}?download=true`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError('Failed to download template');
    }
  };

  // Clear messages after delay
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/">
              <Button variant="ghost" size="sm" className="mb-2">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-slate-900">Document Templates</h1>
            <p className="text-slate-600 mt-1">
              Manage clinic-branded DOCX templates for note exports
            </p>
          </div>

          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Upload Template
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Upload Document Template</DialogTitle>
                <DialogDescription>
                  Upload a .docx template with placeholders like {`{{PATIENT_NAME}}`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="clinic_name">Clinic/Brand Name *</Label>
                  <Input
                    id="clinic_name"
                    placeholder="e.g., Children's Therapy World"
                    value={uploadForm.clinic_name}
                    onChange={(e) =>
                      setUploadForm((prev) => ({ ...prev, clinic_name: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="note_type">Note Type *</Label>
                  <Select
                    value={uploadForm.note_type}
                    onValueChange={(v) =>
                      setUploadForm((prev) => ({ ...prev, note_type: v as DocumentNoteType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select note type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DOCUMENT_NOTE_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template_name">Template Name *</Label>
                  <Input
                    id="template_name"
                    placeholder="e.g., Daily Note v2"
                    value={uploadForm.template_name}
                    onChange={(e) =>
                      setUploadForm((prev) => ({ ...prev, template_name: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Optional description..."
                    value={uploadForm.description}
                    onChange={(e) =>
                      setUploadForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file">Template File (.docx) *</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileChange}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="is_default">Set as default for this clinic + type</Label>
                  <Switch
                    id="is_default"
                    checked={uploadForm.is_default}
                    onCheckedChange={(v) =>
                      setUploadForm((prev) => ({ ...prev, is_default: v }))
                    }
                  />
                </div>

                <details className="text-xs text-slate-500 border rounded-md p-2">
                  <summary className="cursor-pointer font-medium text-slate-600">
                    Supported placeholders (click to expand)
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                    <span>{`{{PATIENT_NAME}}`}</span>
                    <span>{`{{DOB}}`} / {`{{AGE}}`}</span>
                    <span>{`{{REFERRING_MD}}`}</span>
                    <span>{`{{INSURANCE_ID}}`}</span>
                    <span>{`{{MEDICAL_DX}}`}</span>
                    <span>{`{{TREATMENT_DX}}`}</span>
                    <span>{`{{ALLERGIES}}`}</span>
                    <span>{`{{PRECAUTIONS}}`}</span>
                    <span>{`{{DATE_OF_SERVICE}}`}</span>
                    <span>{`{{TIME_IN}}`} / {`{{TIME_OUT}}`}</span>
                    <span>{`{{TOTAL_TIME}}`}</span>
                    <span>{`{{UNITS}}`}</span>
                    <span>{`{{SUBJECTIVE}}`}</span>
                    <span>{`{{OBJECTIVE}}`}</span>
                    <span>{`{{ASSESSMENT}}`}</span>
                    <span>{`{{PLAN}}`}</span>
                    <span>{`{{THERAPIST_NAME}}`}</span>
                    <span>{`{{THERAPIST_CREDENTIALS}}`}</span>
                  </div>
                </details>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpload} disabled={uploading}>
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <Check className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Filter */}
        <div className="mb-6">
          <Label className="text-sm text-slate-600">Filter by Clinic</Label>
          <Select value={filterClinic} onValueChange={setFilterClinic}>
            <SelectTrigger className="w-[250px] mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clinics</SelectItem>
              {clinicNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-400" />
            <p className="mt-2 text-slate-500">Loading templates...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && templates.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700">No templates yet</h3>
              <p className="text-slate-500 mt-1">
                Upload your first clinic-branded template to get started
              </p>
              <Button className="mt-4" onClick={() => setUploadOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Template
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Templates by Clinic */}
        {!loading &&
          Object.entries(templatesByClinic).map(([clinicName, clinicTemplates]) => (
            <Card key={clinicName} className="mb-6">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-slate-600" />
                  <CardTitle>{clinicName}</CardTitle>
                </div>
                <CardDescription>
                  {clinicTemplates.length} template{clinicTemplates.length !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {clinicTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <FileText className="h-8 w-8 text-blue-500" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{template.template_name}</span>
                            <Badge variant="outline">
                              {DOCUMENT_NOTE_TYPE_LABELS[template.note_type]}
                            </Badge>
                            {template.is_default && (
                              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                                <Star className="h-3 w-3 mr-1 fill-current" />
                                Default
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-slate-500 mt-1">
                            {template.file_name} ({(template.file_size / 1024).toFixed(1)} KB)
                          </div>
                          {template.description && (
                            <div className="text-sm text-slate-600 mt-1">
                              {template.description}
                            </div>
                          )}
                          {template.placeholders_detected?.length > 0 && (
                            <div className="text-xs text-slate-400 mt-1">
                              Placeholders: {template.placeholders_detected.slice(0, 5).join(', ')}
                              {template.placeholders_detected.length > 5 && '...'}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!template.is_default && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetDefault(template.id)}
                            title="Set as default"
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(template.id, template.file_name)}
                          title="Download template"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600"
                              title="Delete template"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Template</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{template.template_name}"? This
                                action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-500 hover:bg-red-600"
                                onClick={() => handleDelete(template.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}
