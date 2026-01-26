import { supabase } from '../../lib/supabase';

// ============================================================
// File Storage Functions
// ============================================================

/**
 * Upload photo to Supabase Storage
 * @param {string} uri - Local file URI
 * @param {string} folder - Folder path in storage (e.g., 'daily-reports', 'projects')
 * @returns {Promise<string|null>} - Public URL of uploaded photo or null
 */
export const uploadPhoto = async (uri, folder = 'daily-reports') => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user for photo upload');
      return null;
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const extension = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = `${timestamp}-${random}.${extension}`;
    const filePath = `${folder}/${user.id}/${filename}`;

    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, uint8Array, {
        contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Error uploading photo:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Error in uploadPhoto:', error);
    return null;
  }
};
