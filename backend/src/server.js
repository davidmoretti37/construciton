require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Template rendering
function renderTemplate(name, vars = {}) {
  const filePath = path.join(__dirname, 'templates', `${name}.html`);
  let html = fs.readFileSync(filePath, 'utf-8');
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

// Utilities
const logger = require('./utils/logger');
const { fetchOpenRouter, fetchOpenRouterVision, fetchOpenRouterStream, fetchGroq } = require('./utils/fetchWithRetry');
const pdfParse = require('pdf-parse');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Routes
const geocodingRoutes = require('./routes/geocoding');
const transcriptionRoutes = require('./routes/transcription');
const stripeRoutes = require('./routes/stripe');

// Rate Limiters
const { aiLimiter, servicesLimiter, chatHistoryLimiter } = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway/cloud deployments (fixes rate limiter X-Forwarded-For error)
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(helmet());

// Stripe webhook needs raw body - MUST be before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// Document extraction can receive large PDF base64 payloads
app.use('/api/documents', express.json({ limit: '50mb' }));
app.use(express.json({ limit: '10mb' }));

// ============================================================
// AUTHENTICATION MIDDLEWARE
// Verifies Supabase JWT token from Authorization header
// ============================================================
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn('Auth failed:', error?.message || 'No user found');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Mount routes with rate limiting
app.use('/api', servicesLimiter, geocodingRoutes);
app.use('/api', servicesLimiter, transcriptionRoutes);
app.use('/api/stripe', servicesLimiter, stripeRoutes);
app.use('/api/subscription', servicesLimiter, stripeRoutes);

// ============================================================
// HEALTH & READINESS CHECKS
// ============================================================

/**
 * Liveness probe — confirms the process is running.
 * Use for container orchestrators (Railway, K8s) to detect crashed processes.
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Deep readiness probe — checks all external dependencies.
 * Returns 200 only when ALL services are reachable.
 * Use this before routing traffic to a new deployment.
 */
app.get('/ready', async (req, res) => {
  const checks = {};
  const startTime = Date.now();

  // 1. Supabase — query a lightweight table
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    checks.supabase = error ? { status: 'fail', error: error.message } : { status: 'ok' };
  } catch (e) {
    checks.supabase = { status: 'fail', error: e.message };
  }

  // 2. OpenRouter — check API key validity with a models list call
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const controller = new (require('abort-controller'))();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await require('node-fetch')('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      checks.openrouter = resp.ok ? { status: 'ok' } : { status: 'fail', error: `HTTP ${resp.status}` };
    } catch (e) {
      checks.openrouter = { status: 'fail', error: e.message };
    }
  } else {
    checks.openrouter = { status: 'fail', error: 'OPENROUTER_API_KEY not set' };
  }

  // 3. Stripe — verify key by fetching balance (lightweight)
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      await stripe.balance.retrieve();
      checks.stripe = { status: 'ok' };
    } catch (e) {
      checks.stripe = { status: 'fail', error: e.message };
    }
  } else {
    checks.stripe = { status: 'skip', reason: 'STRIPE_SECRET_KEY not set' };
  }

  // 4. Google Maps — ping geocoding endpoint
  if (process.env.GOOGLE_MAPS_API_KEY) {
    try {
      const controller = new (require('abort-controller'))();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await require('node-fetch')(
        `https://maps.googleapis.com/maps/api/geocode/json?address=test&key=${process.env.GOOGLE_MAPS_API_KEY}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      const data = await resp.json();
      checks.google_maps = data.status !== 'REQUEST_DENIED'
        ? { status: 'ok' }
        : { status: 'fail', error: data.error_message || 'REQUEST_DENIED' };
    } catch (e) {
      checks.google_maps = { status: 'fail', error: e.message };
    }
  } else {
    checks.google_maps = { status: 'skip', reason: 'GOOGLE_MAPS_API_KEY not set' };
  }

  // 5. Deepgram — check API key with a usage endpoint
  if (process.env.DEEPGRAM_API_KEY) {
    try {
      const controller = new (require('abort-controller'))();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await require('node-fetch')('https://api.deepgram.com/v1/projects', {
        headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      checks.deepgram = resp.ok ? { status: 'ok' } : { status: 'fail', error: `HTTP ${resp.status}` };
    } catch (e) {
      checks.deepgram = { status: 'fail', error: e.message };
    }
  } else {
    checks.deepgram = { status: 'skip', reason: 'DEEPGRAM_API_KEY not set' };
  }

  // 6. Environment variables — verify required vars are set
  const requiredVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY'];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  checks.env = missingVars.length === 0
    ? { status: 'ok' }
    : { status: 'fail', missing: missingVars };

  // 7. Tool definitions — verify all tool handlers are registered
  const { toolDefinitions } = require('./services/tools/definitions');
  const { TOOL_HANDLERS } = require('./services/tools/handlers');
  const definedTools = toolDefinitions.map(t => t.function.name);
  const missingHandlers = definedTools.filter(name => !TOOL_HANDLERS[name]);
  checks.tools = missingHandlers.length === 0
    ? { status: 'ok', count: definedTools.length }
    : { status: 'fail', missingHandlers };

  const duration = Date.now() - startTime;
  const allOk = Object.values(checks).every(c => c.status === 'ok' || c.status === 'skip');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    checks,
  });
});

// Subscription success page (shown after Stripe checkout completes)
app.get('/subscription/success', (req, res) => {
  res.send(renderTemplate('subscription-success'));
});

// Subscription cancel page
app.get('/subscription/cancel', (req, res) => {
  res.send(renderTemplate('subscription-cancel'));
});

// Billing complete page - redirect back to app after managing billing
app.get('/billing-complete', (req, res) => {
  res.send(renderTemplate('billing-complete'));
});

// ============================================================
// PRICING PAGE
// ============================================================
app.get('/pricing', (req, res) => {
  const baseUrl = process.env.NODE_ENV === 'production'
    ? 'https://construciton-production.up.railway.app'
    : `http://localhost:${PORT}`;
  res.send(renderTemplate('pricing', { baseUrl }));
});

// ============================================================
// PRIVACY POLICY PAGE
// ============================================================
app.get('/privacy', (req, res) => {
  res.send(renderTemplate('privacy'));
});

// ============================================================
// TERMS OF SERVICE PAGE
// ============================================================
app.get('/terms', (req, res) => {
  res.send(renderTemplate('terms'));
});

// Non-streaming chat endpoint (with AI rate limiting)
app.post('/api/chat', aiLimiter, authenticateUser, async (req, res) => {
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
// PDF text extraction endpoint
app.post('/api/documents/extract-text', aiLimiter, authenticateUser, async (req, res) => {
  const { base64, fileName } = req.body;

  if (!base64) {
    return res.status(400).json({ error: 'base64 content is required' });
  }

  try {
    logger.info(`📄 Extracting text from PDF: ${fileName || 'unknown'}`);
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdfParse(buffer);

    const extractedText = (data.text || '').trim();
    const isScanned = extractedText.length < 50;

    logger.info(`✅ PDF extracted: ${extractedText.length} chars, ${data.numpages} pages${isScanned ? ' (likely scanned)' : ''}`);

    res.json({
      text: extractedText,
      pageCount: data.numpages || 0,
      scanned: isScanned,
    });
  } catch (error) {
    logger.error('PDF extraction error:', error.message, error.stack?.split('\n')[1]);
    // Return scanned:true so frontend falls back to vision API
    res.status(200).json({ text: '', pageCount: 0, scanned: true });
  }
});

app.post('/api/chat/vision', aiLimiter, authenticateUser, async (req, res) => {
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
app.post('/api/chat/stream', aiLimiter, authenticateUser, async (req, res) => {
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

// 🤖 UNIFIED AGENT ENDPOINT - Tool-calling agent with Claude
// Replaces the multi-agent routing system with a single intelligent agent
const { processAgentRequest } = require('./services/agentService');

app.post('/api/chat/agent', aiLimiter, authenticateUser, async (req, res) => {
  const { messages, context } = req.body;
  // Use authenticated user ID from JWT, ignore any user_id in body
  const user_id = req.user.id;

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
    res.setHeader('X-Accel-Buffering', 'no');

    logger.info(`🤖 Agent request from user ${user_id.substring(0, 8)}...`);

    // Run the agentic loop (pass req for disconnect detection)
    await processAgentRequest(messages, user_id, context || {}, res, req);

    // End the SSE stream
    res.end();

  } catch (error) {
    logger.error('Agent endpoint error:', error);
    const message = error.isTimeout ? 'Agent timed out. Please try again.' : error.message;

    // Try to send error via SSE if headers already sent
    if (res.headersSent) {
      try {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      } catch (e) {
        // Client already disconnected
      }
    } else {
      res.status(500).json({ error: message });
    }
  }

  // Handle client disconnect
  req.on('close', () => {
    logger.info('⚠️ Agent client disconnected');
  });
});

// ⚡ GROQ PLANNING ENDPOINT - Ultra-fast inference for agent routing
// Uses Groq's Llama 3.1 70B for 300+ tokens/sec planning
app.post('/api/chat/planning', aiLimiter, authenticateUser, async (req, res) => {
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

// ==================== CHAT HISTORY ENDPOINTS ====================

// List all chat sessions for a user
app.get('/api/chat/sessions', chatHistoryLimiter, authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select('id, title, created_at, updated_at, last_message_at, is_archived')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({ sessions: sessions || [] });
  } catch (error) {
    logger.error('Error fetching chat sessions:', error);
    res.status(500).json({ error: 'Failed to fetch chat sessions' });
  }
});

// Get messages for a specific session
app.get('/api/chat/sessions/:sessionId/messages', chatHistoryLimiter, authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    // Verify session ownership
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get messages
    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ messages: messages || [] });
  } catch (error) {
    logger.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Create a new chat session
app.post('/api/chat/sessions', chatHistoryLimiter, authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title } = req.body;

    const { data: session, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: userId,
        title: title || 'New Chat',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`✅ Created chat session ${session.id} for user ${userId}`);
    res.json({ session });
  } catch (error) {
    logger.error('Error creating chat session:', error);
    res.status(500).json({ error: 'Failed to create chat session' });
  }
});

// Save a message to a session
app.post('/api/chat/sessions/:sessionId/messages', chatHistoryLimiter, authenticateUser, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { role, content, visualElements, actions } = req.body;

    // Verify session ownership
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Save message
    const { data: message, error } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        user_id: userId,
        role,
        content,
        visual_elements: visualElements || [],
        actions: actions || [],
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Update session's last_message_at
    await supabase
      .from('chat_sessions')
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    res.json({ message });
  } catch (error) {
    logger.error('Error saving message:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// Update session title
app.patch('/api/chat/sessions/:sessionId', chatHistoryLimiter, authenticateUser, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { title } = req.body;

    const { data: session, error } = await supabase
      .from('chat_sessions')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    logger.info(`✅ Updated session ${sessionId} title to: ${title}`);
    res.json({ session });
  } catch (error) {
    logger.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Delete a session
app.delete('/api/chat/sessions/:sessionId', chatHistoryLimiter, authenticateUser, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (error) throw error;

    logger.info(`✅ Deleted chat session ${sessionId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Export app for testing with supertest (before listen)
module.exports = app;

// Start server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    logger.info(`Backend server running on port ${PORT}`);
    logger.info(`   Health check: http://localhost:${PORT}/health`);
    logger.info(`   Readiness: http://localhost:${PORT}/ready`);
    logger.info(`   AI Chat: http://localhost:${PORT}/api/chat/stream`);
    logger.info(`   Agent: http://localhost:${PORT}/api/chat/agent`);
    logger.info(`   Fast Planning: http://localhost:${PORT}/api/chat/planning`);
    logger.info(`   Geocoding: http://localhost:${PORT}/api/geocode`);
    logger.info(`   Transcription: http://localhost:${PORT}/api/transcribe`);
    logger.info(`   Stripe: http://localhost:${PORT}/api/stripe/*`);
    logger.info(`   Rate limits: AI=20/min, Services=60/min`);
    if (process.env.GROQ_API_KEY) {
      logger.info(`   Groq enabled for ultra-fast planning`);
    }
    if (process.env.STRIPE_SECRET_KEY) {
      logger.info(`   Stripe payments enabled`);
    }
  });
}
