/**
 * DocumentAgent.js (Updated) - Handles document retrieval and general queries.
 */

import { BaseWorkerAgent } from './core/BaseWorkerAgent';
import { getDocumentPrompt } from './prompts/documentPrompt';

class DocumentAgent extends BaseWorkerAgent {
  constructor() {
    super('DocumentAgent', getDocumentPrompt);
  }
}

export default DocumentAgent;
