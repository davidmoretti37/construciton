// Single source of truth for all transaction categories, subcategories, colors, and labels.
// Every screen, utility, and PDF generator imports from here.

// ============================================================
// Top-level categories (backward-compatible with existing 6)
// ============================================================

export const CATEGORIES = ['labor', 'materials', 'subcontractor', 'equipment', 'permits', 'misc'];

export const CATEGORY_LABELS = {
  labor: 'Labor',
  materials: 'Materials',
  equipment: 'Equipment',
  permits: 'Permits',
  subcontractor: 'Subcontractors',
  misc: 'Miscellaneous',
};

export const CATEGORY_COLORS = {
  labor: '#3B82F6',
  materials: '#10B981',
  equipment: '#F59E0B',
  permits: '#8B5CF6',
  subcontractor: '#EF4444',
  misc: '#6B7280',
};

// ============================================================
// Expense subcategories (keyed by parent category)
// ============================================================

export const EXPENSE_SUBCATEGORIES = {
  labor: [
    { value: 'wages', label: 'Wages' },
    { value: 'overtime', label: 'Overtime' },
    { value: 'payroll_taxes', label: 'Payroll Taxes' },
    { value: 'workers_comp', label: "Workers' Comp" },
    { value: 'benefits', label: 'Benefits' },
    { value: 'labor_other', label: 'Other Labor' },
  ],
  materials: [
    { value: 'lumber', label: 'Lumber' },
    { value: 'concrete_cement', label: 'Concrete/Cement' },
    { value: 'plumbing_supplies', label: 'Plumbing Supplies' },
    { value: 'electrical_supplies', label: 'Electrical Supplies' },
    { value: 'drywall', label: 'Drywall' },
    { value: 'paint', label: 'Paint' },
    { value: 'hardware', label: 'Hardware' },
    { value: 'roofing', label: 'Roofing' },
    { value: 'flooring', label: 'Flooring' },
    { value: 'fixtures', label: 'Fixtures' },
    { value: 'materials_other', label: 'Other Materials' },
  ],
  equipment: [
    { value: 'rental', label: 'Rental' },
    { value: 'purchase', label: 'Purchase' },
    { value: 'fuel_gas', label: 'Fuel/Gas' },
    { value: 'maintenance_repair', label: 'Maintenance/Repair' },
    { value: 'small_tools', label: 'Small Tools' },
    { value: 'equipment_other', label: 'Other Equipment' },
  ],
  subcontractor: [
    { value: 'sub_plumbing', label: 'Plumbing' },
    { value: 'sub_electrical', label: 'Electrical' },
    { value: 'sub_hvac', label: 'HVAC' },
    { value: 'sub_painting', label: 'Painting' },
    { value: 'sub_concrete', label: 'Concrete' },
    { value: 'sub_framing', label: 'Framing' },
    { value: 'sub_roofing', label: 'Roofing' },
    { value: 'sub_landscaping', label: 'Landscaping' },
    { value: 'sub_demolition', label: 'Demolition' },
    { value: 'sub_other', label: 'Other Subcontractor' },
  ],
  permits: [
    { value: 'building_permit', label: 'Building Permit' },
    { value: 'inspection_fee', label: 'Inspection Fee' },
    { value: 'impact_fee', label: 'Impact Fee' },
    { value: 'utility_connection', label: 'Utility Connection' },
    { value: 'permits_other', label: 'Other Permits' },
  ],
  misc: [
    { value: 'office_supplies', label: 'Office Supplies' },
    { value: 'vehicle_transport', label: 'Vehicle/Transportation' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'cleanup_disposal', label: 'Cleanup/Disposal' },
    { value: 'professional_fees', label: 'Professional Fees' },
    { value: 'advertising', label: 'Advertising' },
    { value: 'misc_other', label: 'Other Miscellaneous' },
  ],
};

// ============================================================
// Income subcategories (flat — income has no parent categories)
// ============================================================

export const INCOME_SUBCATEGORIES = [
  { value: 'contract_payment', label: 'Contract Payment' },
  { value: 'change_order', label: 'Change Order' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'retainage_release', label: 'Retainage Release' },
  { value: 'income_other', label: 'Other Income' },
];

// ============================================================
// IRS Tax Categories (Schedule C mapping)
// ============================================================

export const TAX_CATEGORIES = [
  { value: 'cogs', label: 'Cost of Goods Sold' },
  { value: 'contract_labor', label: 'Contract Labor' },
  { value: 'rent_lease', label: 'Rent/Lease' },
  { value: 'repairs_maintenance', label: 'Repairs & Maintenance' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'taxes_licenses', label: 'Taxes & Licenses' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'vehicle', label: 'Vehicle Expenses' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other_deduction', label: 'Other Deductions' },
];

export const TAX_CATEGORY_LABELS = Object.fromEntries(TAX_CATEGORIES.map(c => [c.value, c.label]));

// Default auto-mapping from expense category to tax category
export const DEFAULT_TAX_CATEGORY = {
  materials: 'cogs',
  labor: 'contract_labor',
  equipment: 'rent_lease',
  permits: 'taxes_licenses',
  subcontractor: 'contract_labor',
  misc: 'other_deduction',
};

// ============================================================
// Helpers
// ============================================================

/**
 * Resolve a subcategory value to its display label.
 * Searches both expense and income subcategories.
 */
export const getSubcategoryLabel = (subcategory) => {
  if (!subcategory) return null;
  for (const subs of Object.values(EXPENSE_SUBCATEGORIES)) {
    const found = subs.find(s => s.value === subcategory);
    if (found) return found.label;
  }
  const incomeFound = INCOME_SUBCATEGORIES.find(s => s.value === subcategory);
  return incomeFound?.label || subcategory;
};
