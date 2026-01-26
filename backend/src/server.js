require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Utilities
const logger = require('./utils/logger');
const { fetchOpenRouter, fetchOpenRouterVision, fetchOpenRouterStream, fetchGroq } = require('./utils/fetchWithRetry');

// Routes
const geocodingRoutes = require('./routes/geocoding');
const transcriptionRoutes = require('./routes/transcription');
const stripeRoutes = require('./routes/stripe');

// Rate Limiters
const { aiLimiter, servicesLimiter } = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway/cloud deployments (fixes rate limiter X-Forwarded-For error)
app.set('trust proxy', 1);

// Middleware
app.use(cors());

// Stripe webhook needs raw body - MUST be before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));

// Mount routes with rate limiting
app.use('/api', servicesLimiter, geocodingRoutes);
app.use('/api', servicesLimiter, transcriptionRoutes);
app.use('/api/stripe', servicesLimiter, stripeRoutes);
app.use('/api/subscription', servicesLimiter, stripeRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Subscription success page (shown after Stripe checkout completes)
app.get('/subscription/success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Payment Successful</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               display: flex; justify-content: center; align-items: center;
               min-height: 100vh; margin: 0; background: #1a1a2e; color: white; }
        .container { text-align: center; padding: 40px; }
        .checkmark { font-size: 64px; margin-bottom: 20px; color: #4CAF50; }
        h1 { margin-bottom: 10px; }
        p { color: #888; margin-bottom: 30px; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="checkmark">✓</div>
        <h1>Payment Successful!</h1>
        <p>Your subscription is now active.<br>You can close this page and return to the app.</p>
      </div>
    </body>
    </html>
  `);
});

// Subscription cancel page
app.get('/subscription/cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Payment Cancelled</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               display: flex; justify-content: center; align-items: center;
               min-height: 100vh; margin: 0; background: #1a1a2e; color: white; }
        .container { text-align: center; padding: 40px; }
        h1 { margin-bottom: 10px; }
        p { color: #888; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Payment Cancelled</h1>
        <p>No worries! You can try again anytime.<br>Close this page to return to the app.</p>
      </div>
    </body>
    </html>
  `);
});

// Non-streaming chat endpoint (with AI rate limiting)
app.post('/api/chat', aiLimiter, async (req, res) => {
  const { messages, model, max_tokens = 4000, temperature = 0.3 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OpenRouter API key not configured' });
  }

  try {
    logger.info('🚀 Non-streaming request to OpenRouter...');

    const response = await fetchOpenRouter('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager',
      },
      body: JSON.stringify({
        model: model || 'anthropic/claude-sonnet-4',
        messages,
        max_tokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('OpenRouter error:', errorData);
      return res.status(response.status).json({ error: errorData.error?.message || 'AI request failed' });
    }

    const data = await response.json();
    logger.info('✅ AI response received');
    res.json(data);

  } catch (error) {
    logger.error('Server error:', error);
    const statusCode = error.isTimeout ? 504 : 500;
    const message = error.isTimeout ? 'AI service timed out. Please try again.' : error.message;
    res.status(statusCode).json({ error: message });
  }
});

// Vision model endpoint (with AI rate limiting)
app.post('/api/chat/vision', aiLimiter, async (req, res) => {
  const { messages, model, max_tokens = 2000, temperature = 0.3 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OpenRouter API key not configured' });
  }

  try {
    logger.info('🖼️ Vision request to OpenRouter...');

    const response = await fetchOpenRouterVision('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - Vision',
      },
      body: JSON.stringify({
        model: model || 'openai/gpt-4o-mini',
        messages,
        max_tokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('Vision API error:', errorData);
      return res.status(response.status).json({ error: errorData.error?.message || 'Vision API request failed' });
    }

    const data = await response.json();
    logger.info('✅ Vision response received');
    res.json(data);

  } catch (error) {
    logger.error('Server error:', error);
    const statusCode = error.isTimeout ? 504 : 500;
    const message = error.isTimeout ? 'Vision service timed out. Please try again.' : error.message;
    res.status(statusCode).json({ error: message });
  }
});

// Streaming chat endpoint (with AI rate limiting)
app.post('/api/chat/stream', aiLimiter, async (req, res) => {
  const { messages, model, max_tokens = 4000, temperature = 0.3 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OpenRouter API key not configured' });
  }

  try {
    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    logger.info('🚀 Starting streaming request to OpenRouter...');

    // Call OpenRouter with streaming (with timeout and retry)
    const response = await fetchOpenRouterStream('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager',
      },
      body: JSON.stringify({
        model: model || 'openai/gpt-4o-mini',
        messages,
        max_tokens: Math.min(max_tokens, 4000), // Match non-streaming endpoint limit
        temperature,
        stream: true,
        // Performance optimizations
        top_p: 0.9, // Faster sampling
        frequency_penalty: 0.3, // Reduce repetition = shorter responses
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('OpenRouter error:', errorText);
      res.write(`data: ${JSON.stringify({ error: 'AI service error' })}\n\n`);
      res.end();
      return;
    }

    logger.info('✅ Connected to OpenRouter, streaming chunks...');

    // Stream the response back to client
    let chunkCount = 0;
    const startTime = Date.now();

    response.body.on('data', (chunk) => {
      chunkCount++;

      // First chunk timing
      if (chunkCount === 1) {
        const latency = Date.now() - startTime;
        logger.info(`⚡ First chunk arrived in ${latency}ms`);
      }

      // Forward chunk directly to client
      res.write(chunk);
    });

    response.body.on('end', () => {
      const totalTime = Date.now() - startTime;
      logger.info(`✅ Stream complete: ${chunkCount} chunks in ${totalTime}ms`);
      res.end();
    });

    response.body.on('error', (error) => {
      logger.error('Stream error:', error);
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
      logger.info('⚠️ Client disconnected');
      response.body.destroy();
    });

  } catch (error) {
    logger.error('Server error:', error);
    const message = error.isTimeout ? 'AI service timed out. Please try again.' : error.message;
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

// ⚡ GROQ PLANNING ENDPOINT - Ultra-fast inference for agent routing
// Uses Groq's Llama 3.1 70B for 300+ tokens/sec planning
app.post('/api/chat/planning', aiLimiter, async (req, res) => {
  const { messages, max_tokens = 1000, temperature = 0.1 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  // Check for Groq API key, fall back to OpenRouter if not available
  const useGroq = !!process.env.GROQ_API_KEY;

  if (!useGroq && !process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'No AI API key configured' });
  }

  try {
    const startTime = Date.now();

    if (useGroq) {
      // ⚡ GROQ PATH - Ultra-fast inference
      logger.info('⚡ Fast planning request to Groq...');

      const response = await fetchGroq('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile', // Fast and capable
          messages,
          max_tokens,
          temperature,
          response_format: { type: 'json_object' }, // Ensure JSON output
        }),
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json();
        logger.error('Groq error:', errorData);
        // Fall back to OpenRouter on Groq error
        logger.info('⚠️ Falling back to OpenRouter...');
      } else {
        const data = await response.json();
        logger.info(`⚡ Groq planning complete in ${latency}ms`);
        return res.json(data);
      }
    }

    // OPENROUTER FALLBACK - Use Haiku for fast planning
    logger.info('🚀 Planning request to OpenRouter (fallback)...');

    const response = await fetchOpenRouter('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - Planning',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5', // Fast model for planning (matches aiService.js)
        messages,
        max_tokens,
        temperature,
      }),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('OpenRouter planning error:', errorData);
      return res.status(response.status).json({ error: errorData.error?.message || 'Planning request failed' });
    }

    const data = await response.json();
    logger.info(`✅ Planning complete in ${latency}ms (OpenRouter fallback)`);
    res.json(data);

  } catch (error) {
    logger.error('Planning error:', error);
    const statusCode = error.isTimeout ? 504 : 500;
    const message = error.isTimeout ? 'Planning service timed out. Please try again.' : error.message;
    res.status(statusCode).json({ error: message });
  }
});

// Start server - bind to 0.0.0.0 for Railway/Docker compatibility
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);  // Always visible in production
  logger.info(`🚀 Backend server running on port ${PORT}`);
  logger.info(`   Health check: http://localhost:${PORT}/health`);
  logger.info(`   AI Chat: http://localhost:${PORT}/api/chat/stream`);
  logger.info(`   ⚡ Fast Planning: http://localhost:${PORT}/api/chat/planning`);
  logger.info(`   Geocoding: http://localhost:${PORT}/api/geocode`);
  logger.info(`   Transcription: http://localhost:${PORT}/api/transcribe`);
  logger.info(`   💳 Stripe: http://localhost:${PORT}/api/stripe/*`);
  logger.info(`   Rate limits: AI=20/min, Services=60/min`);
  if (process.env.GROQ_API_KEY) {
    logger.info(`   ⚡ Groq enabled for ultra-fast planning`);
  }
  if (process.env.STRIPE_SECRET_KEY) {
    logger.info(`   💳 Stripe payments enabled`);
  }
});
