/**
 * AgentContext - Builds initial context for all agents
 * This is the "long-term memory" from the database
 */

// Smart caching layer for static/semi-static data
const contextCache = {
  userProfile: { data: null, timestamp: 0, ttl: 300000 }, // 5 minutes
  pricing: { data: null, timestamp: 0, ttl: 600000 }, // 10 minutes
  phasesTemplate: { data: null, timestamp: 0, ttl: 600000 }, // 10 minutes
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
  const { getUserProfile, getUserServices, fetchProjects, fetchEstimates, fetchInvoices, fetchContractDocuments, fetchWorkers, fetchScheduleEvents, fetchWorkSchedules, getClockedInWorkersToday, getStaleClockIns } = require('../../../utils/storage');

  try {
    // Get date range for schedule events (all upcoming events)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 2); // 2 years ahead should be enough
    farFuture.setHours(23, 59, 59, 999);

    // Parallel fetch for speed (Promise.all instead of sequential awaits)
    const [userProfile, userServices, projects, estimates, invoices, contractDocuments, workers, scheduleEvents, workSchedules, clockedInToday, staleClockIns] = await Promise.all([
      getCached('userProfile', getUserProfile),
      getUserServices(), // Get services from new system
      fetchProjects(), // Projects change frequently, always fetch fresh
      fetchEstimates(),
      fetchInvoices(),
      fetchContractDocuments(),
      fetchWorkers(), // Fetch all workers
      fetchScheduleEvents(today.toISOString(), farFuture.toISOString()), // All upcoming schedule events (no limit)
      fetchWorkSchedules(today.toISOString().split('T')[0], today.toISOString().split('T')[0]), // Today's work schedules
      getClockedInWorkersToday(), // Workers currently clocked in today
      getStaleClockIns() // Workers with forgotten clock-outs from previous days
    ]);

    console.log('📊 AI Context: Projects:', projects?.length || 0);

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

    return {
      currentDate: localDateString, // Local date in YYYY-MM-DD format for accurate date parsing
      yesterdayDate: yesterdayDateString, // Yesterday's date pre-calculated
      currentDateTime: now.toISOString(), // Full ISO timestamp if needed

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

      // Data from database
      projects: projects || [],
      estimates: estimates || [],
      invoices: invoices || [],
      contractDocuments: contractDocuments || [],
      workers: workers || [],
      scheduleEvents: convertEventsToLocalTime(scheduleEvents || []), // Owner's personal calendar events (converted to local time)
      workSchedules: workSchedules || [], // Worker project assignments (today)
      clockedInToday: clockedInToday || [], // Workers currently clocked in TODAY
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
    console.error('Error building agent context:', error);
    const fallbackNow = new Date();
    const fallbackLocalDate = `${fallbackNow.getFullYear()}-${String(fallbackNow.getMonth() + 1).padStart(2, '0')}-${String(fallbackNow.getDate()).padStart(2, '0')}`;
    return {
      currentDate: fallbackLocalDate,
      currentDateTime: fallbackNow.toISOString(),
      businessInfo: { name: 'Your Business', phone: '', email: '' },
      services: [],
      pricing: {},
      phasesTemplate: null,
      projects: [],
      estimates: [],
      invoices: [],
      workers: [],
      scheduleEvents: [],
      workSchedules: [],
      clockedInToday: [],
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
