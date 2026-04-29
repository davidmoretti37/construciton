/**
 * eSignService unit tests.
 *
 * Pure-function tests for the PDF + hashing pipeline, plus a focused
 * tamper-detection test. Full request/sign integration is exercised
 * end-to-end via the manual verification steps in the plan; here we
 * exercise the deterministic pieces.
 */

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Mock Supabase + Resend so requiring the service doesn't blow up
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
    storage: {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null }),
        download: jest.fn(),
        createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: 'https://example/signed.pdf' }, error: null }),
      }),
    },
    functions: { invoke: jest.fn().mockResolvedValue({ data: null, error: null }) },
  }),
}));

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ data: { id: 'em_1' }, error: null }) },
  })),
}));

const eSign = require('../services/eSignService');
const { sha256Hex, renderDocumentPdf, stampSignedPdf, loadOrWrapPdf } = eSign._internal;

// One-pixel transparent PNG, base64
const ONE_PIXEL_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

describe('eSignService PDF pipeline', () => {
  test('sha256Hex is deterministic and length 64', () => {
    const a = sha256Hex(Buffer.from('hello'));
    const b = sha256Hex(Buffer.from('hello'));
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(sha256Hex(Buffer.from('hello!'))).not.toBe(a);
  });

  test('renderDocumentPdf returns parseable PDF bytes for an estimate', async () => {
    const bytes = await renderDocumentPdf('estimate', {
      id: 'doc-1',
      estimate_number: 'EST-2026-001',
      client_name: 'Jane Doe',
      project_name: 'Kitchen remodel',
      items: [
        { description: 'Demo', quantity: 1, unit: 'lot', pricePerUnit: 1500, total: 1500 },
        { description: 'Cabinets', quantity: 1, unit: 'lot', pricePerUnit: 8000, total: 8000 },
      ],
      subtotal: 9500,
      tax_amount: 760,
      tax_rate: 8,
      total: 10260,
      notes: 'Net 30',
    });
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(500);
    // PDF magic header
    expect(bytes.slice(0, 4).toString()).toBe('%PDF');
  });

  test('stampSignedPdf appends an audit page and embeds signature', async () => {
    const original = await renderDocumentPdf('invoice', {
      id: 'doc-2',
      invoice_number: 'INV-2026-001',
      client_name: 'Acme Co',
      items: [{ description: 'Service', quantity: 1, unit: 'lot', pricePerUnit: 100, total: 100 }],
      subtotal: 100,
      total: 100,
    });

    const signed = await stampSignedPdf({
      originalBytes: original,
      signaturePngBase64: ONE_PIXEL_PNG_B64,
      audit: {
        document_type: 'invoice',
        document_id: 'doc-2',
        signer_name: 'Jane Doe',
        signer_email: 'jane@example.com',
        original_doc_hash: sha256Hex(original),
        ts: '2026-04-29T10:00:00.000Z',
        ip: '203.0.113.42',
        user_agent: 'jest/1.0',
      },
    });

    expect(Buffer.isBuffer(signed)).toBe(true);
    expect(signed.slice(0, 4).toString()).toBe('%PDF');
    expect(signed.length).toBeGreaterThan(original.length); // audit page added
  });

  test('loadOrWrapPdf wraps non-PDF image bytes into a one-page PDF', async () => {
    const pngBytes = Buffer.from(ONE_PIXEL_PNG_B64, 'base64');
    const pdf = await loadOrWrapPdf(pngBytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  test('tamper detection: hash differs when bytes change', async () => {
    const a = await renderDocumentPdf('estimate', {
      id: 'd', estimate_number: 'X', client_name: 'A',
      items: [], subtotal: 0, total: 0,
    });
    const b = await renderDocumentPdf('estimate', {
      id: 'd', estimate_number: 'X', client_name: 'B', // changed
      items: [], subtotal: 0, total: 0,
    });
    expect(sha256Hex(a)).not.toBe(sha256Hex(b));
  });
});

describe('eSignService input validation', () => {
  test('createSignatureRequest rejects unknown document_type', async () => {
    await expect(eSign.createSignatureRequest({
      ownerId: 'owner-1', documentType: 'bogus', documentId: 'd',
    })).rejects.toThrow(/Invalid document_type/);
  });

  test('createSignatureRequest rejects missing document_id', async () => {
    await expect(eSign.createSignatureRequest({
      ownerId: 'owner-1', documentType: 'estimate', documentId: null,
    })).rejects.toThrow(/document_id required/);
  });

  test('getSigningContext returns invalid for empty token row', async () => {
    const ctx = await eSign.getSigningContext('does-not-exist');
    expect(ctx.status).toBe('invalid');
  });

  test('declineSignature rejects unknown token', async () => {
    await expect(eSign.declineSignature({ token: 'nope' })).rejects.toThrow(/Invalid token/);
  });
});
