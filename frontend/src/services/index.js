/**
 * Services Barrel Export
 *
 * This file serves as a unified export point for all services.
 * During refactoring, functions are gradually moved from storage.js to individual service files.
 *
 * Migration Status:
 * ✅ uploadService - COMPLETE (1 function)
 * ✅ conversationService - COMPLETE (4 functions)
 * ✅ userService - COMPLETE (21 functions)
 * ✅ projectService - COMPLETE (14 functions)
 * ⏳ estimateService - PENDING (8 functions)
 * ⏳ invoiceService - PENDING (11 functions)
 * ⏳ phaseService - PENDING (19 functions)
 * ⏳ workerService - PENDING (15 functions)
 * ⏳ timeTrackingService - PENDING (9 functions)
 * ⏳ transactionService - PENDING (11 functions)
 * ⏳ subcontractorService - PENDING (8 functions)
 * ⏳ scheduleService - PENDING (8 functions)
 *
 * Progress: 40/129 functions migrated (31%)
 */

// === COMPLETED SERVICES ===
export * from './uploadService';
export * from './conversationService';
export * from './userService';
export * from './projectService';

// === LEGACY EXPORTS (from storage.js) ===
// These will be gradually moved to their respective service files
export * from '../utils/storage';
