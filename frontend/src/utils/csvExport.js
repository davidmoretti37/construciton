import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { CATEGORY_LABELS, getSubcategoryLabel } from '../constants/transactionCategories';

const escapeCSV = (value) => {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const buildCSV = (headers, rows) => {
  const headerLine = headers.map(escapeCSV).join(',');
  const dataLines = rows.map((row) => row.map(escapeCSV).join(','));
  return [headerLine, ...dataLines].join('\n');
};

const shareCSV = async (csv, filename) => {
  const fileUri = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(fileUri, csv);
  await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return dateStr;
};

/**
 * Export project transactions as CSV
 */
export const exportTransactionsCSV = async (transactions, projects = [], filename = 'transactions.csv') => {
  const projectMap = {};
  projects.forEach((p) => { projectMap[p.id] = p.name || 'Unknown Project'; });

  const headers = ['Date', 'Project', 'Type', 'Category', 'Subcategory', 'Description', 'Amount', 'Payment Method', 'Notes'];
  const rows = transactions.map((t) => [
    formatDate(t.date),
    projectMap[t.project_id] || t.project_id || '',
    t.type === 'income' ? 'Income' : 'Expense',
    CATEGORY_LABELS[t.category] || t.category || '',
    getSubcategoryLabel(t.subcategory) || '',
    t.description || '',
    parseFloat(t.amount || 0).toFixed(2),
    t.payment_method || '',
    t.notes || '',
  ]);

  const csv = buildCSV(headers, rows);
  await shareCSV(csv, filename);
};

/**
 * Export invoices as CSV
 */
export const exportInvoicesCSV = async (invoices, filename = 'invoices.csv') => {
  const today = new Date();
  const headers = ['Invoice #', 'Client', 'Project', 'Date Created', 'Due Date', 'Total', 'Amount Paid', 'Balance', 'Status', 'Days Overdue'];
  const rows = invoices.map((inv) => {
    const dueDate = inv.due_date ? new Date(inv.due_date + 'T12:00:00') : null;
    const daysOverdue = dueDate && inv.status !== 'paid' && inv.status !== 'cancelled'
      ? Math.max(0, Math.floor((today - dueDate) / (1000 * 60 * 60 * 24)))
      : 0;
    const total = parseFloat(inv.total || 0);
    const paid = parseFloat(inv.amount_paid || 0);

    return [
      inv.invoice_number || '',
      inv.client_name || '',
      inv.project_name || '',
      formatDate(inv.created_at?.split('T')[0]),
      formatDate(inv.due_date),
      total.toFixed(2),
      paid.toFixed(2),
      (total - paid).toFixed(2),
      (inv.status || 'unpaid').toUpperCase(),
      daysOverdue > 0 ? daysOverdue : '',
    ];
  });

  const csv = buildCSV(headers, rows);
  await shareCSV(csv, filename);
};

/**
 * Export payroll summary as CSV
 */
export const exportPayrollCSV = async (payrollData, periodLabel = '', filename = 'payroll.csv') => {
  const headers = ['Worker', 'Trade', 'Project', 'Hours', 'Rate', 'Gross Pay', 'Period'];
  const rows = payrollData.map((w) => [
    w.workerName || '',
    w.trade || '',
    w.projectName || '',
    w.hours != null ? parseFloat(w.hours).toFixed(1) : '',
    w.rate != null ? parseFloat(w.rate).toFixed(2) : '',
    parseFloat(w.grossPay || 0).toFixed(2),
    periodLabel,
  ]);

  const csv = buildCSV(headers, rows);
  await shareCSV(csv, filename);
};

/**
 * Export 1099 contractor data as CSV
 */
export const export1099CSV = async (contractors, taxYear, filename = '1099-contractors.csv') => {
  const headers = ['Contractor Name', 'Total Paid', '1099 Required', 'Tax Year'];
  const rows = contractors.map((c) => [
    c.name || '',
    parseFloat(c.totalPaid || 0).toFixed(2),
    c.totalPaid >= 600 ? 'Yes' : 'No',
    taxYear,
  ]);

  const csv = buildCSV(headers, rows);
  await shareCSV(csv, filename);
};
