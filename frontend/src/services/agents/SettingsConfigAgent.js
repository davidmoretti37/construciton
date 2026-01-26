/**
 * SettingsConfigAgent.js - System Configuration & Customization
 *
 * This agent manages the complete system configuration:
 * - Business information
 * - Phase templates
 * - Service catalog and pricing
 * - Profit margins
 * - Subcontractor quotes (GC mode)
 * - Invoice/contract templates
 * - Integration settings
 */

import { BaseWorkerAgent } from './core/BaseWorkerAgent';
import { getSettingsConfigPrompt } from './prompts/settingsConfigPrompt';

class SettingsConfigAgent extends BaseWorkerAgent {
  constructor() {
    super('SettingsConfigAgent', getSettingsConfigPrompt);
  }

  // The processStreaming method is inherited from BaseWorkerAgent
  // and does not need to be overridden unless custom logic is required.
}

export default SettingsConfigAgent;
