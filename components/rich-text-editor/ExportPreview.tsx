'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, FileType, Download, Loader2 } from 'lucide-react';
import {
  RichNoteContent,
  ExportFormatSettings,
  FontFamily,
  DEFAULT_EXPORT_SETTINGS,
} from '@/lib/rich-text/types';
import { richDocumentToHTML } from '@/lib/rich-text/content-converter';
import { cn } from '@/lib/utils';

interface ExportPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: RichNoteContent;
  onExportPDF: (settings: ExportFormatSettings) => Promise<void>;
  onExportWord: (settings: ExportFormatSettings) => Promise<void>;
  isExporting?: boolean;
}

const FONT_OPTIONS: FontFamily[] = [
  'Times New Roman',
  'Arial',
  'Calibri',
  'Georgia',
  'Helvetica',
];

const LINE_SPACING_OPTIONS = [
  { value: 1.0, label: 'Single' },
  { value: 1.15, label: '1.15' },
  { value: 1.5, label: '1.5' },
  { value: 2.0, label: 'Double' },
];

/**
 * Export Preview Dialog
 *
 * Provides a preview of the document and allows users to customize
 * export settings before generating PDF or Word documents.
 */
export function ExportPreview({
  open,
  onOpenChange,
  content,
  onExportPDF,
  onExportWord,
  isExporting = false,
}: ExportPreviewProps) {
  const [settings, setSettings] = useState<ExportFormatSettings>(
    content.formatSettings || { ...DEFAULT_EXPORT_SETTINGS }
  );
  const [activeTab, setActiveTab] = useState<'preview' | 'settings'>('preview');
  const [exportType, setExportType] = useState<'pdf' | 'word' | null>(null);

  const updateSetting = <K extends keyof ExportFormatSettings>(
    key: K,
    value: ExportFormatSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleExportPDF = async () => {
    setExportType('pdf');
    try {
      await onExportPDF(settings);
      onOpenChange(false);
    } finally {
      setExportType(null);
    }
  };

  const handleExportWord = async () => {
    setExportType('word');
    try {
      await onExportWord(settings);
      onOpenChange(false);
    } finally {
      setExportType(null);
    }
  };

  // Generate preview HTML
  const previewHTML = richDocumentToHTML(content.document);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[75vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Export Document</DialogTitle>
          <DialogDescription>
            Preview your document and customize export settings
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'preview' | 'settings')}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="settings">Format Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="flex-1 overflow-auto mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Document Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    'border rounded-lg p-6 bg-white min-h-[400px]',
                    'prose prose-slate max-w-none',
                    // Apply font settings to preview
                    settings.fontFamily === 'Times New Roman' && 'font-serif',
                    settings.fontFamily === 'Arial' && 'font-sans',
                    settings.fontFamily === 'Calibri' && 'font-sans',
                    settings.fontFamily === 'Georgia' && 'font-serif',
                    settings.fontFamily === 'Helvetica' && 'font-sans'
                  )}
                  style={{
                    fontSize: `${settings.baseFontSize}pt`,
                    lineHeight: settings.paragraphSpacing.lineSpacing,
                    padding: `${settings.pageMargins.top * 0.5}in ${settings.pageMargins.right * 0.5}in`,
                  }}
                  dangerouslySetInnerHTML={{ __html: previewHTML }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="flex-1 overflow-auto mt-4">
            <div className="grid gap-6">
              {/* Font Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Typography</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Font Family</Label>
                      <Select
                        value={settings.fontFamily}
                        onValueChange={(v) => updateSetting('fontFamily', v as FontFamily)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((font) => (
                            <SelectItem key={font} value={font}>
                              <span style={{ fontFamily: font }}>{font}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Base Font Size: {settings.baseFontSize}pt</Label>
                      <Slider
                        value={[settings.baseFontSize]}
                        onValueChange={([v]) => updateSetting('baseFontSize', v)}
                        min={10}
                        max={16}
                        step={1}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Heading Font Size: {settings.headingFontSize}pt</Label>
                      <Slider
                        value={[settings.headingFontSize]}
                        onValueChange={([v]) => updateSetting('headingFontSize', v)}
                        min={12}
                        max={20}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Line Spacing</Label>
                      <Select
                        value={String(settings.paragraphSpacing.lineSpacing)}
                        onValueChange={(v) =>
                          updateSetting('paragraphSpacing', {
                            ...settings.paragraphSpacing,
                            lineSpacing: parseFloat(v),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LINE_SPACING_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={String(option.value)}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Margins */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Page Margins (inches)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4">
                    {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                      <div key={side} className="space-y-2">
                        <Label className="capitalize">{side}</Label>
                        <Select
                          value={String(settings.pageMargins[side])}
                          onValueChange={(v) =>
                            updateSetting('pageMargins', {
                              ...settings.pageMargins,
                              [side]: parseFloat(v),
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[0.5, 0.75, 1, 1.25, 1.5].map((val) => (
                              <SelectItem key={val} value={String(val)}>
                                {val}"
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Additional Options */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Additional Options</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="page-numbers">Include Page Numbers</Label>
                    <Switch
                      id="page-numbers"
                      checked={settings.includePageNumbers}
                      onCheckedChange={(v) => updateSetting('includePageNumbers', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="date-header">Include Date in Header</Label>
                    <Switch
                      id="date-header"
                      checked={settings.includeDateInHeader}
                      onCheckedChange={(v) => updateSetting('includeDateInHeader', v)}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleExportPDF}
            disabled={isExporting}
            className="gap-2"
          >
            {exportType === 'pdf' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileType className="h-4 w-4" />
            )}
            Export PDF
          </Button>
          <Button onClick={handleExportWord} disabled={isExporting} className="gap-2">
            {exportType === 'word' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Export Word (.docx)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
