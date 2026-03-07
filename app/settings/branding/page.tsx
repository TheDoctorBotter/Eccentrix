'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Upload, Image as ImageIcon, FileText, Save, Loader2, ArrowLeft, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { BrandingSettings } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';

// FIX: Default settings object extracted for reuse and to ensure all new fields
// (fax, npi, tax_id, storage paths, colors) have proper defaults.
const DEFAULT_SETTINGS: BrandingSettings = {
  clinic_name: '',
  address: '',
  phone: '',
  fax: '',
  email: '',
  website: '',
  npi: '',
  tax_id: '',
  logo_url: null,
  logo_storage_path: null,
  letterhead_url: null,
  letterhead_storage_path: null,
  show_in_notes: true,
  provider_name: '',
  provider_credentials: '',
  provider_license: '',
  signature_enabled: true,
  primary_color: '#1e40af',
  secondary_color: '#64748b',
};

export default function BrandingSettingsPage() {
  const { toast } = useToast();
  const { currentClinic } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingLetterhead, setUploadingLetterhead] = useState(false);
  // FIX: Track unsaved changes so users know when they need to save
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // FIX: Track local file previews with URL.createObjectURL for immediate feedback
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [letterheadPreview, setLetterheadPreview] = useState<string | null>(null);
  // FIX: Persistent error banner for save/upload failures
  const [saveError, setSaveError] = useState<string | null>(null);

  const [settings, setSettings] = useState<BrandingSettings>({ ...DEFAULT_SETTINGS });
  // FIX: Store the initial loaded settings to compare for unsaved changes
  const savedSettingsRef = useRef<BrandingSettings>({ ...DEFAULT_SETTINGS });

  useEffect(() => {
    if (currentClinic) {
      fetchSettings();
    }
  }, [currentClinic]);

  // FIX: Detect unsaved changes by comparing current settings to saved snapshot
  const checkUnsavedChanges = useCallback((current: BrandingSettings) => {
    const saved = savedSettingsRef.current;
    const changed = (
      current.clinic_name !== saved.clinic_name ||
      current.address !== saved.address ||
      current.phone !== saved.phone ||
      current.fax !== saved.fax ||
      current.email !== saved.email ||
      current.website !== saved.website ||
      current.npi !== saved.npi ||
      current.tax_id !== saved.tax_id ||
      current.logo_url !== saved.logo_url ||
      current.letterhead_url !== saved.letterhead_url ||
      current.show_in_notes !== saved.show_in_notes ||
      current.primary_color !== saved.primary_color ||
      current.secondary_color !== saved.secondary_color
    );
    setHasUnsavedChanges(changed);
  }, []);

  const updateSettings = useCallback((updater: Partial<BrandingSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updater };
      checkUnsavedChanges(next);
      return next;
    });
  }, [checkUnsavedChanges]);

  const fetchSettings = async () => {
    if (!currentClinic) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/branding?clinic_id=${currentClinic.clinic_id}`);
      if (response.ok) {
        const data = await response.json();
        // FIX: Merge fetched data with defaults so any missing fields get proper defaults
        const merged = { ...DEFAULT_SETTINGS, ...data };
        setSettings(merged);
        savedSettingsRef.current = { ...merged };
        setHasUnsavedChanges(false);
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || 'Failed to fetch settings');
      }
    } catch (error) {
      console.error('Error fetching branding settings:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load branding settings',
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

    // FIX: Show immediate local preview using URL.createObjectURL so users see
    // what they selected before the upload completes
    const localPreviewUrl = URL.createObjectURL(file);
    if (type === 'logo') {
      setLogoPreview(localPreviewUrl);
    } else {
      setLetterheadPreview(localPreviewUrl);
    }

    const setUploading = type === 'logo' ? setUploadingLogo : setUploadingLetterhead;
    setUploading(true);
    setSaveError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      // FIX: Send the old storage path so the server can clean up the old file
      const oldPathKey = type === 'logo' ? 'logo_storage_path' : 'letterhead_storage_path';
      if (settings[oldPathKey]) {
        formData.append('old_path', settings[oldPathKey] as string);
      }

      const response = await fetch('/api/branding/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        let errorMessage = data.error || 'Upload failed';
        if (data.details) {
          errorMessage += `: ${data.details}`;
        }
        throw new Error(errorMessage);
      }

      if (!data.url) {
        throw new Error('Upload succeeded but no URL was returned');
      }

      // FIX: Store both the signed URL and the storage path. The storage path is
      // needed for cleanup when replacing images and for generating new signed URLs.
      const urlKey = type === 'logo' ? 'logo_url' : 'letterhead_url';
      const pathKey = type === 'logo' ? 'logo_storage_path' : 'letterhead_storage_path';
      updateSettings({
        [urlKey]: data.url,
        [pathKey]: data.path,
      });

      toast({
        title: 'Success',
        description: `${type === 'logo' ? 'Logo' : 'Letterhead'} uploaded successfully. Click Save to persist.`,
      });
    } catch (error) {
      console.error('[Branding] Error in handleFileUpload:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload file';
      // FIX: Show persistent error banner with specific error details
      setSaveError(`${type === 'logo' ? 'Logo' : 'Letterhead'} upload failed: ${errorMessage}`);
      toast({
        title: 'Upload Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      // Clear the local preview on failure
      if (type === 'logo') setLogoPreview(null);
      else setLetterheadPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!currentClinic) {
      toast({
        title: 'Error',
        description: 'No clinic selected',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch('/api/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          clinic_id: currentClinic.clinic_id,
        }),
      });

      if (!response.ok) {
        // FIX: Parse and display the specific error from the server rather than
        // showing a generic "Save failed" message.
        const errData = await response.json().catch(() => ({}));
        const detail = errData.details || errData.error || 'Save failed';
        throw new Error(detail);
      }

      const savedData = await response.json();

      // FIX: After successful save, update the saved snapshot and clear unsaved indicator
      const merged = { ...DEFAULT_SETTINGS, ...savedData };
      setSettings(merged);
      savedSettingsRef.current = { ...merged };
      setHasUnsavedChanges(false);

      // FIX: Clear local file previews — the saved URLs from the server are now authoritative
      setLogoPreview(null);
      setLetterheadPreview(null);

      toast({
        title: 'Saved',
        description: 'Clinic branding saved successfully',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      const message = error instanceof Error ? error.message : 'Failed to save branding settings';
      // FIX: Show persistent red error banner with exact error details
      setSaveError(message);
      toast({
        title: 'Save Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Determine the display URL for logo/letterhead (local preview takes precedence)
  const displayLogoUrl = logoPreview || settings.logo_url;
  const displayLetterheadUrl = letterheadPreview || settings.letterhead_url;

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
          <div className="flex items-center gap-3">
            {/* FIX: Unsaved changes indicator so users know when to save */}
            {hasUnsavedChanges && (
              <span className="text-sm text-amber-600 font-medium">Unsaved changes</span>
            )}
            {/* FIX: Save button disabled until changes exist, shows spinner during save */}
            <Button
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges}
              size="lg"
            >
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
        </div>

        {/* FIX: Persistent red error banner for save/upload failures with exact error */}
        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Error</p>
              <p className="text-sm text-red-700 mt-1">{saveError}</p>
            </div>
            <button
              onClick={() => setSaveError(null)}
              className="ml-auto text-red-400 hover:text-red-600 text-sm"
            >
              Dismiss
            </button>
          </div>
        )}

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
                {/* FIX: Show current logo preview (local preview or saved URL) */}
                {displayLogoUrl && (
                  <div className="border rounded-lg p-4 bg-white">
                    <img
                      src={displayLogoUrl}
                      alt="Clinic Logo"
                      className="max-h-32 mx-auto object-contain"
                    />
                  </div>
                )}
                {/* FIX: Show placeholder when no logo exists */}
                {!displayLogoUrl && (
                  <div className="border rounded-lg p-4 bg-slate-50 text-center">
                    <ImageIcon className="h-12 w-12 mx-auto text-slate-300 mb-2" />
                    <p className="text-xs text-slate-400">No logo uploaded</p>
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
                {/* FIX: Show current letterhead preview (local preview or saved URL) */}
                {displayLetterheadUrl && (
                  <div className="border rounded-lg p-4 bg-white">
                    <img
                      src={displayLetterheadUrl}
                      alt="Clinic Letterhead"
                      className="max-h-40 w-full object-contain"
                    />
                  </div>
                )}
                {!displayLetterheadUrl && (
                  <div className="border rounded-lg p-4 bg-slate-50 text-center">
                    <FileText className="h-12 w-12 mx-auto text-slate-300 mb-2" />
                    <p className="text-xs text-slate-400">No letterhead uploaded</p>
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
                    onChange={(e) => updateSettings({ clinic_name: e.target.value })}
                    placeholder="Your Clinic Name"
                  />
                </div>
                <div>
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={settings.address}
                    onChange={(e) => updateSettings({ address: e.target.value })}
                    placeholder="Street Address&#10;City, State ZIP"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={settings.phone}
                      onChange={(e) => updateSettings({ phone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div>
                    <Label htmlFor="fax">Fax</Label>
                    <Input
                      id="fax"
                      value={settings.fax}
                      onChange={(e) => updateSettings({ fax: e.target.value })}
                      placeholder="(555) 123-4568"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={settings.email}
                    onChange={(e) => updateSettings({ email: e.target.value })}
                    placeholder="contact@clinic.com"
                  />
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={settings.website}
                    onChange={(e) => updateSettings({ website: e.target.value })}
                    placeholder="https://www.clinic.com"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="npi">NPI</Label>
                    <Input
                      id="npi"
                      value={settings.npi}
                      onChange={(e) => updateSettings({ npi: e.target.value })}
                      placeholder="1234567890"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tax-id">Tax ID</Label>
                    <Input
                      id="tax-id"
                      value={settings.tax_id}
                      onChange={(e) => updateSettings({ tax_id: e.target.value })}
                      placeholder="XX-XXXXXXX"
                    />
                  </div>
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
                    onCheckedChange={(checked) => updateSettings({ show_in_notes: checked })}
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
                  {displayLetterheadUrl ? (
                    <img
                      src={displayLetterheadUrl}
                      alt="Letterhead Preview"
                      className="w-full object-contain"
                    />
                  ) : displayLogoUrl ? (
                    <div className="flex items-start gap-4">
                      <img
                        src={displayLogoUrl}
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
                          {settings.fax && <div>Fax: {settings.fax}</div>}
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
                          {settings.fax && <div>Fax: {settings.fax}</div>}
                          {settings.email && <div>Email: {settings.email}</div>}
                          {settings.website && <div>Web: {settings.website}</div>}
                        </div>
                      </div>
                    </div>
                  )}

                  {!settings.clinic_name &&
                    !displayLogoUrl &&
                    !displayLetterheadUrl && (
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
