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
export const getCurrentUserId = async () => {
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
      .select('role, is_onboarded, phases_template')
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

    // Add more feature checks here in the future
    // if (!data.some_new_feature) {
    //   missingFeatures.push('some_new_feature');
    // }

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

    // Extract schedule dates if provided
    const startDate = projectData.startDate || projectData.schedule?.startDate || null;
    const endDate = projectData.endDate || projectData.schedule?.estimatedEndDate || null;

    // Auto-calculate completion percentage from dates
    const autoPercentComplete = calculateTimeBasedCompletion(startDate, endDate);

    // Calculate budget from phases or lineItems if not provided
    let calculatedBudget = projectData.budget || projectData.baseContract || projectData.contractAmount || 0;

    if (projectData.phases && projectData.phases.length > 0) {
      // Calculate total from phase budgets
      calculatedBudget = projectData.phases.reduce((sum, phase) => {
        return sum + (parseFloat(phase.budget) || 0);
      }, 0);
    } else if (projectData.lineItems && projectData.lineItems.length > 0) {
      // Calculate total from line items
      calculatedBudget = projectData.lineItems.reduce((sum, item) => {
        return sum + (parseFloat(item.total) || 0);
      }, 0);
    } else if (projectData.total) {
      // Use total if provided
      calculatedBudget = parseFloat(projectData.total) || 0;
    }

    // Transform app format to database format
    const dbProject = {
      user_id: userId,
      name: projectData.projectName || projectData.name || `${projectData.client} - Project`,
      client_phone: projectData.phone || projectData.clientPhone || null,
      client_email: projectData.email || projectData.clientEmail || null,
      location: projectData.location || null,
      ai_responses_enabled: projectData.aiResponsesEnabled !== false, // Default to true
      // New financial model with extras support
      base_contract: calculatedBudget,
      extras: projectData.extras || [],
      // contract_amount is auto-calculated by database trigger (base_contract + sum of extras)
      income_collected: projectData.incomeCollected || 0,
      expenses: projectData.expenses || 0,
      // Legacy fields (for backward compatibility)
      budget: calculatedBudget,
      spent: projectData.spent || projectData.expenses || 0,
      percent_complete: autoPercentComplete, // Auto-calculated from dates
      status: projectData.status || 'draft',
      workers: projectData.workers || [],
      days_remaining: projectData.daysRemaining || null,
      last_activity: projectData.lastActivity || 'Just created',
      start_date: startDate,
      end_date: endDate,
      task_description: projectData.scope?.description || projectData.taskDescription || null,
      estimated_duration: projectData.estimatedDuration || null,
      // Indicate if project has phases
      has_phases: !!(projectData.phases && projectData.phases.length > 0),
    };

    // If project has an ID, update it; otherwise insert new
    let result;
    if (projectData.id && !projectData.id.startsWith('temp-')) {
      const { data, error} = await supabase
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

    console.log('✅ Project saved successfully:', result.id);

    // Save phases if provided
    if (projectData.phases && projectData.phases.length > 0) {
      console.log('💾 Saving project phases...');
      await saveProjectPhases(result.id, projectData.phases, projectData.schedule);
    }

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

    // Transform each project and fetch phases if hasPhases is true
    const projects = await Promise.all((data || []).map(async (project) => {
      const transformed = transformProjectFromDB(project);

      // Fetch phases if project has them
      if (transformed.hasPhases) {
        const phases = await fetchProjectPhases(transformed.id);
        transformed.phases = phases || [];
      }

      return transformed;
    }));

    return projects;
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
  // contract_amount is auto-calculated by DB trigger (base_contract + extras)
  const contractAmount = parseFloat(dbProject.contract_amount) || parseFloat(dbProject.budget) || 0;
  const baseContract = parseFloat(dbProject.base_contract) || contractAmount;
  const incomeCollected = parseFloat(dbProject.income_collected) || 0;
  const expenses = parseFloat(dbProject.expenses) || parseFloat(dbProject.spent) || 0;
  const extras = dbProject.extras || [];

  // Auto-calculate completion percentage based on time (days elapsed / total days)
  const percentComplete = calculateTimeBasedCompletion(dbProject.start_date, dbProject.end_date);

  // Calculate status based on progress and financials
  const calculateStatus = () => {
    const storedStatus = dbProject.status || 'active';

    // Only allowed DB statuses: draft, active, completed, archived
    // Dynamic statuses (on-track, behind, over-budget) are calculated in the app, not stored in DB
    if (['draft', 'active', 'completed', 'archived'].includes(storedStatus)) {
      return storedStatus;
    }

    // If stored status is invalid (old data), default to active
    return 'active';
  };

  // Calculate display status (includes dynamic statuses for UI)
  const calculateDisplayStatus = () => {
    const baseStatus = calculateStatus();

    // If project is not active, return the base status
    if (baseStatus !== 'active') {
      return baseStatus;
    }

    // For active projects, calculate dynamic status based on timeline and budget
    const isOverBudget = expenses > contractAmount;
    const isBehind = daysRemaining !== null && daysRemaining < 0;

    // Priority: over-budget > behind > on-track
    if (isOverBudget) return 'over-budget';
    if (isBehind) return 'behind';
    return 'on-track';
  };

  return {
    id: dbProject.id,
    name: dbProject.name,
    client: dbProject.client, // Client name
    clientPhone: dbProject.client_phone,
    aiResponsesEnabled: dbProject.ai_responses_enabled !== false, // Default to true
    // New financial model with extras support
    baseContract: baseContract,
    contractAmount: contractAmount, // This includes base + extras (auto-calculated by DB)
    extras: extras, // Keep extras array for history tracking
    incomeCollected: incomeCollected,
    expenses: expenses,
    profit: incomeCollected - expenses, // Calculated field
    // Legacy fields (kept for backward compatibility)
    budget: contractAmount,
    spent: expenses,
    percentComplete: percentComplete, // Auto-calculated from dates
    status: calculateDisplayStatus(), // Display status (includes dynamic statuses like on-track, behind, over-budget)
    workers: dbProject.workers || [],
    daysRemaining: daysRemaining,
    lastActivity: dbProject.last_activity || 'No activity',
    location: dbProject.location,
    startDate: dbProject.start_date,
    endDate: dbProject.end_date,
    taskDescription: dbProject.task_description,
    estimatedDuration: dbProject.estimated_duration,
    hasPhases: dbProject.has_phases || false, // Whether project uses phases
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
  const { worker, location, date, time, task, budget, estimatedDuration } = screenshotData;

  // Use task as project name
  const projectName = task || 'New Project';

  return {
    id: `temp-${Date.now()}`, // Temporary ID until saved
    name: projectName,
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

// ===================================================================
// ESTIMATES FUNCTIONS
// ===================================================================

/**
 * Save a new estimate to the database
 * @param {object} estimateData - Estimate data
 * @returns {Promise<object|null>} Created estimate or null
 */
export const saveEstimate = async (estimateData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    const { data, error } = await supabase
      .from('estimates')
      .insert({
        user_id: userId,
        project_id: estimateData.projectId || null,
        client_name: estimateData.client?.name || estimateData.client || estimateData.clientName,
        client_phone: estimateData.client?.phone || estimateData.clientPhone,
        client_email: estimateData.client?.email || estimateData.clientEmail,
        client_address: estimateData.client?.address || estimateData.clientAddress,
        project_name: estimateData.projectName,
        items: estimateData.lineItems || estimateData.items || [],
        phases: estimateData.phases || [],
        schedule: estimateData.schedule || {},
        scope: estimateData.scope || {},
        subtotal: estimateData.subtotal || 0,
        tax_rate: estimateData.taxRate || 0,
        tax_amount: estimateData.taxAmount || 0,
        total: estimateData.total || 0,
        valid_until: estimateData.validUntil || null,
        payment_terms: estimateData.paymentTerms || 'Net 30',
        notes: estimateData.notes || '',
        status: 'draft'
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving estimate:', error);
      return null;
    }

    // If estimate has projectId, update the project with estimate data
    if (estimateData.projectId && data) {
      const mergeMode = estimateData.mergeWithProject === true;
      const overrideMode = estimateData.overrideProject === true || !mergeMode; // Default to override

      console.log('📊 Updating project with estimate data:', estimateData.projectId);
      console.log('📊 Mode:', mergeMode ? 'MERGE' : 'OVERRIDE');
      console.log('📊 Estimate data being used for update:', {
        total: estimateData.total,
        hasPhases: estimateData.phases?.length > 0,
        phasesCount: estimateData.phases?.length || 0,
        hasSchedule: !!estimateData.schedule,
        hasScope: !!estimateData.scope
      });

      try {
        // Get existing project data if merging
        let existingProject = null;
        if (mergeMode) {
          const { data: proj } = await supabase
            .from('projects')
            .select('*')
            .eq('id', estimateData.projectId)
            .single();
          existingProject = proj;
          console.log('📊 Existing project for merge:', existingProject);
        }

        const updateData = {};

        // Budget: Override or Add
        if (mergeMode && existingProject) {
          updateData.budget = (existingProject.budget || 0) + (estimateData.total || 0);
          console.log('📊 Merging budgets:', existingProject.budget, '+', estimateData.total, '=', updateData.budget);
        } else {
          updateData.budget = estimateData.total;
          console.log('📊 Overriding budget:', estimateData.total);
        }

        // Dates: Always use latest estimate dates (override)
        if (estimateData.schedule && estimateData.schedule.startDate) {
          updateData.start_date = estimateData.schedule.startDate;
          console.log('📊 Setting start_date:', estimateData.schedule.startDate);
        }

        if (estimateData.schedule && estimateData.schedule.estimatedEndDate) {
          updateData.end_date = estimateData.schedule.estimatedEndDate;
          console.log('📊 Setting end_date:', estimateData.schedule.estimatedEndDate);
        }

        // Description: Append if merging, replace if overriding
        if (estimateData.scope && estimateData.scope.description) {
          if (mergeMode && existingProject && existingProject.task_description) {
            updateData.task_description = existingProject.task_description + '\n\n' + estimateData.scope.description;
            console.log('📊 Appending to task_description');
          } else {
            updateData.task_description = estimateData.scope.description;
            console.log('📊 Overriding task_description:', estimateData.scope.description);
          }
        }

        console.log('📊 Final update data for project:', updateData);

        const { data: updatedProject, error: projectError } = await supabase
          .from('projects')
          .update(updateData)
          .eq('id', estimateData.projectId)
          .select();

        if (projectError) {
          console.error('❌ Error updating project with estimate data:', projectError);
          console.error('❌ Update data that failed:', updateData);
          // Don't fail the estimate save if project update fails
        } else {
          console.log('✅ Project updated successfully with estimate data');
          console.log('✅ Updated project:', updatedProject);
        }

        // Phases: Merge (append) or Override (replace)
        if (estimateData.phases && Array.isArray(estimateData.phases) && estimateData.phases.length > 0) {
          // 🔧 CRITICAL FIX: Map phase schedule dates to phases
          if (estimateData.schedule?.phaseSchedule && Array.isArray(estimateData.schedule.phaseSchedule)) {
            console.log('📊 Mapping phase schedule dates to phases...');
            estimateData.phases = estimateData.phases.map((phase, index) => {
              // Try to find matching phase schedule by name
              const phaseSchedule = estimateData.schedule.phaseSchedule.find(
                ps => ps.phaseName === phase.name ||
                      ps.phaseName === `${phase.name} Phase` ||
                      ps.phaseName?.toLowerCase() === phase.name?.toLowerCase()
              ) || estimateData.schedule.phaseSchedule[index]; // Fallback to index match

              if (phaseSchedule) {
                console.log(`  ✅ Mapped dates for ${phase.name}:`, {
                  startDate: phaseSchedule.startDate,
                  endDate: phaseSchedule.endDate
                });
                return {
                  ...phase,
                  startDate: phaseSchedule.startDate || phase.startDate,
                  endDate: phaseSchedule.endDate || phase.endDate
                };
              }
              return phase;
            });
          }

          // 🔧 Associate line items (services) with phases based on budget
          if (estimateData.lineItems && Array.isArray(estimateData.lineItems) && estimateData.lineItems.length > 0) {
            console.log('📊 Distributing', estimateData.lineItems.length, 'services across phases...');

            // Calculate total phase budget
            const totalPhaseBudget = estimateData.phases.reduce((sum, p) => sum + (p.budget || 0), 0);

            if (totalPhaseBudget > 0) {
              // Distribute services proportionally based on phase budget
              estimateData.phases = estimateData.phases.map(phase => {
                const phaseRatio = (phase.budget || 0) / totalPhaseBudget;
                const phaseServices = [];

                // Assign services to phase (simplified: distribute by budget ratio)
                estimateData.lineItems.forEach(item => {
                  const itemTotal = item.total || 0;
                  // If this item fits within the phase budget ratio, add it
                  if (itemTotal <= (phase.budget || 0) * 1.5) {  // 1.5x tolerance
                    phaseServices.push(item);
                  }
                });

                console.log(`  ✅ Assigned ${phaseServices.length} services to ${phase.name}`);
                return {
                  ...phase,
                  services: phaseServices.length > 0 ? phaseServices : []
                };
              });
            } else {
              // If no phase budgets, assign all services to first phase
              if (estimateData.phases.length > 0) {
                estimateData.phases[0].services = estimateData.lineItems;
                console.log(`  ✅ Assigned all ${estimateData.lineItems.length} services to ${estimateData.phases[0].name}`);
              }
            }
          }

          console.log('📊 Full phases data from estimate:', JSON.stringify(estimateData.phases, null, 2));
          estimateData.phases.forEach((phase, idx) => {
            console.log(`📊 Phase ${idx} - ${phase.name}:`, {
              hasTasks: !!phase.tasks,
              tasksCount: phase.tasks?.length || 0,
              tasks: phase.tasks,
              hasStartDate: !!phase.startDate,
              hasEndDate: !!phase.endDate,
              hasBudget: !!phase.budget,
              servicesCount: phase.services?.length || 0
            });
          });

          if (mergeMode) {
            // Get existing phases and append new ones
            const { data: existingPhases } = await supabase
              .from('project_phases')
              .select('*')
              .eq('project_id', estimateData.projectId)
              .order('order_index');

            const startIndex = existingPhases?.length || 0;
            const phasesToAdd = estimateData.phases.map((phase, idx) => ({
              ...phase,
              order_index: startIndex + idx
            }));

            console.log('📊 Merging phases - adding', phasesToAdd.length, 'new phases to', startIndex, 'existing');

            const phasesToInsert = phasesToAdd.map((phase, index) => ({
              project_id: estimateData.projectId,
              name: phase.name,
              order_index: phase.order_index,
              planned_days: phase.plannedDays || phase.defaultDays || 5,
              start_date: phase.startDate || null,
              end_date: phase.endDate || null,
              completion_percentage: phase.completionPercentage || 0,
              status: phase.status || 'not_started',
              time_extensions: phase.timeExtensions || [],
              tasks: phase.tasks || [],
              budget: phase.budget || 0,  // Save phase budget
              services: phase.services || [],  // Save services associated with phase
            }));

            const { error: insertError } = await supabase
              .from('project_phases')
              .insert(phasesToInsert);

            if (insertError) {
              console.error('❌ Failed to merge phases:', insertError);
            } else {
              console.log('✅ Phases merged successfully');
            }
          } else {
            // Override mode - replace all phases
            console.log('📊 Overriding phases - replacing with', estimateData.phases.length, 'new phases');
            const phasesSaved = await saveProjectPhases(estimateData.projectId, estimateData.phases);
            if (phasesSaved) {
              console.log('✅ Phases overridden successfully');
            } else {
              console.error('❌ Failed to override phases');
            }
          }
        }
      } catch (projectUpdateError) {
        console.error('❌ Exception in project update:', projectUpdateError);
        // Don't fail the estimate save if project update fails
      }
    }

    return data;
  } catch (error) {
    console.error('Error in saveEstimate:', error);
    return null;
  }
};

/**
 * Update an existing estimate with new data
 * @param {object} estimateData - Updated estimate data (must include id or estimateId)
 * @returns {Promise<object|null>} Updated estimate or null
 */
export const updateEstimate = async (estimateData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    const estimateId = estimateData.id || estimateData.estimateId;
    if (!estimateId) {
      console.error('No estimate ID provided');
      return null;
    }

    const { data, error } = await supabase
      .from('estimates')
      .update({
        project_id: estimateData.projectId || null,
        client_name: estimateData.client?.name || estimateData.client || estimateData.clientName,
        client_phone: estimateData.client?.phone || estimateData.clientPhone,
        client_email: estimateData.client?.email || estimateData.clientEmail,
        client_address: estimateData.client?.address || estimateData.clientAddress,
        project_name: estimateData.projectName,
        items: estimateData.lineItems || estimateData.items || [],
        phases: estimateData.phases || [],
        schedule: estimateData.schedule || {},
        scope: estimateData.scope || {},
        subtotal: estimateData.subtotal || 0,
        tax_rate: estimateData.taxRate || 0,
        tax_amount: estimateData.taxAmount || 0,
        total: estimateData.total || 0,
        valid_until: estimateData.validUntil || null,
        payment_terms: estimateData.paymentTerms || 'Net 30',
        notes: estimateData.notes || '',
      })
      .eq('id', estimateId)
      .select()
      .single();

    if (error) {
      console.error('Error updating estimate:', error);
      return null;
    }

    // If estimate has projectId, update the project with the new estimate data
    if (estimateData.projectId && data) {
      console.log('📊 Updating project with updated estimate data:', estimateData.projectId);
      console.log('📊 Estimate data being used for update:', {
        total: estimateData.total,
        hasPhases: estimateData.phases?.length > 0,
        phasesCount: estimateData.phases?.length || 0,
        hasSchedule: !!estimateData.schedule,
        hasScope: !!estimateData.scope
      });

      try {
        const updateData = {
          budget: estimateData.total
        };

        if (estimateData.schedule && estimateData.schedule.startDate) {
          updateData.start_date = estimateData.schedule.startDate;
          console.log('📊 Adding start_date:', estimateData.schedule.startDate);
        }

        if (estimateData.schedule && estimateData.schedule.estimatedEndDate) {
          updateData.end_date = estimateData.schedule.estimatedEndDate;
          console.log('📊 Adding end_date:', estimateData.schedule.estimatedEndDate);
        }

        if (estimateData.scope && estimateData.scope.description) {
          updateData.task_description = estimateData.scope.description;
          console.log('📊 Adding task_description:', estimateData.scope.description);
        }

        console.log('📊 Final update data for project:', updateData);

        const { data: updatedProject, error: projectError } = await supabase
          .from('projects')
          .update(updateData)
          .eq('id', estimateData.projectId)
          .select();

        if (projectError) {
          console.error('❌ Error updating project with estimate data:', projectError);
          console.error('❌ Update data that failed:', updateData);
          // Don't fail the estimate update if project update fails
        } else {
          console.log('✅ Project updated successfully with estimate data');
          console.log('✅ Updated project:', updatedProject);
        }

        // Save phases to project_phases table if they exist
        if (estimateData.phases && Array.isArray(estimateData.phases) && estimateData.phases.length > 0) {
          console.log('📊 Saving phases to project_phases table:', estimateData.phases.length);
          const phasesSaved = await saveProjectPhases(estimateData.projectId, estimateData.phases);
          if (phasesSaved) {
            console.log('✅ Phases saved successfully');
          } else {
            console.error('❌ Failed to save phases');
          }
        }
      } catch (projectUpdateError) {
        console.error('❌ Exception in project update:', projectUpdateError);
        // Don't fail the estimate update if project update fails
      }
    }

    return data;
  } catch (error) {
    console.error('Error in updateEstimate:', error);
    return null;
  }
};

/**
 * Fetch all estimates for current user
 * @param {object} filters - Optional filters (status, dateRange, etc.)
 * @returns {Promise<array>} Array of estimates
 */
export const fetchEstimates = async (filters = {}) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('No user logged in');
      return [];
    }

    let query = supabase
      .from('estimates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.clientName) {
      query = query.ilike('client_name', `%${filters.clientName}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching estimates:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchEstimates:', error);
    return [];
  }
};

/**
 * Get a single estimate by ID
 * @param {string} estimateId - Estimate ID
 * @returns {Promise<object|null>} Estimate or null
 */
export const getEstimate = async (estimateId) => {
  try {
    const { data, error } = await supabase
      .from('estimates')
      .select('*')
      .eq('id', estimateId)
      .single();

    if (error) {
      console.error('Error fetching estimate:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getEstimate:', error);
    return null;
  }
};

/**
 * Update estimate status
 * @param {string} estimateId - Estimate ID
 * @param {string} status - New status ('draft', 'sent', 'accepted', 'rejected')
 * @returns {Promise<boolean>} Success status
 */
export const updateEstimateStatus = async (estimateId, status) => {
  try {
    const updateData = { status };

    // Set timestamp based on status
    if (status === 'sent') {
      updateData.sent_date = new Date().toISOString();
    } else if (status === 'accepted') {
      updateData.accepted_date = new Date().toISOString();
    } else if (status === 'rejected') {
      updateData.rejected_date = new Date().toISOString();
    }

    const { error } = await supabase
      .from('estimates')
      .update(updateData)
      .eq('id', estimateId);

    if (error) {
      console.error('Error updating estimate status:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateEstimateStatus:', error);
    return false;
  }
};

/**
 * Delete an estimate
 * @param {string} estimateId - Estimate ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteEstimate = async (estimateId) => {
  try {
    const { error } = await supabase
      .from('estimates')
      .delete()
      .eq('id', estimateId);

    if (error) {
      console.error('Error deleting estimate:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteEstimate:', error);
    return false;
  }
};

// ===================================================================
// INVOICES FUNCTIONS
// ===================================================================

/**
 * Create invoice from an estimate
 * @param {string} estimateId - Estimate ID to convert
 * @returns {Promise<object|null>} Created invoice or null
 */
export const createInvoiceFromEstimate = async (estimateId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    // Fetch the estimate
    const { data: estimate, error: fetchError } = await supabase
      .from('estimates')
      .select('*')
      .eq('id', estimateId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !estimate) {
      console.error('Error fetching estimate:', fetchError);
      return null;
    }

    // Calculate due date (30 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    // Create invoice
    const { data: invoice, error: createError } = await supabase
      .from('invoices')
      .insert({
        user_id: userId,
        estimate_id: estimateId,
        client_name: estimate.client_name,
        client_phone: estimate.client_phone,
        client_email: estimate.client_email,
        client_address: estimate.client_address,
        project_name: estimate.project_name,
        items: estimate.items,
        subtotal: estimate.subtotal,
        tax_rate: estimate.tax_rate,
        tax_amount: estimate.tax_amount,
        total: estimate.total,
        due_date: dueDate.toISOString().split('T')[0],
        payment_terms: estimate.payment_terms,
        notes: estimate.notes,
        status: 'unpaid'
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating invoice:', createError);
      return null;
    }

    // Update estimate status to 'accepted'
    await updateEstimateStatus(estimateId, 'accepted');

    return invoice;
  } catch (error) {
    console.error('Error in createInvoiceFromEstimate:', error);
    return null;
  }
};

/**
 * Create a standalone invoice (not from estimate)
 * @param {object} invoiceData - Invoice data
 * @returns {Promise<object|null>} Created invoice or null
 */
export const saveInvoice = async (invoiceData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        user_id: userId,
        client_name: invoiceData.client || invoiceData.clientName,
        client_phone: invoiceData.clientPhone,
        client_email: invoiceData.clientEmail,
        client_address: invoiceData.clientAddress,
        project_name: invoiceData.projectName,
        items: invoiceData.items || [],
        subtotal: invoiceData.subtotal || 0,
        tax_rate: invoiceData.taxRate || 0,
        tax_amount: invoiceData.taxAmount || 0,
        total: invoiceData.total || 0,
        due_date: invoiceData.dueDate,
        payment_terms: invoiceData.paymentTerms || 'Net 30',
        notes: invoiceData.notes || '',
        status: 'unpaid'
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving invoice:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in saveInvoice:', error);
    return null;
  }
};

/**
 * Fetch all invoices for current user
 * @param {object} filters - Optional filters (status, dateRange, etc.)
 * @returns {Promise<array>} Array of invoices
 */
export const fetchInvoices = async (filters = {}) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('No user logged in');
      return [];
    }

    let query = supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.clientName) {
      query = query.ilike('client_name', `%${filters.clientName}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching invoices:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchInvoices:', error);
    return [];
  }
};

/**
 * Get a single invoice by ID
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<object|null>} Invoice or null
 */
export const getInvoice = async (invoiceId) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (error) {
      console.error('Error fetching invoice:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getInvoice:', error);
    return null;
  }
};

/**
 * Mark invoice as paid
 * @param {string} invoiceId - Invoice ID
 * @param {number} amount - Payment amount
 * @param {string} paymentMethod - Payment method ('cash', 'check', 'credit_card', etc.)
 * @returns {Promise<boolean>} Success status
 */
export const markInvoiceAsPaid = async (invoiceId, amount, paymentMethod = null) => {
  try {
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('total, amount_paid')
      .eq('id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      console.error('Error fetching invoice:', fetchError);
      return false;
    }

    const newAmountPaid = (invoice.amount_paid || 0) + amount;
    const status = newAmountPaid >= invoice.total ? 'paid' : 'partial';

    const updateData = {
      amount_paid: newAmountPaid,
      status,
      payment_method: paymentMethod
    };

    if (status === 'paid') {
      updateData.paid_date = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', invoiceId);

    if (updateError) {
      console.error('Error updating invoice payment:', updateError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in markInvoiceAsPaid:', error);
    return false;
  }
};

/**
 * Update invoice PDF URL
 * @param {string} invoiceId - Invoice ID
 * @param {string} pdfUrl - PDF URL from Supabase storage
 * @returns {Promise<boolean>} Success status
 */
export const updateInvoicePDF = async (invoiceId, pdfUrl) => {
  try {
    const { error } = await supabase
      .from('invoices')
      .update({ pdf_url: pdfUrl })
      .eq('id', invoiceId);

    if (error) {
      console.error('Error updating invoice PDF:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateInvoicePDF:', error);
    return false;
  }
};

// =====================================================
// PROJECT PHASES FUNCTIONS
// =====================================================

/**
 * Save project phases to database
 * @param {string} projectId - Project ID
 * @param {Array<object>} phases - Array of phase objects
 * @param {object} schedule - Optional schedule object with phaseSchedule array
 * @returns {Promise<boolean>} Success status
 */
export const saveProjectPhases = async (projectId, phases, schedule = null) => {
  try {
    // Delete existing phases for this project
    const { error: deleteError } = await supabase
      .from('project_phases')
      .delete()
      .eq('project_id', projectId);

    if (deleteError) {
      console.error('Error deleting old phases:', deleteError);
      return false;
    }

    // If no phases, just update has_phases to false
    if (!phases || phases.length === 0) {
      await supabase
        .from('projects')
        .update({ has_phases: false })
        .eq('id', projectId);
      return true;
    }

    // Insert new phases
    const phasesToInsert = phases.map((phase, index) => {
      // Try to find matching schedule entry
      const phaseScheduleEntry = schedule?.phaseSchedule?.find(
        ps => ps.phaseName === phase.name
      );

      return {
        project_id: projectId,
        name: phase.name,
        order_index: index,
        planned_days: phase.plannedDays || phase.defaultDays || 5,
        start_date: phase.startDate || phaseScheduleEntry?.startDate || null,
        end_date: phase.endDate || phaseScheduleEntry?.endDate || null,
        completion_percentage: phase.completionPercentage || 0,
        status: phase.status || 'not_started',
        time_extensions: phase.timeExtensions || [],
        tasks: phase.tasks || [],
        budget: phase.budget || 0,  // Save phase budget
        services: phase.services || [],  // Save services associated with phase
      };
    });

    const { error: insertError } = await supabase
      .from('project_phases')
      .insert(phasesToInsert);

    if (insertError) {
      console.error('Error inserting phases:', insertError);
      return false;
    }

    // Update project has_phases flag
    await supabase
      .from('projects')
      .update({ has_phases: true })
      .eq('id', projectId);

    console.log(`✅ Saved ${phases.length} phases for project ${projectId}`);
    return true;
  } catch (error) {
    console.error('Error in saveProjectPhases:', error);
    return false;
  }
};

/**
 * Fetch all phases for a project
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} Array of phase objects
 */
export const fetchProjectPhases = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Error fetching project phases:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchProjectPhases:', error);
    return [];
  }
};

/**
 * Update a single phase's progress
 * @param {string} phaseId - Phase ID
 * @param {number} percentage - Completion percentage (0-100)
 * @returns {Promise<boolean>} Success status
 */
export const updatePhaseProgress = async (phaseId, percentage) => {
  try {
    const updateData = {
      completion_percentage: Math.min(100, Math.max(0, percentage)),
    };

    // If 100%, mark as completed
    if (percentage >= 100) {
      updateData.status = 'completed';
      updateData.actual_end_date = new Date().toISOString().split('T')[0];
    } else if (percentage > 0) {
      // If started but not completed, mark as in_progress
      if (updateData.status === 'not_started') {
        updateData.status = 'in_progress';
        updateData.actual_start_date = new Date().toISOString().split('T')[0];
      }
    }

    const { error } = await supabase
      .from('project_phases')
      .update(updateData)
      .eq('id', phaseId);

    if (error) {
      console.error('Error updating phase progress:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updatePhaseProgress:', error);
    return false;
  }
};

/**
 * Extend a phase timeline by adding extra days
 * @param {string} phaseId - Phase ID
 * @param {number} extraDays - Number of days to add
 * @param {string} reason - Reason for extension
 * @returns {Promise<boolean>} Success status
 */
export const extendPhaseTimeline = async (phaseId, extraDays, reason = '') => {
  try {
    // Fetch current phase data
    const { data: phase, error: fetchError } = await supabase
      .from('project_phases')
      .select('*')
      .eq('id', phaseId)
      .single();

    if (fetchError || !phase) {
      console.error('Error fetching phase:', fetchError);
      return false;
    }

    // Add extension to time_extensions array
    const timeExtensions = phase.time_extensions || [];
    timeExtensions.push({
      days: extraDays,
      reason,
      dateAdded: new Date().toISOString().split('T')[0],
    });

    // Calculate new end date
    let newEndDate = phase.end_date;
    if (newEndDate) {
      const endDate = new Date(newEndDate);
      endDate.setDate(endDate.getDate() + extraDays);
      newEndDate = endDate.toISOString().split('T')[0];
    }

    // Update phase
    const { error: updateError } = await supabase
      .from('project_phases')
      .update({
        time_extensions: timeExtensions,
        end_date: newEndDate,
        planned_days: phase.planned_days + extraDays,
      })
      .eq('id', phaseId);

    if (updateError) {
      console.error('Error extending phase timeline:', updateError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in extendPhaseTimeline:', error);
    return false;
  }
};

/**
 * Calculate phase status based on dates and progress
 * @param {object} phase - Phase object
 * @returns {string} Status ('not_started', 'in_progress', 'completed', 'behind')
 */
export const calculatePhaseStatus = (phase) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // If completed
  if (phase.status === 'completed' || phase.completion_percentage === 100) {
    return 'completed';
  }

  // If not started
  if (phase.status === 'not_started' && !phase.actual_start_date) {
    return 'not_started';
  }

  // If in progress
  if (phase.status === 'in_progress' || phase.actual_start_date) {
    // Check if behind schedule
    if (phase.end_date) {
      const endDate = new Date(phase.end_date);
      endDate.setHours(0, 0, 0, 0);
      if (today > endDate) {
        return 'behind';
      }
    }
    return 'in_progress';
  }

  return phase.status || 'not_started';
};

/**
 * Update phase dates (start and/or end)
 * @param {string} phaseId - Phase ID
 * @param {object} dates - Object with startDate and/or endDate
 * @returns {Promise<boolean>} Success status
 */
export const updatePhaseDates = async (phaseId, dates) => {
  try {
    const updateData = {};

    if (dates.startDate) {
      updateData.start_date = dates.startDate;
    }

    if (dates.endDate) {
      updateData.end_date = dates.endDate;
    }

    // Calculate planned_days if both dates provided
    if (dates.startDate && dates.endDate) {
      const start = new Date(dates.startDate);
      const end = new Date(dates.endDate);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      updateData.planned_days = diffDays;
    }

    const { error } = await supabase
      .from('project_phases')
      .update(updateData)
      .eq('id', phaseId);

    if (error) {
      console.error('Error updating phase dates:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updatePhaseDates:', error);
    return false;
  }
};

/**
 * Mark phase as started
 * @param {string} phaseId - Phase ID
 * @returns {Promise<boolean>} Success status
 */
export const startPhase = async (phaseId) => {
  try {
    const { error } = await supabase
      .from('project_phases')
      .update({
        status: 'in_progress',
        actual_start_date: new Date().toISOString().split('T')[0],
      })
      .eq('id', phaseId);

    if (error) {
      console.error('Error starting phase:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in startPhase:', error);
    return false;
  }
};

/**
 * Mark phase as completed
 * @param {string} phaseId - Phase ID
 * @returns {Promise<boolean>} Success status
 */
export const completePhase = async (phaseId) => {
  try {
    const { error } = await supabase
      .from('project_phases')
      .update({
        status: 'completed',
        completion_percentage: 100,
        actual_end_date: new Date().toISOString().split('T')[0],
      })
      .eq('id', phaseId);

    if (error) {
      console.error('Error completing phase:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in completePhase:', error);
    return false;
  }
};

// ============================================================
// PHASE TASKS MANAGEMENT
// ============================================================

/**
 * Add task to phase
 * @param {string} phaseId - Phase ID
 * @param {string} taskDescription - Task description
 * @param {number} order - Task order index
 * @returns {Promise<object|null>} Updated phase or null
 */
export const addTaskToPhase = async (phaseId, taskDescription, order) => {
  try {
    // Get current phase
    const { data: phase, error: fetchError } = await supabase
      .from('project_phases')
      .select('tasks')
      .eq('id', phaseId)
      .single();

    if (fetchError) throw fetchError;

    // Create new task
    const newTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      description: taskDescription,
      order: order || (phase.tasks?.length || 0) + 1,
      completed: false,
      completed_by: null,
      completed_date: null,
      photo_url: null,
    };

    // Add task to tasks array
    const updatedTasks = [...(phase.tasks || []), newTask];

    // Update phase
    const { data, error } = await supabase
      .from('project_phases')
      .update({ tasks: updatedTasks })
      .eq('id', phaseId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding task to phase:', error);
    return null;
  }
};

/**
 * Update phase task
 * @param {string} phaseId - Phase ID
 * @param {string} taskId - Task ID
 * @param {object} updates - Task updates (description, completed, etc.)
 * @returns {Promise<object|null>} Updated phase or null
 */
export const updatePhaseTask = async (phaseId, taskId, updates) => {
  try {
    // Get current phase
    const { data: phase, error: fetchError } = await supabase
      .from('project_phases')
      .select('tasks')
      .eq('id', phaseId)
      .single();

    if (fetchError) throw fetchError;

    // Update the specific task
    const updatedTasks = (phase.tasks || []).map(task =>
      task.id === taskId ? { ...task, ...updates } : task
    );

    // Update phase
    const { data, error } = await supabase
      .from('project_phases')
      .update({ tasks: updatedTasks })
      .eq('id', phaseId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating phase task:', error);
    return null;
  }
};

/**
 * Mark task as complete
 * @param {string} phaseId - Phase ID
 * @param {string} taskId - Task ID
 * @param {string} workerId - Worker who completed the task
 * @param {string} photoUrl - Optional photo URL
 * @returns {Promise<object|null>} Updated phase or null
 */
export const markTaskComplete = async (phaseId, taskId, workerId = null, photoUrl = null) => {
  try {
    const updates = {
      completed: true,
      completed_by: workerId,
      completed_date: new Date().toISOString(),
      photo_url: photoUrl,
    };

    const updatedPhase = await updatePhaseTask(phaseId, taskId, updates);
    return updatedPhase;
  } catch (error) {
    console.error('Error marking task complete:', error);
    return null;
  }
};

/**
 * Calculate phase progress from tasks (0-100%)
 * Note: Database trigger also does this automatically
 * @param {string} phaseId - Phase ID
 * @returns {Promise<number>} Completion percentage
 */
export const calculatePhaseProgressFromTasks = async (phaseId) => {
  try {
    const { data: phase, error } = await supabase
      .from('project_phases')
      .select('tasks, completion_percentage')
      .eq('id', phaseId)
      .single();

    if (error) throw error;

    const tasks = phase.tasks || [];
    if (tasks.length === 0) {
      return phase.completion_percentage || 0;
    }

    const completedTasks = tasks.filter(task => task.completed).length;
    const percentage = Math.round((completedTasks / tasks.length) * 100);

    return percentage;
  } catch (error) {
    console.error('Error calculating phase progress:', error);
    return 0;
  }
};

// ============================================================
// DAILY REPORTS MANAGEMENT
// ============================================================

/**
 * Save daily report
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @param {string} phaseId - Phase ID (optional)
 * @param {array} photos - Array of photo URLs
 * @param {array} completedStepIds - Array of completed task IDs
 * @param {string} notes - Report notes
 * @returns {Promise<object|null>} Saved report or null
 */
export const saveDailyReport = async (workerId, projectId, phaseId, photos, completedStepIds, notes) => {
  try {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error('User not authenticated');

    const reportData = {
      worker_id: workerId,
      project_id: projectId,
      phase_id: phaseId || null,
      report_date: new Date().toISOString().split('T')[0],
      photos: photos || [],
      completed_steps: completedStepIds || [],
      notes: notes || '',
    };

    const { data, error } = await supabase
      .from('daily_reports')
      .insert(reportData)
      .select()
      .single();

    if (error) throw error;

    // Mark tasks as completed
    if (phaseId && completedStepIds && completedStepIds.length > 0) {
      for (const taskId of completedStepIds) {
        await markTaskComplete(phaseId, taskId, workerId, photos[0] || null);
      }
    }

    return data;
  } catch (error) {
    console.error('Error saving daily report:', error);
    return null;
  }
};

/**
 * Fetch daily reports for a project
 * @param {string} projectId - Project ID
 * @param {object} filters - Optional filters (workerId, phaseId, startDate, endDate)
 * @returns {Promise<array>} Array of reports
 */
export const fetchDailyReports = async (projectId, filters = {}) => {
  try {
    let query = supabase
      .from('daily_reports')
      .select('*, workers(*)')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false });

    if (filters.workerId) {
      query = query.eq('worker_id', filters.workerId);
    }

    if (filters.phaseId) {
      query = query.eq('phase_id', filters.phaseId);
    }

    if (filters.startDate) {
      query = query.gte('report_date', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('report_date', filters.endDate);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching daily reports:', error);
    return [];
  }
};

/**
 * Fetch worker's daily reports for a specific date
 * @param {string} workerId - Worker ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<array>} Array of reports
 */
export const fetchWorkerDailyReports = async (workerId, date) => {
  try {
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*, projects(*), project_phases(*)')
      .eq('worker_id', workerId)
      .eq('report_date', date)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching worker daily reports:', error);
    return [];
  }
};

// ============================================================
// PAYMENT STRUCTURE MANAGEMENT
// ============================================================

/**
 * Update project payment structure
 * @param {string} projectId - Project ID
 * @param {string} paymentStructure - 'full' or 'per_phase'
 * @param {string} paymentTerms - Payment terms text
 * @returns {Promise<boolean>} Success status
 */
export const updateProjectPaymentStructure = async (projectId, paymentStructure, paymentTerms = null) => {
  try {
    const { error } = await supabase
      .from('projects')
      .update({
        payment_structure: paymentStructure,
        payment_terms: paymentTerms,
      })
      .eq('id', projectId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating project payment structure:', error);
    return false;
  }
};

/**
 * Save phase payment amount
 * @param {string} phaseId - Phase ID
 * @param {number} amount - Payment amount
 * @returns {Promise<boolean>} Success status
 */
export const savePhasePaymentAmount = async (phaseId, amount) => {
  try {
    const { error } = await supabase
      .from('project_phases')
      .update({ payment_amount: amount })
      .eq('id', phaseId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error saving phase payment amount:', error);
    return false;
  }
};

/**
 * Validate phase payments sum to contract amount
 * @param {array} phases - Array of phases with payment_amount
 * @param {number} contractAmount - Total contract amount
 * @returns {object} Validation result {isValid, totalPhasePayments, difference}
 */
export const validatePhasePayments = (phases, contractAmount) => {
  const totalPhasePayments = phases.reduce((sum, phase) => {
    return sum + (parseFloat(phase.payment_amount) || 0);
  }, 0);

  const difference = contractAmount - totalPhasePayments;
  const isValid = Math.abs(difference) < 0.01; // Allow minor rounding differences

  return {
    isValid,
    totalPhasePayments,
    contractAmount,
    difference,
  };
};

// ============================================================================
// WORKER MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Create a new worker
 * @param {object} workerData - Worker information
 * @returns {Promise<object>} Created worker or null
 */
export const createWorker = async (workerData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    const { data, error } = await supabase
      .from('workers')
      .insert({
        owner_id: userId,
        full_name: workerData.fullName || workerData.full_name,
        phone: workerData.phone,
        email: workerData.email,
        trade: workerData.trade,
        hourly_rate: workerData.hourlyRate || workerData.hourly_rate || 0,
        payment_type: workerData.paymentType || workerData.payment_type || 'hourly',
        daily_rate: workerData.dailyRate || workerData.daily_rate || 0,
        weekly_salary: workerData.weeklySalary || workerData.weekly_salary || 0,
        project_rate: workerData.projectRate || workerData.project_rate || 0,
        status: workerData.status || 'pending',
        is_onboarded: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating worker:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createWorker:', error);
    return null;
  }
};

/**
 * Update worker information
 * @param {string} workerId - Worker ID
 * @param {object} updates - Fields to update
 * @returns {Promise<boolean>} Success status
 */
export const updateWorker = async (workerId, updates) => {
  try {
    const { error } = await supabase
      .from('workers')
      .update({
        full_name: updates.fullName || updates.full_name,
        phone: updates.phone,
        email: updates.email,
        trade: updates.trade,
        hourly_rate: updates.hourlyRate || updates.hourly_rate,
        payment_type: updates.paymentType || updates.payment_type,
        daily_rate: updates.dailyRate || updates.daily_rate,
        weekly_salary: updates.weeklySalary || updates.weekly_salary,
        project_rate: updates.projectRate || updates.project_rate,
        status: updates.status,
      })
      .eq('id', workerId);

    if (error) {
      console.error('Error updating worker:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateWorker:', error);
    return false;
  }
};

/**
 * Get all workers for the current owner
 * @returns {Promise<array>} Array of workers
 */
export const fetchWorkers = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching workers:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchWorkers:', error);
    return [];
  }
};

/**
 * Get worker by ID
 * @param {string} workerId - Worker ID
 * @returns {Promise<object|null>} Worker data
 */
export const getWorker = async (workerId) => {
  try {
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('id', workerId)
      .single();

    if (error) {
      console.error('Error fetching worker:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getWorker:', error);
    return null;
  }
};

/**
 * Delete a worker
 * @param {string} workerId - Worker ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteWorker = async (workerId) => {
  try {
    const { error } = await supabase
      .from('workers')
      .delete()
      .eq('id', workerId);

    if (error) {
      console.error('Error deleting worker:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteWorker:', error);
    return false;
  }
};

// ============================================================================
// WORKER ASSIGNMENT FUNCTIONS
// ============================================================================

/**
 * Assign worker to a project
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>} Success status
 */
export const assignWorkerToProject = async (workerId, projectId) => {
  try {
    const { error } = await supabase
      .from('project_assignments')
      .insert({
        worker_id: workerId,
        project_id: projectId,
      });

    if (error) {
      console.error('Error assigning worker to project:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in assignWorkerToProject:', error);
    return false;
  }
};

/**
 * Assign worker to a specific phase
 * @param {string} workerId - Worker ID
 * @param {string} phaseId - Phase ID
 * @param {object} options - Additional options (notes, assignedBy)
 * @returns {Promise<boolean>} Success status
 */
export const assignWorkerToPhase = async (workerId, phaseId, options = {}) => {
  try {
    const userId = await getCurrentUserId();

    const { error } = await supabase
      .from('phase_assignments')
      .insert({
        worker_id: workerId,
        phase_id: phaseId,
        notes: options.notes,
        assigned_by: options.assignedBy || userId,
      });

    if (error) {
      console.error('Error assigning worker to phase:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in assignWorkerToPhase:', error);
    return false;
  }
};

/**
 * Remove worker from a project
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>} Success status
 */
export const removeWorkerFromProject = async (workerId, projectId) => {
  try {
    const { error } = await supabase
      .from('project_assignments')
      .delete()
      .eq('worker_id', workerId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error removing worker from project:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in removeWorkerFromProject:', error);
    return false;
  }
};

/**
 * Remove worker from a phase
 * @param {string} workerId - Worker ID
 * @param {string} phaseId - Phase ID
 * @returns {Promise<boolean>} Success status
 */
export const removeWorkerFromPhase = async (workerId, phaseId) => {
  try {
    const { error } = await supabase
      .from('phase_assignments')
      .delete()
      .eq('worker_id', workerId)
      .eq('phase_id', phaseId);

    if (error) {
      console.error('Error removing worker from phase:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in removeWorkerFromPhase:', error);
    return false;
  }
};

/**
 * Get all workers assigned to a project
 * @param {string} projectId - Project ID
 * @returns {Promise<array>} Array of workers
 */
export const getProjectWorkers = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('project_assignments')
      .select(`
        *,
        workers:worker_id (
          id,
          full_name,
          phone,
          email,
          trade,
          hourly_rate,
          status
        )
      `)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error fetching project workers:', error);
      return [];
    }

    return data?.map(assignment => assignment.workers) || [];
  } catch (error) {
    console.error('Error in getProjectWorkers:', error);
    return [];
  }
};

/**
 * Get all workers assigned to a specific phase
 * @param {string} phaseId - Phase ID
 * @returns {Promise<array>} Array of workers with assignment details
 */
export const getPhaseWorkers = async (phaseId) => {
  try {
    // NOTE: Phase-level worker assignments are not implemented yet
    // Workers are assigned at the project level only
    // Return empty array for now
    console.log('⚠️ Phase-level worker assignments not implemented yet. Use project-level assignments.');
    return [];

    /* TODO: Implement phase_assignments table if needed
    const { data, error } = await supabase
      .from('phase_assignments')
      .select(`
        *,
        workers:worker_id (
          id,
          full_name,
          phone,
          email,
          trade,
          hourly_rate,
          status
        )
      `)
      .eq('phase_id', phaseId);

    if (error) {
      console.error('Error fetching phase workers:', error);
      return [];
    }

    return data?.map(assignment => ({
      ...assignment.workers,
      assignmentNotes: assignment.notes,
      assignedAt: assignment.assigned_at,
    })) || [];
    */
  } catch (error) {
    console.error('Error in getPhaseWorkers:', error);
    return [];
  }
};

/**
 * Get all assignments for a worker
 * @param {string} workerId - Worker ID
 * @returns {Promise<object>} Object with projects and phases arrays
 */
export const getWorkerAssignments = async (workerId) => {
  try {
    // Get project assignments
    const { data: projectData, error: projectError } = await supabase
      .from('project_assignments')
      .select(`
        *,
        projects:project_id (
          id,
          name,
          client,
          location,
          start_date,
          end_date,
          status,
          contract_amount
        )
      `)
      .eq('worker_id', workerId);

    if (projectError) {
      console.error('Error fetching project assignments:', projectError);
    }

    // Get phase assignments
    const { data: phaseData, error: phaseError } = await supabase
      .from('phase_assignments')
      .select(`
        *,
        project_phases:phase_id (
          id,
          name,
          start_date,
          end_date,
          status,
          completion_percentage,
          budget,
          project_id,
          projects:project_id (
            id,
            name,
            client
          )
        )
      `)
      .eq('worker_id', workerId);

    if (phaseError) {
      console.error('Error fetching phase assignments:', phaseError);
    }

    return {
      projects: projectData?.map(a => a.projects) || [],
      phases: phaseData?.map(a => ({
        ...a.project_phases,
        assignmentNotes: a.notes,
        assignedAt: a.assigned_at,
      })) || [],
    };
  } catch (error) {
    console.error('Error in getWorkerAssignments:', error);
    return { projects: [], phases: [] };
  }
};

// ============================================================================
// TIME TRACKING FUNCTIONS
// ============================================================================

/**
 * Clock in a worker
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @param {object} location - Location coordinates {latitude, longitude}
 * @returns {Promise<object|null>} Time tracking record
 */
export const clockIn = async (workerId, projectId, location = null) => {
  try {
    const { data, error } = await supabase
      .from('time_tracking')
      .insert({
        worker_id: workerId,
        project_id: projectId,
        clock_in: new Date().toISOString(),
        location_lat: location?.latitude,
        location_lng: location?.longitude,
      })
      .select()
      .single();

    if (error) {
      console.error('Error clocking in:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in clockIn:', error);
    return null;
  }
};

/**
 * Clock out a worker
 * @param {string} timeTrackingId - Time tracking record ID
 * @param {string} notes - Optional notes
 * @returns {Promise<boolean>} Success status
 */
export const clockOut = async (timeTrackingId, notes = null) => {
  try {
    const { error } = await supabase
      .from('time_tracking')
      .update({
        clock_out: new Date().toISOString(),
        notes: notes,
      })
      .eq('id', timeTrackingId);

    if (error) {
      console.error('Error clocking out:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in clockOut:', error);
    return false;
  }
};

/**
 * Get current active time tracking session for a worker
 * @param {string} workerId - Worker ID
 * @returns {Promise<object|null>} Active time tracking record
 */
export const getActiveClockIn = async (workerId) => {
  try {
    const { data, error } = await supabase
      .from('time_tracking')
      .select(`
        *,
        projects:project_id (
          id,
          name
        )
      `)
      .eq('worker_id', workerId)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No active session
        return null;
      }
      console.error('Error fetching active clock-in:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getActiveClockIn:', error);
    return null;
  }
};

/**
 * Get worker timesheet for a date range
 * @param {string} workerId - Worker ID
 * @param {object} dateRange - {startDate, endDate} in ISO format
 * @returns {Promise<array>} Array of time tracking records
 */
export const getWorkerTimesheet = async (workerId, dateRange = null) => {
  try {
    let query = supabase
      .from('time_tracking')
      .select(`
        *,
        projects:project_id (
          id,
          name,
          client
        )
      `)
      .eq('worker_id', workerId)
      .order('clock_in', { ascending: false });

    if (dateRange) {
      if (dateRange.startDate) {
        query = query.gte('clock_in', dateRange.startDate);
      }
      if (dateRange.endDate) {
        query = query.lte('clock_in', dateRange.endDate);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching timesheet:', error);
      return [];
    }

    // Calculate hours for each entry
    return data?.map(entry => {
      let hours = 0;
      if (entry.clock_in && entry.clock_out) {
        const clockIn = new Date(entry.clock_in);
        const clockOut = new Date(entry.clock_out);
        hours = (clockOut - clockIn) / (1000 * 60 * 60); // Convert to hours

        // Subtract break time if exists
        if (entry.break_start && entry.break_end) {
          const breakStart = new Date(entry.break_start);
          const breakEnd = new Date(entry.break_end);
          const breakHours = (breakEnd - breakStart) / (1000 * 60 * 60);
          hours -= breakHours;
        }
      }

      return {
        ...entry,
        hours: parseFloat(hours.toFixed(2)),
      };
    }) || [];
  } catch (error) {
    console.error('Error in getWorkerTimesheet:', error);
    return [];
  }
};

/**
 * Get worker time stats for a project
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @returns {Promise<object>} Time stats {totalHours, entries}
 */
export const getWorkerProjectHours = async (workerId, projectId) => {
  try {
    const { data, error } = await supabase
      .from('time_tracking')
      .select('*')
      .eq('worker_id', workerId)
      .eq('project_id', projectId)
      .not('clock_out', 'is', null);

    if (error) {
      console.error('Error fetching project hours:', error);
      return { totalHours: 0, entries: [] };
    }

    let totalHours = 0;
    const entries = data?.map(entry => {
      const clockIn = new Date(entry.clock_in);
      const clockOut = new Date(entry.clock_out);
      let hours = (clockOut - clockIn) / (1000 * 60 * 60);

      if (entry.break_start && entry.break_end) {
        const breakStart = new Date(entry.break_start);
        const breakEnd = new Date(entry.break_end);
        hours -= (breakEnd - breakStart) / (1000 * 60 * 60);
      }

      totalHours += hours;

      return {
        ...entry,
        hours: parseFloat(hours.toFixed(2)),
      };
    }) || [];

    return {
      totalHours: parseFloat(totalHours.toFixed(2)),
      entries,
    };
  } catch (error) {
    console.error('Error in getWorkerProjectHours:', error);
    return { totalHours: 0, entries: [] };
  }
};


// =====================================================
// WORKER SCHEDULING FUNCTIONS
// =====================================================

/**
 * Get all workers with today's clock-in records grouped by project
 * @returns {Promise<object>} Object with unassigned workers and workers grouped by project
 */
export const getTodaysWorkersSchedule = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all workers for this owner
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: allWorkers, error: workersError } = await supabase
      .from('workers')
      .select('*')
      .eq('owner_id', user.id)
      .eq('status', 'active');

    if (workersError) throw workersError;

    // Get all time tracking records for today
    const { data: todayClockIns, error: clockInsError } = await supabase
      .from('time_tracking')
      .select(`
        *,
        projects:project_id (
          id,
          name
        )
      `)
      .gte('clock_in', today.toISOString())
      .lt('clock_in', tomorrow.toISOString())
      .order('clock_in', { ascending: false });

    if (clockInsError) throw clockInsError;

    // Create a map of worker_id to their clock-in records
    const workerClockIns = {};
    todayClockIns?.forEach(clockIn => {
      if (!workerClockIns[clockIn.worker_id]) {
        workerClockIns[clockIn.worker_id] = [];
      }
      workerClockIns[clockIn.worker_id].push(clockIn);
    });

    // Separate workers into unassigned and grouped by project
    const unassignedWorkers = [];
    const projectGroups = {};

    allWorkers?.forEach(worker => {
      const clockIns = workerClockIns[worker.id];

      if (!clockIns || clockIns.length === 0) {
        // Worker hasn't clocked in today
        unassignedWorkers.push(worker);
      } else {
        // Get the most recent clock-in
        const latestClockIn = clockIns[0];

        // Check if still clocked in
        const isActive = !latestClockIn.clock_out;

        const workerWithClockIn = {
          ...worker,
          latestClockIn,
          isActive,
          clockInTime: latestClockIn.clock_in,
          hoursWorked: latestClockIn.clock_out
            ? (new Date(latestClockIn.clock_out) - new Date(latestClockIn.clock_in)) / (1000 * 60 * 60)
            : (new Date() - new Date(latestClockIn.clock_in)) / (1000 * 60 * 60)
        };

        const projectId = latestClockIn.project_id;
        const projectName = latestClockIn.projects?.name || 'Unknown Project';

        if (!projectGroups[projectId]) {
          projectGroups[projectId] = {
            projectId,
            projectName,
            workers: []
          };
        }

        projectGroups[projectId].workers.push(workerWithClockIn);
      }
    });

    return {
      unassignedWorkers,
      projectGroups: Object.values(projectGroups),
      totalWorkers: allWorkers?.length || 0,
      clockedInCount: Object.keys(workerClockIns).length
    };
  } catch (error) {
    console.error('Error getting today\'s workers schedule:', error);
    return {
      unassignedWorkers: [],
      projectGroups: [],
      totalWorkers: 0,
      clockedInCount: 0
    };
  }
};

/**
 * Get worker clock-in history
 * @param {string} workerId - Worker ID
 * @param {number} limit - Number of records to return (default 30)
 * @returns {Promise<array>} Array of clock-in records
 */
export const getWorkerClockInHistory = async (workerId, limit = 30) => {
  try {
    const { data, error } = await supabase
      .from('time_tracking')
      .select(`
        *,
        projects:project_id (
          id,
          name
        )
      `)
      .eq('worker_id', workerId)
      .order('clock_in', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Calculate hours for each entry
    const historyWithHours = data?.map(entry => ({
      ...entry,
      hoursWorked: entry.clock_out
        ? (new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60 * 60)
        : null
    })) || [];

    return historyWithHours;
  } catch (error) {
    console.error('Error getting worker clock-in history:', error);
    return [];
  }
};

/**
 * Get worker stats for current week and month
 * @param {string} workerId - Worker ID
 * @returns {Promise<object>} Stats object with week/month hours
 */
export const getWorkerStats = async (workerId) => {
  try {
    const now = new Date();

    // Start of current week (Sunday)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data, error } = await supabase
      .from('time_tracking')
      .select('*')
      .eq('worker_id', workerId)
      .not('clock_out', 'is', null) // Only completed sessions
      .gte('clock_in', startOfMonth.toISOString());

    if (error) throw error;

    let weekHours = 0;
    let monthHours = 0;
    const projectHours = {};

    data?.forEach(entry => {
      const hours = (new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60 * 60);
      const clockInDate = new Date(entry.clock_in);

      if (clockInDate >= startOfWeek) {
        weekHours += hours;
      }
      monthHours += hours;

      // Track hours per project
      const projectId = entry.project_id;
      if (!projectHours[projectId]) {
        projectHours[projectId] = 0;
      }
      projectHours[projectId] += hours;
    });

    // Find most worked project
    let mostWorkedProject = null;
    let maxHours = 0;
    Object.entries(projectHours).forEach(([projectId, hours]) => {
      if (hours > maxHours) {
        maxHours = hours;
        mostWorkedProject = projectId;
      }
    });

    return {
      weekHours: Math.round(weekHours * 100) / 100,
      monthHours: Math.round(monthHours * 100) / 100,
      mostWorkedProjectId: mostWorkedProject,
      mostWorkedProjectHours: Math.round(maxHours * 100) / 100
    };
  } catch (error) {
    console.error('Error getting worker stats:', error);
    return {
      weekHours: 0,
      monthHours: 0,
      mostWorkedProjectId: null,
      mostWorkedProjectHours: 0
    };
  }
};

// ============================================================================
// WORKER INVITE FUNCTIONS
// ============================================================================

/**
 * Get pending invites for a worker by email
 * @param {string} workerEmail - Worker's email address
 * @returns {Promise<array>} Array of pending invites with owner info
 */
export const getPendingInvites = async (workerEmail) => {
  try {
    console.log('getPendingInvites - Querying with email:', workerEmail);

    // Debug: Check ALL workers with this email regardless of status
    const { data: allWorkers } = await supabase
      .from('workers')
      .select('*')
      .eq('email', workerEmail);

    console.log('DEBUG - All workers with this email:', allWorkers);

    // First get pending worker invites
    const { data: workers, error: workersError } = await supabase
      .from('workers')
      .select('*')
      .eq('email', workerEmail)
      .eq('status', 'pending')
      .is('user_id', null);

    console.log('getPendingInvites - Workers query result:', { workers, workersError });

    if (workersError) {
      console.error('Error getting pending invites:', workersError);
      return [];
    }

    if (!workers || workers.length === 0) {
      console.log('No pending invites found - checking all pending workers...');
      const { data: allPending } = await supabase
        .from('workers')
        .select('*')
        .eq('status', 'pending');
      console.log('All pending workers in system:', allPending);
      return [];
    }

    // Get owner info for each invite
    const invitesWithOwners = await Promise.all(
      workers.map(async (worker) => {
        const { data: owner } = await supabase
          .from('profiles')
          .select('id, full_name, company_name')
          .eq('id', worker.owner_id)
          .single();

        return {
          ...worker,
          owner: owner || null
        };
      })
    );

    console.log('getPendingInvites - Final result:', invitesWithOwners);

    return invitesWithOwners;
  } catch (error) {
    console.error('Error in getPendingInvites:', error);
    return [];
  }
};

/**
 * Accept a worker invite
 * @param {string} workerId - Worker record ID
 * @param {string} userId - Authenticated user's ID
 * @returns {Promise<boolean>} Success status
 */
export const acceptInvite = async (workerId, userId) => {
  try {
    const { error } = await supabase
      .from('workers')
      .update({
        user_id: userId,
        status: 'active'
      })
      .eq('id', workerId)
      .eq('status', 'pending')
      .is('user_id', null);

    if (error) {
      console.error('Error accepting invite:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in acceptInvite:', error);
    return false;
  }
};

/**
 * Reject a worker invite
 * @param {string} workerId - Worker record ID
 * @returns {Promise<boolean>} Success status
 */
export const rejectInvite = async (workerId) => {
  try {
    const { error } = await supabase
      .from('workers')
      .update({
        status: 'rejected'
      })
      .eq('id', workerId)
      .eq('status', 'pending')
      .is('user_id', null);

    if (error) {
      console.error('Error rejecting invite:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in rejectInvite:', error);
    return false;
  }
};
