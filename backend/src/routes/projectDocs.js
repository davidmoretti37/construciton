/**
 * Project Documents proxy
 *
 * Backend-mediated uploads for the private `project-docs` storage bucket.
 * Needed because storage.objects RLS policies can only be created by
 * supabase_storage_admin, so we route through the backend (SRK bypasses RLS)
 * rather than letting the client talk to storage directly.
 *
 * POST   /api/project-docs/upload               — base64 body, inserts row
 * GET    /api/project-docs/:id/signed-url       — returns { url }
 * DELETE /api/project-docs/:id                  — removes storage object + row
 * GET    /api/project-docs/by-project/:projectId — list documents
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { authenticateUser } = require('../middleware/authenticate');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = 'project-docs';

router.use(authenticateUser);

async function userOwnsProject(userId, projectId) {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  return !error && !!data;
}

async function userCanAccessDocument(userId, documentId) {
  const { data: doc, error } = await supabase
    .from('project_documents')
    .select('id, project_id, uploaded_by, file_url')
    .eq('id', documentId)
    .maybeSingle();
  if (error || !doc) return null;
  if (doc.uploaded_by === userId) return doc;
  if (doc.project_id && await userOwnsProject(userId, doc.project_id)) return doc;
  return null;
}

router.post('/upload', async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId, fileName, mimeType, base64, kind } = req.body || {};

    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    if (!fileName) return res.status(400).json({ error: 'fileName required' });
    if (!base64) return res.status(400).json({ error: 'base64 required' });

    const owns = await userOwnsProject(userId, projectId);
    if (!owns) return res.status(403).json({ error: 'Not authorized for that project' });

    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = (safeName.split('.').pop() || 'bin').toLowerCase();
    const storagePath = `${userId}/${projectId}/${Date.now()}-${safeName}`;

    const raw = base64.includes(',') ? base64.split(',')[1] : base64;
    const buffer = Buffer.from(raw, 'base64');

    if (buffer.length > 25 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (25 MB max)' });
    }

    const resolvedKind = kind || (
      mimeType?.startsWith('image/') ? 'photo'
      : mimeType === 'application/pdf' ? 'contract'
      : 'other'
    );

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimeType || 'application/octet-stream',
        upsert: false,
      });
    if (upErr) {
      logger.error('[project-docs] upload error:', upErr.message);
      return res.status(500).json({ error: upErr.message });
    }

    const fileType = mimeType?.startsWith('image/')
      ? 'image'
      : (mimeType === 'application/pdf' || ext === 'pdf' ? 'pdf' : 'document');

    const { data: row, error: dbErr } = await supabase
      .from('project_documents')
      .insert({
        project_id: projectId,
        file_name: fileName,
        file_url: storagePath,
        file_type: fileType,
        category: resolvedKind,
        uploaded_by: userId,
        visible_to_workers: false,
      })
      .select('id, file_name, file_type, category, file_url, created_at')
      .single();

    if (dbErr) {
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      logger.error('[project-docs] db insert error:', dbErr.message);
      return res.status(500).json({ error: dbErr.message });
    }

    res.json({ success: true, document: row });
  } catch (e) {
    logger.error('[project-docs] /upload exception:', e.message);
    res.status(500).json({ error: e.message || 'Upload failed' });
  }
});

router.get('/by-project/:projectId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId } = req.params;

    const owns = await userOwnsProject(userId, projectId);
    if (!owns) return res.status(403).json({ error: 'Not authorized' });

    const { data, error } = await supabase
      .from('project_documents')
      .select('id, file_name, file_type, category, file_url, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ documents: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Fetch failed' });
  }
});

router.get('/:id/signed-url', async (req, res) => {
  try {
    const userId = req.user.id;
    const doc = await userCanAccessDocument(userId, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const expiresIn = parseInt(req.query.expiresIn, 10) || 3600;
    // Probe both buckets: new ProjectBuilder uploads live in `project-docs`,
    // legacy uploads live in `project-documents`. We don't record which
    // bucket a row belongs to, so try the new one first and fall back.
    const bucketsToTry = [BUCKET, 'project-documents'];
    let signedUrl = null;
    let lastError = null;
    for (const bucket of bucketsToTry) {
      try {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(doc.file_url, expiresIn);
        if (!error && data?.signedUrl) {
          signedUrl = data.signedUrl;
          break;
        }
        lastError = error;
      } catch (probeErr) {
        lastError = probeErr;
      }
    }
    if (!signedUrl) {
      return res.status(404).json({
        error: lastError?.message || 'File not found in any project bucket',
      });
    }
    res.json({ url: signedUrl });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to sign URL' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const doc = await userCanAccessDocument(userId, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (doc.file_url) {
      await supabase.storage.from(BUCKET).remove([doc.file_url]).catch(() => {});
    }
    const { error } = await supabase
      .from('project_documents')
      .delete()
      .eq('id', doc.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Delete failed' });
  }
});

module.exports = router;
