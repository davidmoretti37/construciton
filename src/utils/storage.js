import { supabase } from '../lib/supabase';
import { getDefaultPricing } from '../constants/trades';

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

/**
 * Get current user ID from Supabase auth
 * @returns {Promise<string|null>} User ID or null
 */
const getCurrentUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

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
