/**
 * EstimateInvoiceAgent.js (Updated) - Handles estimate and invoice tasks.
 */

import { BaseWorkerAgent } from './core/BaseWorkerAgent';
import { getEstimateInvoicePrompt } from './prompts/estimateInvoicePrompt';

class EstimateInvoiceAgent extends BaseWorkerAgent {
  constructor() {
    super('EstimateInvoiceAgent', getEstimateInvoicePrompt);
  }
}

export default EstimateInvoiceAgent;
