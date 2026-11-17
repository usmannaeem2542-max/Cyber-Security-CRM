import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CurrencyCode, Quote } from '../types/crm';
import { api } from './api';
import { formatMoney } from './currency';

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportToCsv(
  moduleName: string,
  filename: string,
  headers: string[],
  rows: Array<Array<unknown>>
) {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  try {
    await api('/audit/export', {
      method: 'POST',
      body: JSON.stringify({ module: moduleName, format: 'CSV', recordCount: rows.length }),
    });
  } catch {
    // Non-blocking audit log
  }
}

export async function exportTablePdf(
  moduleName: string,
  title: string,
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
) {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('SentinelShield Cyber — Executive Report', 14, 11);
  doc.setFontSize(9);
  doc.text(`${title}  |  Generated: ${new Date().toLocaleString()}`, 14, 18);

  autoTable(doc, {
    startY: 30,
    head: [headers],
    body: rows,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(filename);

  try {
    await api('/audit/export', {
      method: 'POST',
      body: JSON.stringify({ module: moduleName, format: 'PDF', recordCount: rows.length }),
    });
  } catch {
    // Non-blocking audit log
  }
}

export async function exportQuotePdf(quote: Quote, displayCurrency: CurrencyCode) {
  const doc = new jsPDF();

  // Branded cybersecurity header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('SENTINELSHIELD CYBER', 14, 15);
  doc.setFontSize(9);
  doc.text('Offensive Security · Managed SOC/MDR · GRC Compliance', 14, 22);
  doc.text(`Commercial Proposal  |  ${quote.quoteNumber}`, 14, 28);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text(quote.title, 14, 46);

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Prepared For: ${quote.account?.name || 'Client Account'}`, 14, 54);
  doc.text(`Deal Reference: ${quote.deal?.title || 'N/A'}`, 14, 60);
  doc.text(`Status: ${quote.status}`, 14, 66);
  doc.text(`Valid Until: ${new Date(quote.validUntil).toLocaleDateString()}`, 140, 54);
  doc.text(`Prepared By: ${quote.owner?.name || 'Sales Team'}`, 140, 60);

  autoTable(doc, {
    startY: 74,
    head: [['Service / Deliverable', 'Unit', 'Qty', 'Unit Price', 'Line Total']],
    body: quote.items.map((item) => [
      item.description,
      item.unitType.replace(/_/g, ' '),
      String(item.quantity),
      formatMoney(item.unitPrice, quote.currency, displayCurrency),
      formatMoney(item.total, quote.currency, displayCurrency),
    ]),
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 3 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 130;

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Subtotal: ${formatMoney(quote.subtotal, quote.currency, displayCurrency)}`, 135, finalY + 12);
  doc.text(`Discount: ${quote.discountPercent}%`, 135, finalY + 18);
  doc.text(`VAT / Tax: ${quote.taxPercent}%`, 135, finalY + 24);
  doc.setFontSize(12);
  doc.text(`Total: ${formatMoney(quote.total, quote.currency, displayCurrency)}`, 135, finalY + 32);

  if (quote.terms) {
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('Commercial Terms & Conditions:', 14, finalY + 44);
    const splitTerms = doc.splitTextToSize(quote.terms, 180);
    doc.text(splitTerms, 14, finalY + 50);
  }

  doc.save(`${quote.quoteNumber}.pdf`);

  try {
    await api('/audit/export', {
      method: 'POST',
      body: JSON.stringify({ module: 'Quote', format: 'PDF', recordCount: 1 }),
    });
  } catch {
    // Non-blocking audit log
  }
}
