const logger = require('./logger');

/**
 * Geocoding Cache - In-memory cache for reverse geocoding results
 * Caches address lookups for 24 hours to reduce API calls and improve performance
 */
class GeocodingCache {
  constructor() {
    this.cache = new Map(); // { "lat,lng": { address, timestamp } }
    this.TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    this.MAX_SIZE = 1000; // Maximum cache entries before LRU eviction
  }

  /**
   * Get address for a coordinate pair (with caching)
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<string|null>} Address string or null if geocoding fails
   */
  async getAddress(lat, lng) {
    // Normalize coordinates to 5 decimal places (~1 meter precision)
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;

    // Check cache for existing entry
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.TTL) {
      logger.info(`🎯 Geocoding cache hit: ${key}`);
      return cached.address;
    }

    // Cache miss - call reverse geocoding API
    logger.info(`🔍 Geocoding cache miss: ${key} - calling API`);

    try {
      // Call internal reverse geocoding endpoint
      const port = process.env.PORT || 3000;
      const url = `http://localhost:${port}/api/reverse?lat=${lat}&lng=${lng}`;

      const response = await fetch(url, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        logger.error(`Geocoding API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();

      // Cache the result if address was found
      if (data.address) {
        this.cache.set(key, {
          address: data.address,
          timestamp: Date.now()
        });

        // LRU eviction if cache exceeds max size
        if (this.cache.size > this.MAX_SIZE) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
          logger.info(`♻️ Geocoding cache evicted oldest entry (size: ${this.cache.size})`);
        }

        logger.info(`✅ Geocoded and cached: ${key} → ${data.address}`);
        return data.address;
      }

      logger.warn(`⚠️ No address found for coordinates: ${key}`);
      return null;

    } catch (error) {
      logger.error('Geocoding API call failed:', error.message);
      return null; // Fallback to coordinates handled by caller
    }
  }

  /**
   * Batch geocode multiple locations in parallel (with concurrency limit)
   * @param {Array<{lat, lng}>} locations - Array of coordinate pairs
   * @returns {Promise<Array<string|null>>} Array of addresses (or null)
   */
  async getAddresses(locations) {
    // Process in chunks of 5 to respect rate limits
    const chunks = [];
    for (let i = 0; i < locations.length; i += 5) {
      chunks.push(locations.slice(i, i + 5));
    }

    const results = [];
    for (const chunk of chunks) {
      const addresses = await Promise.all(
        chunk.map(loc => this.getAddress(loc.lat, loc.lng))
      );
      results.push(...addresses);
    }

    logger.info(`📍 Batch geocoded ${locations.length} locations (${results.filter(a => a).length} successful)`);
    return results;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_SIZE,
      ttl: this.TTL
    };
  }

  /**
   * Clear the cache
   */
  clear() {
    this.cache.clear();
    logger.info('🧹 Geocoding cache cleared');
  }
}

// Singleton instance
const geocodingCache = new GeocodingCache();

module.exports = { geocodingCache };
