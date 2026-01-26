/**
 * Service Data Service
 * Handles all database queries for the service system
 * Replaces hardcoded trades.js and phaseTemplates.js
 */

import { supabase } from '../lib/supabase';

/**
 * Get all active service categories
 * @returns {Promise<Array>} Array of service categories
 */
export const getAllServices = async () => {
  try {
    const { data, error } = await supabase
      .from('service_categories')
      .select('*')
      .eq('is_active', true)
      .order('times_used', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching services:', error);
    return [];
  }
};

/**
 * Get a single service by ID
 * @param {string} serviceId - Service category ID
 * @returns {Promise<object>} Service category object
 */
export const getServiceById = async (serviceId) => {
  try {
    const { data, error } = await supabase
      .from('service_categories')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching service:', error);
    return null;
  }
};

/**
 * Get a service by name (case-insensitive)
 * @param {string} serviceName - Service name
 * @returns {Promise<object>} Service category object
 */
export const getServiceByName = async (serviceName) => {
  try {
    const { data, error } = await supabase
      .from('service_categories')
      .select('*')
      .ilike('name', serviceName)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching service by name:', error);
    return null;
  }
};

/**
 * Search services by query string
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of matching services
 */
export const searchServices = async (query) => {
  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('service_categories')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .order('times_used', { ascending: false })
      .limit(10);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error searching services:', error);
    return [];
  }
};

/**
 * Get service items for a category
 * @param {string} categoryId - Service category ID
 * @returns {Promise<Array>} Array of service items
 */
export const getServiceItems = async (categoryId) => {
  try {
    const { data, error } = await supabase
      .from('service_items')
      .select('*')
      .eq('category_id', categoryId)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching service items:', error);
    return [];
  }
};

/**
 * Get phase templates for a category
 * @param {string} categoryId - Service category ID
 * @returns {Promise<Array>} Array of phase templates
 */
export const getPhaseTemplates = async (categoryId) => {
  try {
    const { data, error } = await supabase
      .from('service_phase_templates')
      .select('*')
      .eq('category_id', categoryId)
      .order('order_index', { ascending: true});

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching phase templates:', error);
    return [];
  }
};

/**
 * Get combined phase templates for multiple categories
 * @param {Array<string>} categoryIds - Array of category IDs
 * @returns {Promise<Array>} Deduplicated array of phase templates
 */
export const getCombinedPhaseTemplates = async (categoryIds) => {
  if (!categoryIds || categoryIds.length === 0) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('service_phase_templates')
      .select('*')
      .in('category_id', categoryIds)
      .order('order_index', { ascending: true });

    if (error) throw error;

    // Deduplicate by phase name
    const seen = new Set();
    const unique = [];

    (data || []).forEach(phase => {
      if (!seen.has(phase.phase_name)) {
        unique.push(phase);
        seen.add(phase.phase_name);
      }
    });

    return unique;
  } catch (error) {
    console.error('Error fetching combined phase templates:', error);
    return [];
  }
};

/**
 * Get user's selected services
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of user services with category details
 */
export const getUserServices = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_services')
      .select(`
        *,
        service_categories (
          id,
          name,
          description,
          icon
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching user services:', error);
    return [];
  }
};

/**
 * Add a service to user's profile
 * @param {string} userId - User ID
 * @param {string} categoryId - Service category ID
 * @param {object} options - Optional custom items, phases, pricing
 * @returns {Promise<object>} Created user service
 */
export const addUserService = async (userId, categoryId, options = {}) => {
  try {
    const { data, error } = await supabase
      .from('user_services')
      .insert({
        user_id: userId,
        category_id: categoryId,
        custom_items: options.customItems || [],
        custom_phases: options.customPhases || [],
        pricing: options.pricing || {},
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding user service:', error);
    throw error;
  }
};

/**
 * Update user service pricing and customizations
 * @param {string} userServiceId - User service ID
 * @param {object} updates - Updates object
 * @returns {Promise<object>} Updated user service
 */
export const updateUserService = async (userServiceId, updates) => {
  try {
    const { data, error } = await supabase
      .from('user_services')
      .update(updates)
      .eq('id', userServiceId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating user service:', error);
    throw error;
  }
};

/**
 * Remove a service from user's profile (soft delete)
 * @param {string} userServiceId - User service ID
 * @returns {Promise<boolean>} Success status
 */
export const removeUserService = async (userServiceId) => {
  try {
    const { error } = await supabase
      .from('user_services')
      .update({ is_active: false })
      .eq('id', userServiceId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error removing user service:', error);
    return false;
  }
};

/**
 * Log a service search for analytics
 * @param {string} searchTerm - What the user searched for
 * @param {string} categoryId - Matched category (if any)
 * @param {string} userId - User ID (optional)
 * @param {boolean} resultFound - Whether a result was found
 */
export const logServiceSearch = async (searchTerm, categoryId = null, userId = null, resultFound = false) => {
  try {
    await supabase
      .from('service_search_analytics')
      .insert({
        search_term: searchTerm,
        category_matched: categoryId,
        user_id: userId,
        result_found: resultFound,
      });
  } catch (error) {
    // Silent fail - analytics shouldn't break the app
    console.log('Analytics log failed:', error.message);
  }
};

/**
 * Create a new service category (for AI-generated services)
 * @param {object} serviceData - Service data
 * @returns {Promise<object>} Created service category
 */
export const createServiceCategory = async (serviceData) => {
  try {
    const { data, error } = await supabase
      .from('service_categories')
      .insert({
        name: serviceData.name,
        description: serviceData.description,
        icon: serviceData.icon || 'construct-outline',
        source: 'ai_generated',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating service category:', error);
    throw error;
  }
};

/**
 * Add service items to a category
 * @param {string} categoryId - Service category ID
 * @param {Array} items - Array of item objects
 * @returns {Promise<Array>} Created items
 */
export const addServiceItems = async (categoryId, items) => {
  try {
    const itemsToInsert = items.map((item, index) => ({
      category_id: categoryId,
      name: item.name,
      description: item.description,
      unit: item.unit,
      default_price: null, // AI-generated items don't have default prices
      is_custom: false,
      order_index: index,
    }));

    const { data, error } = await supabase
      .from('service_items')
      .insert(itemsToInsert)
      .select();

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error adding service items:', error);
    throw error;
  }
};

/**
 * Add phase templates to a category
 * @param {string} categoryId - Service category ID
 * @param {Array} phases - Array of phase objects
 * @returns {Promise<Array>} Created phases
 */
export const addPhaseTemplates = async (categoryId, phases) => {
  try {
    const phasesToInsert = phases.map((phase, index) => ({
      category_id: categoryId,
      phase_name: phase.name || phase.phase_name,
      description: phase.description,
      default_days: phase.default_days || phase.defaultDays || 1,
      tasks: phase.tasks || phase.defaultTasks || [],
      order_index: index,
    }));

    const { data, error } = await supabase
      .from('service_phase_templates')
      .insert(phasesToInsert)
      .select();

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error adding phase templates:', error);
    throw error;
  }
};

/**
 * Get popular services (for suggestions)
 * @param {number} limit - Number of results
 * @returns {Promise<Array>} Array of popular services
 */
export const getPopularServices = async (limit = 20) => {
  try {
    const { data, error } = await supabase
      .from('service_categories')
      .select('*')
      .eq('is_active', true)
      .order('times_used', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching popular services:', error);
    return [];
  }
};

/**
 * Check if a service name already exists
 * @param {string} serviceName - Service name to check
 * @returns {Promise<boolean>} True if exists
 */
export const serviceExists = async (serviceName) => {
  try {
    const { data, error } = await supabase
      .from('service_categories')
      .select('id')
      .ilike('name', serviceName)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return !!data;
  } catch (error) {
    console.error('Error checking service existence:', error);
    return false;
  }
};
