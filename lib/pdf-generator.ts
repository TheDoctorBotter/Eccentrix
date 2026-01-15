import { jsPDF } from 'jspdf';
import { Note, NOTE_TYPE_LABELS, BrandingSettings } from './types';
import { format } from 'date-fns';

interface PDFGenerationOptions {
  note: Note;
  branding?: BrandingSettings | null;
  withBranding?: boolean;
}

interface ImageData {
  dataURL: string;
  format: 'PNG' | 'JPEG';
}

async function loadImageAsDataURL(url: string): Promise<ImageData> {
  try {
    const proxyUrl = `/api/branding/image?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const blob = await response.blob();

    let format: 'PNG' | 'JPEG' = 'PNG';
    if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
      format = 'JPEG';
    } else if (contentType.includes('image/webp')) {
      const convertedBlob = await convertWebPToPNG(blob);
      const dataURL = await blobToDataURL(convertedBlob);
      return { dataURL, format: 'PNG' };
    }

    const dataURL = await blobToDataURL(blob);
    return { dataURL, format };
  } catch (error) {
    console.error('Error loading image:', error);
    throw error;
  }
}

async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function convertWebPToPNG(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          resolve(pngBlob);
        } else {
          reject(new Error('Failed to convert WebP to PNG'));
        }
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load WebP image'));
    };

    img.src = url;
  });
}

export async function generateNotePDF({
  note,
  branding,
  withBranding = false,
}: PDFGenerationOptions): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPosition = margin;

  const addText = (
    text: string,
    fontSize: number,
    isBold = false,
    color: [number, number, number] = [0, 0, 0]
  ) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, contentWidth);

    lines.forEach((line: string) => {
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin, yPosition);
      yPosition += fontSize * 0.5;
    });

    return yPosition;
  };

  const addLine = (thickness = 0.5, color: [number, number, number] = [200, 200, 200]) => {
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(thickness);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 5;
  };

  try {
    if (withBranding && branding) {
      if (branding.letterhead_url) {
        try {
          const imageData = await loadImageAsDataURL(branding.letterhead_url);
          const imgWidth = contentWidth;
          const imgHeight = 40;
          doc.addImage(imageData.dataURL, imageData.format, margin, yPosition, imgWidth, imgHeight);
          yPosition += imgHeight + 10;
        } catch (error) {
          console.error('Failed to load letterhead, continuing without it:', error);
        }
      } else if (branding.logo_url) {
        try {
          const imageData = await loadImageAsDataURL(branding.logo_url);
          const logoSize = 25;
          doc.addImage(imageData.dataURL, imageData.format, margin, yPosition, logoSize, logoSize);

          let textX = margin + logoSize + 10;
          let textY = yPosition;

          if (branding.clinic_name) {
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text(branding.clinic_name, textX, textY + 7);
            textY += 10;
          }

          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 100, 100);

          if (branding.address) {
            const addressLines = doc.splitTextToSize(branding.address, contentWidth - logoSize - 10);
            addressLines.forEach((line: string, index: number) => {
              doc.text(line, textX, textY + (index * 4));
            });
            textY += addressLines.length * 4 + 2;
          }

          if (branding.phone) {
            doc.text(`Phone: ${branding.phone}`, textX, textY);
            textY += 4;
          }

          if (branding.email) {
            doc.text(`Email: ${branding.email}`, textX, textY);
            textY += 4;
          }

          if (branding.website) {
            doc.text(`Web: ${branding.website}`, textX, textY);
          }

          yPosition += Math.max(logoSize, textY - yPosition) + 5;
        } catch (error) {
          console.error('Failed to load logo, continuing without it:', error);
        }
      } else if (branding.clinic_name) {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(branding.clinic_name, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);

        if (branding.address) {
          doc.text(branding.address, pageWidth / 2, yPosition, { align: 'center' });
          yPosition += 5;
        }

        const contactInfo: string[] = [];
        if (branding.phone) contactInfo.push(`Phone: ${branding.phone}`);
        if (branding.email) contactInfo.push(`Email: ${branding.email}`);
        if (branding.website) contactInfo.push(`Web: ${branding.website}`);

        if (contactInfo.length > 0) {
          doc.text(contactInfo.join(' | '), pageWidth / 2, yPosition, { align: 'center' });
          yPosition += 5;
        }
      }

      addLine(1, [30, 41, 59]);
      yPosition += 3;
    }

    doc.setFillColor(254, 243, 199);
    doc.rect(margin, yPosition, contentWidth, 12, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9);
    doc.text('DRAFT DOCUMENTATION - This note must be reviewed and approved by a licensed clinician before use.',
      pageWidth / 2, yPosition + 7, { align: 'center' });
    yPosition += 17;

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(NOTE_TYPE_LABELS[note.note_type], margin, yPosition);
    yPosition += 10;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${format(new Date(note.created_at), 'MMMM d, yyyy h:mm a')}`, margin, yPosition);
    yPosition += 10;

    if (note.input_data?.patientDemographic) {
      const demographic = note.input_data.patientDemographic;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('PATIENT DEMOGRAPHIC', margin, yPosition);
      yPosition += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);

      if (demographic.patientName) {
        doc.text(`Name: ${demographic.patientName}`, margin, yPosition);
        yPosition += 5;
      }

      if (demographic.dateOfBirth) {
        doc.text(`DOB: ${demographic.dateOfBirth}`, margin, yPosition);
        yPosition += 5;
      }

      if (demographic.diagnosis) {
        doc.text(`Diagnosis: ${demographic.diagnosis}`, margin, yPosition);
        yPosition += 5;
      }

      if (demographic.referralSource) {
        doc.text(`Referral Source: ${demographic.referralSource}`, margin, yPosition);
        yPosition += 5;
      }

      yPosition += 5;
    }

    addLine();
    yPosition += 3;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    const noteLines = note.output_text.split('\n');
    noteLines.forEach((line: string) => {
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }

      const wrappedLines = doc.splitTextToSize(line || ' ', contentWidth);
      wrappedLines.forEach((wrappedLine: string) => {
        if (yPosition > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(wrappedLine, margin, yPosition);
        yPosition += 5;
      });
    });

    if (note.billing_justification) {
      yPosition += 5;
      if (yPosition > pageHeight - margin - 20) {
        doc.addPage();
        yPosition = margin;
      }

      addLine();
      yPosition += 3;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('BILLING/SKILLED JUSTIFICATION', margin, yPosition);
      yPosition += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);

      const justificationLines = doc.splitTextToSize(note.billing_justification, contentWidth);
      justificationLines.forEach((line: string) => {
        if (yPosition > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(line, margin, yPosition);
        yPosition += 5;
      });
    }

    if (note.hep_summary) {
      yPosition += 5;
      if (yPosition > pageHeight - margin - 20) {
        doc.addPage();
        yPosition = margin;
      }

      addLine();
      yPosition += 3;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('HEP SUMMARY', margin, yPosition);
      yPosition += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);

      const hepLines = doc.splitTextToSize(note.hep_summary, contentWidth);
      hepLines.forEach((line: string) => {
        if (yPosition > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }
        doc.text(line, margin, yPosition);
        yPosition += 5;
      });
    }

    const patientName = note.input_data?.patientDemographic?.patientName || 'patient';
    const safePatientName = patientName.replace(/[^a-zA-Z0-9-]/g, '_');
    const dateStr = format(new Date(note.created_at), 'yyyy-MM-dd');
    const noteTypeStr = note.note_type === 'daily_soap' ? 'DailySoap' : 'PTEvaluation';
    const filename = `${noteTypeStr}-${safePatientName}-${dateStr}.pdf`;

    doc.save(filename);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF. Please try again.');
  }
}
