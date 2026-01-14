'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Upload, Image as ImageIcon, FileText, Save, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { BrandingSettings } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export default function BrandingSettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingLetterhead, setUploadingLetterhead] = useState(false);

  const [settings, setSettings] = useState<BrandingSettings>({
    clinic_name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    logo_url: null,
    letterhead_url: null,
    show_in_notes: true,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/branding');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching branding settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load branding settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File, type: 'logo' | 'letterhead') => {
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'File size must be less than 5MB',
        variant: 'destructive',
      });
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      toast({
        title: 'Error',
        description: 'Only PNG, JPEG, and WebP images are allowed',
        variant: 'destructive',
      });
      return;
    }

    const setUploading = type === 'logo' ? setUploadingLogo : setUploadingLetterhead;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const response = await fetch('/api/branding/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setSettings(prev => ({
        ...prev,
        [type === 'logo' ? 'logo_url' : 'letterhead_url']: data.url,
      }));

      toast({
        title: 'Success',
        description: `${type === 'logo' ? 'Logo' : 'Letterhead'} uploaded successfully`,
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload file';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Save failed');
      }

      toast({
        title: 'Success',
        description: 'Branding settings saved successfully',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save branding settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Settings
            </Button>
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Clinic Branding</h1>
            <p className="text-slate-600 mt-1">
              Upload your clinic logo and letterhead to brand your documentation
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving} size="lg">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Logo Upload</CardTitle>
                <CardDescription>
                  Upload your clinic logo (PNG, JPEG, or WebP, max 5MB)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {settings.logo_url && (
                  <div className="border rounded-lg p-4 bg-white">
                    <img
                      src={settings.logo_url}
                      alt="Clinic Logo"
                      className="max-h-32 mx-auto object-contain"
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="logo-upload" className="cursor-pointer">
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-blue-400 transition-colors text-center">
                      {uploadingLogo ? (
                        <Loader2 className="h-8 w-8 mx-auto animate-spin text-blue-600" />
                      ) : (
                        <>
                          <ImageIcon className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                          <p className="text-sm text-slate-600">
                            Click to upload logo
                          </p>
                        </>
                      )}
                    </div>
                  </Label>
                  <Input
                    id="logo-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'logo');
                    }}
                    disabled={uploadingLogo}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Letterhead Upload</CardTitle>
                <CardDescription>
                  Upload your clinic letterhead (PNG, JPEG, or WebP, max 5MB)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {settings.letterhead_url && (
                  <div className="border rounded-lg p-4 bg-white">
                    <img
                      src={settings.letterhead_url}
                      alt="Clinic Letterhead"
                      className="max-h-40 w-full object-contain"
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="letterhead-upload" className="cursor-pointer">
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-blue-400 transition-colors text-center">
                      {uploadingLetterhead ? (
                        <Loader2 className="h-8 w-8 mx-auto animate-spin text-blue-600" />
                      ) : (
                        <>
                          <FileText className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                          <p className="text-sm text-slate-600">
                            Click to upload letterhead
                          </p>
                        </>
                      )}
                    </div>
                  </Label>
                  <Input
                    id="letterhead-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'letterhead');
                    }}
                    disabled={uploadingLetterhead}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Clinic Information</CardTitle>
                <CardDescription>
                  Enter your clinic contact details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="clinic-name">Clinic Name</Label>
                  <Input
                    id="clinic-name"
                    value={settings.clinic_name}
                    onChange={(e) =>
                      setSettings({ ...settings, clinic_name: e.target.value })
                    }
                    placeholder="Your Clinic Name"
                  />
                </div>
                <div>
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={settings.address}
                    onChange={(e) =>
                      setSettings({ ...settings, address: e.target.value })
                    }
                    placeholder="Street Address&#10;City, State ZIP"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={settings.phone}
                    onChange={(e) =>
                      setSettings({ ...settings, phone: e.target.value })
                    }
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={settings.email}
                    onChange={(e) =>
                      setSettings({ ...settings, email: e.target.value })
                    }
                    placeholder="contact@clinic.com"
                  />
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={settings.website}
                    onChange={(e) =>
                      setSettings({ ...settings, website: e.target.value })
                    }
                    placeholder="https://www.clinic.com"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Display Options</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="show-in-notes">Show branding in notes</Label>
                    <p className="text-sm text-slate-500 mt-1">
                      Include branding header when displaying notes
                    </p>
                  </div>
                  <Switch
                    id="show-in-notes"
                    checked={settings.show_in_notes}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, show_in_notes: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  This is how your branding will appear on notes and PDFs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg p-6 bg-white space-y-4">
                  {settings.letterhead_url ? (
                    <img
                      src={settings.letterhead_url}
                      alt="Letterhead Preview"
                      className="w-full object-contain"
                    />
                  ) : settings.logo_url ? (
                    <div className="flex items-start gap-4">
                      <img
                        src={settings.logo_url}
                        alt="Logo Preview"
                        className="h-16 w-16 object-contain flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        {settings.clinic_name && (
                          <h3 className="font-bold text-lg text-slate-900">
                            {settings.clinic_name}
                          </h3>
                        )}
                        {settings.address && (
                          <p className="text-sm text-slate-600 whitespace-pre-line">
                            {settings.address}
                          </p>
                        )}
                        <div className="text-sm text-slate-600 mt-2 space-y-1">
                          {settings.phone && <div>Phone: {settings.phone}</div>}
                          {settings.email && <div>Email: {settings.email}</div>}
                          {settings.website && <div>Web: {settings.website}</div>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="text-slate-900 space-y-2">
                        {settings.clinic_name && (
                          <h3 className="font-bold text-xl">{settings.clinic_name}</h3>
                        )}
                        {settings.address && (
                          <p className="text-sm whitespace-pre-line">
                            {settings.address}
                          </p>
                        )}
                        <div className="text-sm space-y-1">
                          {settings.phone && <div>Phone: {settings.phone}</div>}
                          {settings.email && <div>Email: {settings.email}</div>}
                          {settings.website && <div>Web: {settings.website}</div>}
                        </div>
                      </div>
                    </div>
                  )}

                  {!settings.clinic_name &&
                    !settings.logo_url &&
                    !settings.letterhead_url && (
                      <div className="text-center py-12 text-slate-400">
                        <Upload className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">
                          Upload branding assets or enter clinic information to see preview
                        </p>
                      </div>
                    )}
                </div>

                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-900">
                    <strong>Note:</strong> Branding will appear at the top of all
                    generated notes when enabled, and will be included in PDF exports.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
