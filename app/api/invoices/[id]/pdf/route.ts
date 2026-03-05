import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { jsPDF } from 'jspdf';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Fetch invoice with lines
  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .select('*, invoice_lines(*)')
    .eq('id', id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  // Fetch patient
  const { data: patient } = await supabaseAdmin
    .from('patients')
    .select('first_name, last_name, date_of_birth, phone, email')
    .eq('id', invoice.patient_id)
    .single();

  // Fetch clinic
  const { data: clinic } = await supabaseAdmin
    .from('clinics')
    .select('name, billing_address, billing_city, billing_state, billing_zip, phone')
    .eq('id', invoice.clinic_id)
    .single();

  // Generate PDF
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header - Clinic Info
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(clinic?.name || 'Clinic', 14, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  if (clinic?.billing_address) {
    doc.text(clinic.billing_address, 14, y);
    y += 5;
  }
  if (clinic?.billing_city) {
    doc.text(`${clinic.billing_city}, ${clinic.billing_state || ''} ${clinic.billing_zip || ''}`, 14, y);
    y += 5;
  }

  // Invoice title
  y += 5;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', pageWidth - 14, 20, { align: 'right' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice #: ${invoice.invoice_number || invoice.id.slice(0, 8)}`, pageWidth - 14, 28, { align: 'right' });
  doc.text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`, pageWidth - 14, 34, { align: 'right' });
  if (invoice.due_date) {
    doc.text(`Due: ${new Date(invoice.due_date).toLocaleDateString()}`, pageWidth - 14, 40, { align: 'right' });
  }
  doc.text(`Status: ${invoice.status.toUpperCase()}`, pageWidth - 14, 46, { align: 'right' });

  // Patient Info
  y += 5;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  if (patient) {
    doc.text(`${patient.first_name} ${patient.last_name}`, 14, y);
    y += 5;
    if (patient.phone) {
      doc.text(`Phone: ${patient.phone}`, 14, y);
      y += 5;
    }
  }

  // Line separator
  y += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, pageWidth - 14, y);
  y += 8;

  // Table Header
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('CPT Code', 14, y);
  doc.text('Description', 45, y);
  doc.text('Units', 130, y, { align: 'right' });
  doc.text('Rate', 155, y, { align: 'right' });
  doc.text('Total', pageWidth - 14, y, { align: 'right' });
  y += 3;
  doc.line(14, y, pageWidth - 14, y);
  y += 5;

  // Line Items
  doc.setFont('helvetica', 'normal');
  const lines = invoice.invoice_lines || [];
  for (const line of lines) {
    doc.text(line.cpt_code || '-', 14, y);
    const desc = (line.description || '').slice(0, 50);
    doc.text(desc, 45, y);
    doc.text(String(line.units || 1), 130, y, { align: 'right' });
    doc.text(`$${(line.rate_per_unit || 0).toFixed(2)}`, 155, y, { align: 'right' });
    doc.text(`$${(line.line_total || 0).toFixed(2)}`, pageWidth - 14, y, { align: 'right' });
    y += 6;

    if (y > 260) {
      doc.addPage();
      y = 20;
    }
  }

  // Totals
  y += 3;
  doc.line(14, y, pageWidth - 14, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Total Due:', 130, y, { align: 'right' });
  doc.text(`$${(invoice.amount_due || 0).toFixed(2)}`, pageWidth - 14, y, { align: 'right' });
  y += 6;

  if (invoice.amount_paid > 0) {
    doc.setFont('helvetica', 'normal');
    doc.text('Amount Paid:', 130, y, { align: 'right' });
    doc.text(`$${(invoice.amount_paid || 0).toFixed(2)}`, pageWidth - 14, y, { align: 'right' });
    y += 6;
    doc.setFont('helvetica', 'bold');
    const balance = (invoice.amount_due || 0) - (invoice.amount_paid || 0);
    doc.text('Balance:', 130, y, { align: 'right' });
    doc.text(`$${balance.toFixed(2)}`, pageWidth - 14, y, { align: 'right' });
  }

  // Notes
  if (invoice.notes) {
    y += 12;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text(`Notes: ${invoice.notes}`, 14, y);
  }

  // Output
  const pdfOutput = doc.output('arraybuffer');

  return new NextResponse(pdfOutput, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${invoice.invoice_number || id.slice(0, 8)}.pdf"`,
    },
  });
}
