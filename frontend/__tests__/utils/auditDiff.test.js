/**
 * Audit diff formatter tests.
 *
 * Verifies that the formatter produces the specific human-readable
 * strings the spec requires ("Total changed from $4,200 to $4,800")
 * and gracefully degrades when fields are missing or malformed.
 */

import {
  formatAuditEntry,
  formatValue,
  pickHeadlineChange,
  CURRENCY_FIELDS,
} from '../../src/utils/auditDiff';

// Stand-in for i18next translator. Renders interpolation by simple
// substitution so we can assert on actual phrasing.
function makeT(map = {}) {
  return (key, opts = {}) => {
    const tmpl = map[key] !== undefined ? map[key] : (opts.defaultValue !== undefined ? opts.defaultValue : key);
    return Object.entries(opts || {}).reduce(
      (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)),
      tmpl
    );
  };
}

describe('formatValue', () => {
  test('renders currency for total/amount fields', () => {
    expect(formatValue(4200, 'total')).toBe('$4,200');
    expect(formatValue(4800.5, 'amount')).toBe('$4,800.5');
  });

  test('renders plain numbers for non-currency fields', () => {
    expect(formatValue(42, 'count')).toBe('42');
  });

  test('renders dash for null', () => {
    expect(formatValue(null, 'x')).toBe('—');
    expect(formatValue(undefined, 'x')).toBe('—');
  });

  test('truncates long strings', () => {
    const long = 'x'.repeat(100);
    expect(formatValue(long, 'note').endsWith('…')).toBe(true);
    expect(formatValue(long, 'note').length).toBeLessThanOrEqual(60);
  });

  test('CURRENCY_FIELDS contains the standard set', () => {
    expect(CURRENCY_FIELDS.has('total')).toBe(true);
    expect(CURRENCY_FIELDS.has('amount')).toBe(true);
    expect(CURRENCY_FIELDS.has('subtotal')).toBe(true);
  });
});

describe('pickHeadlineChange', () => {
  test('prefers status over other fields', () => {
    const changes = [
      { field: 'updated_at', before: 'a', after: 'b' },
      { field: 'name', before: 'old', after: 'new' },
      { field: 'status', before: 'draft', after: 'sent' },
    ];
    const hit = pickHeadlineChange(changes);
    expect(hit.field).toBe('status');
  });

  test('falls back to total when no status', () => {
    const changes = [
      { field: 'name', before: 'a', after: 'b' },
      { field: 'total', before: 100, after: 200 },
    ];
    expect(pickHeadlineChange(changes).field).toBe('total');
  });

  test('returns null for empty array', () => {
    expect(pickHeadlineChange([])).toBeNull();
    expect(pickHeadlineChange(null)).toBeNull();
  });
});

describe('formatAuditEntry', () => {
  const t = makeT({
    'audit.created': 'Created {{entity}} "{{name}}"',
    'audit.createdGeneric': 'Created {{entity}}',
    'audit.deleted': 'Deleted {{entity}} "{{name}}"',
    'audit.deletedGeneric': 'Deleted {{entity}}',
    'audit.updatedGeneric': 'Updated {{entity}}',
    'audit.changed': '{{field}} changed from {{before}} to {{after}}',
    'audit.bulkAction': '{{action}} {{count}} {{entity}}',
    'audit.entityTypes.project': 'Project',
    'audit.entityTypes.estimate': 'Estimate',
    'audit.entityTypes.invoice': 'Invoice',
    'audit.actions.bulk_update': 'Bulk update',
  });

  test('formats create with name', () => {
    const entry = {
      action: 'create',
      entity_type: 'project',
      after_json: { name: 'Smith Bath' },
    };
    expect(formatAuditEntry(entry, t)).toBe('Created Project "Smith Bath"');
  });

  test('formats delete with name', () => {
    const entry = {
      action: 'delete',
      entity_type: 'invoice',
      before_json: { invoice_number: 'INV-001', name: 'Smith Final' },
    };
    expect(formatAuditEntry(entry, t)).toBe('Deleted Invoice "Smith Final"');
  });

  test('formats update with currency diff (the headline use case)', () => {
    const entry = {
      action: 'update',
      entity_type: 'estimate',
      changes: [{ field: 'total', before: 4200, after: 4800 }],
    };
    expect(formatAuditEntry(entry, t)).toBe('total changed from $4,200 to $4,800');
  });

  test('formats bulk roll-up', () => {
    const entry = {
      action: 'bulk_update',
      entity_type: 'transaction',
      item_count: 25,
    };
    expect(formatAuditEntry(entry, t)).toBe('Bulk update 25 transaction');
  });

  test('falls back to generic when no diff is available on update', () => {
    const entry = { action: 'update', entity_type: 'project', changes: [] };
    expect(formatAuditEntry(entry, t)).toBe('Updated Project');
  });

  test('handles null entry', () => {
    expect(formatAuditEntry(null, t)).toBe('');
  });
});
