/**
 * Route Optimization utilities
 * - Fetch saved locations for address picker
 * - Call backend route optimization (Google Directions API)
 * - Decode Google encoded polylines for MapView
 */

import { supabase } from '../../lib/supabase';
import { API_URL } from '../../config/api';

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

/**
 * Fetch all owner's service locations with coordinates
 * Used as the "saved addresses" in the route map picker
 */
export async function fetchOwnerLocations() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-routes/locations`, {
    method: 'GET',
    headers,
  });
  if (!response.ok) throw new Error(`Failed to fetch locations: ${response.status}`);
  return response.json();
}

/**
 * Optimize route order via Google Directions API
 * @param {Array} stops - [{ id, latitude, longitude, name, address }]
 * @param {Object} origin - Optional { latitude, longitude } for starting point
 * @returns {{ polyline, legs, total_distance_text, total_duration_text, optimized_stops }}
 */
export async function optimizeRoute(stops, origin = null) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-routes/optimize`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ stops, origin }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Optimization failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Decode Google's encoded polyline into array of { latitude, longitude }
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded) {
  if (!encoded) return [];

  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    // Decode latitude
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    // Decode longitude
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
}
