import { supabase } from '../lib/supabase';
import { getDefaultPricing } from '../constants/trades';

/**
 * User Service
 * Handles user authentication, profiles, onboarding, trades, and language preferences
 */

/**
 * Default user profile structure
 */
const DEFAULT_PROFILE = {
  isOnboarded: false,
  businessInfo: {
    name: '',
    phone: '',
    email: '',
  },
  trades: [], // Array of trade IDs: ['painting', 'drywall']
  pricing: {}, // { painting: { interior: { price: 3.50, unit: 'sq ft' }, ... }, ... }
};

// ===== AUTHENTICATION =====

/**
 * Get current user ID from Supabase auth
 * @returns {Promise<string|null>} User ID or null
 */
export const getCurrentUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

// ===== PROFILE MANAGEMENT =====

/**
 * Get user profile from Supabase
 * @returns {Promise<object>} User profile
 */
export const getUserProfile = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('No user logged in');
      return DEFAULT_PROFILE;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return DEFAULT_PROFILE;
    }

    if (!data) {
      return DEFAULT_PROFILE;
    }

    // Transform Supabase data to app format
    return {
      isOnboarded: data.is_onboarded || false,
      businessInfo: {
        name: data.business_name || '',
        phone: data.business_phone || '',
        email: data.business_email || '',
      },
      trades: data.trades || [],
      pricing: data.pricing || {},
      phasesTemplate: data.phases_template || null,
    };
  } catch (error) {
    console.error('Error loading user profile:', error);
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
      console.error('No user logged in');
      return false;
    }

    // Transform app format to Supabase format
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        business_name: profile.businessInfo?.name || '',
        business_phone: profile.businessInfo?.phone || '',
        business_email: profile.businessInfo?.email || '',
        trades: profile.trades || [],
        pricing: profile.pricing || {},
        phases_template: profile.phasesTemplate || null,
        is_onboarded: profile.isOnboarded || false,
      });

    if (error) {
      console.error('Error saving profile:', error);
      return false;
    }

    console.log('User profile saved successfully');
    return true;
  } catch (error) {
    console.error('Error saving user profile:', error);
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
      console.error('No user logged in');
      return false;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        business_name: businessInfo.name,
        business_phone: businessInfo.phone,
        business_email: businessInfo.email,
      })
      .eq('id', userId);

    if (error) {
      console.error('Error updating business info:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating business info:', error);
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
      console.error('No user logged in');
      return false;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ profit_margin: margin })
      .eq('id', userId);

    if (error) {
      console.error('Error updating profit margin:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating profit margin:', error);
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
      console.error('No user logged in');
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
      console.error('Error resetting profile:', error);
      return false;
    }

    console.log('User profile reset successfully');
    return true;
  } catch (error) {
    console.error('Error resetting user profile:', error);
    return false;
  }
};

// ===== ONBOARDING =====

/**
 * Mark onboarding as complete
 * @returns {Promise<boolean>} Success status
 */
export const completeOnboarding = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return false;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_onboarded: true })
      .eq('id', userId);

    if (error) {
      console.error('Error completing onboarding:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error completing onboarding:', error);
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
    console.error('Error checking onboarding status:', error);
    return false;
  }
};

/**
 * Check if user needs feature updates (missing new fields)
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
      console.error('Error checking feature updates:', error);
      return { needsUpdate: false, missingFeatures: [] };
    }

    // Only check for owner accounts that are onboarded
    if (data?.role !== 'owner' || !data?.is_onboarded) {
      return { needsUpdate: false, missingFeatures: [] };
    }

    const missingFeatures = [];

    // Check if missing phases_template
    if (!data.phases_template) {
      missingFeatures.push('phases_template');
    }

    // Check if missing profit_margin
    if (data.profit_margin === null || data.profit_margin === undefined) {
      missingFeatures.push('profit_margin');
    }

    return {
      needsUpdate: missingFeatures.length > 0,
      missingFeatures,
    };
  } catch (error) {
    console.error('Error checking feature updates:', error);
    return { needsUpdate: false, missingFeatures: [] };
  }
};

/**
 * Mark feature update as complete by incrementing migration version
 * @returns {Promise<boolean>} Success status
 */
export const markFeatureUpdateComplete = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return false;
    }

    // Increment migration version
    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('migration_version')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching migration version:', fetchError);
      return false;
    }

    const currentVersion = data?.migration_version || 0;
    const newVersion = currentVersion + 1;

    const { error } = await supabase
      .from('profiles')
      .update({ migration_version: newVersion })
      .eq('id', userId);

    if (error) {
      console.error('Error updating migration version:', error);
      return false;
    }

    console.log(`✅ Feature update complete (v${newVersion})`);
    return true;
  } catch (error) {
    console.error('Error marking feature update complete:', error);
    return false;
  }
};

// ===== TRADES & PRICING =====

/**
 * Add a trade to user profile with default pricing
 * @param {string} tradeId - Trade ID to add
 * @returns {Promise<boolean>} Success status
 */
export const addTrade = async (tradeId) => {
  try {
    const profile = await getUserProfile();

    if (!profile.trades.includes(tradeId)) {
      profile.trades.push(tradeId);
      profile.pricing[tradeId] = getDefaultPricing(tradeId);
      return await saveUserProfile(profile);
    }

    return true;
  } catch (error) {
    console.error('Error adding trade:', error);
    return false;
  }
};

/**
 * Remove a trade from user profile
 * @param {string} tradeId - Trade ID to remove
 * @returns {Promise<boolean>} Success status
 */
export const removeTrade = async (tradeId) => {
  try {
    const profile = await getUserProfile();
    profile.trades = profile.trades.filter(id => id !== tradeId);
    delete profile.pricing[tradeId];
    return await saveUserProfile(profile);
  } catch (error) {
    console.error('Error removing trade:', error);
    return false;
  }
};

/**
 * Update pricing for a specific trade
 * @param {string} tradeId - Trade ID
 * @param {object} pricing - Pricing object { itemId: { price, unit }, ... }
 * @returns {Promise<boolean>} Success status
 */
export const updateTradePricing = async (tradeId, pricing) => {
  try {
    const profile = await getUserProfile();

    // Ensure pricing object exists
    if (!profile.pricing) {
      profile.pricing = {};
    }

    if (!profile.pricing[tradeId]) {
      profile.pricing[tradeId] = {};
    }

    profile.pricing[tradeId] = {
      ...profile.pricing[tradeId],
      ...pricing,
    };

    return await saveUserProfile(profile);
  } catch (error) {
    console.error('Error updating trade pricing:', error);
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

    if (profile.pricing[tradeId] && profile.pricing[tradeId][itemId]) {
      return profile.pricing[tradeId][itemId];
    }

    return null;
  } catch (error) {
    console.error('Error getting item pricing:', error);
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
    return profile.pricing;
  } catch (error) {
    console.error('Error getting all pricing:', error);
    return {};
  }
};

/**
 * Add a service to a trade's pricing catalog
 * @param {string} tradeId - Trade ID
 * @param {string} serviceId - Service ID to add
 * @param {object} service - Service object { price, unit, ... }
 * @returns {Promise<boolean>} - Success status
 */
export const addServiceToTrade = async (tradeId, serviceId, service) => {
  try {
    const profile = await getUserProfile();

    // Get current pricing for this trade
    const tradePricing = profile.pricing[tradeId] || {};

    // Add new service
    tradePricing[serviceId] = service;

    // Update the entire pricing object for this trade
    return await updateTradePricing(tradeId, tradePricing);
  } catch (error) {
    console.error('Error in addServiceToTrade:', error);
    return false;
  }
};

/**
 * Remove a service from a trade's pricing catalog
 * @param {string} tradeId - Trade ID
 * @param {string} serviceId - Service ID to remove
 * @returns {Promise<boolean>} - Success status
 */
export const removeServiceFromTrade = async (tradeId, serviceId) => {
  try {
    const profile = await getUserProfile();

    // Get current pricing for this trade
    const tradePricing = profile.pricing[tradeId] || {};

    // Remove service
    delete tradePricing[serviceId];

    // Update the entire pricing object for this trade
    return await updateTradePricing(tradeId, tradePricing);
  } catch (error) {
    console.error('Error in removeServiceFromTrade:', error);
    return false;
  }
};

/**
 * Update a specific service's pricing
 * @param {string} tradeId - Trade ID
 * @param {string} serviceId - Service ID
 * @param {number} price - New price
 * @param {string} unit - Optional new unit
 * @returns {Promise<boolean>} - Success status
 */
export const updateServicePricing = async (tradeId, serviceId, price, unit = null) => {
  try {
    const profile = await getUserProfile();

    // Get current pricing for this trade
    const tradePricing = profile.pricing[tradeId] || {};

    if (!tradePricing[serviceId]) {
      console.error('Service not found');
      return false;
    }

    // Update service pricing
    tradePricing[serviceId].price = price;
    if (unit) {
      tradePricing[serviceId].unit = unit;
    }

    // Update the entire pricing object for this trade
    return await updateTradePricing(tradeId, tradePricing);
  } catch (error) {
    console.error('Error in updateServicePricing:', error);
    return false;
  }
};

// ===== LANGUAGE MANAGEMENT =====

/**
 * Save selected language to Supabase
 * @param {string} languageId - Language ID (e.g., 'en', 'es')
 * @returns {Promise<boolean>} Success status
 */
export const saveLanguage = async (languageId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return false;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ language: languageId })
      .eq('id', userId);

    if (error) {
      console.error('Error saving language:', error);
      return false;
    }

    console.log('Language saved successfully:', languageId);
    return true;
  } catch (error) {
    console.error('Error saving language:', error);
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
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('language')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error getting language:', error);
      return null;
    }

    return data?.language || null;
  } catch (error) {
    console.error('Error getting language:', error);
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
    console.log('Checking language selection - current language:', language);
    return language !== null && language !== '';
  } catch (error) {
    console.error('Error checking language selection:', error);
    return false;
  }
};
