import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORIES,
  getSubcategoryLabel,
} from '../constants/transactionCategories';

const CATEGORY_LABELS_PT = {
  labor: 'Mão de Obra',
  materials: 'Materiais',
  equipment: 'Equipamentos',
  permits: 'Licenças e Alvarás',
  subcontractor: 'Subempreiteiros',
  misc: 'Diversos',
};

const ACCENT = '#1E40AF';
const SUCCESS = '#10B981';
const ERROR = '#EF4444';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Math.abs(amount));
};

const formatCurrencyWithSign = (amount) => {
  if (amount < 0) return `(${formatCurrency(amount)})`;
  return formatCurrency(amount);
};

const formatCostAmount = (amount) => {
  return `(${formatCurrency(amount)})`;
};

const escapeHtml = (str) => {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

// ============================================================
// Shared CSS used by both company and project PDFs
// ============================================================

const getSharedCSS = (profitColor) => `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 11px; line-height: 1.6; color: #000; padding: 50px 60px; background: #fff;
    }
    .report-header { margin-bottom: 35px; border-bottom: 3px solid ${ACCENT}; padding-bottom: 18px; }
    .report-title { font-size: 20px; font-weight: 700; color: ${ACCENT}; letter-spacing: -0.3px; margin-bottom: 2px; }
    .report-subtitle { font-size: 13px; font-weight: 400; color: #666; margin-bottom: 10px; }
    .report-meta { font-size: 10px; color: #666; line-height: 1.6; }
    .report-meta strong { color: #000; font-weight: 600; }
    .section-title { font-size: 12px; font-weight: 700; color: #000; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; margin-top: 28px; }

    /* DRE Table */
    .dre-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
    .dre-table td { padding: 7px 0; font-size: 11px; vertical-align: middle; }
    .dre-table .amount { text-align: right; font-variant-numeric: tabular-nums; width: 130px; }
    .dre-table .label { font-weight: 600; color: #000; }
    .dre-table .revenue-row td { font-weight: 600; font-size: 12px; color: ${SUCCESS}; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; }
    .dre-table .revenue-row .label { color: #000; }
    .dre-table .income-detail td { color: #444; font-size: 10px; }
    .dre-table .income-detail .indent { padding-left: 24px; }
    .dre-table .income-detail .amount { color: ${SUCCESS}; }
    .dre-table .cost-header td { font-weight: 600; color: #000; padding-top: 14px; padding-bottom: 4px; }
    .dre-table .cost-detail td { color: #444; font-size: 10.5px; }
    .dre-table .cost-detail .indent { padding-left: 24px; }
    .dre-table .cost-detail .amount { color: ${ERROR}; }
    .dre-table .cost-sub td { color: #777; font-size: 9.5px; }
    .dre-table .cost-sub .sub-indent { padding-left: 44px; }
    .dre-table .cost-sub .amount { color: ${ERROR}; }
    .dre-table .total-costs-row td { font-weight: 600; border-top: 1px solid #d1d5db; padding-top: 10px; }
    .dre-table .total-costs-row .amount { color: ${ERROR}; }
    .dre-table .separator td { border-bottom: 2px solid #000; padding: 6px 0; }
    .dre-table .profit-row td { font-weight: 700; font-size: 13px; padding-top: 10px; }
    .dre-table .profit-row .amount { color: ${profitColor}; }
    .dre-table .margin-row td { font-size: 11px; padding-top: 4px; }
    .dre-table .margin-row .amount { font-weight: 600; }
    .health-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; color: #fff; margin-left: 8px; }

    /* Breakdown bar */
    .breakdown-section { margin-bottom: 25px; }
    .cost-bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 10px; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; }
    .legend-item { display: flex; align-items: center; gap: 5px; font-size: 10px; }
    .legend-dot { width: 8px; height: 8px; border-radius: 4px; flex-shrink: 0; }
    .legend-label { color: #666; }
    .legend-value { color: #000; font-weight: 500; font-variant-numeric: tabular-nums; }

    /* Project cards */
    .projects-section { margin-top: 30px; }
    .project-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 18px; margin-bottom: 12px; page-break-inside: avoid; }
    .project-name { font-size: 13px; font-weight: 600; color: #000; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid #f3f4f6; }
    .project-stats { display: flex; flex-direction: column; gap: 4px; }
    .stat-row { display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; }
    .stat-label { color: #666; }
    .stat-value { font-weight: 500; color: #000; font-variant-numeric: tabular-nums; }
    .profit-row { margin-top: 4px; padding-top: 5px; border-top: 1px solid #e5e7eb; }
    .margin-badge { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 9px; font-weight: 700; margin-left: 6px; }
    .mini-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 8px; }
    .budget-row { display: flex; justify-content: space-between; margin-top: 8px; margin-bottom: 3px; }
    .budget-label { font-size: 9px; color: #666; }
    .budget-pct { font-size: 9px; font-weight: 600; }
    .budget-track { height: 6px; background: #f3f4f6; border-radius: 3px; overflow: hidden; }
    .budget-fill { height: 100%; border-radius: 3px; }

    /* Transaction detail table */
    .detail-section { margin-top: 30px; }
    .detail-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9.5px; }
    .detail-table th { text-align: left; font-weight: 600; font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.3px; padding: 6px 8px; border-bottom: 2px solid #e5e7eb; }
    .detail-table th.amount-col { text-align: right; }
    .detail-table td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .detail-table td.amount-cell { text-align: right; font-variant-numeric: tabular-nums; }
    .detail-table .cat-header td { font-weight: 600; font-size: 10px; background: #f9fafb; padding: 8px 8px; border-bottom: 1px solid #e5e7eb; }
    .detail-table .cat-header .cat-dot { display: inline-block; width: 8px; height: 8px; border-radius: 4px; margin-right: 6px; vertical-align: middle; }
    .detail-table .subtotal-row td { font-weight: 600; border-top: 1px solid #d1d5db; border-bottom: 2px solid #e5e7eb; padding: 6px 8px; }
    .receipt-badge { display: inline-block; background: #DBEAFE; color: ${ACCENT}; font-size: 8px; font-weight: 600; padding: 1px 5px; border-radius: 4px; }

    /* Footer */
    .report-footer { margin-top: 35px; padding-top: 14px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 9px; color: #999; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

// ============================================================
// Helper: Build subcategory rows for DRE table
// ============================================================

const buildCostRows = (costBreakdown, subcategoryBreakdown = {}) => {
  return CATEGORIES.map((cat) => {
    const amount = costBreakdown[cat] || 0;
    if (amount === 0) return '';

    // Main category row
    let rows = `
      <tr class="cost-detail">
        <td class="indent">${CATEGORY_LABELS_PT[cat]} (${CATEGORY_LABELS[cat]})</td>
        <td class="amount">${formatCostAmount(amount)}</td>
      </tr>
    `;

    // Subcategory detail rows (if any)
    const subs = subcategoryBreakdown[cat];
    if (subs && Object.keys(subs).length > 0) {
      const sorted = Object.entries(subs).sort(([, a], [, b]) => b - a);
      sorted.forEach(([sub, subAmt]) => {
        rows += `
          <tr class="cost-sub">
            <td class="sub-indent">${escapeHtml(getSubcategoryLabel(sub))}</td>
            <td class="amount">${formatCostAmount(subAmt)}</td>
          </tr>
        `;
      });
    }

    return rows;
  }).join('');
};

// ============================================================
// Helper: Build income detail rows
// ============================================================

const buildIncomeRows = (incomeBreakdown = {}) => {
  const entries = Object.entries(incomeBreakdown).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return '';
  return entries.map(([sub, amt]) => `
    <tr class="income-detail">
      <td class="indent">${escapeHtml(getSubcategoryLabel(sub))}</td>
      <td class="amount" style="color: ${SUCCESS};">${formatCurrency(amt)}</td>
    </tr>
  `).join('');
};

// ============================================================
// Helper: Build transaction detail table
// ============================================================

const buildTransactionDetailHTML = (transactions = [], projectsMap = null) => {
  if (!transactions || transactions.length === 0) return '';

  const expenses = transactions.filter(t => t.type === 'expense');
  const income = transactions.filter(t => t.type === 'income');

  let html = '';

  // Expense transactions grouped by category
  const byCategory = {};
  expenses.forEach(t => {
    const cat = CATEGORIES.includes(t.category) ? t.category : 'misc';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(t);
  });

  const activeCats = CATEGORIES.filter(c => byCategory[c] && byCategory[c].length > 0);

  if (activeCats.length > 0) {
    html += `
      <div class="detail-section" style="page-break-before: always;">
        <div class="section-title">Expense Detail</div>
        <table class="detail-table">
          <thead><tr>
            <th>Date</th>
            ${projectsMap ? '<th>Project</th>' : ''}
            <th>Description</th>
            <th>Subcategory</th>
            <th>Payment</th>
            <th class="amount-col">Amount</th>
            <th>Rcpt</th>
          </tr></thead>
          <tbody>
    `;

    activeCats.forEach(cat => {
      const catTxs = byCategory[cat].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const catTotal = catTxs.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

      html += `<tr class="cat-header"><td colspan="${projectsMap ? 7 : 6}"><span class="cat-dot" style="background:${CATEGORY_COLORS[cat]};"></span>${CATEGORY_LABELS[cat]}</td></tr>`;

      catTxs.forEach(t => {
        const projName = projectsMap ? (projectsMap[t.project_id] || '') : '';
        html += `<tr>
          <td>${t.date || ''}</td>
          ${projectsMap ? `<td>${escapeHtml(projName)}</td>` : ''}
          <td>${escapeHtml(t.description || '-')}</td>
          <td>${escapeHtml(getSubcategoryLabel(t.subcategory) || '-')}</td>
          <td>${escapeHtml(t.payment_method || '-')}</td>
          <td class="amount-cell" style="color:${ERROR};">${formatCostAmount(parseFloat(t.amount) || 0)}</td>
          <td>${t.receipt_url ? '<span class="receipt-badge">Yes</span>' : ''}</td>
        </tr>`;
      });

      html += `<tr class="subtotal-row">
        <td colspan="${projectsMap ? 5 : 4}" style="text-align:right;">${CATEGORY_LABELS[cat]} Subtotal</td>
        <td class="amount-cell" style="color:${ERROR};">${formatCostAmount(catTotal)}</td>
        <td></td>
      </tr>`;
    });

    html += '</tbody></table></div>';
  }

  // Income transactions
  if (income.length > 0) {
    const incomeTotal = income.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const sortedIncome = [...income].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    html += `
      <div class="detail-section">
        <div class="section-title">Income Detail</div>
        <table class="detail-table">
          <thead><tr>
            <th>Date</th>
            ${projectsMap ? '<th>Project</th>' : ''}
            <th>Description</th>
            <th>Type</th>
            <th>Payment</th>
            <th class="amount-col">Amount</th>
          </tr></thead>
          <tbody>
    `;

    sortedIncome.forEach(t => {
      const projName = projectsMap ? (projectsMap[t.project_id] || '') : '';
      html += `<tr>
        <td>${t.date || ''}</td>
        ${projectsMap ? `<td>${escapeHtml(projName)}</td>` : ''}
        <td>${escapeHtml(t.description || '-')}</td>
        <td>${escapeHtml(getSubcategoryLabel(t.subcategory) || '-')}</td>
        <td>${escapeHtml(t.payment_method || '-')}</td>
        <td class="amount-cell" style="color:${SUCCESS};">${formatCurrency(parseFloat(t.amount) || 0)}</td>
      </tr>`;
    });

    html += `<tr class="subtotal-row">
      <td colspan="${projectsMap ? 5 : 4}" style="text-align:right;">Total Income</td>
      <td class="amount-cell" style="color:${SUCCESS};">${formatCurrency(incomeTotal)}</td>
    </tr>`;

    html += '</tbody></table></div>';
  }

  return html;
};

// ============================================================
// COMPANY-WIDE P&L PDF (enhanced with subcategories + detail)
// ============================================================

export const generateFinancialReportHTML = (reportData) => {
  const {
    periodLabel = 'All Time',
    totalRevenue = 0,
    totalCosts = 0,
    grossProfit = 0,
    grossMargin = 0,
    totalContractValue = 0,
    costBreakdown = {},
    subcategoryBreakdown = {},
    incomeBreakdown = {},
    projectBreakdowns = [],
    transactions = [],
    businessName = '',
    businessAddress = '',
    businessPhone = '',
  } = reportData;

  const generatedDate = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const marginHealth = grossMargin >= 20 ? 'Healthy' : grossMargin >= 10 ? 'Moderate' : 'At Risk';
  const marginHealthColor = grossMargin >= 20 ? SUCCESS : grossMargin >= 10 ? '#F59E0B' : ERROR;
  const profitColor = grossProfit >= 0 ? SUCCESS : ERROR;

  // Cost rows with subcategory detail
  const costCategoryRows = buildCostRows(costBreakdown, subcategoryBreakdown);

  // Income detail rows
  const incomeDetailRows = buildIncomeRows(incomeBreakdown);

  // Cost breakdown bar
  const activeCosts = CATEGORIES.filter((cat) => (costBreakdown[cat] || 0) > 0);
  const costBarSegments = activeCosts
    .sort((a, b) => (costBreakdown[b] || 0) - (costBreakdown[a] || 0))
    .map((cat) => {
      const pct = totalCosts > 0 ? ((costBreakdown[cat] || 0) / totalCosts) * 100 : 0;
      return `<div style="flex: ${pct}; background: ${CATEGORY_COLORS[cat]}; height: 100%;"></div>`;
    }).join('');

  const costLegendItems = activeCosts
    .sort((a, b) => (costBreakdown[b] || 0) - (costBreakdown[a] || 0))
    .map((cat) => {
      const amount = costBreakdown[cat] || 0;
      const pct = totalCosts > 0 ? ((amount / totalCosts) * 100).toFixed(1) : '0.0';
      return `<div class="legend-item"><div class="legend-dot" style="background: ${CATEGORY_COLORS[cat]};"></div><span class="legend-label">${CATEGORY_LABELS[cat]}</span><span class="legend-value">${formatCurrency(amount)} (${pct}%)</span></div>`;
    }).join('');

  // Per-project cards
  const sortedProjects = [...projectBreakdowns].sort((a, b) => (b.expenses || 0) - (a.expenses || 0));
  const projectCards = sortedProjects.map((p) => {
    const pProfitColor = (p.grossProfit || 0) >= 0 ? SUCCESS : ERROR;
    const budgetUsed = p.budgetUsed || 0;
    const budgetColor = budgetUsed > 100 ? ERROR : budgetUsed > 85 ? '#F59E0B' : SUCCESS;
    const pCosts = p.expenses || 0;
    const pCategories = CATEGORIES.filter((cat) => (p.costBreakdown?.[cat] || 0) > 0);
    const pCostBar = pCosts > 0 && pCategories.length > 0
      ? `<div class="mini-bar">${pCategories.sort((a, b) => (p.costBreakdown[b] || 0) - (p.costBreakdown[a] || 0)).map((cat) => `<div style="flex: ${((p.costBreakdown[cat] || 0) / pCosts) * 100}; background: ${CATEGORY_COLORS[cat]}; height: 100%;"></div>`).join('')}</div>` : '';
    const budgetBar = p.budget > 0 ? `<div class="budget-row"><span class="budget-label">Budget Used</span><span class="budget-pct" style="color: ${budgetColor};">${budgetUsed.toFixed(0)}%</span></div><div class="budget-track"><div class="budget-fill" style="width: ${Math.min(budgetUsed, 100)}%; background: ${budgetColor};"></div></div>` : '';

    return `<div class="project-card"><div class="project-name">${escapeHtml(p.name || 'Untitled Project')}</div><div class="project-stats"><div class="stat-row"><span class="stat-label">Contract</span><span class="stat-value">${formatCurrency(p.contractAmount || 0)}</span></div><div class="stat-row"><span class="stat-label">Collected</span><span class="stat-value" style="color: ${SUCCESS};">${formatCurrency(p.incomeCollected || 0)}</span></div><div class="stat-row"><span class="stat-label">Expenses</span><span class="stat-value" style="color: ${ERROR};">${formatCostAmount(p.expenses || 0)}</span></div><div class="stat-row profit-row"><span class="stat-label" style="font-weight: 600;">Gross Profit</span><span class="stat-value" style="color: ${pProfitColor}; font-weight: 700;">${formatCurrencyWithSign(p.grossProfit || 0)}<span class="margin-badge" style="background: ${pProfitColor}18; color: ${pProfitColor};">${(p.grossMargin || 0).toFixed(1)}%</span></span></div></div>${pCostBar}${budgetBar}</div>`;
  }).join('');

  // Projects map for transaction detail
  const projectsMap = {};
  projectBreakdowns.forEach(p => { projectsMap[p.id] = p.name; });

  // Transaction detail section
  const transactionDetailHTML = buildTransactionDetailHTML(transactions, projectsMap);

  // Outstanding calculation
  const totalOutstanding = projectBreakdowns.reduce((sum, p) => sum + Math.max((p.contractAmount || 0) - (p.incomeCollected || 0), 0), 0);
  const projectsWithOutstanding = projectBreakdowns.filter(p => (p.contractAmount || 0) - (p.incomeCollected || 0) > 0).length;

  // Executive summary
  const marginAssessment = grossMargin >= 20
    ? `Gross margin of ${grossMargin.toFixed(1)}% is healthy.`
    : grossMargin >= 10
      ? `Gross margin of ${grossMargin.toFixed(1)}% is moderate — consider reviewing cost categories.`
      : `Gross margin of ${grossMargin.toFixed(1)}% is below target — immediate cost review recommended.`;
  const outstandingNote = totalOutstanding > 0
    ? ` ${formatCurrency(totalOutstanding)} outstanding across ${projectsWithOutstanding} project${projectsWithOutstanding > 1 ? 's' : ''}.`
    : '';

  // Project comparison table
  const projectComparisonRows = sortedProjects.map(p => {
    const pColor = (p.grossProfit || 0) >= 0 ? SUCCESS : ERROR;
    return `<tr>
      <td style="font-weight: 500;">${escapeHtml(p.name || 'Untitled')}</td>
      <td class="amount-cell">${formatCurrency(p.contractAmount || 0)}</td>
      <td class="amount-cell" style="color: ${SUCCESS};">${formatCurrency(p.incomeCollected || 0)}</td>
      <td class="amount-cell" style="color: ${ERROR};">${formatCostAmount(p.expenses || 0)}</td>
      <td class="amount-cell" style="color: ${pColor}; font-weight: 600;">${formatCurrencyWithSign(p.grossProfit || 0)}</td>
      <td class="amount-cell" style="color: ${pColor}; font-weight: 600;">${(p.grossMargin || 0).toFixed(1)}%</td>
    </tr>`;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>P&L Report - ${periodLabel}</title>
  <style>
    ${getSharedCSS(profitColor)}
    .company-header { font-size: 11px; color: #666; margin-bottom: 4px; }
    .company-name { font-size: 14px; font-weight: 700; color: #000; margin-bottom: 2px; }
    .exec-summary { background: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid ${ACCENT}; border-radius: 6px; padding: 12px 16px; margin-bottom: 25px; font-size: 11px; line-height: 1.6; color: #334155; }
    .comparison-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
    .comparison-table th { text-align: left; font-weight: 600; font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.3px; padding: 8px 6px; border-bottom: 2px solid #e5e7eb; }
    .comparison-table th.amount-col { text-align: right; }
    .comparison-table td { padding: 7px 6px; border-bottom: 1px solid #f3f4f6; }
    .comparison-table td.amount-cell { text-align: right; font-variant-numeric: tabular-nums; }
    .comparison-table .total-row td { font-weight: 700; border-top: 2px solid #e5e7eb; padding-top: 8px; }
    @page { @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 9px; color: #999; } }
  </style>
</head>
<body>
  <div class="report-header">
    ${businessName ? `<div class="company-name">${escapeHtml(businessName)}</div>` : ''}
    ${businessAddress ? `<div class="company-header">${escapeHtml(businessAddress)}</div>` : ''}
    ${businessPhone ? `<div class="company-header">${escapeHtml(businessPhone)}</div>` : ''}
    ${businessName ? '<div style="margin-bottom: 10px;"></div>' : ''}
    <div class="report-title">INCOME STATEMENT (P&L)</div>
    <div class="report-subtitle">Demonstração do Resultado do Exercício</div>
    <div class="report-meta">
      <strong>Period:</strong> ${periodLabel}<br>
      <strong>Generated:</strong> ${generatedDate}<br>
      <strong>Projects:</strong> ${projectBreakdowns.length}
    </div>
  </div>

  <!-- Executive Summary -->
  <div class="exec-summary">
    <strong>Summary:</strong> ${marginAssessment}${outstandingNote}
    Total revenue of ${formatCurrency(totalRevenue)} against ${formatCurrency(totalCosts)} in construction costs across ${projectBreakdowns.length} project${projectBreakdowns.length !== 1 ? 's' : ''}.
  </div>

  <div class="section-title">Income Statement</div>
  <table class="dre-table">
    <tbody>
      <tr class="revenue-row">
        <td class="label">GROSS REVENUE</td>
        <td class="amount">${formatCurrency(totalRevenue)}</td>
      </tr>
      ${incomeDetailRows}

      <tr class="cost-header">
        <td class="label">(-) COST OF CONSTRUCTION</td>
        <td class="amount"></td>
      </tr>
      ${costCategoryRows}
      <tr class="total-costs-row">
        <td class="label">TOTAL COST OF CONSTRUCTION</td>
        <td class="amount">${formatCostAmount(totalCosts)}</td>
      </tr>

      <tr class="separator"><td colspan="2"></td></tr>

      <tr class="profit-row">
        <td class="label">GROSS PROFIT</td>
        <td class="amount">${formatCurrencyWithSign(grossProfit)}</td>
      </tr>
      <tr class="margin-row">
        <td class="label">Gross Margin</td>
        <td class="amount">${grossMargin.toFixed(1)}% <span class="health-badge" style="background: ${marginHealthColor};">${marginHealth}</span></td>
      </tr>
    </tbody>
  </table>

  ${totalCosts > 0 ? `<div class="breakdown-section"><div class="section-title">Cost Breakdown</div><div class="cost-bar">${costBarSegments}</div><div class="legend">${costLegendItems}</div></div>` : ''}

  <!-- Project Comparison Table -->
  ${projectBreakdowns.length > 1 ? `
  <div class="section-title">Project Comparison</div>
  <table class="comparison-table">
    <thead><tr>
      <th>Project</th>
      <th class="amount-col">Contract</th>
      <th class="amount-col">Collected</th>
      <th class="amount-col">Costs</th>
      <th class="amount-col">Profit</th>
      <th class="amount-col">Margin</th>
    </tr></thead>
    <tbody>
      ${projectComparisonRows}
      <tr class="total-row">
        <td>Total (${projectBreakdowns.length} projects)</td>
        <td class="amount-cell">${formatCurrency(totalContractValue)}</td>
        <td class="amount-cell" style="color: ${SUCCESS};">${formatCurrency(totalRevenue)}</td>
        <td class="amount-cell" style="color: ${ERROR};">${formatCostAmount(totalCosts)}</td>
        <td class="amount-cell" style="color: ${profitColor}; font-weight: 700;">${formatCurrencyWithSign(grossProfit)}</td>
        <td class="amount-cell" style="color: ${profitColor}; font-weight: 700;">${grossMargin.toFixed(1)}%</td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  ${projectBreakdowns.length > 0 ? `<div class="projects-section"><div class="section-title">Project Detail (${projectBreakdowns.length})</div>${projectCards}</div>` : ''}

  ${transactionDetailHTML}

  <div class="report-footer">
    <span>Total contract value: ${formatCurrency(totalContractValue)} | ${transactions.length} transactions</span>
    <span>${businessName ? escapeHtml(businessName) + ' — ' : ''}${generatedDate}</span>
  </div>
</body>
</html>
  `.trim();
};

// ============================================================
// PER-PROJECT P&L PDF
// ============================================================

/**
 * Generate detailed per-project P&L report HTML
 * @param {object} project - Project data (from projectBreakdowns or direct)
 * @param {array} transactions - Full transaction list for this project
 * @param {string} periodLabel - Period description
 */
export const generateProjectReportHTML = (project, transactions = [], periodLabel = 'All Time') => {
  const generatedDate = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  // Aggregate from transactions
  let totalRevenue = 0;
  let totalCosts = 0;
  const costBreakdown = {};
  CATEGORIES.forEach(c => { costBreakdown[c] = 0; });
  const subcategoryBreakdown = {};
  const incomeBreakdown = {};

  transactions.forEach(t => {
    const amount = parseFloat(t.amount) || 0;
    if (t.type === 'income') {
      totalRevenue += amount;
      if (t.subcategory) {
        incomeBreakdown[t.subcategory] = (incomeBreakdown[t.subcategory] || 0) + amount;
      }
    } else if (t.type === 'expense') {
      const cat = CATEGORIES.includes(t.category) ? t.category : 'misc';
      costBreakdown[cat] += amount;
      totalCosts += amount;
      if (t.subcategory) {
        if (!subcategoryBreakdown[cat]) subcategoryBreakdown[cat] = {};
        subcategoryBreakdown[cat][t.subcategory] = (subcategoryBreakdown[cat][t.subcategory] || 0) + amount;
      }
    }
  });

  // Use project-level income if no income transactions
  if (totalRevenue === 0 && project.incomeCollected) {
    totalRevenue = parseFloat(project.incomeCollected) || 0;
  }

  const grossProfit = totalRevenue - totalCosts;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const profitColor = grossProfit >= 0 ? SUCCESS : ERROR;
  const marginHealth = grossMargin >= 20 ? 'Healthy' : grossMargin >= 10 ? 'Moderate' : 'At Risk';
  const marginHealthColor = grossMargin >= 20 ? SUCCESS : grossMargin >= 10 ? '#F59E0B' : ERROR;
  const contractAmount = parseFloat(project.contractAmount || project.contract_amount || 0);
  const budget = parseFloat(project.budget || contractAmount);
  const budgetUsed = budget > 0 ? (totalCosts / budget) * 100 : 0;
  const budgetColor = budgetUsed > 100 ? ERROR : budgetUsed > 85 ? '#F59E0B' : SUCCESS;

  const costCategoryRows = buildCostRows(costBreakdown, subcategoryBreakdown);
  const incomeDetailRows = buildIncomeRows(incomeBreakdown);
  const transactionDetailHTML = buildTransactionDetailHTML(transactions);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>P&L - ${escapeHtml(project.name || 'Project')}</title>
  <style>${getSharedCSS(profitColor)}</style>
</head>
<body>
  <div class="report-header">
    <div class="report-title">${escapeHtml(project.name || 'Project Report')}</div>
    <div class="report-subtitle">Project Profit & Loss Statement</div>
    <div class="report-meta">
      <strong>Period:</strong> ${periodLabel}<br>
      <strong>Generated:</strong> ${generatedDate}<br>
      <strong>Contract:</strong> ${formatCurrency(contractAmount)}<br>
      <strong>Budget:</strong> ${formatCurrency(budget)} (${budgetUsed.toFixed(0)}% used)
      ${project.status ? `<br><strong>Status:</strong> ${project.status}` : ''}
    </div>
  </div>

  <div class="section-title">Income Statement</div>
  <table class="dre-table">
    <tbody>
      <tr class="revenue-row">
        <td class="label">REVENUE</td>
        <td class="amount">${formatCurrency(totalRevenue)}</td>
      </tr>
      ${incomeDetailRows}

      <tr class="cost-header">
        <td class="label">(-) COST OF CONSTRUCTION</td>
        <td class="amount"></td>
      </tr>
      ${costCategoryRows}
      <tr class="total-costs-row">
        <td class="label">TOTAL COSTS</td>
        <td class="amount">${formatCostAmount(totalCosts)}</td>
      </tr>

      <tr class="separator"><td colspan="2"></td></tr>

      <tr class="profit-row">
        <td class="label">GROSS PROFIT</td>
        <td class="amount">${formatCurrencyWithSign(grossProfit)}</td>
      </tr>
      <tr class="margin-row">
        <td class="label">Gross Margin</td>
        <td class="amount">${grossMargin.toFixed(1)}% <span class="health-badge" style="background: ${marginHealthColor};">${marginHealth}</span></td>
      </tr>
    </tbody>
  </table>

  <!-- Budget utilization -->
  ${budget > 0 ? `
  <div style="margin-bottom: 25px;">
    <div class="section-title">Budget Utilization</div>
    <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 4px;">
      <span>Spent: ${formatCurrency(totalCosts)} of ${formatCurrency(budget)}</span>
      <span style="font-weight: 600; color: ${budgetColor};">${budgetUsed.toFixed(1)}%</span>
    </div>
    <div class="budget-track">
      <div class="budget-fill" style="width: ${Math.min(budgetUsed, 100)}%; background: ${budgetColor};"></div>
    </div>
  </div>
  ` : ''}

  ${transactionDetailHTML}

  <div class="report-footer">
    <span>${transactions.length} transactions | Contract: ${formatCurrency(contractAmount)}</span>
    <span>Construction Manager &bull; ${generatedDate}</span>
  </div>
</body>
</html>
  `.trim();
};

// ============================================================
// PDF Generation & Sharing functions
// ============================================================

export const generateFinancialReportPDF = async (reportData) => {
  try {
    const html = generateFinancialReportHTML(reportData);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    return uri;
  } catch (error) {
    console.error('Error generating financial report PDF:', error);
    throw error;
  }
};

export const shareFinancialReportPDF = async (reportData) => {
  try {
    const pdfUri = await generateFinancialReportPDF(reportData);
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Error', 'Sharing is not available on this device');
      return;
    }
    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: `P&L Report - ${reportData.periodLabel || 'Financial Report'}`,
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    console.error('Error sharing financial report PDF:', error);
    Alert.alert('Error', 'Failed to export financial report. Please try again.');
  }
};

export const generateProjectReportPDF = async (project, transactions, periodLabel) => {
  try {
    const html = generateProjectReportHTML(project, transactions, periodLabel);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    return uri;
  } catch (error) {
    console.error('Error generating project report PDF:', error);
    throw error;
  }
};

export const shareProjectReportPDF = async (project, transactions, periodLabel) => {
  try {
    const pdfUri = await generateProjectReportPDF(project, transactions, periodLabel);
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Error', 'Sharing is not available on this device');
      return;
    }
    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: `P&L - ${project.name || 'Project Report'}`,
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    console.error('Error sharing project report PDF:', error);
    Alert.alert('Error', 'Failed to export project report. Please try again.');
  }
};
