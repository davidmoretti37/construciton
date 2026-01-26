/**
 * FinancialAgent.js (Updated) - Handles financial tasks.
 */

import { BaseWorkerAgent } from './core/BaseWorkerAgent';
import { getFinancialPrompt } from './prompts/financialPrompt';

class FinancialAgent extends BaseWorkerAgent {
  constructor() {
    // Pass the agent name and the prompt provider function to the base class.
    super('FinancialAgent', getFinancialPrompt);
  }

  // The processStreaming method is inherited from BaseWorkerAgent
  // and does not need to be overridden unless custom logic is required.
}

export default FinancialAgent;
