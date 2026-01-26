import { supabase } from '../../lib/supabase';

/**
 * Default user profile structure
 * Note: Services are now stored in the user_services table, not in the profile
 */
export const DEFAULT_PROFILE = {
  isOnboarded: false,
  businessInfo: {
    name: '',
    phone: '',
    email: '',
  },
};

/**
 * Get current user ID from Supabase auth
 * @returns {Promise<string|null>} User ID or null
 */
export const getCurrentUserId = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  return user?.id || null;
};
