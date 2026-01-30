const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { fetchDeepgram, fetchGroq } = require('../utils/fetchWithRetry');
const FormData = require('form-data');

// Transcribe audio - Groq Whisper (fast) with Deepgram fallback
router.post('/transcribe', async (req, res) => {
  try {
    const { audio, contentType = 'audio/m4a', language = 'en' } = req.body;

    if (!audio) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // Convert base64 to binary buffer
    const audioBuffer = Buffer.from(audio, 'base64');

    // Prefer Groq (faster), fallback to Deepgram
    const useGroq = !!process.env.GROQ_API_KEY;

    if (useGroq) {
      try {
        // ⚡ GROQ WHISPER - Ultra-fast transcription (~2-5 seconds)
        logger.info(`⚡ Sending to Groq Whisper (language: ${language})...`);

        const formData = new FormData();
        formData.append('file', audioBuffer, {
          filename: 'audio.m4a',
          contentType: contentType,
        });
        formData.append('model', 'whisper-large-v3');
        // Only set language if not 'multi' (Groq auto-detects if not specified)
        if (language && language !== 'multi') {
          formData.append('language', language);
        }

        const response = await fetchGroq(
          'https://api.groq.com/openai/v1/audio/transcriptions',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
              ...formData.getHeaders(),
            },
            body: formData,
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('Groq Whisper error:', errorText);
          throw new Error(`Groq transcription failed: ${response.status}`);
        }

        const data = await response.json();
        logger.info('✅ Groq transcription complete');

        // Return in Deepgram-compatible format for frontend compatibility
        return res.json({
          results: {
            channels: [{
              alternatives: [{
                transcript: data.text || ''
              }]
            }]
          }
        });
      } catch (groqError) {
        logger.warn('Groq Whisper failed, falling back to Deepgram:', groqError.message);
        // Fall through to Deepgram
      }
    }

    // Deepgram fallback (or primary if no Groq key)
    if (!process.env.DEEPGRAM_API_KEY) {
      return res.status(500).json({ error: 'No transcription API configured' });
    }

    logger.info(`🎤 Sending to Deepgram API (language: ${language})...`);

    const response = await fetchDeepgram(
      `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=multi`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': contentType,
        },
        body: audioBuffer,
      }
    );

    logger.info('Deepgram API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Deepgram API error:', errorText);
      return res.status(response.status).json({ error: 'Transcription failed' });
    }

    const data = await response.json();
    logger.info('✅ Deepgram transcription complete');
    res.json(data);
  } catch (error) {
    logger.error('Transcription error:', error);
    const statusCode = error.isTimeout ? 504 : 500;
    const message = error.isTimeout ? 'Transcription service timed out. Please try again.' : 'Transcription failed';
    res.status(statusCode).json({ error: message });
  }
});

module.exports = router;
