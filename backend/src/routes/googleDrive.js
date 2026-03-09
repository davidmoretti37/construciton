const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { fetchWithRetry } = require('../utils/fetchWithRetry');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// Supabase admin client (service role)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// ENCRYPTION HELPERS (AES-256-GCM)
// ============================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY not configured');
  return Buffer.from(key, 'hex');
}

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  // Store as iv:tag:ciphertext
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

function decrypt(data) {
  const [ivHex, tagHex, ciphertext] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============================================================
// OAUTH2 CLIENT FACTORY
// ============================================================

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI
  );
}

// ============================================================
// HELPER: getGoogleDriveClient(userId)
// ============================================================

async function getGoogleDriveClient(userId) {
  const { data: connection, error } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google_drive')
    .single();

  if (error || !connection) {
    return null;
  }

  let accessToken, refreshToken;
  try {
    accessToken = decrypt(connection.access_token);
    refreshToken = decrypt(connection.refresh_token);
  } catch (err) {
    logger.error('Failed to decrypt Google Drive tokens:', err.message);
    return null;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Auto-refresh listener: update stored access token when refreshed
  oauth2Client.on('tokens', async (tokens) => {
    try {
      const updates = {
        updated_at: new Date().toISOString(),
      };
      if (tokens.access_token) {
        updates.access_token = encrypt(tokens.access_token);
      }
      if (tokens.refresh_token) {
        updates.refresh_token = encrypt(tokens.refresh_token);
      }
      await supabase
        .from('oauth_connections')
        .update(updates)
        .eq('user_id', userId)
        .eq('provider', 'google_drive');
      logger.info('Google Drive tokens refreshed for user', userId.substring(0, 8));
    } catch (err) {
      logger.error('Failed to update refreshed tokens:', err.message);
    }
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

// ============================================================
// AUTH MIDDLEWARE (reused from server.js pattern)
// ============================================================

const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = authHeader.substring(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      logger.warn('Auth failed:', error?.message || 'No user found');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Guard: check if Google Drive env vars are configured
const requireGoogleDrive = (req, res, next) => {
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Google Drive integration not configured' });
  }
  next();
};

// ============================================================
// 1. GET /auth — Generate Google OAuth2 URL
// ============================================================

router.get('/auth', requireGoogleDrive, authenticateUser, async (req, res) => {
  const start = Date.now();
  try {
    const userId = req.user.id;
    const oauth2Client = createOAuth2Client();

    const state = Buffer.from(JSON.stringify({ userId })).toString('base64');

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive.file'],
      state,
    });

    logger.info('Google Drive auth URL generated', {
      service: 'google-drive',
      endpoint: '/auth',
      userId: userId.substring(0, 8),
      durationMs: Date.now() - start,
      status: 'success',
    });

    res.json({ authUrl });
  } catch (error) {
    logger.error('Google Drive auth URL error:', error.message);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// ============================================================
// 2. GET /callback — OAuth callback from Google
// ============================================================

router.get('/callback', requireGoogleDrive, async (req, res) => {
  const start = Date.now();
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send('Missing authorization code or state');
    }

    // Decode state to get userId
    let userId;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      userId = decoded.userId;
    } catch {
      return res.status(400).send('Invalid state parameter');
    }

    // Exchange code for tokens
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user's Google email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    const providerEmail = userInfo.email;

    // Encrypt tokens before storing
    const encryptedAccessToken = encrypt(tokens.access_token);
    const encryptedRefreshToken = encrypt(tokens.refresh_token);

    // Upsert into oauth_connections
    const { error: upsertError } = await supabase
      .from('oauth_connections')
      .upsert({
        user_id: userId,
        provider: 'google_drive',
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        provider_email: providerEmail,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });

    if (upsertError) {
      logger.error('Failed to store Google Drive tokens:', upsertError);
      return res.status(500).send('Failed to save connection');
    }

    logger.info('Google Drive connected', {
      service: 'google-drive',
      endpoint: '/callback',
      userId: userId.substring(0, 8),
      email: providerEmail,
      durationMs: Date.now() - start,
      status: 'success',
    });

    // Deep-link back to the app
    res.redirect('sylk://integrations/google-drive/success');
  } catch (error) {
    logger.error('Google Drive callback error:', error.message);
    res.redirect('sylk://integrations/google-drive/error');
  }
});

// ============================================================
// 3. DELETE /disconnect — Revoke token and delete connection
// ============================================================

router.delete('/disconnect', requireGoogleDrive, authenticateUser, async (req, res) => {
  const start = Date.now();
  try {
    const userId = req.user.id;

    // Get current connection to revoke token
    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'google_drive')
      .single();

    if (connection) {
      try {
        const token = decrypt(connection.access_token);
        await fetchWithRetry(
          `https://oauth2.googleapis.com/revoke?token=${token}`,
          { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
          { timeout: 10000, retries: 2, retryDelay: 500, name: 'Google Revoke' }
        );
      } catch (revokeErr) {
        // Token may already be invalid — continue with deletion
        logger.warn('Token revocation failed (continuing):', revokeErr.message);
      }
    }

    // Delete the connection row
    await supabase
      .from('oauth_connections')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'google_drive');

    logger.info('Google Drive disconnected', {
      service: 'google-drive',
      endpoint: '/disconnect',
      userId: userId.substring(0, 8),
      durationMs: Date.now() - start,
      status: 'success',
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Google Drive disconnect error:', error.message);
    res.status(500).json({ error: 'Failed to disconnect Google Drive' });
  }
});

// ============================================================
// 4. GET /status — Check connection status
// ============================================================

router.get('/status', requireGoogleDrive, authenticateUser, async (req, res) => {
  const start = Date.now();
  try {
    const userId = req.user.id;

    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('provider_email, connected_at')
      .eq('user_id', userId)
      .eq('provider', 'google_drive')
      .single();

    logger.info('Google Drive status check', {
      service: 'google-drive',
      endpoint: '/status',
      userId: userId.substring(0, 8),
      durationMs: Date.now() - start,
      status: 'success',
    });

    if (!connection) {
      return res.json({ connected: false });
    }

    res.json({
      connected: true,
      email: connection.provider_email,
      connectedAt: connection.connected_at,
    });
  } catch (error) {
    logger.error('Google Drive status error:', error.message);
    res.status(500).json({ error: 'Failed to check connection status' });
  }
});

// ============================================================
// 5. GET /files — List files from Google Drive
// ============================================================

router.get('/files', requireGoogleDrive, authenticateUser, async (req, res) => {
  const start = Date.now();
  try {
    const userId = req.user.id;
    const { folderId = 'root', q: searchQuery, pageToken } = req.query;

    const drive = await getGoogleDriveClient(userId);
    if (!drive) {
      return res.status(400).json({
        error: 'Google Drive not connected',
        code: 'DRIVE_NOT_CONNECTED',
      });
    }

    // Build query
    let query = `'${folderId}' in parents and trashed = false`;
    if (searchQuery) {
      query = `name contains '${searchQuery.replace(/'/g, "\\'")}' and trashed = false`;
    }

    const response = await drive.files.list({
      q: query,
      pageSize: 100,
      pageToken: pageToken || undefined,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, iconLink)',
      orderBy: 'folder,modifiedTime desc',
    });

    logger.info('Google Drive files listed', {
      service: 'google-drive',
      endpoint: '/files',
      userId: userId.substring(0, 8),
      fileCount: response.data.files?.length || 0,
      durationMs: Date.now() - start,
      status: 'success',
    });

    res.json({
      files: response.data.files || [],
      nextPageToken: response.data.nextPageToken || null,
    });
  } catch (error) {
    if (error.code === 401 || error?.response?.status === 401) {
      // Token expired — clean up connection
      await supabase
        .from('oauth_connections')
        .delete()
        .eq('user_id', req.user.id)
        .eq('provider', 'google_drive');
      return res.status(401).json({
        error: 'Google Drive connection expired',
        code: 'DRIVE_TOKEN_EXPIRED',
      });
    }
    logger.error('Google Drive files error:', error.message);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// ============================================================
// 6. POST /import — Import a file from Drive to Supabase Storage
// ============================================================

router.post('/import', requireGoogleDrive, authenticateUser, async (req, res) => {
  const start = Date.now();
  try {
    const userId = req.user.id;
    const { driveFileId, projectId, fileName } = req.body;

    if (!driveFileId || !projectId || !fileName) {
      return res.status(400).json({ error: 'driveFileId, projectId, and fileName are required' });
    }

    const drive = await getGoogleDriveClient(userId);
    if (!drive) {
      return res.status(400).json({
        error: 'Google Drive not connected',
        code: 'DRIVE_NOT_CONNECTED',
      });
    }

    // Download file from Drive
    const driveResponse = await drive.files.get(
      { fileId: driveFileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    const fileBuffer = Buffer.from(driveResponse.data);
    const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
    const timestamp = Date.now();
    const storagePath = `${userId}/${projectId}/${timestamp}_${fileName}`;

    // Determine content type
    let contentType = 'application/octet-stream';
    if (fileExt === 'pdf') contentType = 'application/pdf';
    else if (fileExt === 'docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (['png', 'jpg', 'jpeg'].includes(fileExt)) contentType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;

    // Upload to Supabase Storage (always do this first — Drive sync is secondary)
    const { error: uploadError } = await supabase.storage
      .from('project-documents')
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      logger.error('Supabase storage upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload file to storage' });
    }

    // Extract text if PDF or DOCX
    let extractedText = null;
    try {
      if (fileExt === 'pdf') {
        const pdfData = await pdfParse(fileBuffer);
        extractedText = (pdfData.text || '').trim();
      } else if (fileExt === 'docx') {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = (result.value || '').trim();
      }
    } catch (extractErr) {
      logger.warn('Text extraction failed (non-blocking):', extractErr.message);
    }

    // Upsert document record (idempotent via drive_file_id)
    const { data: doc, error: dbError } = await supabase
      .from('project_documents')
      .upsert({
        project_id: projectId,
        file_name: fileName,
        file_url: storagePath,
        file_type: ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt) ? 'image' : 'document',
        category: 'general',
        uploaded_by: userId,
        drive_file_id: driveFileId,
        drive_sync_status: 'synced',
      }, {
        onConflict: 'drive_file_id',
      })
      .select('id, file_url')
      .single();

    if (dbError) {
      logger.error('Database insert error:', dbError);
      return res.status(500).json({ error: 'Failed to save document record' });
    }

    logger.info('Google Drive file imported', {
      service: 'google-drive',
      endpoint: '/import',
      userId: userId.substring(0, 8),
      fileName,
      durationMs: Date.now() - start,
      status: 'success',
    });

    res.json({
      documentId: doc.id,
      fileUrl: doc.file_url,
      ...(extractedText ? { extractedText } : {}),
    });
  } catch (error) {
    if (error.code === 401 || error?.response?.status === 401) {
      await supabase
        .from('oauth_connections')
        .delete()
        .eq('user_id', req.user.id)
        .eq('provider', 'google_drive');
      return res.status(401).json({
        error: 'Google Drive connection expired',
        code: 'DRIVE_TOKEN_EXPIRED',
      });
    }
    logger.error('Google Drive import error:', error.message);
    res.status(500).json({ error: 'Failed to import file from Google Drive' });
  }
});

// ============================================================
// 7. POST /export — Export a document to Google Drive
// ============================================================

router.post('/export', requireGoogleDrive, authenticateUser, async (req, res) => {
  const start = Date.now();
  try {
    const userId = req.user.id;
    const { documentId, projectId } = req.body;

    if (!documentId || !projectId) {
      return res.status(400).json({ error: 'documentId and projectId are required' });
    }

    const drive = await getGoogleDriveClient(userId);
    if (!drive) {
      return res.status(400).json({
        error: 'Google Drive not connected',
        code: 'DRIVE_NOT_CONNECTED',
      });
    }

    // Get document record
    const { data: doc, error: docError } = await supabase
      .from('project_documents')
      .select('id, file_name, file_url, file_type')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get project info
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, drive_folder_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Download file from Supabase Storage using signed URL
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('project-documents')
      .createSignedUrl(doc.file_url, 300); // 5 min expiry

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return res.status(500).json({ error: 'Failed to access file in storage' });
    }

    const fileResponse = await fetchWithRetry(
      signedUrlData.signedUrl,
      {},
      { timeout: 30000, retries: 2, retryDelay: 1000, name: 'Supabase Download' }
    );
    const fileBuffer = await fileResponse.buffer();

    // Get or create the project's Drive folder
    let folderId = project.drive_folder_id;

    if (!folderId) {
      // Create folder in Drive
      const folderMetadata = {
        name: `Sylk - ${project.name}`,
        mimeType: 'application/vnd.google-apps.folder',
      };
      const folder = await drive.files.create({
        requestBody: folderMetadata,
        fields: 'id',
      });
      folderId = folder.data.id;

      // Store folder ID on the project
      await supabase
        .from('projects')
        .update({ drive_folder_id: folderId })
        .eq('id', projectId);
    }

    // Determine MIME type
    const fileExt = doc.file_name.split('.').pop()?.toLowerCase() || '';
    let mimeType = 'application/octet-stream';
    if (fileExt === 'pdf') mimeType = 'application/pdf';
    else if (fileExt === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (['png', 'jpg', 'jpeg'].includes(fileExt)) mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;

    // Upload to Drive
    const { Readable } = require('stream');
    const driveFile = await drive.files.create({
      requestBody: {
        name: doc.file_name,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from(fileBuffer),
      },
      fields: 'id',
    });

    const driveFileId = driveFile.data.id;

    // Update document record with Drive info
    await supabase
      .from('project_documents')
      .update({
        drive_file_id: driveFileId,
        drive_sync_status: 'synced',
      })
      .eq('id', documentId);

    // Build folder URL
    const driveFolderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    logger.info('Document exported to Google Drive', {
      service: 'google-drive',
      endpoint: '/export',
      userId: userId.substring(0, 8),
      documentId,
      driveFileId,
      durationMs: Date.now() - start,
      status: 'success',
    });

    res.json({ driveFileId, driveFolderUrl });
  } catch (error) {
    if (error.code === 401 || error?.response?.status === 401) {
      await supabase
        .from('oauth_connections')
        .delete()
        .eq('user_id', req.user.id)
        .eq('provider', 'google_drive');
      return res.status(401).json({
        error: 'Google Drive connection expired',
        code: 'DRIVE_TOKEN_EXPIRED',
      });
    }
    logger.error('Google Drive export error:', error.message);
    res.status(500).json({ error: 'Failed to export document to Google Drive' });
  }
});

module.exports = router;
