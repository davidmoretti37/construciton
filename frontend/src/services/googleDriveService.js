import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import logger from '../utils/logger';
import { API_URL as BACKEND_URL } from '../config/api';
const BASE_PATH = '/api/integrations/google-drive';

/**
 * Get the current Supabase auth token.
 */
async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  // Try refreshing
  const { data: { session: refreshed } } = await supabase.auth.refreshSession();
  if (refreshed?.access_token) return refreshed.access_token;
  throw { message: 'Not authenticated', code: 'AUTH_REQUIRED' };
}

/**
 * Make an authenticated request to the Google Drive backend.
 */
async function driveRequest(path, options = {}) {
  const token = await getAuthToken();
  const url = `${BACKEND_URL}${BASE_PATH}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = {
      message: data.error || 'Request failed',
      code: data.code || 'UNKNOWN_ERROR',
    };
    throw error;
  }

  return data;
}

/**
 * Check if Google Drive is connected for the current user.
 * @returns {{ connected: boolean, email?: string, connectedAt?: string }}
 */
export async function getConnectionStatus() {
  return driveRequest('/status');
}

/**
 * Start the Google OAuth flow using expo-web-browser.
 * Opens the Google consent screen; the deep-link return is handled automatically.
 */
export async function startOAuthFlow() {
  const { authUrl } = await driveRequest('/auth');

  const result = await WebBrowser.openAuthSessionAsync(
    authUrl,
    'sylk://integrations/google-drive/success'
  );

  logger.debug('OAuth flow result:', result.type);
  return result;
}

/**
 * Disconnect Google Drive for the current user.
 */
export async function disconnect() {
  return driveRequest('/disconnect', { method: 'DELETE' });
}

/**
 * List files from the user's Google Drive.
 * @param {string} [folderId] - Folder to list (default: root)
 * @param {string} [searchQuery] - Search query
 * @param {string} [pageToken] - Pagination token
 * @returns {{ files: Array, nextPageToken?: string }}
 */
export async function listFiles(folderId, searchQuery, pageToken) {
  const params = new URLSearchParams();
  if (folderId) params.set('folderId', folderId);
  if (searchQuery) params.set('q', searchQuery);
  if (pageToken) params.set('pageToken', pageToken);

  const qs = params.toString();
  return driveRequest(`/files${qs ? `?${qs}` : ''}`);
}

/**
 * Import a file from Google Drive into a Sylk project.
 * @param {string} driveFileId - Google Drive file ID
 * @param {string} projectId - Target project ID
 * @param {string} fileName - File name
 * @returns {{ documentId: string, fileUrl: string, extractedText?: string }}
 */
export async function importFile(driveFileId, projectId, fileName) {
  return driveRequest('/import', {
    method: 'POST',
    body: JSON.stringify({ driveFileId, projectId, fileName }),
  });
}

/**
 * Export a document from Supabase Storage to Google Drive.
 * @param {string} documentId - Document ID in project_documents
 * @param {string} projectId - Project ID
 * @returns {{ driveFileId: string, driveFolderUrl: string }}
 */
export async function exportDocument(documentId, projectId) {
  return driveRequest('/export', {
    method: 'POST',
    body: JSON.stringify({ documentId, projectId }),
  });
}
