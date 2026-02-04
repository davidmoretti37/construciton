/**
 * Service Discovery Service
 * Handles intelligent service search with AI-powered generation
 *
 * Flow:
 * 1. User types "pool cleaning"
 * 2. Search database first (instant, $0)
 * 3. If not found → AI generates ($0.01) and saves to DB
 * 4. Next user gets instant result from DB ($0)
 */

import {
  searchServices,
  logServiceSearch,
  getServiceItems,
  getPhaseTemplates,
} from './serviceDataService';
import { generateAndSaveTemplate } from './templateGenerationService';

/**
 * Smart service search with AI fallback
 * @param {string} query - Search query
 * @param {string} userId - Optional user ID for analytics
 * @returns {Promise<Array>} Array of matching services
 */
export const discoverServices = async (query, userId = null) => {
  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    // 1. Search database first (instant, free)
    const results = await searchServices(query);

    // Log the search for analytics
    await logServiceSearch(
      query,
      results.length > 0 ? results[0].id : null,
      userId,
      results.length > 0
    );

    // 2. Return results if found
    if (results.length > 0) {
      console.log(`✓ Found ${results.length} matches in database for "${query}"`);
      return results;
    }

    // 3. No results found - check if query looks like a valid service
    if (!isValidServiceQuery(query)) {
      console.log(`✗ Query "${query}" doesn't look like a valid service`);
      return [];
    }

    // 4. Generate with AI (will be saved to DB for future users)
    console.log(`🤖 No results found, generating template for "${query}"`);

    const generatedService = await generateAndSaveTemplate(query);

    // Log successful generation
    await logServiceSearch(query, generatedService.id, userId, true);

    return [generatedService];
  } catch (error) {
    console.error('Error in service discovery:', error);
    throw error;
  }
};

/**
 * Get full service details including items and phases
 * @param {string} serviceId - Service category ID
 * @returns {Promise<object>} Service with items and phases
 */
export const getServiceDetails = async (serviceId) => {
  try {
    const [items, phases] = await Promise.all([
      getServiceItems(serviceId),
      getPhaseTemplates(serviceId),
    ]);

    return {
      items,
      phases,
    };
  } catch (error) {
    console.error('Error fetching service details:', error);
    return {
      items: [],
      phases: [],
    };
  }
};

/**
 * Check if a query looks like a valid service name
 * Filters out gibberish, typos, etc.
 */
function isValidServiceQuery(query) {
  const cleaned = query.trim().toLowerCase();

  // Must be at least 3 characters
  if (cleaned.length < 3) {
    return false;
  }

  // Can't be all numbers
  if (/^\d+$/.test(cleaned)) {
    return false;
  }

  // Can't contain only special characters
  if (/^[^a-z0-9]+$/.test(cleaned)) {
    return false;
  }

  // Must contain at least one letter
  if (!/[a-z]/.test(cleaned)) {
    return false;
  }

  // Filter out common non-service queries
  const blacklist = [
    'test', 'asdf', 'qwerty', 'xxx', 'zzz',
    'hello', 'hi', 'hey', 'yes', 'no',
  ];

  if (blacklist.includes(cleaned)) {
    return false;
  }

  return true;
}

/**
 * Get autocomplete suggestions for a query
 * Fast, debounced version for real-time search
 * @param {string} query - Partial search query
 * @returns {Promise<Array>} Array of suggestions (name only for speed)
 */
export const getAutocompleteSuggestions = async (query) => {
  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    // Only search database for autocomplete (no AI generation)
    const results = await searchServices(query);

    // Return simplified results for dropdown
    return results.map(service => ({
      id: service.id,
      name: service.name,
      icon: service.icon,
      description: service.description,
    }));
  } catch (error) {
    console.error('Error getting autocomplete:', error);
    return [];
  }
};

/**
 * Fuzzy match service names locally
 * Used for client-side filtering before hitting DB
 * @param {string} query - Search query
 * @param {Array} services - Array of services to filter
 * @returns {Array} Filtered services
 */
export const fuzzyMatchServices = (query, services) => {
  if (!query || !services || services.length === 0) {
    return services;
  }

  const lowerQuery = query.toLowerCase().trim();

  return services
    .map(service => {
      const lowerName = service.name.toLowerCase();
      const lowerDesc = (service.description || '').toLowerCase();

      // Calculate score
      let score = 0;

      // Exact match
      if (lowerName === lowerQuery) {
        score += 100;
      }

      // Starts with
      if (lowerName.startsWith(lowerQuery)) {
        score += 50;
      }

      // Contains
      if (lowerName.includes(lowerQuery)) {
        score += 25;
      }

      // Word boundary match
      const words = lowerName.split(/\s+/);
      if (words.some(word => word.startsWith(lowerQuery))) {
        score += 30;
      }

      // Description match (lower weight)
      if (lowerDesc.includes(lowerQuery)) {
        score += 10;
      }

      return { ...service, _score: score };
    })
    .filter(service => service._score > 0)
    .sort((a, b) => b._score - a._score);
};

/**
 * Get popular service suggestions (for empty state)
 * @param {number} limit - Number of suggestions
 * @returns {Promise<Array>} Popular services
 */
export const getPopularSuggestions = async (limit = 8) => {
  try {
    const services = await searchServices('');
    return services.slice(0, limit);
  } catch (error) {
    console.error('Error getting popular suggestions:', error);
    return [];
  }
};

/**
 * Check if service needs AI generation or exists in DB
 * @param {string} serviceName - Service name to check
 * @returns {Promise<object>} Status and service if exists
 */
export const checkServiceAvailability = async (serviceName) => {
  try {
    const results = await searchServices(serviceName);

    // Look for exact or very close match
    const exactMatch = results.find(
      s => s.name.toLowerCase() === serviceName.toLowerCase()
    );

    if (exactMatch) {
      return {
        exists: true,
        needsGeneration: false,
        service: exactMatch,
      };
    }

    // Check for close matches
    const closeMatches = results.filter(
      s => s.name.toLowerCase().includes(serviceName.toLowerCase()) ||
           serviceName.toLowerCase().includes(s.name.toLowerCase())
    );

    if (closeMatches.length > 0) {
      return {
        exists: true,
        needsGeneration: false,
        service: closeMatches[0],
        alternatives: closeMatches,
      };
    }

    // No match found - will need generation
    return {
      exists: false,
      needsGeneration: true,
      service: null,
    };
  } catch (error) {
    console.error('Error checking service availability:', error);
    return {
      exists: false,
      needsGeneration: true,
      service: null,
    };
  }
};

/**
 * Debounce helper for search input
 * @param {function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {function} Debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Format service name for display
 * @param {string} name - Service name
 * @returns {string} Formatted name
 */
export const formatServiceName = (name) => {
  if (!name) return '';

  // Capitalize first letter of each word
  return name
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Extract keywords from service name for better matching
 * @param {string} serviceName - Service name
 * @returns {Array<string>} Keywords
 */
export const extractKeywords = (serviceName) => {
  if (!serviceName) return [];

  // Common stop words to filter out
  const stopWords = new Set([
    'and', 'or', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as',
  ]);

  return serviceName
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
};
