import { supabase } from '../../lib/supabase';
import logger from '../logger';
import { getCurrentUserId, DEFAULT_PROFILE } from './auth';

// ============================================================
// User Services (from user_services table)
// ============================================================

/**
 * Get user's services from user_services table
 * @returns {Promise<Array>} Array of user services with category info
 */
export const getUserServices = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return [];
    }

    const { data: services, error } = await supabase
      .from('user_services')
      .select(`
        *,
        service_categories(id, name, icon, description)
      `)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      logger.error('Error loading user services:', error);
      return [];
    }

    return services || [];
  } catch (error) {
    logger.error('Error in getUserServices:', error);
    return [];
  }
};

/**
 * Get a specific user service by category ID
 * @param {string} categoryId - Service category ID
 * @returns {Promise<object|null>} User service or null
 */
export const getUserServiceByCategory = async (categoryId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('user_services')
      .select(`
        *,
        service_categories(id, name, icon, description)
      `)
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .single();

    if (error) return null;
    return data;
  } catch (error) {
    return null;
  }
};

/**
 * Get a specific user service by service ID
 * @param {string} serviceId - User service ID
 * @returns {Promise<object|null>} User service or null
 */
export const getUserServiceById = async (serviceId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('user_services')
      .select(`
        *,
        service_categories(id, name, icon, description),
        service_items:service_categories(
          items:service_items(id, name, unit, default_price, order_index)
        )
      `)
      .eq('id', serviceId)
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  } catch (error) {
    return null;
  }
};

/**
 * Add a new service for the user
 * @param {string} categoryId - Service category ID
 * @param {object} pricing - Pricing object { itemId: { price, unit, name }, ... }
 * @param {Array} customPhases - Custom phases array
 * @returns {Promise<boolean>} Success status
 */
export const addUserService = async (categoryId, pricing = {}, customPhases = []) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return false;
    }

    const { error } = await supabase
      .from('user_services')
      .upsert({
        user_id: userId,
        category_id: categoryId,
        pricing: pricing,
        custom_phases: customPhases,
        is_active: true
      }, { onConflict: 'user_id,category_id' });

    if (error) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Update pricing for a user service
 * @param {string} serviceId - User service ID
 * @param {object} pricing - New pricing object
 * @returns {Promise<boolean>} Success status
 */
export const updateUserServicePricing = async (serviceId, pricing) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('user_services')
      .update({ pricing, updated_at: new Date().toISOString() })
      .eq('id', serviceId)
      .eq('user_id', userId);

    if (error) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Remove a user service
 * @param {string} serviceId - User service ID
 * @returns {Promise<boolean>} Success status
 */
export const removeUserService = async (serviceId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('user_services')
      .delete()
      .eq('id', serviceId)
      .eq('user_id', userId);

    if (error) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get all available service categories
 * @returns {Promise<Array>} Array of service categories
 */
export const getServiceCategories = async () => {
  try {
    const { data, error } = await supabase
      .from('service_categories')
      .select('*')
      .eq('is_active', true)
      .order('times_used', { ascending: false });

    if (error) {
      return [];
    }

    return data || [];
  } catch (error) {
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
      .order('order_index');

    if (error) {
      return [];
    }

    return data || [];
  } catch (error) {
    return [];
  }
};

// ============================================================
// User Profile Management
// ============================================================

/**
 * Get user profile from Supabase
 * @returns {Promise<object>} User profile
 */
export const getUserProfile = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      logger.debug('No user logged in');
      return DEFAULT_PROFILE;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching profile:', error);
      return DEFAULT_PROFILE;
    }

    if (!data) {
      logger.debug('No profile found for user, returning default profile');
      return DEFAULT_PROFILE;
    }

    // Transform Supabase data to app format
    return {
      isOnboarded: data.is_onboarded || false,
      businessInfo: {
        name: data.business_name || '',
        phone: data.business_phone || '',
        email: data.business_email || '',
        logoUrl: data.business_logo || '',
        address: data.business_address || '',
        paymentInfo: data.payment_info || '',
        paymentTerms: data.payment_terms || 'Net 30',
        footerText: data.footer_text || '',
        accentColor: data.accent_color || '#3B82F6',
        fontStyle: data.font_style || 'modern',
      },
      phasesTemplate: data.phases_template || null,
      profit_margin: data.profit_margin || 0.25,
    };
  } catch (error) {
    logger.error('Error loading user profile:', error);
    return DEFAULT_PROFILE;
  }
};

/**
 * Save complete user profile to Supabase
 * @param {object} profile - User profile object
 * @returns {Promise<boolean>} Success status
 */
export const saveUserProfile = async (profile) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return false;
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        business_name: profile.businessInfo?.name || '',
        business_phone: profile.businessInfo?.phone || '',
        business_email: profile.businessInfo?.email || '',
        business_logo: profile.businessInfo?.logoUrl || '',
        business_address: profile.businessInfo?.address || '',
        payment_info: profile.businessInfo?.paymentInfo || '',
        payment_terms: profile.businessInfo?.paymentTerms || '',
        footer_text: profile.businessInfo?.footerText || '',
        phases_template: profile.phasesTemplate || null,
        profit_margin: profile.profit_margin || 0.25,
        is_onboarded: profile.isOnboarded || false,
      });

    if (error) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Update business info
 * @param {object} businessInfo - Business information
 * @returns {Promise<boolean>} Success status
 */
export const updateBusinessInfo = async (businessInfo) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return false;
    }

    const updateData = {
      business_name: businessInfo.name,
      business_phone: businessInfo.phone,
      business_email: businessInfo.email,
    };

    if (businessInfo.logoUrl !== undefined) {
      updateData.business_logo = businessInfo.logoUrl;
    }
    if (businessInfo.address !== undefined) {
      updateData.business_address = businessInfo.address;
    }
    if (businessInfo.paymentInfo !== undefined) {
      updateData.payment_info = businessInfo.paymentInfo;
    }
    if (businessInfo.paymentTerms !== undefined) {
      updateData.payment_terms = businessInfo.paymentTerms;
    }
    if (businessInfo.footerText !== undefined) {
      updateData.footer_text = businessInfo.footerText;
    }
    if (businessInfo.accentColor !== undefined) {
      updateData.accent_color = businessInfo.accentColor;
    }
    if (businessInfo.fontStyle !== undefined) {
      updateData.font_style = businessInfo.fontStyle;
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (error) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Update user's profit margin
 */
export const updateProfitMargin = async (margin) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return false;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ profit_margin: margin })
      .eq('id', userId);

    if (error) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Mark onboarding as complete
 * @returns {Promise<boolean>} Success status
 */
export const completeOnboarding = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return false;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_onboarded: true })
      .eq('id', userId);

    if (error) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Check if user has completed onboarding
 * @returns {Promise<boolean>} Onboarding status
 */
export const isOnboarded = async () => {
  try {
    const profile = await getUserProfile();
    return profile.isOnboarded === true;
  } catch (error) {
    return false;
  }
};

/**
 * Check if user needs feature updates
 * @returns {Promise<object>} Object with needsUpdate flag and missing features
 */
export const needsFeatureUpdate = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { needsUpdate: false, missingFeatures: [] };
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('role, is_onboarded, phases_template, profit_margin')
      .eq('id', userId)
      .single();

    if (error) {
      return { needsUpdate: false, missingFeatures: [] };
    }

    if (data?.role !== 'owner' || !data?.is_onboarded) {
      return { needsUpdate: false, missingFeatures: [] };
    }

    const missingFeatures = [];

    if (!data.phases_template) {
      missingFeatures.push('phases_template');
    }

    if (data.profit_margin === null || data.profit_margin === undefined) {
      missingFeatures.push('profit_margin');
    }

    return {
      needsUpdate: missingFeatures.length > 0,
      missingFeatures,
    };
  } catch (error) {
    return { needsUpdate: false, missingFeatures: [] };
  }
};

/**
 * Mark feature update as complete
 * @returns {Promise<boolean>} Success status
 */
export const markFeatureUpdateComplete = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return false;
    }

    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('migration_version')
      .eq('id', userId)
      .single();

    if (fetchError) {
      return false;
    }

    const currentVersion = data?.migration_version || 0;
    const newVersion = currentVersion + 1;

    const { error } = await supabase
      .from('profiles')
      .update({ migration_version: newVersion })
      .eq('id', userId);

    if (error) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Reset user profile (for testing/debugging)
 * @returns {Promise<boolean>} Success status
 */
export const resetUserProfile = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return false;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        business_name: '',
        business_phone: '',
        business_email: '',
        trades: [],
        pricing: {},
        is_onboarded: false,
      })
      .eq('id', userId);

    if (error) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get pricing for a specific item in a trade
 * @param {string} tradeId - Trade ID
 * @param {string} itemId - Item ID within the trade
 * @returns {Promise<object|null>} Pricing object { price, unit } or null
 */
export const getItemPricing = async (tradeId, itemId) => {
  try {
    const profile = await getUserProfile();

    if (profile.pricing && profile.pricing[tradeId] && profile.pricing[tradeId][itemId]) {
      return profile.pricing[tradeId][itemId];
    }

    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Get all pricing for display/export
 * @returns {Promise<object>} All pricing data
 */
export const getAllPricing = async () => {
  try {
    const profile = await getUserProfile();
    return profile.pricing || {};
  } catch (error) {
    return {};
  }
};

// ============================================================
// Language Management
// ============================================================

/**
 * Save selected language to Supabase
 * @param {string} languageId - Language ID (e.g., 'en', 'es')
 * @returns {Promise<boolean>} Success status
 */
export const saveLanguage = async (languageId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('saveLanguage: No user ID found');
      return false;
    }

    // Use upsert to handle cases where profile might not exist yet
    const { error } = await supabase
      .from('profiles')
      .upsert(
        { id: userId, language: languageId },
        { onConflict: 'id' }
      );

    if (error) {
      console.error('saveLanguage error:', error);
      return false;
    }

    console.log('saveLanguage: Language saved successfully:', languageId);
    return true;
  } catch (error) {
    console.error('saveLanguage exception:', error);
    return false;
  }
};

/**
 * Get selected language from Supabase
 * @returns {Promise<string|null>} Language ID or null
 */
export const getSelectedLanguage = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('getSelectedLanguage: No user ID');
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('language')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('getSelectedLanguage error:', error);
      return null;
    }

    const language = data?.language || null;
    console.log('getSelectedLanguage:', language);
    return language;
  } catch (error) {
    console.error('getSelectedLanguage exception:', error);
    return null;
  }
};

/**
 * Check if language has been selected
 * @returns {Promise<boolean>} Language selection status
 */
export const hasSelectedLanguage = async () => {
  try {
    const language = await getSelectedLanguage();
    return language !== null && language !== '';
  } catch (error) {
    return false;
  }
};

/**
 * Get auto-translate estimates setting
 * When enabled, estimates/invoices are generated in English for PT/ES users
 * @returns {Promise<boolean>} - Whether to translate estimates to English
 */
export const getAutoTranslateEstimates = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('getAutoTranslateEstimates: No user ID');
      return false;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('auto_translate_estimates')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('getAutoTranslateEstimates error:', error);
      return false;
    }

    return data?.auto_translate_estimates || false;
  } catch (error) {
    console.error('getAutoTranslateEstimates exception:', error);
    return false;
  }
};

/**
 * Update auto-translate estimates setting
 * @param {boolean} enabled - Whether to enable auto-translation
 * @returns {Promise<boolean>} - Success status
 */
export const updateAutoTranslateEstimates = async (enabled) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('profiles')
      .update({ auto_translate_estimates: enabled })
      .eq('id', userId);

    if (error) {
      console.error('updateAutoTranslateEstimates error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('updateAutoTranslateEstimates exception:', error);
    return false;
  }
};

// ============================================================
// AI Personalization Settings
// ============================================================

/**
 * Get AI personalization settings
 * @returns {Promise<object>} AI settings with aboutYou and responseStyle
 */
export const getAISettings = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { aboutYou: '', responseStyle: '' };

    const { data, error } = await supabase
      .from('profiles')
      .select('ai_about_you, ai_response_style')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      logger.error('Error getting AI settings:', error);
      return { aboutYou: '', responseStyle: '' };
    }

    return {
      aboutYou: data?.ai_about_you || '',
      responseStyle: data?.ai_response_style || '',
    };
  } catch (error) {
    logger.error('Error in getAISettings:', error);
    return { aboutYou: '', responseStyle: '' };
  }
};

/**
 * Update AI personalization settings
 * @param {object} settings - Settings with aboutYou and responseStyle
 * @returns {Promise<boolean>} Success status
 */
export const updateAISettings = async (settings) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    // Enforce character limits
    const aboutYou = (settings.aboutYou || '').slice(0, 500);
    const responseStyle = (settings.responseStyle || '').slice(0, 300);

    const { error } = await supabase
      .from('profiles')
      .update({
        ai_about_you: aboutYou,
        ai_response_style: responseStyle,
      })
      .eq('id', userId);

    if (error) {
      logger.error('Error updating AI settings:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error in updateAISettings:', error);
    return false;
  }
};
