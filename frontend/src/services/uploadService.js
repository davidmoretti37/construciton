import { supabase } from '../lib/supabase';

/**
 * Upload Service
 * Handles file uploads to Supabase storage
 */

/**
 * Upload photo to Supabase storage
 * @param {string} uri - Local file URI
 * @param {string} folder - Storage folder (default: 'daily-reports')
 * @returns {Promise<string|null>} Public URL or null if error
 */
export const uploadPhoto = async (uri, folder = 'daily-reports') => {
  try {
    // Convert URI to blob
    const response = await fetch(uri);
    const blob = await response.blob();

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const extension = uri.split('.').pop() || 'jpg';
    const filename = `${timestamp}-${random}.${extension}`;
    const filePath = `${folder}/${filename}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, blob, {
        contentType: `image/${extension}`,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Error uploading photo:', error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Error in uploadPhoto:', error);
    return null;
  }
};
