import { supabase } from '../../lib/supabase';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { API_URL as BACKEND_URL } from '../../config/api';

/**
 * ProjectBuilder document helpers.
 *
 * Uploads and reads are routed through the backend `/api/project-docs` proxy
 * because the `project-docs` storage bucket is private and its storage.objects
 * RLS policies must be created by supabase_storage_admin (which the service
 * role key cannot become). The backend uses SRK, bypassing RLS.
 */

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export const pickAndUploadProjectDocument = async (projectId, options = {}) => {
  if (!projectId) return { error: 'projectId required' };

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

export const uploadProjectBuilderDocument = async (projectId, fileUri, originalName, mimeType, options = {}) => {
  try {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/api/project-docs/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId,
        fileName: originalName || `Document_${Date.now()}`,
        mimeType: mimeType || 'application/octet-stream',
        base64,
        kind: options.kind || null,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { error: data.error || `Upload failed (HTTP ${response.status})` };
    }
    return { success: true, document: data.document };
  } catch (e) {
    console.error('uploadProjectBuilderDocument exception:', e);
    return { error: e.message || 'Upload failed' };
  }
};

export const fetchProjectBuilderDocuments = async (projectId) => {
  if (!projectId) return [];
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/api/project-docs/by-project/${projectId}`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.documents || [];
  } catch (e) {
    console.error('fetchProjectBuilderDocuments error:', e);
    return [];
  }
};

/**
 * Resolve a signed URL for a document. Accepts either a document ID (preferred)
 * or a storage path for backward compatibility with callers that saved the
 * file_url directly.
 */
export const getProjectBuilderDocumentUrl = async (documentIdOrPath, options = {}) => {
  if (!documentIdOrPath) return null;
  try {
    const headers = await getAuthHeaders();
    const expiresIn = options.expiresIn || 3600;
    const response = await fetch(
      `${BACKEND_URL}/api/project-docs/${encodeURIComponent(documentIdOrPath)}/signed-url?expiresIn=${expiresIn}`,
      { method: 'GET', headers }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data?.url || null;
  } catch (e) {
    console.error('getProjectBuilderDocumentUrl error:', e);
    return null;
  }
};

export const deleteProjectBuilderDocument = async (documentId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/api/project-docs/${documentId}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { error: data.error || `Delete failed (HTTP ${response.status})` };
    }
    return { success: true };
  } catch (e) {
    return { error: e.message || 'Delete failed' };
  }
};
