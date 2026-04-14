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

/**
 * Get current user context including role information
 * Used for owner-mode AI chat to fetch data across all supervisors
 * @returns {Promise<{userId: string, role: string, isOwner: boolean, ownerId: string|null}|null>}
 */
export const getCurrentUserContext = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user || error) return null;

  // Fetch profile to get role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, owner_id, business_name')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return {
      userId: user.id,
      role: 'contractor',
      isOwner: false,
      ownerId: null,
      businessName: null,
    };
  }

  return {
    userId: user.id,
    role: profile?.role || 'contractor',
    isOwner: profile?.role === 'owner',
    ownerId: profile?.owner_id || null,
    businessName: profile?.business_name || null,
  };
};
