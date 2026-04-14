/**
 * Geocoding and Travel Time Utility
 *
 * Integrates with Google Maps APIs to provide:
 * - Address geocoding (convert address to lat/lng)
 * - Reverse geocoding (convert lat/lng to address)
 * - Travel time calculation between locations
 * - Intelligent buffer time suggestions
 */

import { API_URL as BACKEND_URL } from '../config/api';

// Cache for geocoding results to reduce API calls
const geocodeCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Geocode an address to latitude/longitude coordinates
 * @param {string} address - Address to geocode
 * @returns {Promise<object|null>} - { latitude, longitude, formatted_address, place_id }
 */
export const geocodeAddress = async (address) => {
  if (!address || address.trim() === '') {
    console.warn('geocodeAddress: Empty address provided');
    return null;
  }

  // Check cache first
  const cacheKey = `geocode:${address.toLowerCase()}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `${BACKEND_URL}/api/geocode?address=${encodeURIComponent(address)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0];
      const geocodedData = {
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
        formatted_address: result.formatted_address,
        place_id: result.place_id,
      };

      // Cache the result
      geocodeCache.set(cacheKey, {
        data: geocodedData,
        timestamp: Date.now()
      });

      return geocodedData;
    } else if (data.status === 'ZERO_RESULTS') {
      console.warn('⚠️ Geocoding found no results for:', address);
      return null;
    } else {
      console.error('❌ Geocoding API error:', data.status, data.error_message);
      return null;
    }
  } catch (error) {
    console.error('❌ Geocoding error:', error);
    return null;
  }
};

/**
 * Reverse geocode coordinates to an address
 * @param {number} latitude - Latitude coordinate
 * @param {number} longitude - Longitude coordinate
 * @returns {Promise<object|null>} - { formatted_address, place_id }
 */
export const reverseGeocode = async (latitude, longitude) => {
  if (!latitude || !longitude) {
    console.warn('reverseGeocode: Invalid coordinates');
    return null;
  }

  // Check cache first
  const cacheKey = `reverse:${latitude},${longitude}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `${BACKEND_URL}/api/reverse?lat=${latitude}&lng=${longitude}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0];
      const geocodedData = {
        formatted_address: result.formatted_address,
        place_id: result.place_id,
      };

      // Cache the result
      geocodeCache.set(cacheKey, {
        data: geocodedData,
        timestamp: Date.now()
      });

      return geocodedData;
    } else {
      console.error('❌ Reverse geocoding API error:', data.status);
      return null;
    }
  } catch (error) {
    console.error('❌ Reverse geocoding error:', error);
    return null;
  }
};

/**
 * Calculate travel time between two locations
 * @param {object} origin - { latitude, longitude } or address string
 * @param {object} destination - { latitude, longitude } or address string
 * @param {Date} departureTime - Optional departure time (for traffic awareness)
 * @returns {Promise<object|null>} - { distance_meters, duration_seconds, duration_in_traffic_seconds, distance_text, duration_text }
 */
export const calculateTravelTime = async (origin, destination, departureTime = null) => {
  if (!origin || !destination) {
    console.warn('calculateTravelTime: Invalid origin or destination');
    return null;
  }

  try {
    // Format origin and destination
    const originStr = typeof origin === 'string' ? origin : `${origin.latitude},${origin.longitude}`;
    const destStr = typeof destination === 'string' ? destination : `${destination.latitude},${destination.longitude}`;

    let url = `${BACKEND_URL}/api/distance?origins=${encodeURIComponent(originStr)}&destinations=${encodeURIComponent(destStr)}&mode=driving`;

    // Add departure time for traffic-aware routing (backend would need to support this)
    if (departureTime) {
      const departureTimestamp = Math.floor(departureTime.getTime() / 1000);
      url += `&departure_time=${departureTimestamp}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (data.status === 'OK' && data.rows.length > 0) {
      const element = data.rows[0].elements[0];

      if (element.status === 'OK') {
        const travelData = {
          distance_meters: element.distance.value,
          distance_text: element.distance.text,
          duration_seconds: element.duration.value,
          duration_text: element.duration.text,
          duration_in_traffic_seconds: element.duration_in_traffic ? element.duration_in_traffic.value : null,
          duration_in_traffic_text: element.duration_in_traffic ? element.duration_in_traffic.text : null,
        };

        return travelData;
      } else {
        console.error('❌ Distance Matrix element error:', element.status);
        return null;
      }
    } else {
      console.error('❌ Distance Matrix API error:', data.status);
      return null;
    }
  } catch (error) {
    console.error('❌ Travel time calculation error:', error);
    return null;
  }
};

/**
 * Calculate intelligent buffer time based on distance and event type
 * @param {number} distanceKm - Distance in kilometers
 * @param {string} eventType - Type of event (meeting, site_visit, etc.)
 * @param {number} baseTravelMinutes - Base travel time in minutes
 * @returns {number} - Recommended buffer time in minutes
 */
export const calculateIntelligentBuffer = (distanceKm, eventType, baseTravelMinutes) => {
  let buffer = 0;

  // Base buffer on distance
  if (distanceKm < 5) {
    buffer = 10; // Short local trips - 10 min buffer
  } else if (distanceKm < 20) {
    buffer = 15; // Medium distance - 15 min buffer
  } else {
    buffer = 20; // Long distance - 20 min buffer
  }

  // Adjust for event type
  if (eventType === 'meeting' || eventType === 'appointment') {
    buffer += 5; // Formal events need more prep time
  }

  // Add extra buffer for longer drives (parking, etc.)
  if (baseTravelMinutes > 30) {
    buffer += 10;
  }

  return buffer;
};

/**
 * Format travel information for display
 * @param {object} travelData - Travel data from calculateTravelTime
 * @param {number} bufferMinutes - Buffer minutes
 * @returns {string} - Formatted travel info
 */
export const formatTravelInfo = (travelData, bufferMinutes) => {
  if (!travelData) {
    return '';
  }

  const durationText = travelData.duration_in_traffic_text || travelData.duration_text;
  const totalMinutes = Math.ceil((travelData.duration_in_traffic_seconds || travelData.duration_seconds) / 60) + bufferMinutes;

  return `📍 ${travelData.distance_text} away (${durationText} + ${bufferMinutes} min buffer = ${totalMinutes} min total)`;
};

/**
 * Check if address is valid (not too vague)
 * @param {string} address - Address to validate
 * @returns {boolean} - True if address seems specific enough
 */
export const isAddressSpecific = (address) => {
  if (!address || address.trim() === '') {
    return false;
  }

  const lowercaseAddress = address.toLowerCase().trim();

  // Too vague if it's just these phrases
  const vaguePatterns = [
    'his house',
    'her house',
    'their house',
    'my house',
    'the office',
    'office',
    'home',
    'client location',
    'site',
  ];

  return !vaguePatterns.includes(lowercaseAddress);
};

/**
 * Extract city and state from formatted address
 * @param {string} formattedAddress - Google formatted address
 * @returns {object} - { city, state, zip }
 */
export const parseFormattedAddress = (formattedAddress) => {
  if (!formattedAddress) {
    return { city: null, state: null, zip: null };
  }

  const parts = formattedAddress.split(',').map(p => p.trim());

  // Typical format: "Street, City, State Zip, Country"
  let city = null;
  let state = null;
  let zip = null;

  if (parts.length >= 3) {
    city = parts[parts.length - 3];
    const stateZip = parts[parts.length - 2].split(' ');
    state = stateZip[0];
    zip = stateZip[1];
  }

  return { city, state, zip };
};

/**
 * Clear geocoding cache (useful for testing or memory management)
 */
export const clearGeocodeCache = () => {
  geocodeCache.clear();
};
