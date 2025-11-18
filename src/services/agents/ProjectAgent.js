/**
 * ProjectAgent.js - Intelligent Project Creation with Phases
 *
 * This agent creates complete projects with phases, tasks, timeline, and budget.
 * It uses the contractor's phase template and pricing data to generate intelligent defaults.
 * Works exactly like EstimateInvoiceAgent but outputs project-preview instead of estimate-preview.
 */

import { BaseWorkerAgent } from './core/BaseWorkerAgent';
import { getProjectCreationPrompt } from './prompts/projectCreationPrompt';

class ProjectAgent extends BaseWorkerAgent {
  constructor() {
    super('ProjectAgent', getProjectCreationPrompt);
  }

  // The processStreaming method is inherited from BaseWorkerAgent
  // and does not need to be overridden unless custom logic is required.
}

export default ProjectAgent;
