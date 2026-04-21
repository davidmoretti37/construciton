import { supabase } from '../../lib/supabase';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Document upload utility for the Configure Details project builder.
 *
 * NOTE: A separate (legacy) `projectDocuments.js` module in this directory
 * already exports an `uploadProjectDocument` / `fetchProjectDocuments` /
 * `deleteProjectDocument` with a different signature and a different storage
 * bucket (`project-documents`). This file implements the new ProjectBuilder
 * spec, which uses a distinct storage bucket (`project-docs`) and a
 * different function shape that returns `{ success, document }` / `{ error }`.
 * To avoid breaking existing callers of the legacy module, the new spec
 * functions live here under the `ProjectBuilder*` name prefix and are NOT
 * re-exported from `storage/index.js`.
 */

const STORAGE_BUCKET = 'project-docs';

/**
 * Pick a file from the device, upload to Supabase Storage, and insert
 * a project_documents row. Returns the inserted document or null on failure.
 *
 * @param {string} projectId - The (possibly draft) project UUID
 * @param {object} options - { kind?: 'contract'|'plan'|'permit'|'photo'|'other' }
 */
export const pickAndUploadProjectDocument = async (projectId, options = {}) => {
  if (!projectId) {
    return { error: 'projectId required' };
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled) return { canceled: true };
  const file = result.assets?.[0];
  if (!file) return { error: 'No file selected' };

  return await uploadProjectBuilderDocument(projectId, file.uri, file.name, file.mimeType, options);
};

/**
 * Upload an already-resolved file to a project.
 */
export const uploadProjectBuilderDocument = async (projectId, fileUri, originalName, mimeType, options = {}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };

    // Read file as binary (using FileSystem)
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const fileBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    const fileExt = (originalName || '').split('.').pop()?.toLowerCase() || 'bin';
    const safeName = (originalName || `Document_${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user.id}/${projectId}/${Date.now()}-${safeName}`;

    // Determine kind from mime if not provided
    const kind = options.kind || (
      mimeType?.startsWith('image/') ? 'photo'
      : mimeType === 'application/pdf' ? 'contract'
      : 'other'
    );

    // Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBytes, {
        contentType: mimeType || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('uploadProjectBuilderDocument storage error:', uploadError);
      return { error: uploadError.message };
    }

    // Insert metadata row. project_documents already exists (added by 20260326 migration);
    // it has columns project_id, file_name, file_url, file_type, category, uploaded_by, visible_to_workers
    const { data: doc, error: dbError } = await supabase
      .from('project_documents')
      .insert({
        project_id: projectId,
        file_name: originalName || safeName,
        file_url: storagePath,
        file_type: mimeType?.startsWith('image/') ? 'image' : (mimeType === 'application/pdf' || fileExt === 'pdf' ? 'pdf' : 'document'),
        category: kind,
        uploaded_by: user.id,
        visible_to_workers: false,
      })
      .select('id, file_name, file_type, category, file_url, created_at')
      .single();

    if (dbError) {
      console.error('uploadProjectBuilderDocument db error:', dbError);
      // Try to clean up the uploaded file
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]).catch(() => {});
      return { error: dbError.message };
    }

    return { success: true, document: doc };
  } catch (e) {
    console.error('uploadProjectBuilderDocument exception:', e);
    return { error: e.message || 'Upload failed' };
  }
};

/**
 * Fetch all documents attached to a project.
 */
export const fetchProjectBuilderDocuments = async (projectId) => {
  if (!projectId) return [];
  const { data, error } = await supabase
    .from('project_documents')
    .select('id, file_name, file_type, category, file_url, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchProjectBuilderDocuments error:', error);
    return [];
  }
  return data || [];
};

/**
 * Get a public/signed URL to download/view a stored file.
 */
export const getProjectBuilderDocumentUrl = async (storagePath, options = {}) => {
  const expiresIn = options.expiresIn || 3600;
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) {
    console.error('getProjectBuilderDocumentUrl error:', error);
    return null;
  }
  return data?.signedUrl || null;
};

/**
 * Delete a document (storage object + DB row).
 */
export const deleteProjectBuilderDocument = async (documentId) => {
  // First get the storage path
  const { data: doc } = await supabase
    .from('project_documents')
    .select('id, file_url')
    .eq('id', documentId)
    .single();

  if (!doc) return { error: 'Document not found' };

  // Remove from storage (best-effort)
  if (doc.file_url) {
    await supabase.storage.from(STORAGE_BUCKET).remove([doc.file_url]).catch(() => {});
  }

  // Delete the row
  const { error } = await supabase
    .from('project_documents')
    .delete()
    .eq('id', documentId);

  if (error) return { error: error.message };
  return { success: true };
};
