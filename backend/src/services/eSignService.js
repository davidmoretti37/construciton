/**
 * E-Signature Service
 *
 * Native, no-third-party signing for estimates, invoices, and contracts.
 * - createSignatureRequest: snapshot original PDF, hash it, mint single-use token, send email.
 * - recordSignature: validate token, recompute hash, stamp signature + audit page, store signed PDF.
 * - getSignatureStatus / cancelSignatureRequest: owner-side ops.
 *
 * All Supabase access uses the service-role key (bypasses RLS); ownership is
 * enforced manually at every entry point.
 */

const crypto = require('crypto');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const logger = require('../utils/logger');
// emailService is loaded lazily — it eagerly instantiates Resend at module
// load time, which crashes in test envs where RESEND_API_KEY is unset.
function getEmailService() {
  // eslint-disable-next-line global-require
  return require('./emailService');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PORTAL_URL = process.env.PORTAL_URL || 'https://sylkapp.ai/portal';
const STORAGE_BUCKET = 'documents';
const TOKEN_TTL_DAYS = 7;
const VALID_DOC_TYPES = new Set(['estimate', 'invoice', 'contract', 'change_order']);

// ownerField defaults to 'user_id' across estimates/invoices/contract_documents.
// change_orders uses `owner_id` instead — explicit override here.
const DOC_TABLES = {
  estimate:     { table: 'estimates',          titleField: 'estimate_number', nameField: 'project_name', ownerField: 'user_id' },
  invoice:      { table: 'invoices',           titleField: 'invoice_number',  nameField: 'project_name', ownerField: 'user_id' },
  contract:     { table: 'contract_documents', titleField: 'file_name',       nameField: 'file_name',    ownerField: 'user_id' },
  change_order: { table: 'change_orders',      titleField: 'title',           nameField: 'title',        ownerField: 'owner_id' },
};

// =============================================================================
// PDF helpers
// =============================================================================

function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Render a basic branded PDF for an estimate, invoice, or change order when no
 * source PDF exists. Intentionally plain — the goal is a stable, hashable artifact.
 */
async function renderDocumentPdf(documentType, doc) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  const left = 56;

  // Header line: e.g. "CHANGE ORDER" / "ESTIMATE" / "INVOICE"
  const headerLabel = documentType === 'change_order' ? 'CHANGE ORDER' : documentType.toUpperCase();
  page.drawText(headerLabel, { x: left, y, size: 22, font: bold, color: rgb(0.06, 0.09, 0.16) });
  y -= 28;
  // Sub-header: doc number / title
  let subHeader = doc.estimate_number || doc.invoice_number || '';
  if (documentType === 'change_order') {
    const num = `CO-${String(doc.co_number || 0).padStart(3, '0')}`;
    subHeader = doc.title ? `${num} — ${doc.title}` : num;
  }
  page.drawText(subHeader, { x: left, y, size: 12, font, color: rgb(0.4, 0.45, 0.55) });
  y -= 36;

  const writeRow = (label, value) => {
    page.drawText(`${label}:`, { x: left, y, size: 11, font: bold, color: rgb(0.2, 0.25, 0.35) });
    page.drawText(String(value || '—'), { x: left + 110, y, size: 11, font, color: rgb(0.06, 0.09, 0.16) });
    y -= 18;
  };

  writeRow('Client', doc.client_name);
  if (doc.client_email) writeRow('Email', doc.client_email);
  if (doc.project_name) writeRow('Project', doc.project_name);
  if (doc.due_date) writeRow('Due', new Date(doc.due_date).toLocaleDateString());
  if (doc.valid_until) writeRow('Valid until', new Date(doc.valid_until).toLocaleDateString());

  // Change-order specific fields: description and schedule impact
  if (documentType === 'change_order') {
    if (doc.description) {
      y -= 4;
      page.drawText('Scope of change', { x: left, y, size: 11, font: bold, color: rgb(0.2, 0.25, 0.35) });
      y -= 14;
      const descLines = String(doc.description).match(/.{1,86}(\s|$)/g) || [];
      for (const line of descLines.slice(0, 6)) {
        page.drawText(line.trim(), { x: left, y, size: 10, font });
        y -= 13;
      }
    }
    if (Number(doc.schedule_impact_days || 0) !== 0) {
      const days = Number(doc.schedule_impact_days);
      writeRow('Schedule impact', `${days > 0 ? '+' : ''}${days} day${Math.abs(days) === 1 ? '' : 's'}`);
    }
  }
  y -= 8;

  page.drawText('Line items', { x: left, y, size: 12, font: bold });
  y -= 16;

  // For COs the line items live in change_order_line_items (already joined in
  // loadOwnedDocument); estimates/invoices keep them on the row as `items`.
  let rawItems;
  if (documentType === 'change_order') {
    rawItems = (doc.change_order_line_items || [])
      .slice()
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map(li => ({
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        pricePerUnit: li.unit_price,
        total: li.amount,
      }));
  } else {
    rawItems = Array.isArray(doc.items) ? doc.items : [];
  }
  for (const it of rawItems.slice(0, 25)) {
    if (y < 120) break;
    const desc = (it.description || '').slice(0, 60);
    const qty = it.quantity != null ? `${it.quantity}` : '';
    const unit = it.unit || '';
    const ppu = it.pricePerUnit != null ? `$${Number(it.pricePerUnit).toFixed(2)}` : '';
    const total = it.total != null ? `$${Number(it.total).toFixed(2)}` : '';
    page.drawText(desc, { x: left, y, size: 10, font });
    page.drawText(`${qty} ${unit}`, { x: left + 280, y, size: 10, font });
    page.drawText(ppu, { x: left + 380, y, size: 10, font });
    page.drawText(total, { x: left + 480, y, size: 10, font });
    y -= 14;
  }

  y -= 12;
  const subtotal = Number(doc.subtotal || 0).toFixed(2);
  const taxAmt = Number(doc.tax_amount || 0).toFixed(2);
  const totalAmt = Number(doc.total_amount || doc.total || 0).toFixed(2);
  const taxRateLabel = documentType === 'change_order'
    ? `${(Number(doc.tax_rate || 0) * 100).toFixed(2)}%`
    : `${doc.tax_rate || 0}%`;
  writeRow('Subtotal', `$${subtotal}`);
  if (Number(taxAmt) > 0) writeRow(`Tax (${taxRateLabel})`, `$${taxAmt}`);
  page.drawText('Total:', { x: left, y, size: 14, font: bold });
  page.drawText(`$${totalAmt}`, { x: left + 110, y, size: 14, font: bold, color: rgb(0.12, 0.25, 0.69) });
  y -= 28;

  if (doc.notes) {
    page.drawText('Notes', { x: left, y, size: 11, font: bold });
    y -= 14;
    const lines = String(doc.notes).split('\n').slice(0, 8);
    for (const line of lines) {
      page.drawText(line.slice(0, 90), { x: left, y, size: 10, font });
      y -= 12;
    }
  }

  return Buffer.from(await pdfDoc.save());
}

/**
 * Fetch the canonical original bytes for a document at request time.
 * - invoice: prefer pdf_url; fall back to renderDocumentPdf
 * - estimate: render from row data (no source PDF)
 * - contract: download from contract_documents.file_url
 *
 * Returns { bytes (Buffer), originUrl (string|null) }
 */
async function fetchOriginalBytes(documentType, doc) {
  if (documentType === 'contract') {
    const url = doc.file_url;
    if (!url) throw new Error('Contract has no file_url');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch contract file (${res.status})`);
    const arr = await res.arrayBuffer();
    return { bytes: Buffer.from(arr), originUrl: url };
  }
  if (documentType === 'invoice' && doc.pdf_url) {
    try {
      const res = await fetch(doc.pdf_url);
      if (res.ok) {
        const arr = await res.arrayBuffer();
        return { bytes: Buffer.from(arr), originUrl: doc.pdf_url };
      }
    } catch (err) {
      logger.warn('[eSign] invoice pdf_url fetch failed, will render fallback:', err.message);
    }
  }
  const bytes = await renderDocumentPdf(documentType, doc);
  return { bytes, originUrl: null };
}

/**
 * Try to interpret bytes as a PDF; if it isn't (e.g. an image-based contract),
 * wrap it in a one-page PDF so we can append a signature/audit page.
 */
async function loadOrWrapPdf(bytes) {
  try {
    return await PDFDocument.load(bytes);
  } catch (_) {
    // Not a PDF — treat as image and wrap.
    const wrapper = await PDFDocument.create();
    let img;
    try { img = await wrapper.embedPng(bytes); }
    catch (_) { img = await wrapper.embedJpg(bytes); }
    const page = wrapper.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    return wrapper;
  }
}

/**
 * Stamp a signature image on the last page and append an audit page.
 * Returns the signed PDF bytes.
 */
async function stampSignedPdf({ originalBytes, signaturePngBase64, audit }) {
  const pdfDoc = await loadOrWrapPdf(originalBytes);
  const pages = pdfDoc.getPages();
  const last = pages[pages.length - 1];
  const { width: lw, height: _lh } = last.getSize();

  const sigBytes = Buffer.from(signaturePngBase64.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');
  const sigImg = await pdfDoc.embedPng(sigBytes);
  const targetWidth = Math.min(220, lw * 0.4);
  const sigDims = sigImg.scaleToFit(targetWidth, 80);
  const sigX = lw - sigDims.width - 56;
  const sigY = 70;
  last.drawImage(sigImg, { x: sigX, y: sigY, width: sigDims.width, height: sigDims.height });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  last.drawText(`Signed by ${audit.signer_name}`, { x: sigX, y: sigY - 14, size: 9, font, color: rgb(0.2, 0.25, 0.35) });
  last.drawText(audit.ts, { x: sigX, y: sigY - 26, size: 8, font, color: rgb(0.4, 0.45, 0.55) });

  // Audit page
  const audit_page = pdfDoc.addPage([612, 792]);
  let y = 740;
  const left = 56;
  audit_page.drawText('AUDIT TRAIL', { x: left, y, size: 18, font: bold, color: rgb(0.06, 0.09, 0.16) });
  y -= 30;
  const lines = [
    ['Document type', audit.document_type],
    ['Document ID', audit.document_id],
    ['Signer name', audit.signer_name],
    ['Signer email', audit.signer_email || '—'],
    ['Signed at', audit.ts],
    ['IP address', audit.ip || '—'],
    ['User agent', (audit.user_agent || '—').slice(0, 90)],
    ['Original SHA-256', audit.original_doc_hash],
  ];
  for (const [label, value] of lines) {
    audit_page.drawText(`${label}:`, { x: left, y, size: 11, font: bold });
    audit_page.drawText(String(value || ''), { x: left + 140, y, size: 10, font });
    y -= 18;
  }
  y -= 8;
  audit_page.drawText('This document was signed electronically using Sylk e-sign.', { x: left, y, size: 9, font, color: rgb(0.4, 0.45, 0.55) });
  y -= 12;
  audit_page.drawText('Signature image and audit metadata are embedded below.', { x: left, y, size: 9, font, color: rgb(0.4, 0.45, 0.55) });

  return Buffer.from(await pdfDoc.save());
}

// =============================================================================
// Storage helpers
// =============================================================================

async function uploadToDocuments(path, bytes, contentType = 'application/pdf') {
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

async function downloadFromDocuments(path) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
  if (error) throw new Error(`Storage download failed: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

async function signedUrlForDocuments(path, ttlSec = 60 * 60 * 24 * 30) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, ttlSec);
  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  return data.signedUrl;
}

// =============================================================================
// Document lookup (with ownership)
// =============================================================================

async function loadOwnedDocument(documentType, documentId, ownerId) {
  const cfg = DOC_TABLES[documentType];
  if (!cfg) throw new Error('Invalid document_type');
  const ownerField = cfg.ownerField || 'user_id';
  let query = supabase.from(cfg.table).select('*').eq('id', documentId).eq(ownerField, ownerId);
  // Change orders also pull line items so the rendered PDF has data
  if (documentType === 'change_order') {
    query = supabase.from(cfg.table).select('*, change_order_line_items(*)').eq('id', documentId).eq(ownerField, ownerId);
  }
  const { data, error } = await query.single();
  if (error || !data) throw new Error('Document not found or not owned by caller');
  return data;
}

function documentTitle(documentType, doc) {
  const cfg = DOC_TABLES[documentType];
  return doc[cfg.titleField] || doc[cfg.nameField] || `${documentType} ${doc.id.slice(0, 8)}`;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Owner-initiated. Snapshots the original PDF, hashes it, mints token, sends email.
 */
async function createSignatureRequest({ ownerId, documentType, documentId, signerName, signerEmail, signerPhone }) {
  if (!VALID_DOC_TYPES.has(documentType)) throw new Error('Invalid document_type');
  if (!documentId) throw new Error('document_id required');

  const doc = await loadOwnedDocument(documentType, documentId, ownerId);
  const title = documentTitle(documentType, doc);

  const { bytes, originUrl } = await fetchOriginalBytes(documentType, doc);
  const original_doc_hash = sha256Hex(bytes);

  const { data: sig, error: sigErr } = await supabase
    .from('signatures')
    .insert({
      user_id: ownerId,
      document_type: documentType,
      document_id: documentId,
      signer_name: signerName || null,
      signer_email: signerEmail || null,
      signer_phone: signerPhone || null,
      original_doc_hash,
      audit_json: { origin_url: originUrl },
      status: 'pending',
      created_by: ownerId,
    })
    .select('id')
    .single();
  if (sigErr) throw new Error(`Signature insert failed: ${sigErr.message}`);

  const originalPath = `${ownerId}/originals/${sig.id}.pdf`;
  await uploadToDocuments(originalPath, bytes);

  // Update with the original path now that we have the row id
  await supabase
    .from('signatures')
    .update({ audit_json: { origin_url: originUrl, original_path: originalPath } })
    .eq('id', sig.id);

  const { data: tok, error: tokErr } = await supabase
    .from('signature_tokens')
    .insert({ signature_id: sig.id })
    .select('token, expires_at')
    .single();
  if (tokErr) throw new Error(`Token insert failed: ${tokErr.message}`);

  const signingUrl = `${PORTAL_URL.replace(/\/portal$/, '')}/sign/${tok.token}`;

  // Best-effort email; failure does not block the request (owner can resend via SMS share)
  if (signerEmail) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_name, full_name')
      .eq('id', ownerId)
      .single();
    const businessName = profile?.business_name || profile?.full_name || 'Your contractor';
    getEmailService().sendSignatureRequestEmail({
      documentType,
      documentTitle: title,
      signerName: signerName || 'there',
      signerEmail,
      businessName,
      signingUrl,
      expiresAt: tok.expires_at,
    }).catch(err => logger.warn('[eSign] email send failed:', err.message));
  }

  return {
    signatureId: sig.id,
    signingUrl,
    expiresAt: tok.expires_at,
    documentTitle: title,
  };
}

/**
 * Public — accessed via single-use token. Validates and returns the document
 * info needed to render the sign page.
 */
async function getSigningContext(token) {
  if (!token) throw new Error('Token required');
  const { data: tok } = await supabase
    .from('signature_tokens')
    .select('token, signature_id, expires_at, consumed_at')
    .eq('token', token)
    .single();
  if (!tok) return { status: 'invalid' };
  if (tok.consumed_at) return { status: 'consumed' };
  if (new Date(tok.expires_at) < new Date()) return { status: 'expired' };

  const { data: sig } = await supabase
    .from('signatures')
    .select('id, user_id, document_type, document_id, signer_name, signer_email, status, audit_json')
    .eq('id', tok.signature_id)
    .single();
  if (!sig) return { status: 'invalid' };
  if (sig.status !== 'pending') return { status: sig.status };

  const originalPath = sig.audit_json?.original_path;
  let originalPdfUrl = null;
  if (originalPath) {
    try { originalPdfUrl = await signedUrlForDocuments(originalPath, 60 * 60); } catch (_) {}
  }

  const cfg = DOC_TABLES[sig.document_type];
  const { data: doc } = await supabase
    .from(cfg.table)
    .select(`id, ${cfg.titleField}, ${cfg.nameField}`)
    .eq('id', sig.document_id)
    .single();

  return {
    status: 'pending',
    signatureId: sig.id,
    documentType: sig.document_type,
    documentTitle: doc ? (doc[cfg.titleField] || doc[cfg.nameField]) : null,
    signerName: sig.signer_name,
    signerEmail: sig.signer_email,
    originalPdfUrl,
  };
}

/**
 * Public — submits a signature. Recomputes hash, stamps PDF, marks consumed.
 */
async function recordSignature({ token, signaturePngBase64, signerName, ip, userAgent }) {
  if (!token) throw new Error('Token required');
  if (!signaturePngBase64) throw new Error('Signature image required');

  const { data: tok } = await supabase
    .from('signature_tokens')
    .select('token, signature_id, expires_at, consumed_at')
    .eq('token', token)
    .single();
  if (!tok) throw new Error('Invalid token');
  if (tok.consumed_at) throw new Error('Token already used');
  if (new Date(tok.expires_at) < new Date()) throw new Error('Token expired');

  const { data: sig } = await supabase
    .from('signatures')
    .select('*')
    .eq('id', tok.signature_id)
    .single();
  if (!sig) throw new Error('Signature record missing');
  if (sig.status !== 'pending') throw new Error(`Signature already ${sig.status}`);

  const originalPath = sig.audit_json?.original_path;
  if (!originalPath) throw new Error('Original document not snapshot');

  const originalBytes = await downloadFromDocuments(originalPath);
  const recomputedHash = sha256Hex(originalBytes);
  if (recomputedHash !== sig.original_doc_hash) {
    throw new Error('TAMPER_DETECTED: original document hash mismatch');
  }

  const ts = new Date().toISOString();
  const finalSignerName = signerName || sig.signer_name || 'Customer';

  const signedBytes = await stampSignedPdf({
    originalBytes,
    signaturePngBase64,
    audit: {
      document_type: sig.document_type,
      document_id: sig.document_id,
      signer_name: finalSignerName,
      signer_email: sig.signer_email,
      original_doc_hash: sig.original_doc_hash,
      ts,
      ip,
      user_agent: userAgent,
    },
  });
  const signedPdfHash = sha256Hex(signedBytes);

  // Persist signature image (separate, for ad-hoc display) and signed PDF
  const sigPngPath = `${sig.user_id}/signatures/${sig.id}.png`;
  const signedPdfPath = `${sig.user_id}/signed/${sig.id}.pdf`;
  const sigPngBytes = Buffer.from(signaturePngBase64.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');
  await uploadToDocuments(sigPngPath, sigPngBytes, 'image/png');
  await uploadToDocuments(signedPdfPath, signedBytes);

  const auditJson = {
    ...(sig.audit_json || {}),
    ip: ip || null,
    user_agent: userAgent || null,
    ts,
    signed_pdf_hash: signedPdfHash,
  };

  // Mark token consumed FIRST to prevent double-submit races
  await supabase
    .from('signature_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('token', token)
    .is('consumed_at', null);

  const { error: updErr } = await supabase
    .from('signatures')
    .update({
      status: 'signed',
      signed_at: ts,
      signer_name: finalSignerName,
      signature_png_path: sigPngPath,
      signed_pdf_path: signedPdfPath,
      audit_json: auditJson,
    })
    .eq('id', sig.id);
  if (updErr) throw new Error(`Signature update failed: ${updErr.message}`);

  // Update parent document
  const cfg = DOC_TABLES[sig.document_type];
  await supabase
    .from(cfg.table)
    .update({ current_signature_id: sig.id, signed_at: ts })
    .eq('id', sig.document_id);

  // Approval audit row (entity_type maps directly for estimate/invoice/change_order;
  // contracts have no project link in approval_events.entity_type CHECK, so we skip them)
  if (['estimate', 'invoice', 'change_order'].includes(sig.document_type)) {
    const { data: doc } = await supabase
      .from(cfg.table)
      .select('project_id')
      .eq('id', sig.document_id)
      .single();
    if (doc?.project_id) {
      await supabase.from('approval_events').insert({
        project_id: doc.project_id,
        entity_type: sig.document_type,
        entity_id: sig.document_id,
        action: 'signed_off',
        actor_type: 'client',
        actor_id: sig.user_id, // client_id not always known; record owner_id as actor for traceability
        notes: `Signed by ${finalSignerName}`,
        metadata: { signature_id: sig.id, ip, user_agent: userAgent },
      });
    }
  }

  // Change-order specific: signing a CO is also an approval. Fire the
  // Postgres approve_change_order RPC so the projects.extras + end_date
  // cascade runs atomically. Idempotent — if the CO is already approved
  // (e.g. signature retried), the RPC returns the existing row.
  if (sig.document_type === 'change_order') {
    try {
      const { error: approveErr } = await supabase.rpc('approve_change_order', {
        p_co_id: sig.document_id,
        p_approver_name: finalSignerName,
        p_signature_id: sig.id,
        p_actor_type: 'client',
        p_actor_id: null,
      });
      if (approveErr) {
        // Don't fail the signing — the signature is captured; the cascade
        // can be re-run by the owner if needed. Log loudly.
        logger.error('[eSign] approve_change_order RPC failed after sign:', approveErr.message);
      }
    } catch (err) {
      logger.error('[eSign] approve_change_order threw after sign:', err.message);
    }
  }

  // Notify owner (best-effort)
  const signedPdfUrl = await signedUrlForDocuments(signedPdfPath).catch(() => null);
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', sig.user_id)
      .single();
    if (profile?.email) {
      getEmailService().sendSignatureCompletedEmail({
        ownerEmail: profile.email,
        documentTitle: documentTitle(sig.document_type, await loadOwnedDocument(sig.document_type, sig.document_id, sig.user_id).catch(() => ({ id: sig.document_id }))),
        signerName: finalSignerName,
        signedPdfUrl,
      }).catch(() => {});
    }
  } catch (_) {}

  // Push notification fire-and-forget
  try {
    await supabase.functions.invoke('send-push-notification', {
      body: {
        userId: sig.user_id,
        title: 'Document signed',
        body: `${finalSignerName} signed the ${sig.document_type}`,
        type: 'signature_completed',
        data: { screen: 'SignatureStatus', signatureId: sig.id, documentType: sig.document_type, documentId: sig.document_id },
      },
    });
  } catch (_) {}

  return { signatureId: sig.id, signedPdfUrl, signedPdfPath };
}

/**
 * Public — customer declines. Marks signature declined, consumes token.
 */
async function declineSignature({ token, reason }) {
  const { data: tok } = await supabase
    .from('signature_tokens')
    .select('token, signature_id, expires_at, consumed_at')
    .eq('token', token)
    .single();
  if (!tok) throw new Error('Invalid token');
  if (tok.consumed_at) throw new Error('Token already used');
  if (new Date(tok.expires_at) < new Date()) throw new Error('Token expired');

  await supabase
    .from('signature_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('token', token)
    .is('consumed_at', null);

  const { data: sig } = await supabase
    .from('signatures')
    .update({ status: 'declined', decline_reason: reason || null })
    .eq('id', tok.signature_id)
    .select('user_id, document_type, document_id')
    .single();

  // Notify owner
  if (sig) {
    try {
      await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: sig.user_id,
          title: 'Signature declined',
          body: reason ? `Declined: ${reason}` : 'The customer declined to sign.',
          type: 'signature_declined',
          data: { signatureId: tok.signature_id, documentType: sig.document_type, documentId: sig.document_id },
        },
      });
    } catch (_) {}
  }

  return { ok: true };
}

/**
 * Owner-side. Returns latest status for a document.
 */
async function getSignatureStatus({ documentType, documentId, ownerId }) {
  if (!VALID_DOC_TYPES.has(documentType)) throw new Error('Invalid document_type');
  await loadOwnedDocument(documentType, documentId, ownerId); // ownership check

  const { data: rows } = await supabase
    .from('signatures')
    .select('*')
    .eq('user_id', ownerId)
    .eq('document_type', documentType)
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(1);

  const sig = rows?.[0];
  if (!sig) return { status: 'none' };

  let signedPdfUrl = null;
  if (sig.signed_pdf_path) {
    try { signedPdfUrl = await signedUrlForDocuments(sig.signed_pdf_path); } catch (_) {}
  }

  return {
    signatureId: sig.id,
    status: sig.status,
    signerName: sig.signer_name,
    signerEmail: sig.signer_email,
    signedAt: sig.signed_at,
    signedPdfUrl,
    auditTrail: sig.audit_json || {},
  };
}

/**
 * Owner-side. Cancels a pending request.
 */
async function cancelSignatureRequest({ signatureId, ownerId }) {
  const { data: sig } = await supabase
    .from('signatures')
    .select('id, user_id, status')
    .eq('id', signatureId)
    .single();
  if (!sig || sig.user_id !== ownerId) throw new Error('Signature not found');
  if (sig.status !== 'pending') throw new Error(`Cannot cancel signature in status ${sig.status}`);

  await supabase
    .from('signature_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('signature_id', signatureId)
    .is('consumed_at', null);

  await supabase
    .from('signatures')
    .update({ status: 'expired' })
    .eq('id', signatureId);

  return { ok: true };
}

module.exports = {
  createSignatureRequest,
  getSigningContext,
  recordSignature,
  declineSignature,
  getSignatureStatus,
  cancelSignatureRequest,
  // exported for tests
  _internal: { sha256Hex, renderDocumentPdf, stampSignedPdf, loadOrWrapPdf },
};
