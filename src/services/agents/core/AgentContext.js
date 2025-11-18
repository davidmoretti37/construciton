/**
 * AgentContext - Builds initial context for all agents
 * This is the "long-term memory" from the database
 */

/**
 * Builds comprehensive initial context for agent processing
 * @returns {Promise<object>} - Context object with all relevant data
 */
export const buildInitialContext = async () => {
  // Import functions inside to avoid circular dependencies
  const { getUserProfile, fetchProjects, fetchEstimates, fetchInvoices } = require('../../../utils/storage');
  const { getTradeById } = require('../../../constants/trades');

  try {
    const userProfile = await getUserProfile();
    const projects = await fetchProjects();
    const estimates = await fetchEstimates();
    const invoices = await fetchInvoices();

    console.log('📊 AI Context: Projects:', projects?.length || 0);

    // Format pricing for AI readability
    const formattedPricing = {};
    if (userProfile.pricing) {
      userProfile.trades.forEach(tradeId => {
        const trade = getTradeById(tradeId);
        if (trade && userProfile.pricing[tradeId]) {
          formattedPricing[trade.name] = {};

          trade.pricingTemplate.forEach(item => {
            const priceData = userProfile.pricing[tradeId][item.id];
            if (priceData) {
              formattedPricing[trade.name][item.label] = {
                price: priceData.price,
                unit: priceData.unit
              };
            }
          });
        }
      });
    }

    // Calculate stats
    const activeProjects = projects.filter(p => ['active', 'on-track', 'behind', 'over-budget'].includes(p.status));
    const completedThisMonth = projects.filter(p => {
      if (p.status !== 'completed') return false;
      const completedDate = new Date(p.updatedAt);
      const now = new Date();
      return completedDate.getMonth() === now.getMonth() && completedDate.getFullYear() === now.getFullYear();
    });

    return {
      currentDate: new Date().toISOString(),

      // User business info
      businessInfo: userProfile.businessInfo || {
        name: 'Your Business',
        phone: '',
        email: '',
      },

      // User services and pricing
      services: userProfile.trades || [],
      pricing: formattedPricing,
      phasesTemplate: userProfile.phasesTemplate || null,

      // Data from database
      projects: projects || [],
      estimates: estimates || [],
      invoices: invoices || [],
      workers: [], // To be added later

      // Calculated statistics
      stats: {
        activeProjects: activeProjects.length,
        completedThisMonth: completedThisMonth.length,
        totalWorkers: 0,
        workersOnSiteToday: 0,

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
    return {
      currentDate: new Date().toISOString(),
      businessInfo: { name: 'Your Business', phone: '', email: '' },
      services: [],
      pricing: {},
      phasesTemplate: null,
      projects: [],
      estimates: [],
      invoices: [],
      workers: [],
      stats: {
        activeProjects: 0,
        completedThisMonth: 0,
        totalWorkers: 0,
        workersOnSiteToday: 0,
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
