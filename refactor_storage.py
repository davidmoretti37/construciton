#!/usr/bin/env python3
"""
Script to refactor storage.js into separate service modules
"""

# Function mapping: which service each function belongs to
FUNCTION_TO_SERVICE = {
    # User Service
    'getCurrentUserId': 'userService',
    'getUserProfile': 'userService',
    'saveUserProfile': 'userService',
    'updateBusinessInfo': 'userService',
    'updateProfitMargin': 'userService',
    'addTrade': 'userService',
    'removeTrade': 'userService',
    'updateTradePricing': 'userService',
    'completeOnboarding': 'userService',
    'isOnboarded': 'userService',
    'needsFeatureUpdate': 'userService',
    'markFeatureUpdateComplete': 'userService',
    'resetUserProfile': 'userService',
    'getItemPricing': 'userService',
    'getAllPricing': 'userService',
    'saveLanguage': 'userService',
    'getSelectedLanguage': 'userService',
    'hasSelectedLanguage': 'userService',
    'addServiceToTrade': 'userService',
    'removeServiceFromTrade': 'userService',
    'updateServicePricing': 'userService',

    # Project Service
    'saveProject': 'projectService',
    'fetchProjects': 'projectService',
    'getProject': 'projectService',
    'deleteProject': 'projectService',
    'transformScreenshotToProject': 'projectService',
    'fetchActiveProjectsForDate': 'projectService',
    'createProjectFromEstimate': 'projectService',
    'calculateActualProgress': 'projectService',
    'calculateVelocity': 'projectService',
    'calculateEstimatedCompletion': 'projectService',
    'updateProjectProgress': 'projectService',
    'resetProjectProgressToAutomatic': 'projectService',
    'checkAndStartScheduledProjects': 'projectService',
    'updateProjectPaymentStructure': 'projectService',

    # Estimate Service
    'saveEstimate': 'estimateService',
    'updateEstimate': 'estimateService',
    'fetchEstimates': 'estimateService',
    'getEstimate': 'estimateService',
    'getEstimateByProjectName': 'estimateService',
    'updateEstimateStatus': 'estimateService',
    'deleteEstimate': 'estimateService',
    'addEstimateToProject': 'estimateService',

    # Invoice Service
    'createInvoiceFromEstimate': 'invoiceService',
    'saveInvoice': 'invoiceService',
    'fetchInvoices': 'invoiceService',
    'getInvoice': 'invoiceService',
    'markInvoiceAsPaid': 'invoiceService',
    'updateInvoicePDF': 'invoiceService',
    'updateInvoiceTemplate': 'invoiceService',
    'updateInvoice': 'invoiceService',
    'deleteInvoice': 'invoiceService',
    'recordInvoicePayment': 'invoiceService',
    'voidInvoice': 'invoiceService',

    # Phase Service
    'saveProjectPhases': 'phaseService',
    'fetchProjectPhases': 'phaseService',
    'updatePhaseProgress': 'phaseService',
    'extendPhaseTimeline': 'phaseService',
    'calculatePhaseStatus': 'phaseService',
    'updatePhaseDates': 'phaseService',
    'startPhase': 'phaseService',
    'completePhase': 'phaseService',
    'addTaskToPhase': 'phaseService',
    'updatePhaseTask': 'phaseService',
    'markTaskComplete': 'phaseService',
    'calculatePhaseProgressFromTasks': 'phaseService',
    'saveDailyReport': 'phaseService',
    'fetchDailyReports': 'phaseService',
    'fetchWorkerDailyReports': 'phaseService',
    'savePhasePaymentAmount': 'phaseService',
    'validatePhasePayments': 'phaseService',
    'updatePhaseTemplate': 'phaseService',
    'getPhaseWorkers': 'phaseService',

    # Worker Service
    'createWorker': 'workerService',
    'updateWorker': 'workerService',
    'fetchWorkers': 'workerService',
    'getWorker': 'workerService',
    'deleteWorker': 'workerService',
    'assignWorkerToProject': 'workerService',
    'assignWorkerToPhase': 'workerService',
    'removeWorkerFromProject': 'workerService',
    'removeWorkerFromPhase': 'workerService',
    'getProjectWorkers': 'workerService',
    'getWorkerAssignments': 'workerService',
    'getWorkerStats': 'workerService',
    'getPendingInvites': 'workerService',
    'acceptInvite': 'workerService',
    'rejectInvite': 'workerService',

    # Time Tracking Service
    'clockIn': 'timeTrackingService',
    'clockOut': 'timeTrackingService',
    'getActiveClockIn': 'timeTrackingService',
    'getWorkerTimesheet': 'timeTrackingService',
    'getWorkerProjectHours': 'timeTrackingService',
    'getTodaysWorkersSchedule': 'timeTrackingService',
    'getWorkerClockInHistory': 'timeTrackingService',
    'calculateWorkerPaymentForPeriod': 'timeTrackingService',
    'calculateLaborCostsFromTimeTracking': 'timeTrackingService',

    # Transaction Service
    'addProjectTransaction': 'transactionService',
    'getProjectTransactions': 'transactionService',
    'updateTransaction': 'transactionService',
    'deleteTransaction': 'transactionService',
    'getProjectTransactionSummary': 'transactionService',
    'getTransactionsByCategory': 'transactionService',
    'getTransactionsByDateRange': 'transactionService',
    'getTransactionsByPaymentMethod': 'transactionService',
    'getSpendingTrendsByCategory': 'transactionService',
    'detectCostOverruns': 'transactionService',
    'predictCashFlow': 'transactionService',

    # Subcontractor Service
    'saveSubcontractorQuote': 'subcontractorService',
    'getAllSubcontractorQuotes': 'subcontractorService',
    'getSubcontractorQuotesByTrade': 'subcontractorService',
    'getSubcontractorQuotesGroupedByTrade': 'subcontractorService',
    'updateSubcontractorQuote': 'subcontractorService',
    'togglePreferredStatus': 'subcontractorService',
    'deleteSubcontractorQuote': 'subcontractorService',
    'getPreferredQuoteForTrade': 'subcontractorService',

    # Schedule Service
    'createScheduleEvent': 'scheduleService',
    'fetchScheduleEvents': 'scheduleService',
    'updateScheduleEvent': 'scheduleService',
    'deleteScheduleEvent': 'scheduleService',
    'fetchWorkSchedules': 'scheduleService',
    'createWorkSchedule': 'scheduleService',
    'updateWorkSchedule': 'scheduleService',
    'deleteWorkSchedule': 'scheduleService',

    # Upload Service (already created)
    'uploadPhoto': 'uploadService',

    # Conversation Service (already created)
    'fetchConversations': 'conversationService',
    'sendManualMessage': 'conversationService',
    'markConversationHandled': 'conversationService',
    'getUnhandledConversationCount': 'conversationService',
}

print("Refactoring plan created!")
print(f"Total functions to move: {len(FUNCTION_TO_SERVICE)}")
print("\nFunctions per service:")
service_counts = {}
for func, service in FUNCTION_TO_SERVICE.items():
    service_counts[service] = service_counts.get(service, 0) + 1

for service, count in sorted(service_counts.items(), key=lambda x: x[1], reverse=True):
    print(f"  {service}: {count} functions")
