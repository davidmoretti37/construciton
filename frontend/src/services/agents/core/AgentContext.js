/**
 * AgentContext - Builds initial context for all agents
 * This is the "long-term memory" from the database
 *
 * OPTIMIZATION: Now supports agent-specific context fetching
 * to avoid loading ALL data for every request.
 *
 * ENHANCEMENT: Includes learned facts from MemoryService for
 * personalized AI responses.
 */

import logger from '../../../utils/logger';
import { memoryService } from './MemoryService';
import { detectBudgetIssues, detectTimelineIssues, formatConflictsForPrompt } from './ConflictDetector';

// Smart caching layer for static/semi-static data
const contextCache = {
  userProfile: { data: null, timestamp: 0, ttl: 300000 }, // 5 minutes
  pricing: { data: null, timestamp: 0, ttl: 600000 }, // 10 minutes
  phasesTemplate: { data: null, timestamp: 0, ttl: 600000 }, // 10 minutes
};

/**
 * AGENT_DATA_REQUIREMENTS
 * Maps each agent to the specific data it needs.
 * This enables lazy loading - only fetch what's required.
 */
export const AGENT_DATA_REQUIREMENTS = {
  'WorkersSchedulingAgent': ['workers', 'clockedInToday', 'workSchedules', 'completedShiftsToday', 'staleClockIns', 'scheduleEvents', 'projects'],
  'FinancialAgent': ['projects', 'invoices', 'estimates'],
  'ProjectAgent': ['projects', 'workers', 'scheduleEvents', 'userServices', 'pricingHistory', 'phasesTemplate', 'constructionKnowledge', 'checklistHistory', 'existingSchedules'],
  'EstimateInvoiceAgent': ['projects', 'estimates', 'invoices', 'userServices', 'pricingHistory', 'subcontractorQuotes'],
  'DocumentAgent': ['projects', 'estimates', 'invoices', 'contractDocuments', 'workers'],
  'SettingsConfigAgent': ['userServices', 'pricingHistory', 'subcontractorQuotes'],
};

/**
 * Helper: Get cached data or fetch fresh if stale
 */
const getCached = async (cacheKey, fetchFn) => {
  const now = Date.now();
  const cache = contextCache[cacheKey];

  if (!cache.data || (now - cache.timestamp > cache.ttl)) {
    cache.data = await fetchFn();
    cache.timestamp = now;
  }

  return cache.data;
};

/**
 * Builds comprehensive initial context for agent processing
 * @returns {Promise<object>} - Context object with all relevant data
 */
export const buildInitialContext = async () => {
  // Import functions inside to avoid circular dependencies
  const { getUserProfile, getUserServices, fetchProjects, fetchEstimates, fetchInvoices, fetchContractDocuments, fetchWorkers, fetchScheduleEvents, fetchWorkSchedules, getClockedInWorkersToday, getStaleClockIns, getCompletedShiftsToday } = require('../../../utils/storage');
  const { getClockedInSupervisorsToday, getCompletedSupervisorShiftsToday } = require('../../../utils/storage/timeTracking');
  const { getPricingHistory } = require('../../aiService');
  const { getSubcontractorQuotesGroupedByTrade, getSupervisorsForOwner, fetchWorkersForOwner, getClockedInWorkersTodayForOwner, getCompanyHierarchy } = require('../../../utils/storage/workers');
  const { fetchProjectsForOwner } = require('../../../utils/storage/projects');
  const { fetchEstimatesForOwner } = require('../../../utils/storage/estimates');
  const { fetchInvoicesForOwner } = require('../../../utils/storage/invoices');
  const { getCurrentUserContext } = require('../../../utils/storage/auth');
  const { getSelectedLanguage, getAISettings, getAutoTranslateEstimates } = require('../../../utils/storage');

  try {
    // Get date range for schedule events (all upcoming events)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 2); // 2 years ahead should be enough
    farFuture.setHours(23, 59, 59, 999);

    // Fetch userProfile first to get userId for getPricingHistory
    const userProfile = await getCached('userProfile', getUserProfile);
    const userId = userProfile?.id;

    // Get user's selected language for AI responses
    const userLanguage = await getSelectedLanguage() || 'en';

    // Get user's AI personalization settings
    const aiSettings = await getAISettings();

    // Get auto-translate estimates setting
    const autoTranslateEstimates = await getAutoTranslateEstimates();

    // Check if user is an owner (for company-wide data access)
    const userContext = await getCurrentUserContext();
    const isOwnerMode = userContext?.isOwner || false;
    let supervisors = [];
    let companyHierarchy = null;
    if (isOwnerMode) {
      supervisors = await getSupervisorsForOwner(userContext.userId);
      companyHierarchy = await getCompanyHierarchy();
      logger.debug('🏢 Owner mode: fetching company-wide data for', supervisors.length, 'supervisors');
    }

    // Check if user is a supervisor (for supervisor context)
    const isSupervisorMode = userContext?.role === 'supervisor';
    let ownerInfo = null;
    if (isSupervisorMode && userContext?.ownerId) {
      const { getOwnerInfoForSupervisor } = require('../../../utils/storage/workers');
      ownerInfo = await getOwnerInfoForSupervisor(userContext.ownerId);
      logger.debug('👷 Supervisor mode: owner is', ownerInfo?.name);
    }

    // Parallel fetch for speed (Promise.all instead of sequential awaits)
    // Use owner-aware functions if user is an owner
    const [userServices, projects, estimates, invoices, contractDocuments, workers, scheduleEvents, workSchedules, clockedInWorkersToday, clockedInSupervisorsToday, staleClockIns, completedWorkerShiftsToday, completedSupervisorShiftsToday, pricingHistory, subcontractorQuotes] = await Promise.all([
      getUserServices(), // Get services from new system
      isOwnerMode ? fetchProjectsForOwner() : fetchProjects(), // Owner sees all projects
      isOwnerMode ? fetchEstimatesForOwner() : fetchEstimates(), // Owner sees all estimates
      isOwnerMode ? fetchInvoicesForOwner() : fetchInvoices(), // Owner sees all invoices
      fetchContractDocuments(),
      isOwnerMode ? fetchWorkersForOwner() : fetchWorkers(), // Owner sees all workers
      fetchScheduleEvents(today.toISOString(), farFuture.toISOString()), // All upcoming schedule events (no limit)
      fetchWorkSchedules(today.toISOString().split('T')[0], today.toISOString().split('T')[0]), // Today's work schedules
      isOwnerMode ? getClockedInWorkersTodayForOwner() : getClockedInWorkersToday(), // Owner sees all clocked-in workers
      getClockedInSupervisorsToday(), // Supervisors currently clocked in
      getStaleClockIns(), // Workers with forgotten clock-outs from previous days
      getCompletedShiftsToday(), // Workers who completed their shifts today (clocked in AND out)
      getCompletedSupervisorShiftsToday(), // Supervisors who completed their shifts today
      userId ? getPricingHistory(userId) : Promise.resolve({ recentJobs: [], byService: {}, corrections: [], totalEntries: 0 }), // Pricing history for smart pricing
      getSubcontractorQuotesGroupedByTrade() // Subcontractor contacts (for reference)
    ]);

    // Combine workers and supervisors into clockedInToday
    const clockedInToday = [
      ...(clockedInWorkersToday || []),
      ...(clockedInSupervisorsToday || []),
    ];

    // Combine workers and supervisors into completedShiftsToday
    const completedShiftsToday = [
      ...(completedWorkerShiftsToday || []),
      ...(completedSupervisorShiftsToday || []),
    ];

    logger.debug('📊 AI Context: Projects:', projects?.length || 0);

    // Format pricing for AI readability from new user_services system
    const formattedPricing = {};
    const serviceNames = [];

    userServices.forEach(service => {
      const categoryName = service.service_categories?.name || 'Unknown Service';
      serviceNames.push(categoryName);

      if (service.pricing && Object.keys(service.pricing).length > 0) {
        formattedPricing[categoryName] = {};

        Object.entries(service.pricing).forEach(([itemId, itemData]) => {
          const itemName = itemData.name || itemId;
          formattedPricing[categoryName][itemName] = {
            price: itemData.price,
            unit: itemData.unit
          };
        });
      }
    });

    // Calculate stats
    const activeProjects = projects.filter(p => ['active', 'on-track', 'behind', 'over-budget'].includes(p.status));
    const completedThisMonth = projects.filter(p => {
      if (p.status !== 'completed') return false;
      const completedDate = new Date(p.updatedAt);
      const now = new Date();
      return completedDate.getMonth() === now.getMonth() && completedDate.getFullYear() === now.getFullYear();
    });

    // Calculate worker stats
    const activeWorkers = workers.filter(w => w.status === 'active');
    const workersScheduledToday = new Set(workSchedules.map(ws => ws.worker_id)).size;

    // Convert schedule events from UTC to local time for AI context
    // This ensures the AI sees times in the user's timezone (e.g., "2025-11-29T14:00:00")
    // instead of UTC (e.g., "2025-11-29T19:00:00Z"), so conflict detection works correctly
    const convertEventsToLocalTime = (events) => {
      return events.map(event => {
        const localEvent = { ...event };

        if (event.start_datetime) {
          const date = new Date(event.start_datetime);
          // Format as YYYY-MM-DDTHH:mm:ss (local time, no Z suffix)
          // Using 'sv-SE' locale gives ISO format in local timezone
          localEvent.start_datetime = date.toLocaleString('sv-SE').replace(' ', 'T');
        }

        if (event.end_datetime) {
          const date = new Date(event.end_datetime);
          localEvent.end_datetime = date.toLocaleString('sv-SE').replace(' ', 'T');
        }

        return localEvent;
      });
    };

    // Get today's date in local timezone for the AI to use
    const now = new Date();
    const localDateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Calculate yesterday's date
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDateString = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    // Get learned facts from long-term memory for personalized responses
    const learnedFacts = memoryService.getMemoriesForPrompt('');

    // Proactive conflict/issue detection across all projects
    let detectedConflicts = [];
    const currentDateObj = new Date(localDateString);
    (projects || []).forEach(project => {
      const budgetIssues = detectBudgetIssues(project);
      const timelineIssues = detectTimelineIssues(project, currentDateObj);
      if (budgetIssues.length) {
        detectedConflicts.push(...budgetIssues.map(i => ({ ...i, projectName: project.name })));
      }
      if (timelineIssues.length) {
        detectedConflicts.push(...timelineIssues.map(i => ({ ...i, projectName: project.name })));
      }
    });
    // Format high-severity conflicts for prompt injection
    const conflictWarnings = formatConflictsForPrompt(
      detectedConflicts.filter(c => c.severity === 'critical' || c.severity === 'high'),
      { maxItems: 5 }
    );

    return {
      currentDate: localDateString, // Local date in YYYY-MM-DD format for accurate date parsing
      yesterdayDate: yesterdayDateString, // Yesterday's date pre-calculated
      currentDateTime: now.toISOString(), // Full ISO timestamp if needed

      // Owner mode (for company-wide data access in Boss Portal)
      isOwnerMode: isOwnerMode,
      userRole: userContext?.role || 'contractor',
      supervisors: supervisors.map(s => ({ id: s.id, name: s.business_name || 'Supervisor' })),
      companyHierarchy: companyHierarchy, // Full hierarchy with counts (for owner)

      // Supervisor mode (for supervisor context awareness)
      isSupervisorMode: isSupervisorMode,
      ownerInfo: ownerInfo, // { id, name, business_name } - supervisor's owner

      // Learned facts from long-term memory (for personalized AI responses)
      learnedFacts: learnedFacts,

      // Proactive conflict warnings (budget issues, timeline issues)
      conflictWarnings: conflictWarnings,

      // User's selected language for AI responses
      userLanguage: userLanguage,

      // User's AI personalization preferences
      userPersonalization: {
        aboutYou: aiSettings?.aboutYou || '',
        responseStyle: aiSettings?.responseStyle || '',
      },

      // Auto-translate estimates to English (for PT/ES users)
      autoTranslateEstimates: autoTranslateEstimates && userLanguage !== 'en',

      // User business info
      businessInfo: userProfile.businessInfo || {
        name: 'Your Business',
        phone: '',
        email: '',
      },

      // User services and pricing (from new user_services system)
      services: serviceNames,
      pricing: formattedPricing,
      phasesTemplate: userProfile.phasesTemplate || null,

      // User profile (for contingency % and other settings)
      userProfile: userProfile,

      // Pricing intelligence (for smart pricing: services → history → contingency)
      pricingHistory: pricingHistory || { recentJobs: [], corrections: [], byService: {}, totalEntries: 0 },

      // Subcontractor contacts (for reference, not used in estimate calculations)
      subcontractorQuotes: subcontractorQuotes || {},

      // Data from database
      projects: projects || [],
      estimates: estimates || [],
      invoices: invoices || [],
      contractDocuments: contractDocuments || [],
      workers: workers || [],

      // Clients derived from projects (for AI to look up client info by name)
      // Extract client name from project name if client field is empty (pattern: "ClientName - Description")
      clients: (projects || []).map(p => {
        // Try to extract client name from project name if client field is empty
        let clientName = p.client;
        if (!clientName && p.name && p.name.includes(' - ')) {
          clientName = p.name.split(' - ')[0].trim();
        }
        return {
          name: clientName,
          phone: p.clientPhone,
          email: p.clientEmail,
          address: p.location,  // Use location field for address
          projectId: p.id,
          projectName: p.name,
        };
      }).filter(c => c.name),
      scheduleEvents: convertEventsToLocalTime(scheduleEvents || []), // Owner's personal calendar events (converted to local time)
      workSchedules: workSchedules || [], // Worker project assignments (today)
      clockedInToday: clockedInToday || [], // Workers currently clocked in TODAY
      completedShiftsToday: completedShiftsToday || [], // Workers who completed their shifts today (clocked in AND out)
      staleClockIns: staleClockIns || [], // Workers with forgotten clock-outs from previous days

      // Calculated statistics
      stats: {
        activeProjects: activeProjects.length,
        completedThisMonth: completedThisMonth.length,
        totalWorkers: activeWorkers.length,
        workersScheduledToday: workersScheduledToday,

        // Financial calculations
        totalIncomeCollected: projects.reduce((sum, p) => sum + (p.incomeCollected || 0), 0),
        totalExpenses: projects.reduce((sum, p) => sum + (p.expenses || 0), 0),
        totalProfit: projects.reduce((sum, p) => sum + ((p.incomeCollected || 0) - (p.expenses || 0)), 0),
        totalContractValue: projects.reduce((sum, p) => sum + (p.contractAmount || p.budget || 0), 0),
        pendingCollection: projects.reduce((sum, p) => sum + ((p.contractAmount || p.budget || 0) - (p.incomeCollected || 0)), 0),

        // Legacy fields (for backward compatibility)
        monthlyIncome: projects.reduce((sum, p) => sum + (p.incomeCollected || 0), 0),
        monthlyBudget: projects.reduce((sum, p) => sum + (p.contractAmount || p.budget || 0), 0),
        pendingPayments: projects.reduce((sum, p) => sum + ((p.contractAmount || p.budget || 0) - (p.incomeCollected || 0)), 0),
      },
    };
  } catch (error) {
    logger.error('Error building agent context:', error);
    const fallbackNow = new Date();
    const fallbackLocalDate = `${fallbackNow.getFullYear()}-${String(fallbackNow.getMonth() + 1).padStart(2, '0')}-${String(fallbackNow.getDate()).padStart(2, '0')}`;
    return {
      currentDate: fallbackLocalDate,
      currentDateTime: fallbackNow.toISOString(),
      userLanguage: 'en', // Default to English in fallback
      userRole: 'contractor', // Default role in fallback
      isOwnerMode: false,
      isSupervisorMode: false,
      ownerInfo: null,
      companyHierarchy: null,
      userPersonalization: { aboutYou: '', responseStyle: '' }, // Empty personalization in fallback
      businessInfo: { name: 'Your Business', phone: '', email: '' },
      services: [],
      pricing: {},
      phasesTemplate: null,
      userProfile: null,
      pricingHistory: { recentJobs: [], corrections: [], byService: {}, totalEntries: 0 },
      subcontractorQuotes: {},
      projects: [],
      estimates: [],
      invoices: [],
      workers: [],
      scheduleEvents: [],
      workSchedules: [],
      clockedInToday: [],
      completedShiftsToday: [],
      staleClockIns: [],
      stats: {
        activeProjects: 0,
        completedThisMonth: 0,
        totalWorkers: 0,
        workersScheduledToday: 0,
        totalIncomeCollected: 0,
        totalExpenses: 0,
        totalProfit: 0,
        totalContractValue: 0,
        pendingCollection: 0,
        monthlyIncome: 0,
        monthlyBudget: 0,
        pendingPayments: 0,
      },
    };
  }
};

/**
 * OPTIMIZED: Fetches only the data required by a specific agent.
 * This dramatically reduces latency for fast-routed requests.
 *
 * @param {string} agentName - The name of the agent (e.g., 'WorkersSchedulingAgent')
 * @returns {Promise<object>} - Context object with only the required data
 */
export const fetchAgentSpecificContext = async (agentName) => {
  const { getUserProfile, getUserServices, fetchProjects, fetchEstimates, fetchInvoices, fetchContractDocuments, fetchWorkers, fetchScheduleEvents, fetchWorkSchedules, getClockedInWorkersToday, getStaleClockIns, getCompletedShiftsToday } = require('../../../utils/storage');
  const { getClockedInSupervisorsToday, getCompletedSupervisorShiftsToday } = require('../../../utils/storage/timeTracking');
  const { getPricingHistory } = require('../../aiService');
  const { getSubcontractorQuotesGroupedByTrade } = require('../../../utils/storage/workers');
  const { getSelectedLanguage, getAISettings, getAutoTranslateEstimates } = require('../../../utils/storage');

  const startTime = Date.now();
  const requirements = AGENT_DATA_REQUIREMENTS[agentName] || [];

  logger.debug(`⚡ [AgentContext] Fetching context for ${agentName}: [${requirements.join(', ')}]`);

  try {
    // Always fetch base context (fast, cached)
    const userProfile = await getCached('userProfile', getUserProfile);
    const userId = userProfile?.id;
    const userLanguage = await getSelectedLanguage() || 'en';
    const aiSettings = await getAISettings();
    const autoTranslateEstimates = await getAutoTranslateEstimates();

    // Get date info
    const now = new Date();
    const localDateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDateString = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    // Date range for schedule events
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 2);
    farFuture.setHours(23, 59, 59, 999);

    // Build parallel fetch array based on requirements
    const fetchPromises = [];
    const fetchKeys = [];

    if (requirements.includes('userServices')) {
      fetchKeys.push('userServices');
      fetchPromises.push(getUserServices());
    }
    if (requirements.includes('projects')) {
      fetchKeys.push('projects');
      fetchPromises.push(fetchProjects());
    }
    if (requirements.includes('estimates')) {
      fetchKeys.push('estimates');
      fetchPromises.push(fetchEstimates());
    }
    if (requirements.includes('invoices')) {
      fetchKeys.push('invoices');
      fetchPromises.push(fetchInvoices());
    }
    if (requirements.includes('contractDocuments')) {
      fetchKeys.push('contractDocuments');
      fetchPromises.push(fetchContractDocuments());
    }
    if (requirements.includes('workers')) {
      fetchKeys.push('workers');
      fetchPromises.push(fetchWorkers());
    }
    if (requirements.includes('scheduleEvents')) {
      fetchKeys.push('scheduleEvents');
      fetchPromises.push(fetchScheduleEvents(today.toISOString(), farFuture.toISOString()));
    }
    if (requirements.includes('workSchedules')) {
      fetchKeys.push('workSchedules');
      fetchPromises.push(fetchWorkSchedules(today.toISOString().split('T')[0], today.toISOString().split('T')[0]));
    }
    if (requirements.includes('clockedInToday')) {
      fetchKeys.push('clockedInToday');
      // Fetch both workers and supervisors clocked in today
      fetchPromises.push(
        Promise.all([getClockedInWorkersToday(), getClockedInSupervisorsToday()])
          .then(([workers, supervisors]) => [...(workers || []), ...(supervisors || [])])
      );
    }
    if (requirements.includes('staleClockIns')) {
      fetchKeys.push('staleClockIns');
      fetchPromises.push(getStaleClockIns());
    }
    if (requirements.includes('completedShiftsToday')) {
      fetchKeys.push('completedShiftsToday');
      // Fetch both workers and supervisors completed shifts today
      fetchPromises.push(
        Promise.all([getCompletedShiftsToday(), getCompletedSupervisorShiftsToday()])
          .then(([workers, supervisors]) => [...(workers || []), ...(supervisors || [])])
      );
    }
    if (requirements.includes('pricingHistory')) {
      fetchKeys.push('pricingHistory');
      fetchPromises.push(userId ? getPricingHistory(userId) : Promise.resolve({ recentJobs: [], byService: {}, corrections: [], totalEntries: 0 }));
    }
    if (requirements.includes('subcontractorQuotes')) {
      fetchKeys.push('subcontractorQuotes');
      fetchPromises.push(getSubcontractorQuotesGroupedByTrade());
    }
    if (requirements.includes('phasesTemplate')) {
      // phasesTemplate comes from userProfile, already have it
      fetchKeys.push('phasesTemplate');
      fetchPromises.push(Promise.resolve(userProfile.phasesTemplate || null));
    }
    if (requirements.includes('constructionKnowledge')) {
      // Fetch construction knowledge graph data for intelligent project creation
      fetchKeys.push('constructionKnowledge');
      const { getAllProjectTypes, getTasksForProjectType, getSchedulingConstraints } = require('../../../utils/constructionKnowledge');
      fetchPromises.push(
        Promise.all([
          getAllProjectTypes(),
          getTasksForProjectType('bathroom'), // Pre-fetch common project types
          getTasksForProjectType('kitchen'),
          getSchedulingConstraints()
        ]).then(([projectTypes, bathroomTasks, kitchenTasks, constraints]) => ({
          projectTypes: projectTypes || [],
          tasksByCategory: {
            bathroom: bathroomTasks || [],
            kitchen: kitchenTasks || [],
          },
          constraints: constraints || []
        })).catch(err => {
          logger.debug('[AgentContext] Construction knowledge not available:', err.message);
          return null; // Return null if tables don't exist yet
        })
      );
    }

    if (requirements.includes('checklistHistory')) {
      // Fetch owner's past checklist templates so AI can suggest reusing them
      fetchKeys.push('checklistHistory');
      const { supabase } = require('../../../lib/supabase');
      fetchPromises.push(
        Promise.all([
          supabase.rpc('get_checklist_history', { p_owner_id: userId }).then(r => r.data),
          supabase.rpc('get_labor_role_history', { p_owner_id: userId }).then(r => r.data),
        ]).then(([checklistItems, laborRoles]) => ({
          checklistItems: checklistItems || [],
          laborRoles: laborRoles || [],
        })).catch(async () => {
          // Fallback: direct queries if RPCs don't exist
          try {
            const { data: items } = await supabase
              .from('daily_checklist_templates')
              .select('title, item_type, quantity_unit, requires_photo')
              .eq('owner_id', userId)
              .eq('is_active', true)
              .order('created_at', { ascending: false })
              .limit(30);

            const { data: roles } = await supabase
              .from('labor_role_templates')
              .select('role_name, default_quantity')
              .eq('owner_id', userId)
              .eq('is_active', true)
              .order('created_at', { ascending: false })
              .limit(15);

            // Deduplicate by title/role_name and count frequency
            const itemMap = {};
            (items || []).forEach(i => {
              const key = i.title.toLowerCase();
              if (!itemMap[key]) itemMap[key] = { ...i, times_used: 0 };
              itemMap[key].times_used++;
            });
            const roleMap = {};
            (roles || []).forEach(r => {
              const key = r.role_name.toLowerCase();
              if (!roleMap[key]) roleMap[key] = { ...r, times_used: 0 };
              roleMap[key].times_used++;
            });

            return {
              checklistItems: Object.values(itemMap).sort((a, b) => b.times_used - a.times_used).slice(0, 20),
              laborRoles: Object.values(roleMap).sort((a, b) => b.times_used - a.times_used).slice(0, 10),
            };
          } catch (e) {
            logger.debug('[AgentContext] Checklist history not available:', e.message);
            return { checklistItems: [], laborRoles: [] };
          }
        })
      );
    }

    if (requirements.includes('existingSchedules')) {
      // Fetch upcoming visits grouped by day/time for conflict detection
      fetchKeys.push('existingSchedules');
      const { supabase: sb } = require('../../../lib/supabase');
      fetchPromises.push(
        (async () => {
          try {
            const today = new Date().toISOString().split('T')[0];
            const fourWeeks = new Date();
            fourWeeks.setDate(fourWeeks.getDate() + 28);
            const endDate = fourWeeks.toISOString().split('T')[0];

            const { data: visits } = await sb
              .from('service_visits')
              .select('scheduled_date, scheduled_time, service_location_id, service_plans!inner(name)')
              .gte('scheduled_date', today)
              .lte('scheduled_date', endDate)
              .eq('status', 'scheduled')
              .order('scheduled_date', { ascending: true })
              .limit(100);

            if (!visits || visits.length === 0) return [];

            // Summarize by day-of-week + time
            const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const summary = {};
            visits.forEach(v => {
              const d = new Date(v.scheduled_date + 'T12:00:00');
              const dayName = DAY_NAMES[d.getDay()];
              const time = v.scheduled_time || 'unset';
              const key = `${dayName} ${time}`;
              if (!summary[key]) summary[key] = { day: dayName, time, plans: new Set(), count: 0 };
              summary[key].plans.add(v.service_plans?.name || 'Unknown');
              summary[key].count++;
            });

            return Object.values(summary).map(s => ({
              day: s.day,
              time: s.time,
              plans: [...s.plans],
              visit_count: s.count,
            }));
          } catch (e) {
            logger.debug('[AgentContext] Existing schedules not available:', e.message);
            return [];
          }
        })()
      );
    }

    // Execute all required fetches in parallel
    const results = await Promise.all(fetchPromises);

    // Map results to keys
    const data = {};
    fetchKeys.forEach((key, index) => {
      data[key] = results[index];
    });

    // Convert schedule events to local time if present
    const convertEventsToLocalTime = (events) => {
      return (events || []).map(event => {
        const localEvent = { ...event };
        if (event.start_datetime) {
          const date = new Date(event.start_datetime);
          localEvent.start_datetime = date.toLocaleString('sv-SE').replace(' ', 'T');
        }
        if (event.end_datetime) {
          const date = new Date(event.end_datetime);
          localEvent.end_datetime = date.toLocaleString('sv-SE').replace(' ', 'T');
        }
        return localEvent;
      });
    };

    // Format pricing if userServices fetched
    let formattedPricing = {};
    let serviceNames = [];
    if (data.userServices) {
      data.userServices.forEach(service => {
        const categoryName = service.service_categories?.name || 'Unknown Service';
        serviceNames.push(categoryName);
        if (service.pricing && Object.keys(service.pricing).length > 0) {
          formattedPricing[categoryName] = {};
          Object.entries(service.pricing).forEach(([itemId, itemData]) => {
            const itemName = itemData.name || itemId;
            formattedPricing[categoryName][itemName] = {
              price: itemData.price,
              unit: itemData.unit
            };
          });
        }
      });
    }

    // Calculate stats if projects fetched
    let stats = {};
    if (data.projects) {
      const projects = data.projects;
      const activeProjects = projects.filter(p => ['active', 'on-track', 'behind', 'over-budget'].includes(p.status));
      const activeWorkers = (data.workers || []).filter(w => w.status === 'active');
      const workersScheduledToday = new Set((data.workSchedules || []).map(ws => ws.worker_id)).size;

      stats = {
        activeProjects: activeProjects.length,
        totalWorkers: activeWorkers.length,
        workersScheduledToday: workersScheduledToday,
        totalIncomeCollected: projects.reduce((sum, p) => sum + (p.incomeCollected || 0), 0),
        totalExpenses: projects.reduce((sum, p) => sum + (p.expenses || 0), 0),
        totalProfit: projects.reduce((sum, p) => sum + ((p.incomeCollected || 0) - (p.expenses || 0)), 0),
        totalContractValue: projects.reduce((sum, p) => sum + (p.contractAmount || p.budget || 0), 0),
        pendingCollection: projects.reduce((sum, p) => sum + ((p.contractAmount || p.budget || 0) - (p.incomeCollected || 0)), 0),
      };
    }

    // Derive clients from projects if available
    let clients = [];
    if (data.projects) {
      clients = data.projects.map(p => {
        let clientName = p.client;
        if (!clientName && p.name && p.name.includes(' - ')) {
          clientName = p.name.split(' - ')[0].trim();
        }
        return {
          name: clientName,
          phone: p.clientPhone,
          email: p.clientEmail,
          address: p.location,
          projectId: p.id,
          projectName: p.name,
        };
      }).filter(c => c.name);
    }

    const latency = Date.now() - startTime;
    logger.debug(`⚡ [AgentContext] Fetched ${fetchKeys.length} data sources in ${latency}ms (vs 13 for full context)`);

    // Get learned facts from long-term memory for personalized responses
    const learnedFacts = memoryService.getMemoriesForPrompt('');

    // Proactive conflict/issue detection across projects (if loaded)
    let conflictWarnings = '';
    if (data.projects?.length) {
      const detectedConflicts = [];
      const currentDateObj = new Date(localDateString);
      data.projects.forEach(project => {
        const budgetIssues = detectBudgetIssues(project);
        const timelineIssues = detectTimelineIssues(project, currentDateObj);
        if (budgetIssues.length) {
          detectedConflicts.push(...budgetIssues.map(i => ({ ...i, projectName: project.name })));
        }
        if (timelineIssues.length) {
          detectedConflicts.push(...timelineIssues.map(i => ({ ...i, projectName: project.name })));
        }
      });
      // Format high-severity conflicts for prompt injection
      conflictWarnings = formatConflictsForPrompt(
        detectedConflicts.filter(c => c.severity === 'critical' || c.severity === 'high'),
        { maxItems: 5 }
      );
    }

    return {
      currentDate: localDateString,
      yesterdayDate: yesterdayDateString,
      currentDateTime: now.toISOString(),
      // Learned facts from long-term memory (for personalized AI responses)
      learnedFacts: learnedFacts,
      // Proactive conflict warnings (budget issues, timeline issues)
      conflictWarnings: conflictWarnings,
      userLanguage: userLanguage,
      userPersonalization: {
        aboutYou: aiSettings?.aboutYou || '',
        responseStyle: aiSettings?.responseStyle || '',
      },
      autoTranslateEstimates: autoTranslateEstimates && userLanguage !== 'en',
      businessInfo: userProfile.businessInfo || { name: 'Your Business', phone: '', email: '' },
      services: serviceNames,
      pricing: formattedPricing,
      phasesTemplate: data.phasesTemplate || userProfile.phasesTemplate || null,
      userProfile: userProfile,
      pricingHistory: data.pricingHistory || { recentJobs: [], corrections: [], byService: {}, totalEntries: 0 },
      subcontractorQuotes: data.subcontractorQuotes || {},
      projects: data.projects || [],
      estimates: data.estimates || [],
      invoices: data.invoices || [],
      contractDocuments: data.contractDocuments || [],
      workers: data.workers || [],
      clients: clients,
      scheduleEvents: convertEventsToLocalTime(data.scheduleEvents),
      workSchedules: data.workSchedules || [],
      clockedInToday: data.clockedInToday || [],
      completedShiftsToday: data.completedShiftsToday || [],
      staleClockIns: data.staleClockIns || [],
      stats: stats,
      // Construction knowledge graph for intelligent project creation
      constructionKnowledge: data.constructionKnowledge || null,
    };
  } catch (error) {
    logger.error('Error in fetchAgentSpecificContext:', error);
    // Fall back to full context on error
    return buildInitialContext();
  }
};
