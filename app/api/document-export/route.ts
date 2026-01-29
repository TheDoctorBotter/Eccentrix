/**
 * Document Export API
 *
 * POST: Generate a filled document from a template
 *
 * Supports:
 * - DOCX export (direct template filling)
 * - PDF export (DOCX to PDF conversion)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fillDocxTemplate, fillDocxTemplateRaw } from '@/lib/templates/docx-engine';
import { NoteTemplateData, ExportFormat } from '@/lib/templates/types';

const STORAGE_BUCKET = 'document-templates';

// PDF conversion service URL (configure based on deployment)
const PDF_CONVERSION_URL = process.env.PDF_CONVERSION_URL || '';

interface ExportRequestBody {
  template_id: string;
  format: ExportFormat;
  note_data: NoteTemplateData;
  note_id?: string; // Optional: link export to a note
}

export async function POST(request: NextRequest) {
  try {
    const body: ExportRequestBody = await request.json();
    const { template_id, format, note_data, note_id } = body;

    // Validate required fields
    if (!template_id) {
      return NextResponse.json(
        { error: 'template_id is required' },
        { status: 400 }
      );
    }

    if (!format || !['docx', 'pdf'].includes(format)) {
      return NextResponse.json(
        { error: 'format must be "docx" or "pdf"' },
        { status: 400 }
      );
    }

    if (!note_data) {
      return NextResponse.json(
        { error: 'note_data is required' },
        { status: 400 }
      );
    }

    // Get template from database
    const { data: template, error: templateError } = await supabase
      .from('document_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Download template file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(template.file_key);

    if (downloadError || !fileData) {
      console.error('Error downloading template:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download template file' },
        { status: 500 }
      );
    }

    // Convert blob to ArrayBuffer
    const templateBuffer = await fileData.arrayBuffer();

    // Fill the template
    let fillResult = await fillDocxTemplate({
      templateBuffer,
      data: note_data,
    });

    // If standard fill fails, try raw XML manipulation
    if (!fillResult.success) {
      console.log('Standard fill failed, trying raw XML method...');
      fillResult = await fillDocxTemplateRaw({
        templateBuffer,
        data: note_data,
      });
    }

    if (!fillResult.success || !fillResult.buffer) {
      return NextResponse.json(
        { error: fillResult.error || 'Failed to fill template' },
        { status: 500 }
      );
    }

    // Generate filename
    const patientName = note_data.patientName || note_data.patientLastName || 'Unknown';
    const dateStr = note_data.dateOfService || new Date().toISOString().split('T')[0];
    const sanitizedName = patientName.replace(/[^a-zA-Z0-9]/g, '_');
    const baseFilename = `${sanitizedName}_${template.note_type}_${dateStr}`;

    // If DOCX format, return directly
    if (format === 'docx') {
      // Update note with template reference if note_id provided
      if (note_id) {
        await supabase
          .from('notes')
          .update({
            document_template_id: template_id,
            clinic_name: template.clinic_name,
          })
          .eq('id', note_id);
      }

      return new NextResponse(fillResult.buffer, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${baseFilename}.docx"`,
        },
      });
    }

    // PDF format - need to convert
    if (format === 'pdf') {
      const pdfBuffer = await convertDocxToPdf(fillResult.buffer, baseFilename);

      if (!pdfBuffer) {
        return NextResponse.json(
          { error: 'PDF conversion failed. Please try DOCX export instead.' },
          { status: 500 }
        );
      }

      // Update note with template reference if note_id provided
      if (note_id) {
        await supabase
          .from('notes')
          .update({
            document_template_id: template_id,
            clinic_name: template.clinic_name,
          })
          .eq('id', note_id);
      }

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${baseFilename}.pdf"`,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  } catch (error) {
    console.error('Error in POST /api/document-export:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Convert DOCX to PDF
 *
 * Strategy based on deployment environment:
 * 1. Gotenberg (Docker) - Best fidelity, self-hosted
 * 2. CloudConvert API - Good fidelity, hosted service
 * 3. LibreOffice headless - Good fidelity, requires server
 *
 * For Vercel/serverless: Use external API service
 * For self-hosted: Use Gotenberg Docker container
 */
async function convertDocxToPdf(
  docxBuffer: ArrayBuffer,
  filename: string
): Promise<ArrayBuffer | null> {
  // Try Gotenberg first (if configured)
  if (PDF_CONVERSION_URL) {
    try {
      const formData = new FormData();
      formData.append(
        'files',
        new Blob([docxBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
        `${filename}.docx`
      );

      const response = await fetch(`${PDF_CONVERSION_URL}/forms/libreoffice/convert`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        return await response.arrayBuffer();
      }

      console.error('Gotenberg conversion failed:', response.statusText);
    } catch (error) {
      console.error('Gotenberg conversion error:', error);
    }
  }

  // Try CloudConvert if configured
  const cloudConvertApiKey = process.env.CLOUDCONVERT_API_KEY;
  if (cloudConvertApiKey) {
    try {
      return await convertWithCloudConvert(docxBuffer, filename, cloudConvertApiKey);
    } catch (error) {
      console.error('CloudConvert error:', error);
    }
  }

  // No conversion service available
  console.warn('No PDF conversion service configured. Set PDF_CONVERSION_URL (Gotenberg) or CLOUDCONVERT_API_KEY.');
  return null;
}

/**
 * Convert using CloudConvert API
 */
async function convertWithCloudConvert(
  docxBuffer: ArrayBuffer,
  filename: string,
  apiKey: string
): Promise<ArrayBuffer | null> {
  const baseUrl = 'https://api.cloudconvert.com/v2';

  try {
    // Step 1: Create job
    const jobResponse = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tasks: {
          'import-file': {
            operation: 'import/upload',
          },
          'convert-file': {
            operation: 'convert',
            input: 'import-file',
            output_format: 'pdf',
          },
          'export-file': {
            operation: 'export/url',
            input: 'convert-file',
          },
        },
      }),
    });

    if (!jobResponse.ok) {
      throw new Error('Failed to create CloudConvert job');
    }

    const job = await jobResponse.json();
    const uploadTask = job.data.tasks.find((t: any) => t.name === 'import-file');

    // Step 2: Upload file
    const uploadForm = new FormData();
    Object.entries(uploadTask.result.form.parameters).forEach(([key, value]) => {
      uploadForm.append(key, value as string);
    });
    uploadForm.append(
      'file',
      new Blob([docxBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      `${filename}.docx`
    );

    await fetch(uploadTask.result.form.url, {
      method: 'POST',
      body: uploadForm,
    });

    // Step 3: Wait for job completion
    let exportUrl: string | null = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const statusResponse = await fetch(`${baseUrl}/jobs/${job.data.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const statusData = await statusResponse.json();

      if (statusData.data.status === 'finished') {
        const exportTask = statusData.data.tasks.find(
          (t: any) => t.name === 'export-file'
        );
        exportUrl = exportTask?.result?.files?.[0]?.url;
        break;
      } else if (statusData.data.status === 'error') {
        throw new Error('CloudConvert job failed');
      }
    }

    if (!exportUrl) {
      throw new Error('CloudConvert job timed out');
    }

    // Step 4: Download PDF
    const pdfResponse = await fetch(exportUrl);
    return await pdfResponse.arrayBuffer();
  } catch (error) {
    console.error('CloudConvert error:', error);
    return null;
  }
}
