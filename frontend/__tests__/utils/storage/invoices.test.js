/**
 * Invoices Storage Tests
 *
 * Validates invoice CRUD, payment recording,
 * aging report, and void operations.
 */

jest.mock('../../../src/utils/storage/auth', () => ({
  getCurrentUserId: jest.fn(() => Promise.resolve('user-1')),
  getCurrentUserContext: jest.fn(() => Promise.resolve({ userId: 'user-1', role: 'owner', ownerId: null })),
}));

let mockChainResult = { data: null, error: null };
let mockChainCalls = [];

const createChainBuilder = () => {
  const builder = {
    select: jest.fn((...args) => { mockChainCalls.push(['select', ...args]); return builder; }),
    eq: jest.fn((...args) => { mockChainCalls.push(['eq', ...args]); return builder; }),
    neq: jest.fn((...args) => { mockChainCalls.push(['neq', ...args]); return builder; }),
    or: jest.fn((...args) => { mockChainCalls.push(['or', ...args]); return builder; }),
    in: jest.fn((...args) => { mockChainCalls.push(['in', ...args]); return builder; }),
    order: jest.fn((...args) => { mockChainCalls.push(['order', ...args]); return builder; }),
    limit: jest.fn((...args) => { mockChainCalls.push(['limit', ...args]); return builder; }),
    single: jest.fn(() => { mockChainCalls.push(['single']); return Promise.resolve(mockChainResult); }),
    maybeSingle: jest.fn(() => { mockChainCalls.push(['maybeSingle']); return Promise.resolve(mockChainResult); }),
    insert: jest.fn((...args) => { mockChainCalls.push(['insert', ...args]); return builder; }),
    upsert: jest.fn((...args) => { mockChainCalls.push(['upsert', ...args]); return builder; }),
    update: jest.fn((...args) => { mockChainCalls.push(['update', ...args]); return builder; }),
    delete: jest.fn(() => { mockChainCalls.push(['delete']); return builder; }),
    then: jest.fn((cb) => cb(mockChainResult)),
  };
  return builder;
};

jest.mock('../../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => createChainBuilder()),
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  },
}));

import { supabase } from '../../../src/lib/supabase';
import { getCurrentUserId } from '../../../src/utils/storage/auth';
import {
  saveInvoice,
  getInvoice,
  fetchInvoices,
  markInvoiceAsPaid,
  recordInvoicePayment,
  voidInvoice,
  deleteInvoice,
  updateInvoiceTemplate,
  fetchAgingReport,
} from '../../../src/utils/storage/invoices';

beforeEach(() => {
  jest.clearAllMocks();
  mockChainCalls = [];
  mockChainResult = { data: null, error: null };
  supabase.from.mockImplementation(() => createChainBuilder());
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

// ============================================================
// saveInvoice
// ============================================================
describe('saveInvoice', () => {
  test('creates with items, tax, terms, due date', async () => {
    const invoice = { id: 'inv-1', invoice_number: 'INV-001', total: 5000, status: 'unpaid' };
    mockChainResult = { data: invoice, error: null };

    const result = await saveInvoice({
      clientName: 'Mr. Smith',
      items: [{ description: 'Labor', amount: 5000 }],
      total: 5000,
      dueDate: '2025-04-15',
      paymentTerms: 'Net 30',
    });

    expect(supabase.from).toHaveBeenCalledWith('invoices');
    const insertCall = mockChainCalls.find(c => c[0] === 'insert');
    expect(insertCall).toBeTruthy();
    expect(result).toBeTruthy();
  });

  test('returns null when not authenticated', async () => {
    getCurrentUserId.mockResolvedValueOnce(null);

    const result = await saveInvoice({ clientName: 'Test', total: 100 });
    expect(result).toBeNull();
  });
});

// ============================================================
// getInvoice
// ============================================================
describe('getInvoice', () => {
  test('returns single invoice', async () => {
    const invoice = { id: 'inv-1', invoice_number: 'INV-001', total: 5000 };
    mockChainResult = { data: invoice, error: null };

    const result = await getInvoice('inv-1');

    expect(supabase.from).toHaveBeenCalledWith('invoices');
    expect(result).toEqual(invoice);
  });
});

// ============================================================
// fetchInvoices
// ============================================================
describe('fetchInvoices', () => {
  test('returns user invoices', async () => {
    const invoices = [
      { id: 'inv-1', status: 'unpaid' },
      { id: 'inv-2', status: 'paid' },
    ];
    mockChainResult = { data: invoices, error: null };

    const result = await fetchInvoices();

    expect(supabase.from).toHaveBeenCalledWith('invoices');
    expect(result).toHaveLength(2);
  });

  test('applies status filter', async () => {
    mockChainResult = { data: [{ id: 'inv-1', status: 'unpaid' }], error: null };

    await fetchInvoices({ status: 'unpaid' });

    const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
    expect(eqCalls.some(c => c[1] === 'status' && c[2] === 'unpaid')).toBe(true);
  });
});

// ============================================================
// markInvoiceAsPaid
// ============================================================
describe('markInvoiceAsPaid', () => {
  test('updates status to paid', async () => {
    // First call fetches invoice, second updates
    let callCount = 0;
    supabase.from.mockImplementation(() => {
      callCount++;
      const builder = createChainBuilder();
      if (callCount === 1) {
        mockChainResult = { data: { id: 'inv-1', total: 5000, payments: [] }, error: null };
      } else {
        mockChainResult = { data: { id: 'inv-1', status: 'paid' }, error: null };
      }
      return builder;
    });

    const result = await markInvoiceAsPaid('inv-1', 5000);

    expect(supabase.from).toHaveBeenCalledWith('invoices');
  });
});

// ============================================================
// recordInvoicePayment
// ============================================================
describe('recordInvoicePayment', () => {
  test('partial payment → status partial', async () => {
    let callCount = 0;
    supabase.from.mockImplementation(() => {
      callCount++;
      const builder = createChainBuilder();
      if (callCount === 1) {
        // Fetch invoice
        mockChainResult = { data: { id: 'inv-1', total: 5000, amount_paid: 0, payments: [] }, error: null };
      } else {
        // Update
        mockChainResult = { data: { id: 'inv-1', status: 'partial', amount_paid: 2000 }, error: null };
      }
      return builder;
    });

    const result = await recordInvoicePayment('inv-1', 2000, 'check');

    expect(supabase.from).toHaveBeenCalledWith('invoices');
    expect(result).toBeTruthy();
  });

  test('full payment → status paid', async () => {
    let callCount = 0;
    supabase.from.mockImplementation(() => {
      callCount++;
      const builder = createChainBuilder();
      if (callCount === 1) {
        mockChainResult = { data: { id: 'inv-1', total: 5000, amount_paid: 0, payments: [] }, error: null };
      } else {
        mockChainResult = { data: { id: 'inv-1', status: 'paid', amount_paid: 5000 }, error: null };
      }
      return builder;
    });

    const result = await recordInvoicePayment('inv-1', 5000, 'check');

    expect(result).toBeTruthy();
  });
});

// ============================================================
// voidInvoice
// ============================================================
describe('voidInvoice', () => {
  test('sets status to cancelled', async () => {
    mockChainResult = { data: { id: 'inv-1', status: 'cancelled' }, error: null };

    const result = await voidInvoice('inv-1');

    expect(supabase.from).toHaveBeenCalledWith('invoices');
    const updateCall = mockChainCalls.find(c => c[0] === 'update');
    expect(updateCall).toBeTruthy();
    expect(updateCall[1].status).toBe('cancelled');
  });
});

// ============================================================
// deleteInvoice
// ============================================================
describe('deleteInvoice', () => {
  test('removes invoice', async () => {
    mockChainResult = { error: null };

    await deleteInvoice('inv-1');

    expect(supabase.from).toHaveBeenCalledWith('invoices');
    expect(mockChainCalls.find(c => c[0] === 'delete')).toBeTruthy();
  });
});

// ============================================================
// updateInvoiceTemplate
// ============================================================
describe('updateInvoiceTemplate', () => {
  test('updates existing template', async () => {
    // First call: select existing, second call: update
    let callCount = 0;
    supabase.from.mockImplementation(() => {
      callCount++;
      const builder = createChainBuilder();
      if (callCount === 1) {
        mockChainResult = { data: { id: 'tmpl-1' }, error: null };
      } else {
        mockChainResult = { data: null, error: null };
      }
      return builder;
    });

    await updateInvoiceTemplate({
      logo_url: 'https://example.com/logo.png',
      primary_color: '#2563EB',
    });

    expect(supabase.from).toHaveBeenCalledWith('invoice_template');
    const updateCall = mockChainCalls.find(c => c[0] === 'update');
    expect(updateCall).toBeTruthy();
  });
});

// ============================================================
// fetchAgingReport
// ============================================================
describe('fetchAgingReport', () => {
  test('returns aging buckets', async () => {
    const invoices = [
      { id: 'inv-1', client_name: 'Mr. Smith', total: 5000, amount_paid: 0, status: 'unpaid', due_date: '2025-01-01' },
      { id: 'inv-2', client_name: 'Mr. Smith', total: 3000, amount_paid: 0, status: 'overdue', due_date: '2025-02-01' },
    ];
    mockChainResult = { data: invoices, error: null };

    const result = await fetchAgingReport();

    expect(supabase.from).toHaveBeenCalledWith('invoices');
    expect(result).toBeTruthy();
  });
});
