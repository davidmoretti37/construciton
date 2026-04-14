const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { fetchGoogleMaps } = require('../utils/fetchWithRetry');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { authenticateUser } = require('../middleware/authenticate');

// Apply auth to all geocoding routes
router.use(authenticateUser);

// Geocode an address
router.get('/geocode', async (req, res) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    const response = await fetchGoogleMaps(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );

    if (!response.ok) {
      logger.error('Google Maps geocode error:', response.status);
      return res.status(response.status).json({ error: 'Geocoding service error' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error('Geocoding error:', error);
    const statusCode = error.isTimeout ? 504 : 500;
    const message = error.isTimeout ? 'Geocoding service timed out. Please try again.' : 'Geocoding failed';
    res.status(statusCode).json({ error: message });
  }
});

// Distance matrix between origins and destinations
router.get('/distance', async (req, res) => {
  try {
    const { origins, destinations, mode = 'driving', departure_time } = req.query;

    if (!origins || !destinations) {
      return res.status(400).json({ error: 'Origins and destinations are required' });
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    let url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&mode=${mode}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

    if (departure_time) {
      url += `&departure_time=${departure_time}`;
    }

    const response = await fetchGoogleMaps(url);

    if (!response.ok) {
      logger.error('Google Maps distance error:', response.status);
      return res.status(response.status).json({ error: 'Distance calculation service error' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error('Distance matrix error:', error);
    const statusCode = error.isTimeout ? 504 : 500;
    const message = error.isTimeout ? 'Distance service timed out. Please try again.' : 'Distance calculation failed';
    res.status(statusCode).json({ error: message });
  }
});

// Reverse geocode (coordinates to address)
router.get('/reverse', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    const response = await fetchGoogleMaps(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );

    if (!response.ok) {
      logger.error('Google Maps reverse geocode error:', response.status);
      return res.status(response.status).json({ error: 'Reverse geocoding service error' });
    }

    const data = await response.json();

    // Return simplified response with address
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const address = data.results[0].formatted_address;
      logger.info(`✅ Reverse geocoded ${lat},${lng} → ${address}`);
      return res.json({ address });
    } else {
      logger.warn(`⚠️ No address found for ${lat},${lng} (status: ${data.status})`);
      return res.status(404).json({ error: 'No address found for coordinates' });
    }
  } catch (error) {
    logger.error('Reverse geocoding error:', error);
    const statusCode = error.isTimeout ? 504 : 500;
    const message = error.isTimeout ? 'Reverse geocoding service timed out. Please try again.' : 'Reverse geocoding failed';
    res.status(statusCode).json({ error: message });
  }
});

module.exports = router;
