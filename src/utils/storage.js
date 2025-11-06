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

    // Auto-calculate completion percentage from dates
    const autoPercentComplete = calculateTimeBasedCompletion(
      projectData.startDate || null,
      projectData.endDate || null
    );

    // Transform app format to database format
    const dbProject = {
      user_id: userId,
      name: projectData.name,
      client: projectData.client || projectData.name || 'Unknown Client', // Fallback to name or Unknown if missing
      client_phone: projectData.clientPhone || null,
      ai_responses_enabled: projectData.aiResponsesEnabled !== false, // Default to true
      // New financial model
      contract_amount: projectData.contractAmount || 0,
      income_collected: projectData.incomeCollected || 0,
      expenses: projectData.expenses || 0,
      extras: projectData.extras || [],
      // Legacy fields (for backward compatibility)
      budget: projectData.budget || projectData.contractAmount || 0,
      spent: projectData.spent || projectData.expenses || 0,
      percent_complete: autoPercentComplete, // Auto-calculated from dates
      status: projectData.status || 'active',
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
 * Calculate time-based completion percentage
 * @param {string} startDate - Project start date (YYYY-MM-DD)
 * @param {string} endDate - Project end date (YYYY-MM-DD)
 * @returns {number} Completion percentage (0-100)
 */
const calculateTimeBasedCompletion = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;

  try {
    // Parse start date
    const [startYear, startMonth, startDay] = startDate.split('-');
    const start = new Date(parseInt(startYear), parseInt(startMonth) - 1, parseInt(startDay));
    start.setHours(0, 0, 0, 0);

    // Parse end date
    const [endYear, endMonth, endDay] = endDate.split('-');
    const end = new Date(parseInt(endYear), parseInt(endMonth) - 1, parseInt(endDay));
    end.setHours(0, 0, 0, 0);

    // Get today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate total days and elapsed days
    const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.round((today - start) / (1000 * 60 * 60 * 24));

    // Handle edge cases
    if (totalDays <= 0) return 0; // Invalid date range
    if (elapsedDays <= 0) return 0; // Project hasn't started yet
    if (elapsedDays >= totalDays) return 100; // Project deadline has passed

    // Calculate percentage
    return Math.round((elapsedDays / totalDays) * 100);
  } catch (error) {
    console.error('Error calculating time-based completion:', error);
    return 0;
  }
};

/**
 * Transform project from database format to app format
 * @param {object} dbProject - Project from database
 * @returns {object} App format project
 */
const transformProjectFromDB = (dbProject) => {
  // Parse daysRemaining as a number, handling null/undefined
  let daysRemaining = null;
  if (dbProject.days_remaining !== null && dbProject.days_remaining !== undefined) {
    daysRemaining = parseInt(dbProject.days_remaining);
    if (isNaN(daysRemaining)) {
      daysRemaining = null;
    }
  }

  // Parse new financial fields, with fallback to legacy fields
  const contractAmount = parseFloat(dbProject.contract_amount) || parseFloat(dbProject.budget) || 0;
  const incomeCollected = parseFloat(dbProject.income_collected) || 0;
  const expenses = parseFloat(dbProject.expenses) || parseFloat(dbProject.spent) || 0;

  // Auto-calculate completion percentage based on time (days elapsed / total days)
  const percentComplete = calculateTimeBasedCompletion(dbProject.start_date, dbProject.end_date);

  return {
    id: dbProject.id,
    name: dbProject.name,
    client: dbProject.client,
    clientPhone: dbProject.client_phone,
    aiResponsesEnabled: dbProject.ai_responses_enabled !== false, // Default to true
    // New financial model
    contractAmount: contractAmount,
    incomeCollected: incomeCollected,
    expenses: expenses,
    profit: incomeCollected - expenses, // Calculated field
    extras: dbProject.extras || [],
    // Legacy fields (kept for backward compatibility)
    budget: contractAmount,
    spent: expenses,
    percentComplete: percentComplete, // Auto-calculated from dates
    status: dbProject.status || 'active',
    workers: dbProject.workers || [],
    daysRemaining: daysRemaining,
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
    // New financial model
    contractAmount: budget || 0, // Screenshot budget becomes contract amount
    incomeCollected: 0,
    expenses: 0,
    profit: 0,
    // Legacy fields (for backward compatibility)
    budget: budget || 0,
    spent: 0,
    percentComplete: 0,
    status: 'active',
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

// ===== SMS/WHATSAPP CONVERSATION FUNCTIONS =====

/**
 * Fetch conversations for a specific project
 * @param {string} projectId - Project ID
 * @returns {Promise<array>} Array of conversations
 */
export const fetchConversations = async (projectId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('No user logged in');
      return [];
    }

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching conversations:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error loading conversations:', error);
    return [];
  }
};

/**
 * Send a manual SMS/WhatsApp message from contractor to client
 * @param {string} projectId - Project ID
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} Success status
 */
export const sendManualMessage = async (projectId, message) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return false;
    }

    // Get project and user info
    const { data: project } = await supabase
      .from('projects')
      .select('*, profiles!inner(*)')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      console.error('Project not found');
      return false;
    }

    if (!project.client_phone) {
      console.error('No client phone number on project');
      return false;
    }

    if (!project.profiles.twilio_account_sid || !project.profiles.twilio_auth_token) {
      console.error('Twilio not configured');
      return false;
    }

    // Send via Twilio
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${project.profiles.twilio_account_sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${project.profiles.twilio_account_sid}:${project.profiles.twilio_auth_token}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: project.profiles.business_phone_number,
          To: project.client_phone,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      console.error('Failed to send message:', await response.text());
      return false;
    }

    // Log conversation
    await supabase.from('conversations').insert({
      project_id: projectId,
      from_number: project.profiles.business_phone_number,
      to_number: project.client_phone,
      message_type: 'sms',
      direction: 'outbound',
      message_body: message,
      handled_by: 'contractor',
    });

    return true;
  } catch (error) {
    console.error('Error sending manual message:', error);
    return false;
  }
};

/**
 * Mark conversation as handled by contractor
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<boolean>} Success status
 */
export const markConversationHandled = async (conversationId) => {
  try {
    const { error } = await supabase
      .from('conversations')
      .update({
        needs_attention: false,
        handled_by: 'contractor',
      })
      .eq('id', conversationId);

    if (error) {
      console.error('Error marking conversation handled:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating conversation:', error);
    return false;
  }
};

/**
 * Get count of conversations needing attention for a project
 * @param {string} projectId - Project ID
 * @returns {Promise<number>} Count of unhandled conversations
 */
export const getUnhandledConversationCount = async (projectId) => {
  try {
    const { count, error } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('needs_attention', true);

    if (error) {
      console.error('Error getting unhandled count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Error getting unhandled conversation count:', error);
    return 0;
  }
};
