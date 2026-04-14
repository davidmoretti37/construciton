/**
 * Pricing Intelligence Service
 *
 * Provides AI-powered pricing suggestions based on historical pricing data.
 * Learns from past projects, estimates, and invoices to suggest prices for new work.
 * Owner corrections are weighted 1.5x higher for more accurate future suggestions.
 */

import { getPricingHistory, savePricingHistory } from './aiService';
import { sendMessageToAI } from './aiService';
import { getCurrentUserId } from '../utils/storage';

/**
 * Gets a suggested price for work based on pricing history
 * @param {string} workDescription - Description of the work (e.g., "Interior painting 3 bedrooms")
 * @param {string} serviceType - Service type (e.g., "painting", "tile")
 * @param {object} options - Additional options
 * @param {number} options.quantity - Quantity if known
 * @param {string} options.unit - Unit type (sq ft, linear ft, etc.)
 * @returns {Promise<object>} - { suggestedPrice, explanation, confidence, similarJobs }
 */
export const getSuggestedPrice = async (workDescription, serviceType, options = {}) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return {
        suggestedPrice: null,
        explanation: 'Please log in to get pricing suggestions',
        confidence: 0,
        similarJobs: 0,
      };
    }

    // Fetch pricing history
    const history = await getPricingHistory(userId, serviceType);

    // If no history, return early
    if (!history.recentJobs || history.recentJobs.length === 0) {
      return {
        suggestedPrice: null,
        explanation: 'No pricing history yet. Complete some projects to get AI suggestions.',
        confidence: 0,
        similarJobs: 0,
      };
    }

    // Use AI to find similar items and calculate suggestion
    const prompt = `You are a pricing assistant for a construction contractor. Analyze the pricing history and suggest a price.

WORK TO PRICE:
- Description: "${workDescription}"
- Service Type: ${serviceType}
${options.quantity ? `- Quantity: ${options.quantity} ${options.unit || 'units'}` : ''}

PRICING HISTORY (sorted by relevance - corrections are pre-verified by owner):
${JSON.stringify(history.recentJobs.slice(0, 15), null, 2)}

OWNER CORRECTIONS (these are verified prices - weight 1.5x higher):
${JSON.stringify(history.corrections.slice(0, 5), null, 2)}

INSTRUCTIONS:
1. Find similar past work (match service type, keywords in description)
2. Weight corrections 1.5x higher than regular entries
3. Calculate a weighted average price
4. If quantity is provided, calculate total; otherwise suggest per-unit price

Return ONLY valid JSON:
{
  "suggestedPrice": <number - suggested price>,
  "pricePerUnit": <number or null - if applicable>,
  "unit": "<string or null - unit type>",
  "explanation": "<brief explanation, max 50 words>",
  "confidence": "<high|medium|low>",
  "similarJobs": <number of similar jobs found>
}`;

    const response = await sendMessageToAI(prompt, {}, [], prompt);

    // Parse the response
    if (typeof response === 'object') {
      return {
        suggestedPrice: response.suggestedPrice || null,
        pricePerUnit: response.pricePerUnit || null,
        unit: response.unit || null,
        explanation: response.explanation || 'Based on your pricing history',
        confidence: response.confidence || 'medium',
        similarJobs: response.similarJobs || 0,
      };
    }

    // Try to parse string response
    try {
      const parsed = JSON.parse(response);
      return {
        suggestedPrice: parsed.suggestedPrice || null,
        pricePerUnit: parsed.pricePerUnit || null,
        unit: parsed.unit || null,
        explanation: parsed.explanation || 'Based on your pricing history',
        confidence: parsed.confidence || 'medium',
        similarJobs: parsed.similarJobs || 0,
      };
    } catch {
      return {
        suggestedPrice: null,
        explanation: 'Could not generate suggestion',
        confidence: 'low',
        similarJobs: 0,
      };
    }
  } catch (error) {
    console.error('Error getting suggested price:', error);
    return {
      suggestedPrice: null,
      explanation: 'Error generating suggestion',
      confidence: 'low',
      similarJobs: 0,
    };
  }
};

/**
 * Records pricing from an estimate to the history
 * @param {object} estimate - Estimate object with items
 * @returns {Promise<void>}
 */
export const recordEstimatePricing = async (estimate) => {
  try {
    if (!estimate?.items || !Array.isArray(estimate.items)) {
      return;
    }

    for (const item of estimate.items) {
      // Calculate total amount - items use 'price' not 'pricePerUnit'
      const pricePerUnit = item.price || item.pricePerUnit || 0;
      const quantity = item.quantity || 0;
      const totalAmount = item.total || (quantity * pricePerUnit);

      // Skip if totalAmount is invalid (null, NaN, or 0)
      if (!totalAmount || isNaN(totalAmount)) {
        console.warn('Skipping pricing history - invalid totalAmount:', { item, totalAmount });
        continue;
      }

      await savePricingHistory({
        serviceType: item.serviceType || extractServiceType(item.description),
        workDescription: item.description,
        quantity: quantity,
        unit: item.unit,
        pricePerUnit: pricePerUnit,
        totalAmount: totalAmount,
        scopeKeywords: extractKeywords(item.description),
        sourceType: 'estimate',
        sourceId: estimate.id,
        projectName: estimate.project_name,
        isCorrection: false,
      });
    }
  } catch (error) {
    console.error('Error recording estimate pricing:', error);
  }
};

/**
 * Records pricing from a completed project
 * @param {object} project - Project object
 * @returns {Promise<void>}
 */
export const recordProjectPricing = async (project) => {
  try {
    if (!project?.contractAmount && !project?.contract_amount) {
      return;
    }

    await savePricingHistory({
      serviceType: project.serviceType || 'general',
      workDescription: project.task_description || project.taskDescription || project.name,
      totalAmount: project.contractAmount || project.contract_amount,
      scopeKeywords: extractKeywords(project.task_description || project.taskDescription || ''),
      sourceType: 'project',
      sourceId: project.id,
      projectName: project.name,
      isCorrection: false,
      workDate: project.end_date || project.endDate,
    });
  } catch (error) {
    console.error('Error recording project pricing:', error);
  }
};

/**
 * Records a pricing correction (when owner changes AI suggestion)
 * @param {object} correctionData - The corrected pricing data
 * @param {number} correctionData.originalSuggestion - What AI suggested
 * @param {number} correctionData.finalPrice - What owner set
 * @param {string} correctionData.workDescription - Description of work
 * @param {string} correctionData.serviceType - Service type
 * @returns {Promise<void>}
 */
export const recordPricingCorrection = async (correctionData) => {
  try {
    // Only record if the price was actually changed
    if (correctionData.originalSuggestion === correctionData.finalPrice) {
      return;
    }

    await savePricingHistory({
      serviceType: correctionData.serviceType,
      workDescription: correctionData.workDescription,
      quantity: correctionData.quantity,
      unit: correctionData.unit,
      pricePerUnit: correctionData.pricePerUnit,
      totalAmount: correctionData.finalPrice,
      scopeKeywords: extractKeywords(correctionData.workDescription),
      sourceType: 'correction',
      sourceId: correctionData.sourceId,
      projectName: correctionData.projectName,
      isCorrection: true, // This gets 1.5x weight
    });

  } catch (error) {
    console.error('Error recording pricing correction:', error);
  }
};

/**
 * Extracts keywords from a work description for similarity matching
 * @param {string} description - Work description
 * @returns {string[]} - Array of keywords
 */
const extractKeywords = (description) => {
  if (!description) return [];

  // Common construction keywords to look for
  const keywords = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2)
    .filter(word => !['the', 'and', 'for', 'with', 'this', 'that', 'from'].includes(word));

  return [...new Set(keywords)].slice(0, 10);
};

/**
 * Extracts service type from description if not provided
 * @param {string} description - Work description
 * @returns {string} - Service type
 */
export const extractServiceType = (description) => {
  if (!description) return 'general';

  const desc = description.toLowerCase();

  const serviceMap = {
    painting: ['paint', 'primer', 'coat', 'wall color'],
    tile: ['tile', 'grout', 'ceramic', 'porcelain', 'backsplash'],
    carpentry: ['wood', 'cabinet', 'trim', 'molding', 'door', 'frame'],
    plumbing: ['pipe', 'faucet', 'drain', 'toilet', 'sink', 'plumb'],
    electrical: ['wire', 'outlet', 'switch', 'light', 'electric', 'panel'],
    flooring: ['floor', 'hardwood', 'laminate', 'vinyl', 'carpet'],
    drywall: ['drywall', 'sheetrock', 'gypsum', 'wall repair'],
    roofing: ['roof', 'shingle', 'gutter', 'flashing'],
    hvac: ['hvac', 'heating', 'cooling', 'air condition', 'duct'],
    concrete: ['concrete', 'cement', 'slab', 'foundation'],
  };

  for (const [service, keywords] of Object.entries(serviceMap)) {
    if (keywords.some(keyword => desc.includes(keyword))) {
      return service;
    }
  }

  return 'general';
};

/**
 * Gets pricing insights for a service type
 * @param {string} serviceType - Service type to analyze
 * @returns {Promise<object>} - Pricing insights
 */
export const getPricingInsights = async (serviceType) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return null;
    }

    const history = await getPricingHistory(userId, serviceType);

    if (!history.recentJobs || history.recentJobs.length === 0) {
      return null;
    }

    const prices = history.recentJobs
      .filter(job => job.price_per_unit)
      .map(job => job.price_per_unit);

    if (prices.length === 0) {
      return null;
    }

    const sorted = [...prices].sort((a, b) => a - b);

    return {
      serviceType,
      totalJobs: history.totalEntries,
      averagePrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      minPrice: sorted[0],
      maxPrice: sorted[sorted.length - 1],
      medianPrice: sorted[Math.floor(sorted.length / 2)],
      correctionsCount: history.corrections.length,
    };
  } catch (error) {
    console.error('Error getting pricing insights:', error);
    return null;
  }
};

export default {
  getSuggestedPrice,
  recordEstimatePricing,
  recordProjectPricing,
  recordPricingCorrection,
  getPricingInsights,
  extractServiceType,
};
