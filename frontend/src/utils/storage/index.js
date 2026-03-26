/**
 * Storage Module Index
 *
 * This file re-exports all storage functions for backward compatibility.
 * Existing imports like `import { fetchProjects } from '../utils/storage'`
 * will continue to work.
 *
 * Domain-specific modules:
 * - auth.js: Authentication helpers (getCurrentUserId, DEFAULT_PROFILE)
 * - userProfile.js: User profile, services, onboarding
 * - projects.js: Project CRUD operations
 * - communication.js: SMS/WhatsApp messaging
 * - estimates.js: Estimate CRUD and conversion
 * - invoices.js: Invoice management and contract documents
 * - workers.js: Worker CRUD, assignments, invites
 * - timeTracking.js: Clock in/out, timesheets, payments
 * - dailyReports.js: Daily reports and photos
 * - transactions.js: Financial transactions and analytics
 * - fileStorage.js: Photo/file uploads
 * - projectPhases.js: Phase management, tasks, progress
 * - schedules.js: Calendar events, work schedules, crews
 */

// Authentication
export { getCurrentUserId, DEFAULT_PROFILE, getCurrentUserContext } from './auth';

// User Profile & Services
export {
  getUserProfile,
  getFullUserProfile,
  updateUserProfile,
  saveUserProfile,
  updateBusinessInfo,
  isOnboarded,
  hasUserAcknowledgedInviteInfo,
  setInviteInfoAcknowledged,
  getUserServices,
  updateUserServices,
  resetUserProfile,
  updateTradePricing,
  getSelectedTrades,
  updateSelectedTrades,
  saveLanguage,
  getSelectedLanguage,
  hasSelectedLanguage,
  getAutoTranslateEstimates,
  updateAutoTranslateEstimates,
  getUserTrades,
  getDefaultTrades,
  syncTradesToPricing,
  clearNotificationToken,
  getAISettings,
  updateAISettings,
  updateEstimateDefaultNotes,
  updateSubcontractorNotes,
  updateAutoSuggestSettings,
  getServiceCategories,
} from './userProfile';

// Projects
export {
  saveProject,
  fetchProjects,
  fetchProjectsBasic,
  getProject,
  updateProject,
  deleteProject,
  transformProject,
  updateProjectWorkingDays,
  getProjectWorkingDays,
  getProjectNonWorkingDates,
  addNonWorkingDate,
  removeNonWorkingDate,
  updateNonWorkingDates,
  // Owner mode functions
  fetchProjectsForOwner,
  assignProjectToSupervisor,
} from './projects';

// Communication
export {
  checkPhonePermissions,
  sendSMS,
  openWhatsApp,
  shareViaWhatsApp,
} from './communication';

// Estimates
export {
  saveEstimate,
  updateEstimate,
  fetchEstimates,
  getEstimate,
  getEstimateByProjectName,
  fetchEstimatesByProjectId,
  updateEstimateStatus,
  deleteEstimate,
  createInvoiceFromEstimate,
  addEstimateToProject,
  createProjectFromEstimate,
  // Owner mode function
  fetchEstimatesForOwner,
} from './estimates';

// Invoices & Contract Documents
export {
  saveInvoice,
  fetchInvoices,
  getInvoice,
  markInvoiceAsPaid,
  updateInvoicePDF,
  updateInvoice,
  deleteInvoice,
  recordInvoicePayment,
  voidInvoice,
  updateInvoiceTemplate,
  fetchContractDocuments,
  uploadContractDocument,
  // Owner mode function
  fetchInvoicesForOwner,
} from './invoices';

// Workers
export {
  createWorker,
  updateWorker,
  fetchWorkers,
  getWorker,
  deleteWorker,
  getAverageWorkerRate,
  assignWorkerToProject,
  assignWorkerToPhase,
  removeWorkerFromProject,
  removeWorkerFromPhase,
  getProjectWorkers,
  assignWorkerToServicePlan,
  removeWorkerFromServicePlan,
  getServicePlanWorkers,
  getWorkerAssignmentCounts,
  getPhaseWorkers,
  getWorkerAssignments,
  getPendingInvites,
  acceptInvite,
  rejectInvite,
  saveSubcontractorQuote,
  getAllSubcontractorQuotes,
  getSubcontractorQuotesByTrade,
  getSubcontractorQuotesGroupedByTrade,
  updateSubcontractorQuote,
  togglePreferredStatus,
  deleteSubcontractorQuote,
  getPreferredQuoteForTrade,
  // Owner mode functions
  getSupervisorsForOwner,
  updateSupervisorProfile,
  removeSupervisor,
  fetchWorkersForOwner,
  getClockedInWorkersTodayForOwner,
  getCompanyHierarchy,
} from './workers';

// Time Tracking
export {
  clockIn,
  clockOut,
  getActiveClockIn,
  getClockedInWorkersToday,
  getStaleClockIns,
  getCompletedShiftsToday,
  getWorkerTimesheet,
  getWorkerProjectHours,
  getTodaysWorkersSchedule,
  getWorkerClockInHistory,
  getWorkerStats,
  calculateWorkerPaymentForPeriod,
  editTimeEntry,
  editSupervisorTimeEntry,
  createManualTimeEntry,
  deleteTimeEntry,
  startWorkerBreak,
  endWorkerBreak,
  remoteClockOutWorker,
  remoteClockOutSupervisor,
  checkForgottenClockOuts,
  sendForgottenClockOutNotifications,
} from './timeTracking';

// Daily Reports
export {
  saveDailyReport,
  fetchDailyReportById,
  fetchDailyReports,
  fetchProjectPhotosByPhase,
  fetchWorkerDailyReports,
  fetchPhotosWithFilters,
  fetchDailyReportsWithFilters,
} from './dailyReports';

// Transactions & Financial Analytics
export {
  addProjectTransaction,
  getProjectTransactions,
  updateTransaction,
  deleteTransaction,
  getProjectTransactionSummary,
  syncProjectTotalsFromTransactions,
  getTransactionsByCategory,
  getTransactionsByDateRange,
  getTransactionsByPaymentMethod,
  calculateLaborCostsFromTimeTracking,
  getSpendingTrendsByCategory,
  detectCostOverruns,
  predictCashFlow,
} from './transactions';

// File Storage
export { uploadPhoto } from './fileStorage';

// Project Phases & Progress
export {
  saveProjectPhases,
  fetchProjectPhases,
  updatePhaseProgress,
  extendPhaseTimeline,
  calculatePhaseStatus,
  updatePhaseDates,
  startPhase,
  completePhase,
  addTaskToPhase,
  updatePhaseTask,
  markTaskComplete,
  calculatePhaseProgressFromTasks,
  calculateActualProgress,
  calculateVelocity,
  calculateEstimatedCompletion,
  updateProjectProgress,
  checkAndStartScheduledProjects,
  resetProjectProgressToAutomatic,
  createWorkerTasksFromPhases,
  redistributeAllTasksWithAI,
} from './projectPhases';

// Schedules, Events, Crews
export {
  createScheduleEvent,
  deleteScheduleEvent,
  fetchScheduleEvents,
  updateScheduleEvent,
  fetchActiveProjectsForDate,
  fetchWorkSchedules,
  createWorkSchedule,
  updateWorkSchedule,
  deleteWorkSchedule,
  updatePhaseTemplate,
  addServiceToTrade,
  removeServiceFromTrade,
  updateServicePricing,
  createRecurringEvent,
  updateRecurringEvent,
  deleteRecurringEvent,
  setWorkerAvailability,
  setWorkerPTO,
  removeWorkerAvailability,
  getWorkerAvailability,
  createCrew,
  getCrew,
  updateCrew,
  deleteCrew,
  fetchCrews,
  createShiftTemplate,
  applyShiftTemplate,
  deleteShiftTemplate,
  fetchShiftTemplates,
  swapWorkerShifts,
  findReplacementWorkers,
} from './schedules';

// Worker Tasks (Daily To-Do System)
export {
  createTask,
  fetchTasksForProject,
  fetchTasksForDate,
  fetchTasksForDateRange,
  fetchTasksForSupervisor,
  fetchTasksForSupervisorDateRange,
  regenerateProjectSchedule,
  fetchUpcomingTasks,
  completeTask,
  uncompleteTask,
  calculateProjectProgressFromTasks,
  updateProjectProgressFromTasks,
  markTaskIncomplete,
  getOverdueTasks,
  updateTask,
  deleteTask,
  fetchAllTasks,
  fetchTasksForWorker,
  fetchTasksForWorkerDateRange,
  syncProjectTasksToCalendar,
  syncAllProjectTasksToCalendar,
  isWorkingDay,
  shiftDate,
  bulkShiftTasks,
  fetchTasksForSelection,
  recalculateTaskDatesForProject,
  redistributeTasksFromDayWithAI,
  restoreTasksToOriginalDay,
  moveTasksFromSpecificDate,
  restoreTasksToSpecificDate,
  // Date & validation utilities
  safeParseDateToObject,
  safeParseDateToString,
  validateWorkingDays,
} from './workerTasks';

// Project Documents
export {
  uploadProjectDocument,
  fetchProjectDocuments,
  updateDocumentVisibility,
  deleteProjectDocument,
} from './projectDocuments';
