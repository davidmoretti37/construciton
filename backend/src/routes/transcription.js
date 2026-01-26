const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { fetchDeepgram } = require('../utils/fetchWithRetry');

// Transcribe audio using Deepgram
router.post('/transcribe', async (req, res) => {
  try {
    const { audio, contentType = 'audio/m4a' } = req.body;

    if (!audio) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    if (!process.env.DEEPGRAM_API_KEY) {
      return res.status(500).json({ error: 'Deepgram API key not configured' });
    }

    // Convert base64 to binary buffer
    const binaryString = Buffer.from(audio, 'base64');

    logger.info('🎤 Sending to Deepgram API...');

    // Call Deepgram API for transcription (with timeout and retry)
    const response = await fetchDeepgram(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en',
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': contentType,
        },
        body: binaryString,
      }
    );

    logger.info('Deepgram API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Deepgram API error:', errorText);
      return res.status(response.status).json({ error: 'Transcription failed' });
    }

    const data = await response.json();
    logger.info('✅ Transcription complete');
    res.json(data);
  } catch (error) {
    logger.error('Transcription error:', error);
    const statusCode = error.isTimeout ? 504 : 500;
    const message = error.isTimeout ? 'Transcription service timed out. Please try again.' : 'Transcription failed';
    res.status(statusCode).json({ error: message });
  }
});

module.exports = router;
