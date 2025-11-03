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

// ===== PROJECT MANAGEMENT FUNCTIONS =====

/**
 * Save or update a project in Supabase
 * @param {object} projectData - Project data object
 * @returns {Promise<object|null>} Saved project or null if error
 */
export const saveProject = async (projectData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    // Transform app format to database format
    const dbProject = {
      user_id: userId,
      name: projectData.name,
      client: projectData.client,
      budget: projectData.budget || 0,
      spent: projectData.spent || 0,
      percent_complete: projectData.percentComplete || 0,
      status: projectData.status || 'draft',
      workers: projectData.workers || [],
      days_remaining: projectData.daysRemaining || null,
      last_activity: projectData.lastActivity || 'Just created',
      location: projectData.location || null,
      start_date: projectData.startDate || null,
      end_date: projectData.endDate || null,
      task_description: projectData.taskDescription || null,
      estimated_duration: projectData.estimatedDuration || null,
    };

    // If project has an ID, update it; otherwise insert new
    let result;
    if (projectData.id && !projectData.id.startsWith('temp-')) {
      const { data, error } = await supabase
        .from('projects')
        .update(dbProject)
        .eq('id', projectData.id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('projects')
        .insert(dbProject)
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    console.log('Project saved successfully:', result.id);
    return transformProjectFromDB(result);
  } catch (error) {
    console.error('Error saving project:', error);
    return null;
  }
};

/**
 * Fetch all projects for the current user
 * @returns {Promise<array>} Array of projects
 */
export const fetchProjects = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('No user logged in');
      return [];
    }

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }

    // Transform each project from DB format to app format
    return (data || []).map(transformProjectFromDB);
  } catch (error) {
    console.error('Error loading projects:', error);
    return [];
  }
};

/**
 * Get a single project by ID
 * @param {string} projectId - Project ID
 * @returns {Promise<object|null>} Project object or null
 */
export const getProject = async (projectId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching project:', error);
      return null;
    }

    return transformProjectFromDB(data);
  } catch (error) {
    console.error('Error loading project:', error);
    return null;
  }
};

/**
 * Delete a project by ID
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteProject = async (projectId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return false;
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting project:', error);
      return false;
    }

    console.log('Project deleted successfully:', projectId);
    return true;
  } catch (error) {
    console.error('Error deleting project:', error);
    return false;
  }
};

/**
 * Transform project from database format to app format
 * @param {object} dbProject - Project from database
 * @returns {object} App format project
 */
const transformProjectFromDB = (dbProject) => {
  return {
    id: dbProject.id,
    name: dbProject.name,
    client: dbProject.client,
    budget: parseFloat(dbProject.budget) || 0,
    spent: parseFloat(dbProject.spent) || 0,
    percentComplete: dbProject.percent_complete || 0,
    status: dbProject.status || 'draft',
    workers: dbProject.workers || [],
    daysRemaining: dbProject.days_remaining,
    lastActivity: dbProject.last_activity || 'No activity',
    location: dbProject.location,
    startDate: dbProject.start_date,
    endDate: dbProject.end_date,
    taskDescription: dbProject.task_description,
    estimatedDuration: dbProject.estimated_duration,
    createdAt: dbProject.created_at,
    updatedAt: dbProject.updated_at,
  };
};

/**
 * Transform screenshot analysis data to project format
 * @param {object} screenshotData - Data from screenshot analysis
 * @returns {object} Project format object ready to save
 */
export const transformScreenshotToProject = (screenshotData) => {
  const { worker, location, date, time, task, budget, client, estimatedDuration } = screenshotData;

  // Generate project name from client and task
  let projectName = '';
  if (client && task) {
    projectName = `${client}'s ${task}`;
  } else if (client) {
    projectName = `${client} Project`;
  } else if (task) {
    projectName = task;
  } else {
    projectName = 'New Project';
  }

  return {
    id: `temp-${Date.now()}`, // Temporary ID until saved
    name: projectName,
    client: client || 'Unknown Client',
    budget: budget || 0,
    spent: 0,
    percentComplete: 0,
    status: 'draft',
    workers: worker ? [worker] : [],
    daysRemaining: null,
    lastActivity: 'Just created',
    location: location || null,
    startDate: date || new Date().toISOString().split('T')[0],
    endDate: null,
    taskDescription: task || null,
    estimatedDuration: estimatedDuration || null,
  };
};
