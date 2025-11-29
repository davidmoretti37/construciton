/**
 * WorkersSchedulingAgent.js - Intelligent Workers & Scheduling Management
 *
 * This agent manages the entire workforce lifecycle:
 * - Worker CRUD operations (create, update, archive)
 * - Time tracking (clock in/out, history, hours calculation)
 * - Schedule events (owner's personal calendar)
 * - Work schedules (project/phase assignments)
 * - Daily reports (creation, queries, analysis)
 * - Performance analytics (attendance, labor costs, productivity)
 */

import { BaseWorkerAgent } from './core/BaseWorkerAgent';
import { getWorkersSchedulingPrompt } from './prompts/workersSchedulingPrompt';

class WorkersSchedulingAgent extends BaseWorkerAgent {
  constructor() {
    super('WorkersSchedulingAgent', getWorkersSchedulingPrompt);
  }

  // The processStreaming method is inherited from BaseWorkerAgent
  // and does not need to be overridden unless custom logic is required.
}

export default WorkersSchedulingAgent;
