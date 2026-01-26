import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from './auth';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Upload a document to a project
 * @param {string} projectId - The project ID
 * @param {string} fileUri - Local file URI
 * @param {string} fileName - Original file name
 * @param {string} fileType - 'image' or 'document'
 * @param {string} category - Document category (e.g., 'scope', 'permit', 'blueprint', 'general')
 * @param {string} notes - Optional notes about the document
 * @param {boolean} visibleToWorkers - Whether workers can see this document
 */
export const uploadProjectDocument = async (projectId, fileUri, fileName, fileType = 'document', category = 'general', notes = null, visibleToWorkers = false) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    // Get file extension
    const fileExt = fileName ? fileName.split('.').pop()?.toLowerCase() : 'jpg';
    const timestamp = Date.now();
    const filePath = `${userId}/${projectId}/${timestamp}.${fileExt}`;

    // Determine content type
    let contentType;
    if (fileType === 'image') {
      contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
    } else {
      contentType = fileExt === 'pdf' ? 'application/pdf' : 'application/octet-stream';
    }

    // Read file as base64
    const base64Data = await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'base64',
    });

    // Convert base64 to ArrayBuffer for Supabase upload
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to Supabase storage (use project-documents bucket)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('project-documents')
      .upload(filePath, bytes.buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('project-documents')
      .getPublicUrl(filePath);

    // Save document record to database
    const { data, error: dbError } = await supabase
      .from('project_documents')
      .insert({
        project_id: projectId,
        file_name: fileName || `Document ${timestamp}`,
        file_url: publicUrl,
        file_type: fileType,
        category: category,
        uploaded_by: userId,
        notes: notes,
        visible_to_workers: visibleToWorkers,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    return data;
  } catch (error) {
    console.error('Error uploading project document:', error);
    return null;
  }
};

/**
 * Fetch all documents for a project
 * @param {string} projectId - The project ID
 * @param {boolean} workerView - If true, only returns documents visible to workers
 */
export const fetchProjectDocuments = async (projectId, workerView = false) => {
  try {
    if (!projectId) return [];

    let query = supabase
      .from('project_documents')
      .select('*')
      .eq('project_id', projectId);

    // If worker view, only show documents marked as visible to workers
    if (workerView) {
      query = query.eq('visible_to_workers', true);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching project documents:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchProjectDocuments:', error);
    return [];
  }
};

/**
 * Update document visibility for workers
 * @param {string} documentId - The document ID
 * @param {boolean} visibleToWorkers - Whether workers can see this document
 */
export const updateDocumentVisibility = async (documentId, visibleToWorkers) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('project_documents')
      .update({ visible_to_workers: visibleToWorkers })
      .eq('id', documentId);

    if (error) {
      console.error('Error updating document visibility:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateDocumentVisibility:', error);
    return false;
  }
};

/**
 * Delete a project document
 * @param {string} documentId - The document ID
 */
export const deleteProjectDocument = async (documentId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    // First get the document to check ownership and get file path
    const { data: doc, error: fetchError } = await supabase
      .from('project_documents')
      .select('*, projects!inner(user_id)')
      .eq('id', documentId)
      .single();

    if (fetchError || !doc) {
      console.error('Error fetching document:', fetchError);
      return false;
    }

    // Check if user owns the project
    if (doc.projects.user_id !== userId) {
      console.error('User does not own this project');
      return false;
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('project_documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) {
      console.error('Error deleting document:', deleteError);
      return false;
    }

    // Note: We could also delete from storage, but keeping files
    // in storage is fine as orphaned files can be cleaned up later

    return true;
  } catch (error) {
    console.error('Error in deleteProjectDocument:', error);
    return false;
  }
};
