require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Template rendering
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTemplate(name, vars = {}) {
  const filePath = path.join(__dirname, 'templates', `${name}.html`);
  let html = fs.readFileSync(filePath, 'utf-8');
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, escapeHtml(value));
  }
  return html;
}

// Startup safety checks
if (!process.env.NODE_ENV) {
  console.warn('⚠️  NODE_ENV is not set — cookies will be insecure. Set NODE_ENV=production in deployment.');
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
const tellerRoutes = require('./routes/teller');
const googleDriveRoutes = require('./routes/googleDrive');

// Rate Limiters
const { aiLimiter, servicesLimiter, chatHistoryLimiter, portalLimiter } = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3000;

// Safe JSON parse — returns fallback on malformed data instead of crashing
function safeJsonParse(value, fallback = []) {
  if (typeof value !== 'string') return value || fallback;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

// Trust proxy for Railway/cloud deployments (fixes rate limiter X-Forwarded-For error)
app.set('trust proxy', 1);

// Request ID middleware — attach unique ID for tracing across logs
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 6)}`;
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
});

// Middleware
const cookieParser = require('cookie-parser');
app.use(cookieParser());
// CORS: support comma-separated CORS_ORIGINS env var for additional allowed
// origins (e.g. Tailscale dev IPs). Falls back to PORTAL_URL or local dev.
const corsExtra = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const corsBase = process.env.PORTAL_URL
  ? [process.env.PORTAL_URL.replace(/\/portal$/, '')]
  : ['http://localhost:3000', 'http://localhost:3001'];
const corsAllowed = [...new Set([...corsBase, ...corsExtra, 'http://100.97.31.74:3000', 'http://100.97.31.74:3001'])];
app.use(cors({
  origin: corsAllowed,
  credentials: true,
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
    },
  },
}));

// Teller Connect page needs permissive CSP for external scripts and iframes
app.use('/api/teller/connect-page', (req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src * 'unsafe-inline' 'unsafe-eval'; " +
    "script-src * 'unsafe-inline' 'unsafe-eval'; " +
    "frame-src *; " +
    "connect-src *; " +
    "img-src * data: blob:; " +
    "style-src * 'unsafe-inline';"
  );
  next();
});

// Stripe webhook needs raw body - MUST be before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// QBO webhook also needs raw body for HMAC-SHA256 signature verification.
// Same pattern as Stripe — keep this BEFORE express.json().
app.use('/api/integrations/qbo/webhook', express.raw({ type: '*/*' }));

// Twilio webhooks come in as application/x-www-form-urlencoded with the
// signature computed over the canonicalized form params. Mounted at
// `/webhooks/twilio` (outside /api) so it bypasses the per-router auth
// middleware that applies to /api/* — Twilio is unauthenticated and we
// validate via X-Twilio-Signature instead.
app.use('/webhooks/twilio', express.urlencoded({ extended: false }));

// Document extraction can receive large PDF base64 payloads
app.use('/api/documents', express.json({ limit: '50mb' }));
app.use(express.json({ limit: '10mb' }));

// Shared authentication middleware
const { authenticateUser } = require('./middleware/authenticate');
const { auditLog, recordAudit } = require('./middleware/auditLog');
const { enforceMonthlyBudget } = require('./services/aiBudget');

// Allow-listed shape for the free-text portions of the agent context object.
// Anything not on this list is dropped, anything over-length is truncated.
// The system prompt fences these values with <<USER_PROVIDED_CONTEXT>> markers,
// but defense-in-depth: keep the raw payload bounded too.
const STRING_CONTEXT_LIMITS = {
  businessName: 200,
  businessPhone: 40,
  businessEmail: 200,
  businessAddress: 400,
  userName: 200,
  userLanguage: 16,
  userRole: 32,
  ownerName: 200,
  responseStyle: 1000,
  aboutYou: 4000,
  learnedFacts: 8000,
  projectInstructions: 8000,
};
const BOOL_CONTEXT_KEYS = ['isSupervisor'];

function sanitizeContextPayload(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [k, max] of Object.entries(STRING_CONTEXT_LIMITS)) {
    const v = input[k];
    if (typeof v === 'string') {
      out[k] = v.slice(0, max);
    }
  }
  for (const k of BOOL_CONTEXT_KEYS) {
    if (typeof input[k] === 'boolean') out[k] = input[k];
  }
  return out;
}

// Mount routes with rate limiting
app.use('/api', servicesLimiter, geocodingRoutes);
app.use('/api', servicesLimiter, transcriptionRoutes);
app.use('/api/stripe', servicesLimiter, stripeRoutes);
app.use('/api/subscription', servicesLimiter, stripeRoutes);
app.use('/api/teller', servicesLimiter, tellerRoutes);
app.use('/api/integrations/google-drive', servicesLimiter, googleDriveRoutes);

// Project sections AI generation
const projectSectionsRoutes = require('./routes/projectSections');
app.use('/api/project-sections', servicesLimiter, projectSectionsRoutes);

// AI helpers (suggest checklist/labor for ProjectBuilder)
const aiRoutes = require('./routes/ai');
app.use('/api/ai', aiLimiter, aiRoutes);

// Project documents proxy (upload/download via backend since storage.objects RLS needs storage_admin)
const projectDocsRoutes = require('./routes/projectDocs');
app.use('/api/project-docs', express.json({ limit: '30mb' }), servicesLimiter, projectDocsRoutes);

// Service plans (recurring service management)
const servicePlanRoutes = require('./routes/servicePlans');
app.use('/api/service-plans', servicesLimiter, servicePlanRoutes);

// Service visits (visit tracking, generation, actions)
const serviceVisitRoutes = require('./routes/serviceVisits');
app.use('/api/service-visits', servicesLimiter, serviceVisitRoutes);

// Service routes (daily route management)
const serviceRouteRoutes = require('./routes/serviceRoutes');
app.use('/api/service-routes', servicesLimiter, serviceRouteRoutes);

// Client portal (public-facing client access)
const portalRoutes = require('./routes/portal');
app.use('/api/portal', portalLimiter, portalRoutes);

// Portal admin (owner-facing portal management)
const portalOwnerRoutes = require('./routes/portalOwner');
app.use('/api/portal-admin', portalLimiter, portalOwnerRoutes);

// Audit log (read-only history of write operations)
const auditRoutes = require('./routes/audit');
app.use('/api/audit', servicesLimiter, auditRoutes);

// SMS — two-way Twilio messaging (own router handles its own rate limiters)
const { smsApiRouter, smsWebhookRouter } = require('./routes/sms');
app.use('/api/sms', smsApiRouter);
app.use('/webhooks/twilio', smsWebhookRouter);

// MCP integrations — OAuth flows, connect/disconnect, runtime tool registration
const integrationsRoutes = require('./routes/integrations');
app.use('/api/integrations', servicesLimiter, integrationsRoutes);

// E-signature — owner request flow + public token-protected signing
const esignRoutes = require('./routes/esign');
app.use('/api/esign', portalLimiter, express.json({ limit: '15mb' }), esignRoutes);

// Subcontractor module — GC-side CRUD, sub-portal auth, public token-gated actions
const subsRoutes = require('./routes/subs');
app.use('/api/subs', servicesLimiter, subsRoutes);

const subPortalRoutes = require('./routes/subPortal');
app.use('/api/sub-portal', servicesLimiter, subPortalRoutes);

const subActionRoutes = require('./routes/subAction');
app.use('/api/sub-action', portalLimiter, subActionRoutes);

const complianceRoutes = require('./routes/compliance');
app.use('/api/compliance', express.json({ limit: '30mb' }), servicesLimiter, complianceRoutes);

const internalRoutes = require('./routes/internal');
app.use('/api/internal', internalRoutes);

const engagementsRoutes = require('./routes/engagements');
app.use('/api/engagements', servicesLimiter, engagementsRoutes);

const bidRequestsRoutes = require('./routes/bidRequests');
// 30mb to accommodate base64-encoded plans, photos, and specs
// (base64 inflates ~33%; a typical batch can hit 15-20mb).
app.use('/api/bid-requests', express.json({ limit: '30mb' }), servicesLimiter, bidRequestsRoutes);


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
      const controller = new AbortController();
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
      const controller = new AbortController();
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
      const controller = new AbortController();
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

  // 6. Teller — check if configured
  if (process.env.TELLER_APPLICATION_ID) {
    checks.teller = { status: 'ok', env: process.env.TELLER_ENV || 'sandbox' };
  } else {
    checks.teller = { status: 'skip', reason: 'TELLER_APPLICATION_ID not set' };
  }

  // 7. Environment variables — verify required vars are set
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
// APPLE APP SITE ASSOCIATION (Universal Links)
// ============================================================
app.get('/.well-known/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: 'TJ5BDPJ6XC.com.davidmoretti.constructionmanager',
          paths: ['/invite*'],
        },
      ],
    },
  });
});

// ============================================================
// INVITE DEEP LINK PAGE
// ============================================================
app.get('/invite', (req, res) => {
  const email = req.query.email || '';
  const role = req.query.role || 'team member';

  // This page serves as fallback when app is not installed
  res.send(renderTemplate('invite', { email, role }));
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

// ============================================================
// SUPPORT PAGE
// ============================================================
app.get('/support', (req, res) => {
  res.send(renderTemplate('support'));
});

// Non-streaming chat endpoint (with AI rate limiting)
app.post('/api/chat', aiLimiter, authenticateUser, enforceMonthlyBudget, async (req, res) => {
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

// DOCX text extraction endpoint
const mammoth = require('mammoth');

app.post('/api/documents/extract-text-docx', aiLimiter, authenticateUser, async (req, res) => {
  try {
    const { base64, filename } = req.body;

    // Input validation
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing or invalid base64 field' });
    }
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing or invalid filename field' });
    }

    // Strip data URL prefix if present (e.g. "data:application/vnd.openxmlformats...;base64,")
    const rawBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

    // Size guard: reject if decoded size > 10MB
    const estimatedBytes = Math.ceil((rawBase64.length * 3) / 4);
    const MAX_BYTES = 10 * 1024 * 1024;
    if (estimatedBytes > MAX_BYTES) {
      return res.status(413).json({ success: false, error: 'File too large for text extraction' });
    }

    const buffer = Buffer.from(rawBase64, 'base64');

    // mammoth returns { value: string, messages: [] } — use .value for the text
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value || '';
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    logger.info(`📄 DOCX extracted: ${text.length} chars, ${wordCount} words from ${filename}`);

    return res.json({ text, wordCount, success: true });
  } catch (err) {
    logger.error('[extract-text-docx] Extraction failed:', err.message);
    // Return 200 with success: false to match existing PDF endpoint pattern
    return res.status(200).json({ text: '', wordCount: 0, success: false });
  }
});

app.post('/api/chat/vision', aiLimiter, authenticateUser, enforceMonthlyBudget, async (req, res) => {
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
app.post('/api/chat/stream', aiLimiter, authenticateUser, enforceMonthlyBudget, async (req, res) => {
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
// Processes requests in the background — continues even if client disconnects
const { processAgentRequest } = require('./services/agentService');

app.post('/api/chat/agent', aiLimiter, authenticateUser, enforceMonthlyBudget, async (req, res) => {
  const { messages, context: rawContext, attachments, sessionId } = req.body;
  // Use authenticated user ID from JWT, ignore any user_id in body
  const user_id = req.user.id;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  // Allow-list context fields to defang prompt-injection via free-text input.
  // The AI agent's system prompt interpolates these strings, so unbounded
  // input here would let any client rewrite the agent's instructions.
  const context = sanitizeContextPayload(rawContext);

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OpenRouter API key not configured' });
  }

  // Create a persistent job record so results survive disconnects
  const { data: job, error: jobError } = await supabase
    .from('agent_jobs')
    .insert({ user_id, status: 'processing' })
    .select('id')
    .single();

  if (jobError) {
    logger.error('Failed to create agent job:', jobError);
    return res.status(500).json({ error: 'Failed to start agent job' });
  }

  const jobId = job.id;

  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Disable Nagle's algorithm so SSE events flush immediately
  if (res.socket) res.socket.setNoDelay(true);
  res.flushHeaders();

  // Send jobId as the FIRST event so the frontend can track this request
  res.write(`data: ${JSON.stringify({ type: 'job_id', jobId })}\n\n`);
  if (typeof res.flush === 'function') res.flush();

  logger.info(`🤖 Agent request from user ${user_id.substring(0, 8)}... (job: ${jobId.substring(0, 8)})`);

  // Await the agent loop — keeps the SSE response open for streaming.
  // When client disconnects, the loop continues (writes to DB instead of SSE).
  // The await resolves when the loop finishes, then we close the response.
  try {
    await processAgentRequest(messages, user_id, context || {}, res, req, jobId, attachments, sessionId);
  } catch (error) {
    logger.error('Agent processing error:', error);
    const message = error.isTimeout ? 'Agent timed out. Please try again.' : error.message;
    try {
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    } catch (e) { /* client gone */ }
  }

  try { res.end(); } catch (e) { /* already closed */ }
});

// 📊 AGENT LATEST JOB ENDPOINT - Find user's most recent active job
// Used when frontend lost the jobId (e.g., app backgrounded before SSE delivered it)
app.get('/api/chat/agent-latest', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  const { data: job, error } = await supabase
    .from('agent_jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['processing', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !job) {
    return res.json({ job: null });
  }

  // Only return jobs created in the last 5 minutes (avoid stale jobs)
  const ageMs = Date.now() - new Date(job.created_at).getTime();
  if (ageMs > 5 * 60 * 1000) {
    return res.json({ job: null });
  }

  res.json({
    job: {
      jobId: job.id,
      status: job.status,
      accumulatedText: job.accumulated_text || '',
      visualElements: safeJsonParse(job.visual_elements, []),
      actions: safeJsonParse(job.actions, []),
      error: job.error_message,
      createdAt: job.created_at,
      completedAt: job.completed_at,
    },
  });
});

// 📊 AGENT JOB POLLING ENDPOINT - Retrieve results for background jobs
app.get('/api/chat/agent/:jobId', authenticateUser, async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.id;

  const { data: job, error } = await supabase
    .from('agent_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single();

  if (error || !job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    jobId: job.id,
    status: job.status,
    accumulatedText: job.accumulated_text || '',
    visualElements: safeJsonParse(job.visual_elements, []),
    actions: safeJsonParse(job.actions, []),
    error: job.error_message,
    createdAt: job.created_at,
    completedAt: job.completed_at,
  });
});

// ⚡ GROQ PLANNING ENDPOINT - Ultra-fast inference for agent routing
// Uses Groq's Llama 3.1 70B for 300+ tokens/sec planning
app.post('/api/chat/planning', aiLimiter, authenticateUser, enforceMonthlyBudget, async (req, res) => {
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
      .select('id, title, created_at, updated_at, last_message_at, is_archived, chat_messages(count)')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Flatten message_count from Supabase's nested aggregation format
    const sessionsWithCount = (sessions || []).map(s => ({
      ...s,
      message_count: s.chat_messages?.[0]?.count ?? 0,
      chat_messages: undefined,
    }));

    res.json({ sessions: sessionsWithCount });
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

// Save a message to a session.
// Routes through memoryService.persistMessage so the message gets embedded
// (1536-d via OpenRouter) and indexed for semantic recall. Without this
// every frontend save bypassed the embedding pipeline, leaving 95% of
// chat_messages without vectors and breaking semantic memory.
const memoryService = require('./services/memory/memoryService');
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

    const { messageId } = await memoryService.persistMessage({
      sessionId,
      userId,
      role,
      content: typeof content === 'string' ? content : JSON.stringify(content || ''),
      visualElements: visualElements || [],
      actions: actions || [],
    });

    if (!messageId) {
      return res.status(500).json({ error: 'Failed to persist message' });
    }

    // Update session's last_message_at (persistMessage handles message_count)
    await supabase
      .from('chat_sessions')
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    res.json({ message: { id: messageId } });
  } catch (error) {
    // Log the full error so Railway logs surface what actually went
    // wrong. The frontend just sees "Failed to save message" — fine —
    // but operators need the underlying cause.
    logger.error('Error saving message:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack?.split('\n').slice(0, 5).join('\n'),
    });
    res.status(500).json({ error: 'Failed to save message', detail: error?.message });
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

// ============================================================
// TIME TRACKING - Edit time entries (uses service role to bypass RLS)
// ============================================================

app.patch('/api/time-entries/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { clock_in, clock_out, table } = req.body;
    const userId = req.user.id;

    if (!clock_in || !clock_out) {
      return res.status(400).json({ error: 'clock_in and clock_out are required' });
    }

    const clockInDate = new Date(clock_in);
    const clockOutDate = new Date(clock_out);
    if (clockOutDate <= clockInDate) {
      return res.status(400).json({ error: 'clock_out must be after clock_in' });
    }

    const hoursWorked = (clockOutDate - clockInDate) / (1000 * 60 * 60);
    const tableName = table === 'supervisor' ? 'supervisor_time_tracking' : 'time_tracking';
    const ownerField = table === 'supervisor' ? 'supervisor_id' : 'worker_id';

    // Capture before-state for audit (full row, not just owner field).
    const { data: beforeRow } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    // Verify the record exists
    const { data: record, error: fetchError } = await supabase
      .from(tableName)
      .select(`id, ${ownerField}`)
      .eq('id', id)
      .single();

    if (fetchError || !record) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    // Verify the requesting user is the owner of the worker/supervisor
    // or is the worker/supervisor themselves
    const recordOwnerId = record[ownerField];
    let authorized = recordOwnerId === userId;

    if (!authorized) {
      // Check if user is the owner of this worker/supervisor
      const { data: profile } = await supabase
        .from('profiles')
        .select('owner_id')
        .eq('id', recordOwnerId)
        .single();

      authorized = profile?.owner_id === userId;
    }

    if (!authorized) {
      // Also check workers table for worker entries
      if (table !== 'supervisor') {
        const { data: worker } = await supabase
          .from('workers')
          .select('owner_id')
          .eq('id', recordOwnerId)
          .single();

        authorized = worker?.owner_id === userId;

        // Also allow supervisors assigned to the worker's project
        if (!authorized && worker) {
          const { data: project } = await supabase
            .from('time_tracking')
            .select('project_id, projects!inner(assigned_supervisor_id)')
            .eq('id', id)
            .single();

          authorized = project?.projects?.assigned_supervisor_id === userId;
        }
      }
    }

    if (!authorized) {
      return res.status(403).json({ error: 'Not authorized to edit this time entry' });
    }

    // Build update object
    const updates = { clock_in, clock_out };
    if (table !== 'supervisor') {
      updates.hours_worked = hoursWorked;
    }

    const { error: updateError } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', id);

    if (updateError) {
      logger.error('Error updating time entry:', updateError);
      return res.status(500).json({ error: 'Failed to update time entry' });
    }

    res.json({ success: true, hours_worked: hoursWorked });

    // Audit (fire-and-forget, after response).
    (async () => {
      const { data: afterRow } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      const ownerId = beforeRow?.owner_id || beforeRow?.user_id || userId;
      recordAudit({
        companyId: ownerId,
        actorUserId: userId,
        actorType: 'user',
        action: 'update',
        entityType: 'time_entry',
        entityId: id,
        beforeJson: beforeRow,
        afterJson: afterRow,
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
        source: req.headers?.['x-client'] || 'api',
      });
    })().catch(e => logger.error('[Audit] time-entry write failed:', e.message));
  } catch (error) {
    logger.error('Error in time entry edit:', error);
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// ============================================================
// SUPERVISOR PROFILE - Update supervisor (uses service role to bypass RLS)
// ============================================================

app.patch('/api/supervisors/:id', authenticateUser, auditLog({
  entityType: 'supervisor',
  table: 'profiles',
  getCompanyId: (req, beforeRow) => beforeRow?.owner_id || req?.user?.id,
}), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      business_name, business_phone, payment_type,
      hourly_rate, daily_rate, weekly_salary, project_rate,
      can_create_projects, can_create_estimates, can_create_invoices,
      can_message_clients, can_pay_workers, can_manage_workers,
    } = req.body;

    // Verify the supervisor exists and belongs to this owner
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('id, owner_id, role')
      .eq('id', id)
      .single();

    if (fetchError || !profile) {
      return res.status(404).json({ error: 'Supervisor not found' });
    }

    if (profile.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to edit this supervisor' });
    }

    // Build update object with only provided fields
    const updates = {};
    if (business_name !== undefined) updates.business_name = business_name;
    if (business_phone !== undefined) updates.business_phone = business_phone;
    if (payment_type !== undefined) updates.payment_type = payment_type;
    if (hourly_rate !== undefined) updates.hourly_rate = hourly_rate;
    if (daily_rate !== undefined) updates.daily_rate = daily_rate;
    if (weekly_salary !== undefined) updates.weekly_salary = weekly_salary;
    if (project_rate !== undefined) updates.project_rate = project_rate;
    if (can_create_projects !== undefined) updates.can_create_projects = !!can_create_projects;
    if (can_create_estimates !== undefined) updates.can_create_estimates = !!can_create_estimates;
    if (can_create_invoices !== undefined) updates.can_create_invoices = !!can_create_invoices;
    if (can_message_clients !== undefined) updates.can_message_clients = !!can_message_clients;
    if (can_pay_workers !== undefined) updates.can_pay_workers = !!can_pay_workers;
    if (can_manage_workers !== undefined) updates.can_manage_workers = !!can_manage_workers;

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id);

    if (updateError) {
      logger.error('Error updating supervisor profile:', updateError);
      return res.status(500).json({ error: 'Failed to update supervisor' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error in supervisor profile edit:', error);
    res.status(500).json({ error: 'Failed to update supervisor' });
  }
});

app.delete('/api/supervisors/:id', authenticateUser, auditLog({
  entityType: 'supervisor',
  table: 'profiles',
  action: 'update', // soft "unlink" (sets owner_id=null), not a hard delete
  getCompanyId: (req, beforeRow) => beforeRow?.owner_id || req?.user?.id,
}), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('id, owner_id')
      .eq('id', id)
      .single();

    if (fetchError || !profile) {
      return res.status(404).json({ error: 'Supervisor not found' });
    }

    if (profile.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Unlink supervisor from owner (don't delete the profile)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ owner_id: null })
      .eq('id', id);

    if (updateError) {
      logger.error('Error removing supervisor:', updateError);
      return res.status(500).json({ error: 'Failed to remove supervisor' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error in supervisor removal:', error);
    res.status(500).json({ error: 'Failed to remove supervisor' });
  }
});

// Export app for testing with supertest (before listen)
module.exports = app;

// Cleanup old/stale agent jobs
async function cleanupAgentJobs() {
  try {
    // Mark stale processing jobs as error (e.g., server restarted mid-processing)
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase.from('agent_jobs')
      .update({ status: 'error', error_message: 'Server restarted during processing', updated_at: new Date().toISOString() })
      .eq('status', 'processing')
      .lt('updated_at', staleThreshold);

    // Delete completed/error jobs older than 24 hours
    const ttlThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('agent_jobs')
      .delete()
      .lt('created_at', ttlThreshold);
  } catch (e) {
    logger.error('Agent job cleanup error:', e.message);
  }
}

// Start server only when run directly (not when imported by tests)
if (require.main === module) {
  // Run cleanup on startup and periodically
  cleanupAgentJobs();
  setInterval(cleanupAgentJobs, 6 * 60 * 60 * 1000); // Every 6 hours

  // Daily billing nudge — emits stale-action notifications for draws,
  // invoices, and COs that need owner attention. Idempotent server-side.
  try {
    const { startBillingNudgeJob } = require('./services/billingNudgeJob');
    startBillingNudgeJob();
  } catch (e) {
    logger.warn('Billing nudge job failed to start:', e.message);
  }

  // Push dispatcher — every minute, ships any unpushed notifications to
  // the user's device via Expo push. Respects per-category preferences
  // and quiet hours. Single source of truth: notifications table.
  try {
    const { startPushDispatchJob } = require('./services/pushDispatchJob');
    startPushDispatchJob();
  } catch (e) {
    logger.warn('Push dispatch job failed to start:', e.message);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
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
    if (process.env.TELLER_APPLICATION_ID) {
      logger.info(`   Teller bank integration enabled (${process.env.TELLER_ENV || 'sandbox'})`);
    }
  });

  function gracefulShutdown(signal) {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    // Force exit after 10 seconds if connections don't close
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
