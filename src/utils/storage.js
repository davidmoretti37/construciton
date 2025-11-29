import { supabase } from '../lib/supabase';
import logger from './logger';

/**
 * Default user profile structure
 * Note: Services are now stored in the user_services table, not in the profile
 */
const DEFAULT_PROFILE = {
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
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

/**
 * Get user's services from user_services table (new system)
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
 * Add a new service for the user (new system)
 * @param {string} categoryId - Service category ID
 * @param {object} pricing - Pricing object { itemId: { price, unit, name }, ... }
 * @param {Array} customPhases - Custom phases array [{ name, description, default_days, tasks }, ...]
 * @returns {Promise<boolean>} Success status
 */
export const addUserService = async (categoryId, pricing = {}, customPhases = []) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
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
      console.error('Error adding user service:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in addUserService:', error);
    return false;
  }
};

/**
 * Update pricing for a user service (new system)
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
      console.error('Error updating service pricing:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateUserServicePricing:', error);
    return false;
  }
};

/**
 * Remove a user service (new system)
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
      console.error('Error removing user service:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in removeUserService:', error);
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
      console.error('Error loading service categories:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getServiceCategories:', error);
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
      console.error('Error loading service items:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getServiceItems:', error);
    return [];
  }
};

/**
 * Get user profile from Supabase
 * Note: Services are now fetched via getUserServices(), not from profile
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
 * Note: Services are now saved via addUserService(), not in profile
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

    const updateData = {
      business_name: businessInfo.name,
      business_phone: businessInfo.phone,
      business_email: businessInfo.email,
    };

    // Add optional fields if they exist
    if (businessInfo.logoUrl !== undefined) {
      updateData.business_logo = businessInfo.logoUrl;
    }
    if (businessInfo.address !== undefined) {
      updateData.business_address = businessInfo.address;
    }
    if (businessInfo.paymentInfo !== undefined) {
      updateData.payment_info = businessInfo.paymentInfo;
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
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
      .maybeSingle();

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
      status: projectData.status || 'active',
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

    // Record pricing to history when project is completed (for AI learning)
    if (result.status === 'completed' && (result.contract_amount || result.base_contract)) {
      try {
        const { recordProjectPricing } = require('../services/pricingIntelligence');
        await recordProjectPricing({
          id: result.id,
          name: result.name,
          contract_amount: result.contract_amount || result.base_contract,
          task_description: result.task_description,
          end_date: result.end_date,
        });
        console.log('📊 Recorded completed project pricing to history');
      } catch (pricingErr) {
        console.warn('Failed to record project pricing:', pricingErr);
      }
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

    // OPTIMIZED: Use JOIN to fetch projects with phases in a single query
    // This eliminates the N+1 query problem
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        project_phases (
          id,
          name,
          planned_days,
          start_date,
          end_date,
          budget,
          tasks,
          completion_percentage,
          status,
          order_index,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }

    // Transform each project (phases are already included)
    const projects = (data || []).map((project) => {
      const transformed = transformProjectFromDB(project);

      // Phases are already fetched via JOIN, just attach them
      if (project.project_phases && project.project_phases.length > 0) {
        transformed.phases = project.project_phases.sort((a, b) =>
          (a.order_index || 0) - (b.order_index || 0)
        );
        transformed.hasPhases = true;
      }

      return transformed;
    });

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
  if (!startDate || !endDate) {
    return 0;
  }

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
    if (totalDays <= 0) return 0;
    if (elapsedDays < 0) return 0;
    if (elapsedDays >= totalDays) return 100;

    // Calculate percentage
    const percentage = Math.round((elapsedDays / totalDays) * 100);
    return percentage;
  } catch (error) {
    console.error('❌ Error calculating time-based completion:', error);
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

    // Support both snake_case and camelCase for project_id
    const projectId = estimateData.projectId || estimateData.project_id || null;

    const { data, error } = await supabase
      .from('estimates')
      .insert({
        user_id: userId,
        project_id: projectId,
        client_name: estimateData.client?.name || estimateData.client || estimateData.clientName || 'Unnamed Client',
        client_phone: estimateData.client?.phone || estimateData.clientPhone || null,
        client_email: estimateData.client?.email || estimateData.clientEmail || null,
        client_address: estimateData.client?.address || estimateData.clientAddress || null,
        project_name: estimateData.projectName || null,
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

    // Record pricing to history for AI learning (non-blocking)
    try {
      const { recordEstimatePricing } = require('../services/pricingIntelligence');
      const lineItems = estimateData.lineItems || estimateData.items || [];
      if (lineItems.length > 0) {
        recordEstimatePricing({
          id: data.id,
          items: lineItems,
          project_name: estimateData.projectName,
        }).catch(err => console.warn('Failed to record pricing history:', err));
        console.log('📊 Recording estimate pricing to history for AI learning');
      }
    } catch (pricingError) {
      // Don't fail estimate save if pricing history fails
      console.warn('⚠️ Could not record pricing history:', pricingError);
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
        client_name: estimateData.client?.name || estimateData.client || estimateData.clientName || 'Unnamed Client',
        client_phone: estimateData.client?.phone || estimateData.clientPhone || null,
        client_email: estimateData.client?.email || estimateData.clientEmail || null,
        client_address: estimateData.client?.address || estimateData.clientAddress || null,
        project_name: estimateData.projectName || null,
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
 * Get estimate by project name
 * @param {string} projectName - Project name to search for
 * @returns {Promise<object|null>} Estimate object or null
 */
export const getEstimateByProjectName = async (projectName) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    // Search for estimates with matching project name (case-insensitive)
    const { data, error } = await supabase
      .from('estimates')
      .select('*')
      .eq('user_id', userId)
      .ilike('project_name', `%${projectName}%`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching estimate by project name:', error);
      return null;
    }

    // Return most recent match if multiple found
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error in getEstimateByProjectName:', error);
    return null;
  }
};

/**
 * Fetch all estimates linked to a project
 * @param {string} projectId - Project ID
 * @returns {Promise<array>} Array of estimates for this project
 */
export const fetchEstimatesByProjectId = async (projectId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('No user logged in');
      return [];
    }

    const { data, error } = await supabase
      .from('estimates')
      .select('id, client_name, project_name, status, total, created_at')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching estimates for project:', error);
      return [];
    }

    return data.map(est => ({
      id: est.id,
      clientName: est.client_name,
      projectName: est.project_name,
      status: est.status || 'draft',
      total: est.total || 0,
      createdAt: est.created_at
    }));
  } catch (error) {
    console.error('Error in fetchEstimatesByProjectId:', error);
    return [];
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

    const { data, error} = await supabase
      .from('invoices')
      .insert({
        user_id: userId,
        client_name: invoiceData.client || invoiceData.clientName,
        client_contact_person: invoiceData.clientContactPerson || invoiceData.client_contact_person,
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

    // Record invoice pricing to history for AI learning
    if (invoiceData.items && invoiceData.items.length > 0) {
      try {
        const { savePricingHistory } = require('../services/aiService');
        const { extractServiceType } = require('../services/pricingIntelligence');

        for (const item of invoiceData.items) {
          if (item.total > 0 || (item.quantity && item.pricePerUnit)) {
            await savePricingHistory({
              serviceType: extractServiceType(item.description),
              workDescription: item.description,
              quantity: item.quantity,
              unit: item.unit,
              pricePerUnit: item.pricePerUnit,
              totalAmount: item.total || (item.quantity * item.pricePerUnit),
              sourceType: 'invoice',
              sourceId: data.id,
              projectName: invoiceData.projectName,
              isCorrection: false,
            });
          }
        }
        console.log('📊 Recorded invoice pricing to history');
      } catch (pricingErr) {
        console.warn('Failed to record invoice pricing:', pricingErr);
      }
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
 * Fetch all contract documents for current user
 * @returns {Promise<Array>} Array of contract documents
 */
export const fetchContractDocuments = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('No user logged in');
      return [];
    }

    const { data, error } = await supabase
      .from('contract_documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching contract documents:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchContractDocuments:', error);
    return [];
  }
};

/**
 * Upload contract document from chat
 * @param {string} fileUri - File URI
 * @param {string} fileName - File name
 * @param {string} fileType - 'image' or 'document'
 * @returns {Promise<object|null>} Uploaded document data or null
 */
export const uploadContractDocument = async (fileUri, fileName, fileType) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    // Get file extension
    const fileExt = fileName ? fileName.split('.').pop() : 'jpg';
    const timestamp = Date.now();
    const filePath = `${userId}/${timestamp}.${fileExt}`;

    // Fetch the file
    const response = await fetch(fileUri);
    const blob = await response.blob();

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('contract-documents')
      .upload(filePath, blob, {
        contentType: fileType === 'image' ? 'image/jpeg' : 'application/pdf',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('contract-documents')
      .getPublicUrl(filePath);

    // Save document record to database
    const { data: docData, error: dbError } = await supabase
      .from('contract_documents')
      .insert({
        user_id: userId,
        file_name: fileName || `Contract ${timestamp}`,
        file_url: publicUrl,
        file_path: filePath,
        file_type: fileType,
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return docData;
  } catch (error) {
    console.error('Error uploading contract document:', error);
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

    // Calculate average progress across all tasks
    // Tasks without progress field default to: 100 if completed, 0 if not
    const totalProgress = tasks.reduce((sum, task) => {
      const taskProgress = task.progress !== undefined
        ? task.progress
        : (task.completed ? 100 : 0);
      return sum + taskProgress;
    }, 0);

    const percentage = Math.round(totalProgress / tasks.length);

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
export const saveDailyReport = async (workerId, projectId, phaseId, photos, completedStepIds, customTasks, notes, taskProgress = {}, isOwner = false, tags = []) => {
  try {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error('User not authenticated');

    // Use local date (not UTC) for report_date
    const today = new Date();
    const reportDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const reportData = {
      project_id: projectId,
      phase_id: phaseId || null,
      report_date: reportDateStr,
      photos: photos || [],
      completed_steps: completedStepIds || [],
      custom_tasks: customTasks || [],
      notes: notes || '',
      reporter_type: isOwner ? 'owner' : 'worker',
      tags: tags || [],
    };

    // Set worker_id or owner_id based on who is submitting
    if (isOwner) {
      reportData.owner_id = userId;
      reportData.worker_id = null;
    } else {
      reportData.worker_id = workerId;
      reportData.owner_id = null;
    }

    const { data, error } = await supabase
      .from('daily_reports')
      .insert(reportData)
      .select()
      .single();

    if (error) throw error;

    // Try to update tasks with their progress values (non-blocking)
    // This may fail due to RLS if worker doesn't have update permission on phases
    if (phaseId && Object.keys(taskProgress).length > 0) {
      try {
        for (const [taskId, progress] of Object.entries(taskProgress)) {
          if (progress > 0) {
            const updates = {
              progress: progress,
              completed: progress === 100,
              completed_by: progress === 100 ? workerId : undefined,
              completed_at: progress === 100 ? new Date().toISOString() : undefined,
              photo_url: photos[0] || null,
            };
            await updatePhaseTask(phaseId, taskId, updates);
          }
        }

        // Recalculate and update phase completion percentage based on task progress
        const newPhaseProgress = await calculatePhaseProgressFromTasks(phaseId);
        await updatePhaseProgress(phaseId, newPhaseProgress);
        console.log(`Phase progress updated to ${newPhaseProgress}%`);
      } catch (taskError) {
        // Log but don't fail - the daily report was saved successfully
        console.log('Note: Could not update phase tasks (may require contractor permission)');
      }
    }

    return data;
  } catch (error) {
    console.error('Error saving daily report:', error);
    return null;
  }
};

/**
 * Fetch a single daily report by ID
 * @param {string} reportId - Report ID
 * @returns {Promise<object|null>} Report object or null
 */
export const fetchDailyReportById = async (reportId) => {
  try {
    const { data, error } = await supabase
      .from('daily_reports')
      .select(`
        *,
        workers (id, full_name, trade),
        projects (id, name, location, status),
        project_phases (id, name, completion_percentage)
      `)
      .eq('id', reportId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching daily report by ID:', error);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from('daily_reports')
      .select(`
        *,
        workers (id, full_name, trade),
        projects!inner (id, name, user_id),
        project_phases (id, name)
      `)
      .eq('projects.user_id', user.id)
      .order('report_date', { ascending: false });

    // Only filter by project if projectId is provided
    if (projectId) {
      query = query.eq('project_id', projectId);
    }

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
 * Fetch all photos for a project grouped by phase
 * @param {string} projectId - Project ID
 * @returns {Promise<object>} Photos grouped by phase { phaseId: { phaseName, photos: [{url, date, reportId}] } }
 */
export const fetchProjectPhotosByPhase = async (projectId) => {
  try {
    const { data: reports, error } = await supabase
      .from('daily_reports')
      .select(`
        id,
        photos,
        report_date,
        phase_id,
        project_phases (id, name)
      `)
      .eq('project_id', projectId)
      .order('report_date', { ascending: false });

    if (error) throw error;

    // Group photos by phase
    const photosByPhase = {};
    let totalPhotos = 0;

    reports?.forEach(report => {
      // Skip reports with no photos
      if (!report.photos || report.photos.length === 0) return;

      const phaseId = report.phase_id || 'unassigned';
      const phaseName = report.project_phases?.name || 'General';

      if (!photosByPhase[phaseId]) {
        photosByPhase[phaseId] = {
          phaseName,
          photos: []
        };
      }

      report.photos.forEach(url => {
        photosByPhase[phaseId].photos.push({
          url,
          reportId: report.id,
          date: report.report_date
        });
        totalPhotos++;
      });
    });

    return { photosByPhase, totalPhotos };
  } catch (error) {
    console.error('Error fetching project photos:', error);
    return { photosByPhase: {}, totalPhotos: 0 };
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
// INTELLIGENT PHOTO AND REPORT RETRIEVAL
// ============================================================

/**
 * Fetch photos with intelligent filtering for AI-powered retrieval
 * @param {object} filters - Filter criteria
 * @param {string} filters.projectId - Filter by project ID
 * @param {string} filters.projectName - Filter by project name (fuzzy match)
 * @param {string} filters.workerId - Filter by worker ID
 * @param {string} filters.workerName - Filter by worker name (fuzzy match)
 * @param {string} filters.phaseId - Filter by phase ID
 * @param {string} filters.phaseName - Filter by phase name or work category (fuzzy match)
 * @param {string} filters.startDate - Start date (YYYY-MM-DD)
 * @param {string} filters.endDate - End date (YYYY-MM-DD)
 * @param {string[]} filters.tags - Array of work category tags
 * @param {number} filters.limit - Max number of photos to return (default 50)
 * @returns {Promise<Array>} Array of photo objects with metadata
 */
export const fetchPhotosWithFilters = async (filters = {}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from('daily_reports')
      .select(`
        id,
        photos,
        tags,
        report_date,
        notes,
        worker_id,
        project_id,
        phase_id,
        owner_id,
        reporter_type,
        workers (id, full_name, trade),
        projects!inner (id, name, user_id, location),
        project_phases (id, name)
      `)
      .eq('projects.user_id', user.id)
      .order('report_date', { ascending: false });

    // Apply project filter
    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }

    // Apply worker filter
    if (filters.workerId) {
      query = query.eq('worker_id', filters.workerId);
    }

    // Apply phase filter
    if (filters.phaseId) {
      query = query.eq('phase_id', filters.phaseId);
    }

    // Apply date filters
    if (filters.startDate) {
      query = query.gte('report_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('report_date', filters.endDate);
    }

    // Note: tags filter moved to post-processing (JSONB doesn't support overlaps operator)

    const { data: reports, error } = await query;

    if (error) throw error;

    // Post-process for fuzzy name matching and photo extraction
    let filteredReports = reports || [];

    // Fuzzy match project name if provided
    if (filters.projectName) {
      const searchTerm = filters.projectName.toLowerCase();
      filteredReports = filteredReports.filter(r =>
        r.projects?.name?.toLowerCase().includes(searchTerm)
      );
    }

    // Fuzzy match worker name if provided
    if (filters.workerName) {
      const searchTerm = filters.workerName.toLowerCase();
      filteredReports = filteredReports.filter(r =>
        r.workers?.full_name?.toLowerCase().includes(searchTerm)
      );
    }

    // Fuzzy match phase name if provided (also check tags)
    if (filters.phaseName) {
      const searchTerm = filters.phaseName.toLowerCase();
      filteredReports = filteredReports.filter(r => {
        const phaseMatch = r.project_phases?.name?.toLowerCase().includes(searchTerm);
        const tagMatch = r.tags?.some(tag => tag.toLowerCase().includes(searchTerm));
        return phaseMatch || tagMatch;
      });
    }

    // Fuzzy match tags if provided (supports partial matching like "rough" -> "rough-in")
    if (filters.tags) {
      // Normalize tags to array (AI might return string or array)
      const tagsArray = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
      if (tagsArray.length > 0) {
        const searchTags = tagsArray.map(t => t.toLowerCase());
        filteredReports = filteredReports.filter(r => {
          const reportTags = (r.tags || []).map(t => t.toLowerCase());
          // Check if any search tag matches any report tag (bidirectional partial match)
          return searchTags.some(searchTag =>
            reportTags.some(reportTag =>
              reportTag.includes(searchTag) || searchTag.includes(reportTag)
            )
          );
        });
      }
    }

    // Extract and format photos with metadata
    const photos = [];
    const limit = filters.limit || 50;

    for (const report of filteredReports) {
      if (!report.photos || report.photos.length === 0) continue;

      for (const photoUrl of report.photos) {
        if (photos.length >= limit) break;

        photos.push({
          url: photoUrl,
          reportId: report.id,
          reportDate: report.report_date,
          projectId: report.project_id,
          projectName: report.projects?.name || 'Unknown Project',
          projectLocation: report.projects?.location,
          phaseId: report.phase_id,
          phaseName: report.project_phases?.name || 'General',
          workerId: report.worker_id,
          workerName: report.workers?.full_name || (report.reporter_type === 'owner' ? 'Owner' : 'Unknown'),
          workerTrade: report.workers?.trade,
          tags: report.tags || [],
          notes: report.notes,
          uploadedBy: report.workers?.full_name || (report.reporter_type === 'owner' ? 'Owner' : 'Unknown'),
        });
      }

      if (photos.length >= limit) break;
    }

    return photos;
  } catch (error) {
    console.error('Error fetching photos with filters:', error);
    return [];
  }
};

/**
 * Fetch daily reports with intelligent filtering for AI-powered retrieval
 * @param {object} filters - Filter criteria (same as fetchPhotosWithFilters)
 * @returns {Promise<Array>} Array of daily report objects with metadata
 */
export const fetchDailyReportsWithFilters = async (filters = {}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from('daily_reports')
      .select(`
        *,
        workers (id, full_name, trade),
        projects!inner (id, name, user_id, location, status),
        project_phases (id, name, completion_percentage)
      `)
      .eq('projects.user_id', user.id)
      .order('report_date', { ascending: false });

    // Apply filters (same logic as fetchPhotosWithFilters)
    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
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
    // Note: tags filter moved to post-processing (JSONB doesn't support overlaps operator)

    // Apply limit
    const limit = filters.limit || 20;
    query = query.limit(limit);

    const { data: reports, error } = await query;

    if (error) throw error;

    // Post-process for fuzzy name matching
    let filteredReports = reports || [];

    if (filters.projectName) {
      const searchTerm = filters.projectName.toLowerCase();
      filteredReports = filteredReports.filter(r =>
        r.projects?.name?.toLowerCase().includes(searchTerm)
      );
    }

    if (filters.workerName) {
      const searchTerm = filters.workerName.toLowerCase();
      filteredReports = filteredReports.filter(r =>
        r.workers?.full_name?.toLowerCase().includes(searchTerm)
      );
    }

    if (filters.phaseName) {
      const searchTerm = filters.phaseName.toLowerCase();
      filteredReports = filteredReports.filter(r => {
        const phaseMatch = r.project_phases?.name?.toLowerCase().includes(searchTerm);
        const tagMatch = r.tags?.some(tag => tag.toLowerCase().includes(searchTerm));
        return phaseMatch || tagMatch;
      });
    }

    // Fuzzy match tags if provided (supports partial matching like "rough" -> "rough-in")
    if (filters.tags) {
      // Normalize tags to array (AI might return string or array)
      const tagsArray = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
      if (tagsArray.length > 0) {
        const searchTags = tagsArray.map(t => t.toLowerCase());
        filteredReports = filteredReports.filter(r => {
          const reportTags = (r.tags || []).map(t => t.toLowerCase());
          // Check if any search tag matches any report tag (bidirectional partial match)
          return searchTags.some(searchTag =>
            reportTags.some(reportTag =>
              reportTag.includes(searchTag) || searchTag.includes(reportTag)
            )
          );
        });
      }
    }

    // Format reports for display
    return filteredReports.map(report => ({
      id: report.id,
      reportDate: report.report_date,
      projectId: report.project_id,
      projectName: report.projects?.name || 'Unknown Project',
      projectLocation: report.projects?.location,
      projectStatus: report.projects?.status,
      phaseId: report.phase_id,
      phaseName: report.project_phases?.name || 'General',
      phaseProgress: report.project_phases?.completion_percentage || 0,
      workerId: report.worker_id,
      workerName: report.workers?.full_name || (report.reporter_type === 'owner' ? 'Owner' : 'Unknown'),
      workerTrade: report.workers?.trade,
      reporterType: report.reporter_type,
      photos: report.photos || [],
      photoCount: (report.photos || []).length,
      notes: report.notes,
      completedSteps: report.completed_steps || [],
      customTasks: report.custom_tasks || [],
      taskProgress: report.task_progress || {},
      tags: report.tags || [],
      createdAt: report.created_at,
    }));
  } catch (error) {
    console.error('Error fetching daily reports with filters:', error);
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
 * Get average worker rate across all active workers
 * Used for estimating labor costs on estimates
 * @returns {Promise<object>} { daily, hourly, count }
 */
export const getAverageWorkerRate = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { daily: 0, hourly: 0, count: 0 };

    const { data: workers, error } = await supabase
      .from('workers')
      .select('hourly_rate, daily_rate, payment_type')
      .eq('owner_id', userId)
      .eq('status', 'active');

    if (error || !workers || workers.length === 0) {
      return { daily: 0, hourly: 0, count: 0 };
    }

    // Calculate averages
    const avgHourly = workers.reduce((sum, w) => sum + (parseFloat(w.hourly_rate) || 0), 0) / workers.length;
    // For daily rate: use daily_rate if set, otherwise estimate from hourly (8 hour day)
    const avgDaily = workers.reduce((sum, w) => {
      const daily = parseFloat(w.daily_rate) || 0;
      const hourly = parseFloat(w.hourly_rate) || 0;
      return sum + (daily > 0 ? daily : hourly * 8);
    }, 0) / workers.length;

    return {
      daily: Math.round(avgDaily * 100) / 100,
      hourly: Math.round(avgHourly * 100) / 100,
      count: workers.length
    };
  } catch (error) {
    console.error('Error in getAverageWorkerRate:', error);
    return { daily: 0, hourly: 0, count: 0 };
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

    // Get phase assignments (gracefully handle if table doesn't exist)
    let phaseData = null;
    const { data: phaseResult, error: phaseError } = await supabase
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
            name
          )
        )
      `)
      .eq('worker_id', workerId);

    if (phaseError) {
      // Only log error if it's not a "table not found" error
      if (phaseError.code !== 'PGRST205' && phaseError.code !== '42P01') {
        console.error('Error fetching phase assignments:', phaseError);
      }
      // If table doesn't exist, just use empty array
      phaseData = [];
    } else {
      phaseData = phaseResult;
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
 * Clock out a worker and automatically calculate/record labor costs
 * @param {string} timeTrackingId - Time tracking record ID
 * @param {string} notes - Optional notes
 * @returns {Promise<{success: boolean, laborCost?: number, hours?: number}>} Result with labor cost details
 */
export const clockOut = async (timeTrackingId, notes = null) => {
  try {
    const clockOutTime = new Date().toISOString();

    // First, get the time tracking entry with worker and project info
    const { data: timeEntry, error: fetchError } = await supabase
      .from('time_tracking')
      .select(`
        *,
        workers!inner (
          id,
          full_name,
          payment_type,
          hourly_rate,
          daily_rate,
          weekly_salary,
          project_rate
        ),
        projects!inner (
          id,
          name
        )
      `)
      .eq('id', timeTrackingId)
      .single();

    if (fetchError || !timeEntry) {
      console.error('Error fetching time entry:', fetchError);
      return { success: false };
    }

    // Update clock out time
    const { error: updateError } = await supabase
      .from('time_tracking')
      .update({
        clock_out: clockOutTime,
        notes: notes,
      })
      .eq('id', timeTrackingId);

    if (updateError) {
      console.error('Error clocking out:', updateError);
      return { success: false };
    }

    // Calculate hours worked
    const clockInTime = new Date(timeEntry.clock_in);
    const clockOutDate = new Date(clockOutTime);
    const hoursWorked = (clockOutDate - clockInTime) / (1000 * 60 * 60);

    // Calculate labor cost based on payment type
    const worker = timeEntry.workers;
    let laborCost = 0;
    let costDescription = '';

    switch (worker.payment_type) {
      case 'hourly':
        laborCost = hoursWorked * (worker.hourly_rate || 0);
        costDescription = `${worker.full_name} - ${hoursWorked.toFixed(2)} hours @ $${worker.hourly_rate}/hr`;
        break;

      case 'daily':
        // Half-day rule: < 5 hours = half day, >= 5 hours = full day
        if (hoursWorked < 5) {
          laborCost = (worker.daily_rate || 0) * 0.5;
          costDescription = `${worker.full_name} - Half day (${hoursWorked.toFixed(2)} hours) @ $${worker.daily_rate}/day`;
        } else {
          laborCost = worker.daily_rate || 0;
          costDescription = `${worker.full_name} - Full day (${hoursWorked.toFixed(2)} hours) @ $${worker.daily_rate}/day`;
        }
        break;

      case 'weekly':
      case 'project_based':
        // No automatic expense for weekly/project-based workers
        console.log(`Worker ${worker.full_name} is ${worker.payment_type} - no automatic expense created`);
        return { success: true, hours: hoursWorked, laborCost: 0 };

      default:
        console.warn(`Unknown payment type: ${worker.payment_type}`);
        return { success: true, hours: hoursWorked, laborCost: 0 };
    }

    // Create labor cost transaction
    if (laborCost > 0) {
      const { error: transactionError } = await supabase
        .from('project_transactions')
        .insert({
          project_id: timeEntry.project_id,
          type: 'expense',
          category: 'labor',
          description: costDescription,
          amount: laborCost,
          date: new Date().toISOString().split('T')[0],
          worker_id: worker.id,
          time_tracking_id: timeTrackingId,
          is_auto_generated: true,
          notes: notes
        });

      if (transactionError) {
        console.error('Error creating labor cost transaction:', transactionError);
        // Still return success for clock out even if transaction fails
        return { success: true, hours: hoursWorked, laborCost: 0 };
      }
    }

    return { success: true, hours: hoursWorked, laborCost };
  } catch (error) {
    console.error('Error in clockOut:', error);
    return { success: false };
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
 * Get all workers currently clocked in TODAY
 * @returns {Promise<array>} Array of today's active clock-ins with worker and project info
 */
export const getClockedInWorkersToday = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data, error } = await supabase
      .from('time_tracking')
      .select(`
        id,
        worker_id,
        project_id,
        clock_in,
        clock_out,
        workers:worker_id (
          id,
          full_name,
          trade,
          payment_type,
          daily_rate,
          hourly_rate
        ),
        projects:project_id (
          id,
          name
        )
      `)
      .gte('clock_in', today.toISOString())
      .lt('clock_in', tomorrow.toISOString())
      .is('clock_out', null)
      .order('clock_in', { ascending: false });

    if (error) {
      console.error('Error fetching clocked-in workers today:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getClockedInWorkersToday:', error);
    return [];
  }
};

/**
 * Get stale clock-ins (workers who clocked in before today but never clocked out)
 * @returns {Promise<array>} Array of stale clock-in records
 */
export const getStaleClockIns = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('time_tracking')
      .select(`
        id,
        worker_id,
        project_id,
        clock_in,
        workers:worker_id (
          id,
          full_name
        ),
        projects:project_id (
          id,
          name
        )
      `)
      .lt('clock_in', today.toISOString())
      .is('clock_out', null)
      .order('clock_in', { ascending: false });

    if (error) {
      console.error('Error fetching stale clock-ins:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getStaleClockIns:', error);
    return [];
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
          location
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

        // Only group under project if currently active (clocked in)
        if (isActive) {
          const workerWithClockIn = {
            ...worker,
            latestClockIn,
            isActive,
            clockInTime: latestClockIn.clock_in,
            hoursWorked: (new Date() - new Date(latestClockIn.clock_in)) / (1000 * 60 * 60)
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
        } else {
          // Worker clocked in today but is now clocked out - add to unassigned
          unassignedWorkers.push(worker);
        }
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
// WORKER PAYMENT CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate payment for a worker based on their payment type for a given period
 * @param {string} workerId - Worker ID
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Promise<object>} Payment breakdown with project details
 */
export const calculateWorkerPaymentForPeriod = async (workerId, fromDate, toDate) => {
  try {
    // Get worker info (for payment type and rates)
    const { data: worker, error: workerError } = await supabase
      .from('workers')
      .select('*')
      .eq('id', workerId)
      .single();

    if (workerError || !worker) {
      console.error('Error fetching worker:', workerError);
      return null;
    }

    // Get all time entries for the period
    const { data: timeEntries, error: timeError } = await supabase
      .from('time_tracking')
      .select(`
        *,
        projects (id, name)
      `)
      .eq('worker_id', workerId)
      .not('clock_out', 'is', null)
      .gte('clock_in', `${fromDate}T00:00:00`)
      .lte('clock_in', `${toDate}T23:59:59`)
      .order('clock_in', { ascending: true });

    if (timeError) {
      console.error('Error fetching time entries:', timeError);
      return null;
    }

    if (!timeEntries || timeEntries.length === 0) {
      return {
        workerId: worker.id,
        workerName: worker.full_name || worker.name || 'Unknown Worker',
        totalAmount: 0,
        totalHours: 0,
        totalDays: 0,
        dateRange: { from: fromDate, to: toDate },
        paymentType: worker.payment_type,
        byProject: [],
        byDate: []
      };
    }

    // Calculate hours for each entry
    const entriesWithHours = timeEntries.map(entry => {
      const clockIn = new Date(entry.clock_in);
      const clockOut = new Date(entry.clock_out);
      const hours = (clockOut - clockIn) / (1000 * 60 * 60);
      const date = clockIn.toISOString().split('T')[0];

      return {
        ...entry,
        hours,
        date
      };
    });

    // Calculate payment based on payment type
    let paymentBreakdown;

    switch (worker.payment_type) {
      case 'hourly':
        paymentBreakdown = calculateHourlyPayment(entriesWithHours, worker.hourly_rate);
        break;
      case 'daily':
        paymentBreakdown = calculateDailyPayment(entriesWithHours, worker.daily_rate);
        break;
      case 'weekly':
        paymentBreakdown = calculateWeeklyPayment(entriesWithHours, worker.weekly_salary, fromDate, toDate);
        break;
      case 'project_based':
        paymentBreakdown = calculateProjectBasedPayment(entriesWithHours, worker.project_rate);
        break;
      default:
        paymentBreakdown = { totalAmount: 0, byProject: [], byDate: [] };
    }

    return {
      ...paymentBreakdown,
      workerId: worker.id,
      workerName: worker.full_name || worker.name || 'Unknown Worker',
      totalHours: entriesWithHours.reduce((sum, e) => sum + e.hours, 0),
      dateRange: { from: fromDate, to: toDate },
      paymentType: worker.payment_type,
      rate: {
        hourly: worker.hourly_rate,
        daily: worker.daily_rate,
        weekly: worker.weekly_salary,
        project: worker.project_rate
      }
    };
  } catch (error) {
    console.error('Error calculating worker payment:', error);
    return null;
  }
};

/**
 * Calculate hourly payment
 */
function calculateHourlyPayment(entries, hourlyRate) {
  const byProject = {};
  const byDate = {};

  entries.forEach(entry => {
    const amount = entry.hours * (hourlyRate || 0);
    const projectId = entry.project_id;
    const projectName = entry.projects?.name || 'Unknown Project';
    const date = entry.date;

    // By project
    if (!byProject[projectId]) {
      byProject[projectId] = {
        projectId,
        projectName,
        hours: 0,
        amount: 0,
        sessions: []
      };
    }
    byProject[projectId].hours += entry.hours;
    byProject[projectId].amount += amount;
    byProject[projectId].sessions.push({ ...entry, amount });

    // By date
    if (!byDate[date]) {
      byDate[date] = {
        date,
        hours: 0,
        amount: 0,
        projects: []
      };
    }
    byDate[date].hours += entry.hours;
    byDate[date].amount += amount;
    byDate[date].projects.push({ projectName, hours: entry.hours, amount });
  });

  const totalAmount = Object.values(byProject).reduce((sum, p) => sum + p.amount, 0);

  return {
    totalAmount,
    totalDays: Object.keys(byDate).length,
    byProject: Object.values(byProject),
    byDate: Object.values(byDate)
  };
}

/**
 * Calculate daily payment with half-day logic
 */
function calculateDailyPayment(entries, dailyRate) {
  const byProject = {};
  const byDate = {};

  // Group entries by date
  const entriesByDate = entries.reduce((acc, entry) => {
    if (!acc[entry.date]) {
      acc[entry.date] = [];
    }
    acc[entry.date].push(entry);
    return acc;
  }, {});

  // Calculate payment per day
  Object.entries(entriesByDate).forEach(([date, dayEntries]) => {
    const totalHoursForDay = dayEntries.reduce((sum, e) => sum + e.hours, 0);

    // Determine if full day or half day
    let dayAmount;
    let dayType;
    if (totalHoursForDay >= 5) {
      dayAmount = dailyRate || 0;
      dayType = 'full';
    } else {
      dayAmount = (dailyRate || 0) * 0.5;
      dayType = 'half';
    }

    // Split payment proportionally across projects if multiple projects in one day
    dayEntries.forEach(entry => {
      const projectId = entry.project_id;
      const projectName = entry.projects?.name || 'Unknown Project';
      const proportion = entry.hours / totalHoursForDay;
      const amount = dayAmount * proportion;

      // By project
      if (!byProject[projectId]) {
        byProject[projectId] = {
          projectId,
          projectName,
          days: 0,
          hours: 0,
          amount: 0,
          sessions: []
        };
      }
      byProject[projectId].hours += entry.hours;
      byProject[projectId].amount += amount;
      byProject[projectId].sessions.push({ ...entry, amount, dayType });
    });

    // By date
    byDate[date] = {
      date,
      hours: totalHoursForDay,
      dayType,
      amount: dayAmount,
      projects: dayEntries.map(e => ({
        projectName: e.projects?.name || 'Unknown Project',
        hours: e.hours,
        amount: dayAmount * (e.hours / totalHoursForDay)
      }))
    };
  });

  // Calculate days worked per project
  Object.values(byProject).forEach(project => {
    const uniqueDates = [...new Set(project.sessions.map(s => s.date))];
    project.days = uniqueDates.length;
  });

  const totalAmount = Object.values(byProject).reduce((sum, p) => sum + p.amount, 0);

  return {
    totalAmount,
    totalDays: Object.keys(byDate).length,
    byProject: Object.values(byProject),
    byDate: Object.values(byDate)
  };
}

/**
 * Calculate weekly payment (fixed salary)
 */
function calculateWeeklyPayment(entries, weeklySalary, fromDate, toDate) {
  // Count number of weeks in period
  const start = new Date(fromDate);
  const end = new Date(toDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const weeksWorked = Math.ceil(diffDays / 7);

  const totalAmount = (weeklySalary || 0) * weeksWorked;

  // Still group by project for display
  const byProject = {};
  entries.forEach(entry => {
    const projectId = entry.project_id;
    const projectName = entry.projects?.name || 'Unknown Project';

    if (!byProject[projectId]) {
      byProject[projectId] = {
        projectId,
        projectName,
        hours: 0,
        sessions: []
      };
    }
    byProject[projectId].hours += entry.hours;
    byProject[projectId].sessions.push(entry);
  });

  return {
    totalAmount,
    totalDays: [...new Set(entries.map(e => e.date))].length,
    weeksWorked,
    byProject: Object.values(byProject),
    byDate: []
  };
}

/**
 * Calculate project-based payment
 */
function calculateProjectBasedPayment(entries, projectRate) {
  // For project-based, we don't auto-calculate
  // Just show hours worked per project
  const byProject = {};

  entries.forEach(entry => {
    const projectId = entry.project_id;
    const projectName = entry.projects?.name || 'Unknown Project';

    if (!byProject[projectId]) {
      byProject[projectId] = {
        projectId,
        projectName,
        hours: 0,
        sessions: []
      };
    }
    byProject[projectId].hours += entry.hours;
    byProject[projectId].sessions.push(entry);
  });

  return {
    totalAmount: 0, // Not calculated for project-based
    totalDays: [...new Set(entries.map(e => e.date))].length,
    byProject: Object.values(byProject),
    byDate: [],
    note: 'Project-based workers are paid per completed project milestone'
  };
}

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
    // Get pending worker invites
    const { data: workers, error: workersError } = await supabase
      .from('workers')
      .select('*')
      .eq('email', workerEmail)
      .eq('status', 'pending')
      .is('user_id', null);

    if (workersError) {
      console.error('Error getting pending invites:', workersError);
      return [];
    }

    if (!workers || workers.length === 0) {
      return [];
    }

    // Get owner info for each invite
    const invitesWithOwners = await Promise.all(
      workers.map(async (worker) => {
        const { data: owner, error: ownerError } = await supabase
          .from('profiles')
          .select('id, business_name')
          .eq('id', worker.owner_id)
          .single();

        return {
          ...worker,
          owner: owner ? {
            id: owner.id,
            full_name: owner.business_name || 'Business Owner',
            company_name: owner.business_name
          } : null
        };
      })
    );

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
    console.log('acceptInvite - Attempting to accept invite:', { workerId, userId });

    // Use the database function that handles duplicate resolution
    const { data, error } = await supabase.rpc('accept_worker_invite', {
      p_worker_id: workerId,
      p_user_id: userId
    });

    if (error) {
      console.error('Error accepting invite:', error);
      return false;
    }

    console.log('acceptInvite - Result:', data);

    if (!data || !data.success) {
      console.error('acceptInvite - Failed:', data?.error || 'Unknown error');
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

// ==========================================
// SUBCONTRACTOR QUOTES FUNCTIONS (GC Feature)
// ==========================================

/**
 * Save a new subcontractor quote
 * @param {object} quoteData - Quote data object
 * @param {string} quoteData.tradeId - Trade ID (e.g., 'drywall', 'electrical')
 * @param {string} quoteData.subcontractorName - Name of the subcontractor
 * @param {string} quoteData.contactPhone - Phone number (optional)
 * @param {string} quoteData.contactEmail - Email (optional)
 * @param {boolean} quoteData.isPreferred - Mark as preferred vendor
 * @param {string} quoteData.documentUrl - URL to uploaded document (optional)
 * @param {Array} quoteData.services - Array of service pricing items
 * @param {string} quoteData.notes - Additional notes (optional)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export const saveSubcontractorQuote = async (quoteData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'No user logged in' };
    }

    const { data, error } = await supabase
      .from('subcontractor_quotes')
      .insert({
        user_id: userId,
        trade_id: quoteData.tradeId,
        subcontractor_name: quoteData.subcontractorName,
        contact_phone: quoteData.contactPhone || null,
        contact_email: quoteData.contactEmail || null,
        is_preferred: quoteData.isPreferred || false,
        document_url: quoteData.documentUrl || null,
        services: quoteData.services || [],
        notes: quoteData.notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving subcontractor quote:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Subcontractor quote saved:', data.id);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('Error in saveSubcontractorQuote:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get all subcontractor quotes for the current user
 * @returns {Promise<Array>} Array of quote objects
 */
export const getAllSubcontractorQuotes = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('No user logged in');
      return [];
    }

    const { data, error } = await supabase
      .from('subcontractor_quotes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching subcontractor quotes:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAllSubcontractorQuotes:', error);
    return [];
  }
};

/**
 * Get subcontractor quotes for a specific trade
 * @param {string} tradeId - Trade ID (e.g., 'drywall', 'electrical')
 * @returns {Promise<Array>} Array of quote objects for the specified trade
 */
export const getSubcontractorQuotesByTrade = async (tradeId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('No user logged in');
      return [];
    }

    const { data, error } = await supabase
      .from('subcontractor_quotes')
      .select('*')
      .eq('user_id', userId)
      .eq('trade_id', tradeId)
      .order('is_preferred', { ascending: false }) // Preferred quotes first
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching subcontractor quotes by trade:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getSubcontractorQuotesByTrade:', error);
    return [];
  }
};

/**
 * Get all subcontractor quotes organized by trade
 * @returns {Promise<object>} Object with trade IDs as keys and arrays of quotes as values
 */
export const getSubcontractorQuotesGroupedByTrade = async () => {
  try {
    const quotes = await getAllSubcontractorQuotes();

    const grouped = {};
    quotes.forEach(quote => {
      if (!grouped[quote.trade_id]) {
        grouped[quote.trade_id] = [];
      }
      grouped[quote.trade_id].push(quote);
    });

    return grouped;
  } catch (error) {
    console.error('Error in getSubcontractorQuotesGroupedByTrade:', error);
    return {};
  }
};

/**
 * Update a subcontractor quote
 * @param {string} quoteId - Quote ID to update
 * @param {object} updates - Fields to update
 * @returns {Promise<boolean>} Success status
 */
export const updateSubcontractorQuote = async (quoteId, updates) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return false;
    }

    const { error } = await supabase
      .from('subcontractor_quotes')
      .update(updates)
      .eq('id', quoteId)
      .eq('user_id', userId); // Ensure user owns this quote

    if (error) {
      console.error('Error updating subcontractor quote:', error);
      return false;
    }

    console.log('✅ Subcontractor quote updated:', quoteId);
    return true;
  } catch (error) {
    console.error('Error in updateSubcontractorQuote:', error);
    return false;
  }
};

/**
 * Toggle the preferred status of a subcontractor quote
 * If setting to preferred, optionally unset other preferred quotes for the same trade
 * @param {string} quoteId - Quote ID to toggle
 * @param {boolean} makePreferred - New preferred status
 * @param {boolean} unsetOthers - If true, unset other preferred quotes for the same trade
 * @returns {Promise<boolean>} Success status
 */
export const togglePreferredStatus = async (quoteId, makePreferred, unsetOthers = true) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return false;
    }

    // If making this quote preferred and unsetOthers is true, first get the trade ID
    if (makePreferred && unsetOthers) {
      const { data: quote } = await supabase
        .from('subcontractor_quotes')
        .select('trade_id')
        .eq('id', quoteId)
        .eq('user_id', userId)
        .single();

      if (quote) {
        // Unset all other preferred quotes for this trade
        await supabase
          .from('subcontractor_quotes')
          .update({ is_preferred: false })
          .eq('user_id', userId)
          .eq('trade_id', quote.trade_id)
          .eq('is_preferred', true)
          .neq('id', quoteId);
      }
    }

    // Now update this quote
    const { error } = await supabase
      .from('subcontractor_quotes')
      .update({ is_preferred: makePreferred })
      .eq('id', quoteId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error toggling preferred status:', error);
      return false;
    }

    console.log(`✅ Quote ${quoteId} preferred status set to:`, makePreferred);
    return true;
  } catch (error) {
    console.error('Error in togglePreferredStatus:', error);
    return false;
  }
};

/**
 * Delete a subcontractor quote
 * @param {string} quoteId - Quote ID to delete
 * @returns {Promise<boolean>} Success status
 */
export const deleteSubcontractorQuote = async (quoteId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return false;
    }

    const { error } = await supabase
      .from('subcontractor_quotes')
      .delete()
      .eq('id', quoteId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting subcontractor quote:', error);
      return false;
    }

    console.log('✅ Subcontractor quote deleted:', quoteId);
    return true;
  } catch (error) {
    console.error('Error in deleteSubcontractorQuote:', error);
    return false;
  }
};

/**
 * Get the preferred subcontractor quote for a specific trade
 * @param {string} tradeId - Trade ID
 * @returns {Promise<object|null>} Preferred quote object or null
 */
export const getPreferredQuoteForTrade = async (tradeId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return null;
    }

    const { data, error } = await supabase
      .from('subcontractor_quotes')
      .select('*')
      .eq('user_id', userId)
      .eq('trade_id', tradeId)
      .eq('is_preferred', true)
      .single();

    if (error) {
      // No preferred quote found is not an error
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error fetching preferred quote:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getPreferredQuoteForTrade:', error);
    return null;
  }
};

/**
 * Add an estimate to an existing project with intelligent merge options
 * @param {string} projectId - The project ID
 * @param {string} estimateId - The estimate ID
 * @param {string} mergeMode - 'merge' or 'separate'
 * @returns {Promise<object|null>} Updated project or null
 */
export const addEstimateToProject = async (projectId, estimateId, mergeMode = 'separate') => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    // Fetch the project
    const project = await getProject(projectId);
    if (!project) {
      console.error('Project not found:', projectId);
      return null;
    }

    // Fetch the estimate
    const estimate = await getEstimate(estimateId);
    if (!estimate) {
      console.error('Estimate not found:', estimateId);
      return null;
    }

    console.log(`📎 Adding estimate "${estimate.estimate_number}" to project "${project.name}" (mode: ${mergeMode})`);

    if (mergeMode === 'merge') {
      // **MERGE MODE**: Combine estimate tasks and budgets into existing phases
      return await mergeEstimateIntoProject(project, estimate, userId);
    } else {
      // **SEPARATE MODE**: Add estimate as separate scope within project
      return await addEstimateAsSeparateScope(project, estimate, userId);
    }
  } catch (error) {
    console.error('Error adding estimate to project:', error);
    return null;
  }
};

/**
 * Merge estimate into existing project phases (combine work)
 */
const mergeEstimateIntoProject = async (project, estimate, userId) => {
  // Get existing project phases
  const existingPhases = await getProjectPhases(project.id);

  // Get estimate phases
  const estimatePhases = await getEstimatePhases(estimate.id);

  // Intelligently match and merge phases by name
  const mergedPhases = {};

  // Start with existing phases
  existingPhases.forEach(phase => {
    mergedPhases[phase.name] = {
      ...phase,
      tasks: [...phase.tasks], // Clone tasks
      budget: phase.budget
    };
  });

  // Add estimate phase tasks and budgets to matching phases
  estimatePhases.forEach(estimatePhase => {
    const phaseName = estimatePhase.name;

    if (mergedPhases[phaseName]) {
      // Phase exists - merge tasks and add budget
      const existingPhase = mergedPhases[phaseName];

      // Add estimate tasks to existing phase (avoid duplicates by description)
      estimatePhase.tasks.forEach(newTask => {
        const isDuplicate = existingPhase.tasks.some(
          existingTask => existingTask.description.toLowerCase() === newTask.description.toLowerCase()
        );

        if (!isDuplicate) {
          existingPhase.tasks.push({
            ...newTask,
            order: existingPhase.tasks.length + 1 // Append at end
          });
        }
      });

      // Add estimate budget to existing phase budget
      existingPhase.budget = (existingPhase.budget || 0) + (estimatePhase.budget || 0);

    } else {
      // Phase doesn't exist - add it
      mergedPhases[phaseName] = {
        ...estimatePhase,
        tasks: [...estimatePhase.tasks]
      };
    }
  });

  // Convert merged phases back to array
  const finalPhases = Object.values(mergedPhases);

  // Save updated phases
  await saveProjectPhases(project.id, finalPhases, project.schedule);

  // Update project budget (base_contract + this estimate)
  const estimateTotal = estimate.subtotal || estimate.total || 0;
  const newBaseContract = (project.baseContract || project.budget || 0) + estimateTotal;

  const { error } = await supabase
    .from('projects')
    .update({
      base_contract: newBaseContract,
      budget: newBaseContract
    })
    .eq('id', project.id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating project budget:', error);
    throw error;
  }

  console.log('✅ Estimate merged into project successfully');

  // Return updated project
  return await getProject(project.id);
};

/**
 * Add estimate as separate scope within project (track independently)
 */
const addEstimateAsSeparateScope = async (project, estimate, userId) => {
  // Get existing project phases
  const existingPhases = await getProjectPhases(project.id);

  // Get estimate phases
  const estimatePhases = await getEstimatePhases(estimate.id);

  // Create scope identifier for estimate phases
  const scopeId = `estimate-${estimate.id}`;
  const scopeName = estimate.project_name || `Estimate ${estimate.estimate_number}`;

  // Add scopeId to estimate phases
  const newScopePhases = estimatePhases.map(phase => ({
    ...phase,
    scope_id: scopeId,
    scope_name: scopeName
  }));

  // Combine existing phases with new scope phases
  const allPhases = [...existingPhases, ...newScopePhases];

  // Save all phases
  await saveProjectPhases(project.id, allPhases, project.schedule);

  // Add estimate to project's extras array (to track additional scopes)
  const currentExtras = project.extras || [];
  const newExtra = {
    id: scopeId,
    name: scopeName,
    amount: estimate.subtotal || estimate.total || 0,
    estimateId: estimate.id,
    addedAt: new Date().toISOString()
  };

  const updatedExtras = [...currentExtras, newExtra];

  const { error } = await supabase
    .from('projects')
    .update({
      extras: updatedExtras
    })
    .eq('id', project.id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating project extras:', error);
    throw error;
  }

  console.log('✅ Estimate added as separate scope successfully');

  // Return updated project
  return await getProject(project.id);
};

// ========================================
// PROJECT TRANSACTIONS (Itemized Expense & Income Tracking)
// ========================================

/**
 * Add a new transaction (expense or income) to a project
 */
export const addProjectTransaction = async (transaction) => {
  try {
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from('project_transactions')
      .insert({
        project_id: transaction.project_id,
        type: transaction.type, // 'expense' or 'income'
        category: transaction.category, // 'labor', 'materials', 'equipment', 'permits', 'other'
        description: transaction.description,
        amount: transaction.amount,
        date: transaction.date || new Date().toISOString().split('T')[0],
        worker_id: transaction.worker_id || null,
        payment_method: transaction.payment_method || null,
        notes: transaction.notes || null,
        is_auto_generated: false,
        created_by: userId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding transaction:', error);
    throw error;
  }
};

/**
 * Get all transactions for a project, optionally filtered by type
 */
export const getProjectTransactions = async (projectId, type = null) => {
  try {
    let query = supabase
      .from('project_transactions')
      .select(`
        *,
        workers (id, full_name)
      `)
      .eq('project_id', projectId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
};

/**
 * Update an existing transaction
 */
export const updateTransaction = async (transactionId, updates) => {
  try {
    const { data, error } = await supabase
      .from('project_transactions')
      .update({
        type: updates.type,
        category: updates.category,
        description: updates.description,
        amount: updates.amount,
        date: updates.date,
        payment_method: updates.payment_method,
        notes: updates.notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', transactionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating transaction:', error);
    throw error;
  }
};

/**
 * Delete a transaction
 */
export const deleteTransaction = async (transactionId) => {
  try {
    const { error } = await supabase
      .from('project_transactions')
      .delete()
      .eq('id', transactionId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting transaction:', error);
    throw error;
  }
};

/**
 * Get transaction summary for a project (totals by category)
 */
export const getProjectTransactionSummary = async (projectId) => {
  try {
    const transactions = await getProjectTransactions(projectId);

    const summary = {
      totalExpenses: 0,
      totalIncome: 0,
      expensesByCategory: {},
      transactionCount: transactions.length,
      latestTransaction: transactions[0] || null
    };

    transactions.forEach(t => {
      if (t.type === 'expense') {
        summary.totalExpenses += parseFloat(t.amount);
        if (t.category) {
          summary.expensesByCategory[t.category] =
            (summary.expensesByCategory[t.category] || 0) + parseFloat(t.amount);
        }
      } else if (t.type === 'income') {
        summary.totalIncome += parseFloat(t.amount);
      }
    });

    return summary;
  } catch (error) {
    console.error('Error getting transaction summary:', error);
    throw error;
  }
};

// ========================================
// ESTIMATE TO PROJECT CONVERSION
// ========================================

/**
 * Create a new project from an accepted estimate
 * @param {string} estimateId - The estimate ID to convert
 * @returns {Promise<object|null>} Created project or null
 */
export const createProjectFromEstimate = async (estimateId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    // Fetch the estimate with all data
    const estimate = await getEstimate(estimateId);
    if (!estimate) {
      console.error('Estimate not found');
      return null;
    }

    // Transform estimate data to project format
    const projectData = {
      name: estimate.project_name || estimate.client_name || 'Unnamed Project',
      client: estimate.client_name,
      client_phone: estimate.client_phone,
      client_email: estimate.client_email,
      location: estimate.client_address,
      base_contract: estimate.total || 0,
      contract_amount: estimate.total || 0,
      income_collected: 0,
      expenses: 0,
      phases: estimate.phases || [],
      schedule: estimate.schedule || {},
      scope: estimate.scope || {},
      lineItems: estimate.items || [],
      status: 'active',
      taskDescription: estimate.scope?.description || '',
      estimate_id: estimate.id,
    };

    // Create the project
    const createdProject = await saveProject(projectData);

    if (!createdProject) {
      console.error('Failed to create project from estimate');
      return null;
    }

    // Update estimate status to 'accepted' and link to project
    const { error: updateError } = await supabase
      .from('estimates')
      .update({
        status: 'accepted',
        accepted_date: new Date().toISOString(),
        project_id: createdProject.id,
      })
      .eq('id', estimateId);

    if (updateError) {
      console.error('Error updating estimate status:', updateError);
      // Don't fail the whole operation, project was created successfully
    }

    console.log('✅ Project created from estimate successfully:', createdProject.id);
    return createdProject;
  } catch (error) {
    console.error('Error creating project from estimate:', error);
    return null;
  }
};

// ============================================================================
// SCHEDULE EVENTS FUNCTIONS (Personal Calendar)
// ============================================================================

/**
 * Upload photo to Supabase Storage
 * @param {string} uri - Local file URI
 * @param {string} folder - Folder path in storage (e.g., 'daily-reports', 'projects')
 * @returns {Promise<string|null>} - Public URL of uploaded photo or null
 */
export const uploadPhoto = async (uri, folder = 'daily-reports') => {
  try {
    // Get current user ID for secure folder path
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user for photo upload');
      return null;
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const extension = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = `${timestamp}-${random}.${extension}`;
    // Path: folder/userId/filename (e.g., daily-reports/abc123/1234-xyz.jpg)
    const filePath = `${folder}/${user.id}/${filename}`;

    // For React Native, read the file as arrayBuffer
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, uint8Array, {
        contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
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

/**
 * Create a new schedule event
 * @param {object} eventData - Event details
 * @returns {Promise<object|null>} - Created event or null
 */
export const createScheduleEvent = async (eventData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ No authenticated user');
      return null;
    }

    // Helper: Convert local datetime string to UTC if needed
    const ensureUTC = (datetimeStr) => {
      if (!datetimeStr) return null;

      // If already has Z suffix (UTC), use as-is
      if (datetimeStr.endsWith('Z')) {
        return datetimeStr;
      }

      // Parse as local time and convert to UTC
      // Format: "2025-11-30T15:00:00" (no Z) means 3pm LOCAL time
      const localDate = new Date(datetimeStr);
      return localDate.toISOString(); // Converts to UTC with Z suffix
    };

    // Geocode address if provided
    let geocodedData = null;
    const address = eventData.address || null;

    if (address && address.trim() !== '') {
      // Import geocoding utility (dynamic import to avoid circular dependency)
      const { geocodeAddress, isAddressSpecific } = require('./geocoding');

      // Only geocode if address is specific enough
      if (isAddressSpecific(address)) {
        console.log('🌍 Geocoding address:', address);
        geocodedData = await geocodeAddress(address);

        if (!geocodedData) {
          console.warn('⚠️ Geocoding failed, saving event without coordinates');
        }
      } else {
        console.log('⚠️ Address too vague for geocoding:', address);
      }
    }

    // Support both snake_case (from AI) and camelCase (legacy)
    const insertData = {
      owner_id: user.id,
      worker_id: eventData.worker_id || eventData.workerId || null,
      title: eventData.title,
      description: eventData.description || null,
      event_type: eventData.event_type || eventData.eventType || 'other',
      location: eventData.location || null,
      address: address,
      formatted_address: geocodedData?.formatted_address || null,
      latitude: geocodedData?.latitude || null,
      longitude: geocodedData?.longitude || null,
      place_id: geocodedData?.place_id || null,
      start_datetime: ensureUTC(eventData.start_datetime || eventData.startDatetime),
      end_datetime: ensureUTC(eventData.end_datetime || eventData.endDatetime),
      all_day: eventData.all_day !== undefined ? eventData.all_day : (eventData.allDay || false),
      recurring: eventData.recurring || false,
      recurring_pattern: eventData.recurring_pattern || eventData.recurringPattern || null,
      color: eventData.color || '#3B82F6',
      estimated_travel_time_minutes: null, // Will be calculated if needed
    };

    console.log('📅 Creating schedule event:', JSON.stringify(insertData, null, 2));

    const { data, error } = await supabase
      .from('schedule_events')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating schedule event:', error);
      console.error('📋 Error details:', JSON.stringify(error, null, 2));
      return null;
    }

    console.log('✅ Schedule event created successfully:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Exception in createScheduleEvent:', error);
    return null;
  }
};

/**
 * Delete a schedule event
 * @param {string} eventId - Event ID to delete
 * @returns {Promise<boolean>} - Success status
 */
export const deleteScheduleEvent = async (eventId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('schedule_events')
      .delete()
      .eq('id', eventId)
      .eq('owner_id', user.id); // Ensure user can only delete their own events

    if (error) {
      console.error('Error deleting schedule event:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteScheduleEvent:', error);
    return false;
  }
};

/**
 * Fetch schedule events for a date range
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @param {string} eventType - Optional filter by event type
 * @returns {Promise<array>} - Array of schedule events
 */
export const fetchScheduleEvents = async (startDate, endDate, eventType = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Query events where the selected date range overlaps with the event's date range
    // This handles both single-day events (end_datetime is null) and multi-day events
    // Events are included if they: START on/after today, OR END on/after today, OR are all-day
    let query = supabase
      .from('schedule_events')
      .select('*')
      .eq('owner_id', user.id)
      .lte('start_datetime', endDate)
      .or(`start_datetime.gte.${startDate},end_datetime.gte.${startDate},end_datetime.is.null`)
      .order('start_datetime', { ascending: true });

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching schedule events:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchScheduleEvents:', error);
    return [];
  }
};

/**
 * Update an existing schedule event
 * @param {string} eventId - Event ID
 * @param {object} updates - Fields to update
 * @returns {Promise<boolean>} - Success status
 */
export const updateScheduleEvent = async (eventId, updates) => {
  try {
    const { error } = await supabase
      .from('schedule_events')
      .update(updates)
      .eq('id', eventId);

    if (error) {
      console.error('Error updating schedule event:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateScheduleEvent:', error);
    return false;
  }
};

/**
 * Fetch projects for a specific date (past, present, or future)
 * A project appears on a date if:
 * - It has a start_date <= selectedDate
 * - AND (it has no end_date OR end_date >= selectedDate)
 * Shows all projects (active, completed, archived) so owner can review history
 * @param {string} date - Date to check (YYYY-MM-DD)
 * @returns {Promise<array>} - Array of projects with phases
 */
export const fetchActiveProjectsForDate = async (date) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        project_phases (
          id,
          name,
          status,
          start_date,
          end_date,
          order_index
        )
      `)
      .eq('user_id', user.id)
      .lte('start_date', date)
      .or(`end_date.gte.${date},end_date.is.null`)
      .order('start_date', { ascending: true });

    if (error) {
      console.error('Error fetching active projects:', error);
      return [];
    }

    // Transform to match app format
    return (data || []).map(project => ({
      ...project,
      startDate: project.start_date,
      endDate: project.end_date,
      phases: project.project_phases || []
    }));
  } catch (error) {
    console.error('Error in fetchActiveProjectsForDate:', error);
    return [];
  }
};

/**
 * Fetch work schedules for a date range (from worker_schedules table)
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<array>} - Array of work schedules with worker and project details
 */
export const fetchWorkSchedules = async (startDate, endDate) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Query schedules where the selected date falls within the start_date to end_date range
    // This handles both single-day schedules (end_date is null) and multi-day schedules
    const { data, error } = await supabase
      .from('worker_schedules')
      .select(`
        *,
        workers (
          id,
          full_name,
          trade,
          payment_type
        ),
        projects (
          id,
          name,
          status
        ),
        project_phases (
          id,
          name,
          status
        )
      `)
      .eq('created_by', user.id)
      .lte('start_date', endDate)
      .or(`end_date.gte.${startDate},end_date.is.null`)
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching work schedules:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchWorkSchedules:', error);
    return [];
  }
};

/**
 * Create a new work schedule for a worker
 * @param {object} scheduleData - Schedule data (worker_id, project_id, phase_id, dates, times)
 * @returns {Promise<object|null>} - Created schedule or null
 */
export const createWorkSchedule = async (scheduleData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return null;
    }

    const { data, error } = await supabase
      .from('worker_schedules')
      .insert({
        worker_id: scheduleData.worker_id || scheduleData.workerId,
        project_id: scheduleData.project_id || scheduleData.projectId,
        phase_id: scheduleData.phase_id || scheduleData.phaseId,
        start_date: scheduleData.start_date || scheduleData.startDate,
        end_date: scheduleData.end_date || scheduleData.endDate,
        start_time: scheduleData.start_time || scheduleData.startTime,
        end_time: scheduleData.end_time || scheduleData.endTime,
        recurring: scheduleData.recurring || false,
        recurring_days: scheduleData.recurring_days || scheduleData.recurringDays,
        notes: scheduleData.notes,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating work schedule:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createWorkSchedule:', error);
    return null;
  }
};

/**
 * Update an existing work schedule
 * @param {string} scheduleId - Schedule ID
 * @param {object} updates - Fields to update
 * @returns {Promise<boolean>} - Success status
 */
export const updateWorkSchedule = async (scheduleId, updates) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return false;
    }

    // Transform camelCase to snake_case for database
    const dbUpdates = {};
    const fieldMap = {
      workerId: 'worker_id',
      projectId: 'project_id',
      phaseId: 'phase_id',
      startDate: 'start_date',
      endDate: 'end_date',
      startTime: 'start_time',
      endTime: 'end_time',
      recurring: 'recurring',
      recurringDays: 'recurring_days',
      notes: 'notes',
    };

    Object.keys(updates).forEach(key => {
      const dbKey = fieldMap[key] || key;
      dbUpdates[dbKey] = updates[key];
    });

    const { error } = await supabase
      .from('worker_schedules')
      .update(dbUpdates)
      .eq('id', scheduleId);

    if (error) {
      console.error('Error updating work schedule:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateWorkSchedule:', error);
    return false;
  }
};

/**
 * Delete a work schedule
 * @param {string} scheduleId - Schedule ID
 * @returns {Promise<boolean>} - Success status
 */
export const deleteWorkSchedule = async (scheduleId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return false;
    }

    const { error } = await supabase
      .from('worker_schedules')
      .delete()
      .eq('id', scheduleId);

    if (error) {
      console.error('Error deleting work schedule:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteWorkSchedule:', error);
    return false;
  }
};

/**
 * ============================================================================
 * SETTINGS & CONFIGURATION FUNCTIONS
 * ============================================================================
 */

/**
 * Update phase template (stored in profiles.phases_template)
 * @param {object} template - Phase template object with name and phases array
 * @returns {Promise<boolean>} - Success status
 */
export const updatePhaseTemplate = async (template) => {
  try {
    const profile = await getUserProfile();

    const { error } = await supabase
      .from('profiles')
      .update({ phases_template: template })
      .eq('id', profile.id);

    if (error) {
      console.error('Error updating phase template:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updatePhaseTemplate:', error);
    return false;
  }
};

/**
 * Add a service to a trade's pricing catalog
 * @param {string} tradeId - Trade ID
 * @param {string} serviceId - Unique service ID
 * @param {object} service - Service object {label, price, unit}
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

/**
 * Update invoice template
 * @param {object} templateData - Template configuration
 * @returns {Promise<boolean>} - Success status
 */
export const updateInvoiceTemplate = async (templateData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return false;
    }

    // Check if template exists
    const { data: existing } = await supabase
      .from('invoice_template')
      .select('id')
      .eq('user_id', user.id)
      .single();

    let error;
    if (existing) {
      // Update existing template
      ({ error } = await supabase
        .from('invoice_template')
        .update(templateData)
        .eq('user_id', user.id));
    } else {
      // Insert new template
      ({ error } = await supabase
        .from('invoice_template')
        .insert({
          ...templateData,
          user_id: user.id,
        }));
    }

    if (error) {
      console.error('Error updating invoice template:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateInvoiceTemplate:', error);
    return false;
  }
};

// ===================================
// DOCUMENT AGENT - Invoice Management
// ===================================

/**
 * Update an existing invoice (amount, items, terms, etc.)
 */
export const updateInvoice = async (invoiceId, updates) => {
  try {
    const { error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId);

    if (error) {
      console.error('Error updating invoice:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateInvoice:', error);
    return false;
  }
};

/**
 * Delete an invoice
 */
export const deleteInvoice = async (invoiceId) => {
  try {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoiceId);

    if (error) {
      console.error('Error deleting invoice:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteInvoice:', error);
    return false;
  }
};

/**
 * Record a payment on an invoice
 * Automatically updates status based on amount_paid vs total
 */
export const recordInvoicePayment = async (invoiceId, paymentAmount, paymentMethod = 'check', paymentDate = null) => {
  try {
    // Get current invoice
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      console.error('Error fetching invoice:', fetchError);
      return false;
    }

    // Calculate new amount_paid
    const currentAmountPaid = parseFloat(invoice.amount_paid || 0);
    const newAmountPaid = currentAmountPaid + parseFloat(paymentAmount);
    const total = parseFloat(invoice.total);

    // Determine new status
    let newStatus;
    if (newAmountPaid >= total) {
      newStatus = 'paid';
    } else if (newAmountPaid > 0) {
      newStatus = 'partial';
    } else {
      newStatus = 'unpaid';
    }

    // Update invoice
    const updates = {
      amount_paid: newAmountPaid,
      status: newStatus,
      payment_method: paymentMethod,
    };

    // Add paid_date if fully paid
    if (newStatus === 'paid') {
      updates.paid_date = paymentDate || new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId);

    if (updateError) {
      console.error('Error recording payment:', updateError);
      return false;
    }

    return {
      success: true,
      newBalance: total - newAmountPaid,
      status: newStatus
    };
  } catch (error) {
    console.error('Error in recordInvoicePayment:', error);
    return false;
  }
};

/**
 * Void an invoice (set status to cancelled)
 */
export const voidInvoice = async (invoiceId) => {
  try {
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'cancelled' })
      .eq('id', invoiceId);

    if (error) {
      console.error('Error voiding invoice:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in voidInvoice:', error);
    return false;
  }
};

// ===================================
// FINANCIAL AGENT - Enhanced Analytics
// ===================================

/**
 * Get transactions filtered by category
 */
export const getTransactionsByCategory = async (category, projectId = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return [];
    }

    let query = supabase
      .from('project_transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('category', category)
      .order('transaction_date', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching transactions by category:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getTransactionsByCategory:', error);
    return [];
  }
};

/**
 * Get transactions within a date range
 */
export const getTransactionsByDateRange = async (startDate, endDate, projectId = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return [];
    }

    let query = supabase
      .from('project_transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching transactions by date range:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getTransactionsByDateRange:', error);
    return [];
  }
};

/**
 * Get transactions by payment method
 */
export const getTransactionsByPaymentMethod = async (paymentMethod, projectId = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return [];
    }

    let query = supabase
      .from('project_transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_method', paymentMethod)
      .order('transaction_date', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching transactions by payment method:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getTransactionsByPaymentMethod:', error);
    return [];
  }
};

/**
 * Calculate labor costs from time tracking
 */
export const calculateLaborCostsFromTimeTracking = async (projectId = null, startDate = null, endDate = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return { totalCost: 0, breakdown: [] };
    }

    // Build query for clock-in records
    let query = supabase
      .from('clock_in_records')
      .select(`
        *,
        workers:worker_id (
          id,
          full_name,
          hourly_rate
        ),
        projects:project_id (
          id,
          name
        )
      `)
      .eq('user_id', user.id)
      .not('clock_out_time', 'is', null);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    if (startDate) {
      query = query.gte('clock_in_time', startDate);
    }

    if (endDate) {
      query = query.lte('clock_out_time', endDate);
    }

    const { data: records, error } = await query;

    if (error) {
      console.error('Error fetching time records:', error);
      return { totalCost: 0, breakdown: [] };
    }

    // Calculate costs
    const breakdown = {};
    let totalCost = 0;

    records.forEach(record => {
      const clockIn = new Date(record.clock_in_time);
      const clockOut = new Date(record.clock_out_time);
      const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60); // Convert ms to hours
      const rate = record.workers?.hourly_rate || 0;
      const cost = hoursWorked * rate;

      totalCost += cost;

      const workerName = record.workers?.full_name || 'Unknown Worker';
      if (!breakdown[workerName]) {
        breakdown[workerName] = { hours: 0, cost: 0, rate };
      }
      breakdown[workerName].hours += hoursWorked;
      breakdown[workerName].cost += cost;
    });

    return {
      totalCost,
      breakdown: Object.entries(breakdown).map(([name, data]) => ({
        workerName: name,
        hours: data.hours,
        rate: data.rate,
        cost: data.cost
      }))
    };
  } catch (error) {
    console.error('Error in calculateLaborCostsFromTimeTracking:', error);
    return { totalCost: 0, breakdown: [] };
  }
};

/**
 * Get spending trends by category
 */
export const getSpendingTrendsByCategory = async (projectId = null, months = 3) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return {};
    }

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    let query = supabase
      .from('project_transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .gte('transaction_date', startDate.toISOString());

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data: transactions, error } = await query;

    if (error) {
      console.error('Error fetching spending trends:', error);
      return {};
    }

    // Group by category
    const trends = {};
    transactions.forEach(tx => {
      const category = tx.category || 'other';
      if (!trends[category]) {
        trends[category] = { total: 0, count: 0, transactions: [] };
      }
      trends[category].total += parseFloat(tx.amount);
      trends[category].count += 1;
      trends[category].transactions.push(tx);
    });

    return trends;
  } catch (error) {
    console.error('Error in getSpendingTrendsByCategory:', error);
    return {};
  }
};

/**
 * Detect cost overruns (actual vs budget)
 */
export const detectCostOverruns = async (projectId) => {
  try {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*, phases:project_phases(*)')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('Error fetching project:', projectError);
      return null;
    }

    // Get all expenses
    const { data: expenses, error: expensesError } = await supabase
      .from('project_transactions')
      .select('*')
      .eq('project_id', projectId)
      .eq('type', 'expense');

    if (expensesError) {
      console.error('Error fetching expenses:', expensesError);
      return null;
    }

    const totalExpenses = expenses.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    const budget = parseFloat(project.contract_amount || 0);
    const overBudget = totalExpenses > budget;
    const variance = totalExpenses - budget;
    const percentageOver = budget > 0 ? (variance / budget) * 100 : 0;

    return {
      projectName: project.name,
      budget,
      totalExpenses,
      variance,
      percentageOver,
      overBudget,
      status: overBudget ? 'over-budget' : 'on-budget'
    };
  } catch (error) {
    console.error('Error in detectCostOverruns:', error);
    return null;
  }
};

/**
 * Predict cash flow based on payment schedules
 */
export const predictCashFlow = async (months = 3) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return { predictions: [], summary: {} };
    }

    // Get all active projects
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*, phases:project_phases(*)')
      .eq('user_id', user.id)
      .in('status', ['active', 'on-track', 'behind', 'over-budget']);

    if (error) {
      console.error('Error fetching projects:', error);
      return { predictions: [], summary: {} };
    }

    const predictions = [];
    let totalExpectedIncome = 0;
    let totalPendingPayments = 0;

    projects.forEach(project => {
      const contractAmount = parseFloat(project.contract_amount || 0);
      const collected = parseFloat(project.income_collected || 0);
      const pending = contractAmount - collected;

      if (pending > 0) {
        totalPendingPayments += pending;

        // Check for phases with payment amounts
        const phasesWithPayment = project.phases?.filter(p => p.payment_amount > 0) || [];

        phasesWithPayment.forEach(phase => {
          predictions.push({
            projectName: project.name,
            phaseName: phase.name,
            amount: phase.payment_amount,
            expectedDate: phase.end_date,
            status: phase.status
          });
        });

        // If no phase payments, assume final payment
        if (phasesWithPayment.length === 0) {
          predictions.push({
            projectName: project.name,
            phaseName: 'Final Payment',
            amount: pending,
            expectedDate: null,
            status: 'pending'
          });
        }

        totalExpectedIncome += pending;
      }
    });

    return {
      predictions: predictions.sort((a, b) => {
        if (!a.expectedDate) return 1;
        if (!b.expectedDate) return -1;
        return new Date(a.expectedDate) - new Date(b.expectedDate);
      }),
      summary: {
        totalExpectedIncome,
        totalPendingPayments,
        projectCount: projects.length
      }
    };
  } catch (error) {
    console.error('Error in predictCashFlow:', error);
    return { predictions: [], summary: {} };
  }
};

// ===================================
// PROGRESS TRACKING & VELOCITY SYSTEM
// ===================================

/**
 * Calculate actual progress from phase completions
 * Aggregates all phase completion percentages
 */
export const calculateActualProgress = async (projectId) => {
  try {
    const { data: phases, error } = await supabase
      .from('project_phases')
      .select('completion_percentage')
      .eq('project_id', projectId);

    if (error || !phases || phases.length === 0) {
      console.error('Error fetching phases for progress:', error);
      return 0;
    }

    // Calculate average completion across all phases
    const totalCompletion = phases.reduce((sum, phase) => {
      return sum + (phase.completion_percentage || 0);
    }, 0);

    const averageProgress = Math.round(totalCompletion / phases.length);

    // Update project's actual progress (only if not manually overridden)
    const { data: project } = await supabase
      .from('projects')
      .select('progress_override')
      .eq('id', projectId)
      .single();

    if (!project?.progress_override) {
      await supabase
        .from('projects')
        .update({ actual_progress: averageProgress })
        .eq('id', projectId);
    }

    return averageProgress;
  } catch (error) {
    console.error('Error in calculateActualProgress:', error);
    return 0;
  }
};

/**
 * Calculate task completion velocity (tasks per day)
 */
export const calculateVelocity = async (projectId) => {
  try {
    // Get project start date
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('actual_start_date, start_date')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('Error fetching project for velocity:', projectError);
      return 0;
    }

    const startDate = project.actual_start_date || project.start_date;
    if (!startDate) {
      return 0; // Can't calculate velocity without start date
    }

    // Calculate days elapsed
    const start = new Date(startDate);
    const today = new Date();
    const daysElapsed = Math.max(1, Math.ceil((today - start) / (1000 * 60 * 60 * 24)));

    // Count completed tasks across all phases
    const { data: phases, error: phasesError } = await supabase
      .from('project_phases')
      .select('tasks')
      .eq('project_id', projectId);

    if (phasesError || !phases) {
      console.error('Error fetching phases for velocity:', phasesError);
      return 0;
    }

    let completedTasks = 0;
    phases.forEach(phase => {
      const tasks = phase.tasks || [];
      completedTasks += tasks.filter(t => t.completed).length;
    });

    // Calculate velocity (tasks per day)
    const velocity = completedTasks / daysElapsed;

    // Update project
    await supabase
      .from('projects')
      .update({ velocity_tasks_per_day: velocity.toFixed(2) })
      .eq('id', projectId);

    return velocity;
  } catch (error) {
    console.error('Error in calculateVelocity:', error);
    return 0;
  }
};

/**
 * Calculate estimated completion date based on current velocity
 */
export const calculateEstimatedCompletion = async (projectId) => {
  try {
    // Get project data
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('velocity_tasks_per_day, end_date')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('Error fetching project for completion estimate:', projectError);
      return null;
    }

    const velocity = parseFloat(project.velocity_tasks_per_day);
    if (velocity === 0) {
      return null; // Can't predict without velocity
    }

    // Count total and completed tasks
    const { data: phases, error: phasesError } = await supabase
      .from('project_phases')
      .select('tasks')
      .eq('project_id', projectId);

    if (phasesError || !phases) {
      console.error('Error fetching phases for completion estimate:', phasesError);
      return null;
    }

    let totalTasks = 0;
    let completedTasks = 0;
    phases.forEach(phase => {
      const tasks = phase.tasks || [];
      totalTasks += tasks.length;
      completedTasks += tasks.filter(t => t.completed).length;
    });

    if (totalTasks === 0) {
      return null; // No tasks to estimate from
    }

    const remainingTasks = totalTasks - completedTasks;
    const daysNeeded = Math.ceil(remainingTasks / velocity);

    // Calculate estimated date
    const today = new Date();
    const estimatedDate = new Date(today.getTime() + (daysNeeded * 24 * 60 * 60 * 1000));
    const estimatedDateString = estimatedDate.toISOString().split('T')[0];

    // Calculate days late/early
    let daysLate = 0;
    if (project.end_date) {
      const plannedEnd = new Date(project.end_date);
      daysLate = Math.ceil((estimatedDate - plannedEnd) / (1000 * 60 * 60 * 24));
    }

    // Update project
    await supabase
      .from('projects')
      .update({ estimated_completion_date: estimatedDateString })
      .eq('id', projectId);

    return {
      estimatedDate: estimatedDateString,
      daysNeeded,
      daysLate,
      remainingTasks,
      completedTasks,
      totalTasks
    };
  } catch (error) {
    console.error('Error in calculateEstimatedCompletion:', error);
    return null;
  }
};

/**
 * Update project progress (manual or automatic)
 */
export const updateProjectProgress = async (projectId, actualProgress, isManual = false) => {
  try {
    const updates = {
      actual_progress: actualProgress,
      progress_override: isManual
    };

    const { error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId);

    if (error) {
      console.error('Error updating project progress:', error);
      return false;
    }

    // If manual, don't recalculate velocity
    if (!isManual) {
      // Recalculate velocity and estimated completion
      await calculateVelocity(projectId);
      await calculateEstimatedCompletion(projectId);
    }

    return true;
  } catch (error) {
    console.error('Error in updateProjectProgress:', error);
    return false;
  }
};

/**
 * Auto-start projects when their start_date arrives
 * Call this on app initialization
 */
export const checkAndStartScheduledProjects = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return 0;
    }

    const today = new Date().toISOString().split('T')[0];

    // Find all scheduled projects where start_date <= today
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('status', 'scheduled')
      .lte('start_date', today);

    if (error) {
      console.error('Error fetching scheduled projects:', error);
      return 0;
    }

    if (!projects || projects.length === 0) {
      return 0;
    }

    // Start each project
    for (const project of projects) {
      await supabase
        .from('projects')
        .update({
          status: 'active',
          actual_start_date: today
        })
        .eq('id', project.id);

      console.log(`Auto-started project: ${project.name}`);
    }

    return projects.length;
  } catch (error) {
    console.error('Error in checkAndStartScheduledProjects:', error);
    return 0;
  }
};

/**
 * Reset project progress to automatic calculation
 */
export const resetProjectProgressToAutomatic = async (projectId) => {
  try {
    // Recalculate from phases
    const actualProgress = await calculateActualProgress(projectId);

    // Update with override = false
    const { error } = await supabase
      .from('projects')
      .update({
        actual_progress: actualProgress,
        progress_override: false
      })
      .eq('id', projectId);

    if (error) {
      console.error('Error resetting progress:', error);
      return false;
    }

    // Recalculate velocity and completion
    await calculateVelocity(projectId);
    await calculateEstimatedCompletion(projectId);

    return true;
  } catch (error) {
    console.error('Error in resetProjectProgressToAutomatic:', error);
    return false;
  }
};

/**
 * ============================================================================
 * NEW WORKFORCE MANAGEMENT FUNCTIONS
 * ============================================================================
 */

// ============================================
// TIME ENTRY MANAGEMENT
// ============================================

/**
 * Edit an existing time entry
 * @param {string} timeTrackingId - Time tracking record ID
 * @param {object} updates - Fields to update (clock_in_time, clock_out_time, notes)
 * @returns {Promise<boolean>} - Success status
 */
export const editTimeEntry = async (timeTrackingId, updates) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Recalculate hours if times changed
    if (updates.clock_in || updates.clock_out) {
      const { data: existing } = await supabase
        .from('time_tracking')
        .select('*')
        .eq('id', timeTrackingId)
        .single();

      if (existing) {
        const clockIn = new Date(updates.clock_in || existing.clock_in);
        const clockOut = new Date(updates.clock_out || existing.clock_out);
        if (clockOut > clockIn) {
          updates.hours_worked = (clockOut - clockIn) / (1000 * 60 * 60);
        }
      }
    }

    const { error } = await supabase
      .from('time_tracking')
      .update(updates)
      .eq('id', timeTrackingId);

    return !error;
  } catch (error) {
    console.error('Error in editTimeEntry:', error);
    return false;
  }
};

/**
 * Create a manual time entry (for missed clock-ins)
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @param {string} clockInTime - Clock in time (HH:MM)
 * @param {string} clockOutTime - Clock out time (HH:MM)
 * @param {string} date - Date (YYYY-MM-DD)
 * @returns {Promise<object|null>} - Created entry
 */
export const createManualTimeEntry = async (workerId, projectId, clockInTime, clockOutTime, date) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const clockIn = new Date(`${date}T${clockInTime}:00`);
    const clockOut = new Date(`${date}T${clockOutTime}:00`);
    const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);

    const { data, error } = await supabase
      .from('time_tracking')
      .insert({
        worker_id: workerId,
        project_id: projectId,
        clock_in: clockIn.toISOString(),
        clock_out: clockOut.toISOString(),
        hours_worked: hoursWorked,
        is_manual: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating manual time entry:', error);
      return null;
    }

    return { ...data, hours_worked: hoursWorked };
  } catch (error) {
    console.error('Error in createManualTimeEntry:', error);
    return null;
  }
};

/**
 * Delete a time entry
 * @param {string} timeTrackingId - Time tracking record ID
 * @returns {Promise<boolean>} - Success status
 */
export const deleteTimeEntry = async (timeTrackingId) => {
  try {
    const { error } = await supabase
      .from('time_tracking')
      .delete()
      .eq('id', timeTrackingId);

    return !error;
  } catch (error) {
    console.error('Error in deleteTimeEntry:', error);
    return false;
  }
};

// ============================================
// RECURRING EVENTS
// ============================================

/**
 * Create a recurring event (generates multiple instances)
 * @param {object} eventData - Event data with recurrence pattern
 * @returns {Promise<object|null>} - Created recurring event
 */
export const createRecurringEvent = async (eventData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { title, event_type, start_time, end_time, location, recurrence } = eventData;
    const { frequency, days, end_date, occurrences } = recurrence;

    // Generate recurring event ID
    const recurringId = `recurring_${Date.now()}`;

    // Calculate dates for instances
    const instances = [];
    const today = new Date();
    let currentDate = new Date(today);
    let count = 0;
    const maxOccurrences = occurrences || 52; // Default 1 year of weekly events
    const endDateTime = end_date ? new Date(end_date) : new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);

    while (currentDate <= endDateTime && count < maxOccurrences) {
      const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      // Check if this day matches the pattern
      let shouldCreate = false;
      if (frequency === 'daily') {
        shouldCreate = true;
      } else if (frequency === 'weekly' && days?.includes(dayName)) {
        shouldCreate = true;
      } else if (frequency === 'biweekly' && days?.includes(dayName) && count % 2 === 0) {
        shouldCreate = true;
      } else if (frequency === 'monthly' && currentDate.getDate() === today.getDate()) {
        shouldCreate = true;
      }

      if (shouldCreate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        instances.push({
          owner_id: user.id,
          title,
          event_type: event_type || 'meeting',
          start_datetime: `${dateStr}T${start_time}:00`,
          end_datetime: `${dateStr}T${end_time}:00`,
          location,
          all_day: false,
          recurring: true,
          recurring_id: recurringId,
          color: getEventColor(event_type)
        });
        count++;
      }

      // Advance date based on frequency
      if (frequency === 'daily') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (frequency === 'weekly' || frequency === 'biweekly') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (frequency === 'monthly') {
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    // Insert all instances
    if (instances.length > 0) {
      const { data, error } = await supabase
        .from('schedule_events')
        .insert(instances)
        .select();

      if (error) {
        console.error('Error creating recurring events:', error);
        return null;
      }

      return { recurring_id: recurringId, instances: data, count: instances.length };
    }

    return null;
  } catch (error) {
    console.error('Error in createRecurringEvent:', error);
    return null;
  }
};

/**
 * Helper to get event color by type
 */
const getEventColor = (eventType) => {
  const colors = {
    meeting: '#3B82F6',
    appointment: '#F59E0B',
    site_visit: '#22C55E',
    pto: '#EF4444',
    other: '#6B7280'
  };
  return colors[eventType] || colors.other;
};

/**
 * Update a recurring event (all or future instances)
 * @param {string} recurringId - Recurring event ID
 * @param {object} updates - Updates to apply
 * @returns {Promise<boolean>} - Success status
 */
export const updateRecurringEvent = async (recurringId, updates) => {
  try {
    const { error } = await supabase
      .from('schedule_events')
      .update(updates)
      .eq('recurring_id', recurringId);

    return !error;
  } catch (error) {
    console.error('Error in updateRecurringEvent:', error);
    return false;
  }
};

/**
 * Delete recurring event instances
 * @param {string} recurringId - Recurring event ID
 * @param {string} scope - "all", "future", or "single"
 * @param {string} instanceId - For single deletion
 * @returns {Promise<boolean>} - Success status
 */
export const deleteRecurringEvent = async (recurringId, scope = 'all', instanceId = null) => {
  try {
    if (scope === 'single' && instanceId) {
      const { error } = await supabase
        .from('schedule_events')
        .delete()
        .eq('id', instanceId);
      return !error;
    }

    if (scope === 'future') {
      const today = new Date().toISOString();
      const { error } = await supabase
        .from('schedule_events')
        .delete()
        .eq('recurring_id', recurringId)
        .gte('start_datetime', today);
      return !error;
    }

    // Delete all
    const { error } = await supabase
      .from('schedule_events')
      .delete()
      .eq('recurring_id', recurringId);

    return !error;
  } catch (error) {
    console.error('Error in deleteRecurringEvent:', error);
    return false;
  }
};

// ============================================
// WORKER AVAILABILITY & PTO
// ============================================

/**
 * Set worker availability/unavailability
 * @param {object} data - Availability data
 * @returns {Promise<object|null>} - Created record
 */
export const setWorkerAvailability = async (data) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { worker_id, date, end_date, status, reason, time_range } = data;

    const { data: result, error } = await supabase
      .from('worker_availability')
      .insert({
        user_id: user.id,
        worker_id,
        start_date: date,
        end_date: end_date || date,
        status,
        reason,
        time_range: time_range ? JSON.stringify(time_range) : null
      })
      .select()
      .single();

    if (error) {
      console.error('Error setting worker availability:', error);
      return null;
    }

    return result;
  } catch (error) {
    console.error('Error in setWorkerAvailability:', error);
    return null;
  }
};

/**
 * Set worker PTO (vacation/time off)
 * @param {string} workerId - Worker ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @param {string} reason - Reason for PTO
 * @returns {Promise<object|null>} - Created PTO record
 */
export const setWorkerPTO = async (workerId, startDate, endDate, reason = 'vacation') => {
  return setWorkerAvailability({
    worker_id: workerId,
    date: startDate,
    end_date: endDate,
    status: 'pto',
    reason
  });
};

/**
 * Remove worker availability record
 * @param {string} availabilityId - Availability record ID
 * @returns {Promise<boolean>} - Success status
 */
export const removeWorkerAvailability = async (availabilityId) => {
  try {
    const { error } = await supabase
      .from('worker_availability')
      .delete()
      .eq('id', availabilityId);

    return !error;
  } catch (error) {
    console.error('Error in removeWorkerAvailability:', error);
    return false;
  }
};

/**
 * Get worker availability for date range
 * @param {string} workerId - Worker ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<array>} - Availability records
 */
export const getWorkerAvailability = async (workerId, startDate, endDate) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('worker_availability')
      .select('*')
      .eq('worker_id', workerId)
      .gte('start_date', startDate)
      .lte('end_date', endDate);

    if (error) {
      console.error('Error fetching worker availability:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getWorkerAvailability:', error);
    return [];
  }
};

// ============================================
// CREW MANAGEMENT
// ============================================

/**
 * Create a worker crew/team
 * @param {object} crewData - Crew data
 * @returns {Promise<object|null>} - Created crew
 */
export const createCrew = async (crewData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { name, worker_ids, default_project_id } = crewData;

    const { data, error } = await supabase
      .from('worker_crews')
      .insert({
        user_id: user.id,
        name,
        worker_ids,
        default_project_id
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating crew:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createCrew:', error);
    return null;
  }
};

/**
 * Get a crew by ID
 * @param {string} crewId - Crew ID
 * @returns {Promise<object|null>} - Crew data
 */
export const getCrew = async (crewId) => {
  try {
    const { data, error } = await supabase
      .from('worker_crews')
      .select('*')
      .eq('id', crewId)
      .single();

    if (error) return null;
    return data;
  } catch (error) {
    console.error('Error in getCrew:', error);
    return null;
  }
};

/**
 * Update a crew
 * @param {string} crewId - Crew ID
 * @param {object} updates - Updates (add_worker_ids, remove_worker_ids, name)
 * @returns {Promise<boolean>} - Success status
 */
export const updateCrew = async (crewId, updates) => {
  try {
    const crew = await getCrew(crewId);
    if (!crew) return false;

    let newWorkerIds = [...(crew.worker_ids || [])];

    if (updates.add_worker_ids) {
      newWorkerIds = [...new Set([...newWorkerIds, ...updates.add_worker_ids])];
    }

    if (updates.remove_worker_ids) {
      newWorkerIds = newWorkerIds.filter(id => !updates.remove_worker_ids.includes(id));
    }

    const updateData = { worker_ids: newWorkerIds };
    if (updates.name) updateData.name = updates.name;

    const { error } = await supabase
      .from('worker_crews')
      .update(updateData)
      .eq('id', crewId);

    return !error;
  } catch (error) {
    console.error('Error in updateCrew:', error);
    return false;
  }
};

/**
 * Delete a crew
 * @param {string} crewId - Crew ID
 * @returns {Promise<boolean>} - Success status
 */
export const deleteCrew = async (crewId) => {
  try {
    const { error } = await supabase
      .from('worker_crews')
      .delete()
      .eq('id', crewId);

    return !error;
  } catch (error) {
    console.error('Error in deleteCrew:', error);
    return false;
  }
};

/**
 * Get all crews for user
 * @returns {Promise<array>} - Crews
 */
export const fetchCrews = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('worker_crews')
      .select('*')
      .eq('user_id', user.id);

    if (error) return [];
    return data || [];
  } catch (error) {
    console.error('Error in fetchCrews:', error);
    return [];
  }
};

// ============================================
// SHIFT TEMPLATES
// ============================================

/**
 * Create a shift template
 * @param {object} templateData - Template data
 * @returns {Promise<object|null>} - Created template
 */
export const createShiftTemplate = async (templateData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { name, start_time, end_time, break_duration, days } = templateData;

    const { data, error } = await supabase
      .from('shift_templates')
      .insert({
        user_id: user.id,
        name,
        start_time,
        end_time,
        break_duration: break_duration || 0,
        days: days || ['mon', 'tue', 'wed', 'thu', 'fri']
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating shift template:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createShiftTemplate:', error);
    return null;
  }
};

/**
 * Apply a shift template to create work schedules
 * @param {string} templateId - Template ID
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<array|null>} - Created schedules
 */
export const applyShiftTemplate = async (templateId, workerId, projectId, startDate, endDate) => {
  try {
    // Get template
    const { data: template, error: templateError } = await supabase
      .from('shift_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) return null;

    const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const scheduleDays = (template.days || []).map(d => dayMap[d.toLowerCase()]);

    // Generate schedules for matching days in range
    const schedules = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      if (scheduleDays.includes(current.getDay())) {
        const dateStr = current.toISOString().split('T')[0];
        schedules.push({
          worker_id: workerId,
          project_id: projectId,
          start_date: dateStr,
          end_date: dateStr,
          start_time: template.start_time,
          end_time: template.end_time
        });
      }
      current.setDate(current.getDate() + 1);
    }

    // Create all schedules
    const results = [];
    for (const schedule of schedules) {
      const created = await createWorkSchedule(schedule);
      if (created) results.push(created);
    }

    return results;
  } catch (error) {
    console.error('Error in applyShiftTemplate:', error);
    return null;
  }
};

/**
 * Delete a shift template
 * @param {string} templateId - Template ID
 * @returns {Promise<boolean>} - Success status
 */
export const deleteShiftTemplate = async (templateId) => {
  try {
    const { error } = await supabase
      .from('shift_templates')
      .delete()
      .eq('id', templateId);

    return !error;
  } catch (error) {
    console.error('Error in deleteShiftTemplate:', error);
    return false;
  }
};

/**
 * Get all shift templates
 * @returns {Promise<array>} - Templates
 */
export const fetchShiftTemplates = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('shift_templates')
      .select('*')
      .eq('user_id', user.id);

    if (error) return [];
    return data || [];
  } catch (error) {
    console.error('Error in fetchShiftTemplates:', error);
    return [];
  }
};

// ============================================
// BREAK MANAGEMENT
// ============================================

/**
 * Start a break for a worker
 * @param {string} workerId - Worker ID
 * @param {string} breakType - Type of break (lunch, rest, other)
 * @returns {Promise<object|null>} - Break record
 */
export const startWorkerBreak = async (workerId, breakType = 'lunch') => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Get active time tracking record
    const activeRecord = await getActiveClockIn(workerId);
    if (!activeRecord) {
      console.error('Worker not clocked in');
      return null;
    }

    const now = new Date().toISOString();

    // Try using breaks JSONB array first (new schema)
    // Fall back to break_start column (old schema)
    let updateData = {};

    if (activeRecord.breaks !== undefined) {
      // New schema with JSONB breaks array
      const breaks = activeRecord.breaks || [];
      breaks.push({
        id: `break_${Date.now()}`,
        type: breakType,
        start_time: now,
        end_time: null
      });
      updateData = { breaks };
    } else {
      // Old schema with single break_start/break_end
      updateData = { break_start: now };
    }

    const { data, error } = await supabase
      .from('time_tracking')
      .update(updateData)
      .eq('id', activeRecord.id)
      .select()
      .single();

    if (error) {
      console.error('Error starting break:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in startWorkerBreak:', error);
    return null;
  }
};

/**
 * End a worker's current break
 * @param {string} workerId - Worker ID
 * @returns {Promise<object|null>} - Updated record with duration
 */
export const endWorkerBreak = async (workerId) => {
  try {
    // Get active time tracking record
    const activeRecord = await getActiveClockIn(workerId);
    if (!activeRecord) return null;

    const endTime = new Date();
    let updateData = {};
    let durationMinutes = 0;

    if (activeRecord.breaks !== undefined) {
      // New schema with JSONB breaks array
      const breaks = activeRecord.breaks || [];
      const activeBreak = breaks.find(b => !b.end_time);

      if (!activeBreak) {
        console.error('No active break found');
        return null;
      }

      activeBreak.end_time = endTime.toISOString();
      activeBreak.duration_minutes = Math.round(
        (endTime - new Date(activeBreak.start_time)) / (1000 * 60)
      );
      durationMinutes = activeBreak.duration_minutes;
      updateData = { breaks };
    } else {
      // Old schema with single break_start/break_end
      if (!activeRecord.break_start || activeRecord.break_end) {
        console.error('No active break found');
        return null;
      }

      durationMinutes = Math.round(
        (endTime - new Date(activeRecord.break_start)) / (1000 * 60)
      );
      updateData = { break_end: endTime.toISOString() };
    }

    const { data, error } = await supabase
      .from('time_tracking')
      .update(updateData)
      .eq('id', activeRecord.id)
      .select()
      .single();

    if (error) {
      console.error('Error ending break:', error);
      return null;
    }

    return { ...data, duration_minutes: durationMinutes };
  } catch (error) {
    console.error('Error in endWorkerBreak:', error);
    return null;
  }
};

// ============================================
// SHIFT SWAPPING
// ============================================

/**
 * Swap shifts between two work schedules
 * @param {string} shift1Id - First shift ID
 * @param {string} shift2Id - Second shift ID
 * @returns {Promise<boolean>} - Success status
 */
export const swapWorkerShifts = async (shift1Id, shift2Id) => {
  try {
    // Get both shifts
    const { data: shift1 } = await supabase
      .from('worker_schedules')
      .select('*')
      .eq('id', shift1Id)
      .single();

    const { data: shift2 } = await supabase
      .from('worker_schedules')
      .select('*')
      .eq('id', shift2Id)
      .single();

    if (!shift1 || !shift2) return false;

    // Swap worker IDs
    const { error: error1 } = await supabase
      .from('worker_schedules')
      .update({ worker_id: shift2.worker_id })
      .eq('id', shift1Id);

    const { error: error2 } = await supabase
      .from('worker_schedules')
      .update({ worker_id: shift1.worker_id })
      .eq('id', shift2Id);

    return !error1 && !error2;
  } catch (error) {
    console.error('Error in swapWorkerShifts:', error);
    return false;
  }
};

/**
 * Find available workers to cover a shift
 * @param {string} projectId - Project ID
 * @param {string} date - Date
 * @param {string} trade - Optional trade filter
 * @returns {Promise<array>} - Available workers
 */
export const findReplacementWorkers = async (projectId, date, trade = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Get all active workers
    let query = supabase
      .from('workers')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (trade) {
      query = query.ilike('trade', `%${trade}%`);
    }

    const { data: workers, error } = await query;
    if (error || !workers) return [];

    // Get schedules for that date to exclude busy workers
    const { data: schedules } = await supabase
      .from('worker_schedules')
      .select('worker_id')
      .eq('start_date', date);

    const busyWorkerIds = new Set((schedules || []).map(s => s.worker_id));

    // Get unavailable workers
    const { data: unavailable } = await supabase
      .from('worker_availability')
      .select('worker_id')
      .lte('start_date', date)
      .gte('end_date', date);

    const unavailableWorkerIds = new Set((unavailable || []).map(u => u.worker_id));

    // Filter to available workers
    return workers.filter(w =>
      !busyWorkerIds.has(w.id) && !unavailableWorkerIds.has(w.id)
    );
  } catch (error) {
    console.error('Error in findReplacementWorkers:', error);
    return [];
  }
};
