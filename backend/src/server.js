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

// ============================================================
// PRICING PAGE - Mobile-friendly pricing for App Store compliance
// ============================================================
app.get('/pricing', (req, res) => {
  const baseUrl = process.env.NODE_ENV === 'production'
    ? 'https://construciton-production.up.railway.app'
    : `http://localhost:${PORT}`;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <title>Construction Manager - Pricing</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
          min-height: 100vh;
          color: white;
          padding: 20px;
          padding-bottom: 40px;
        }
        .container { max-width: 500px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 30px; padding-top: 20px; }
        .logo {
          width: 64px; height: 64px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          border-radius: 16px;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 16px;
          font-size: 28px;
        }
        h1 { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
        .subtitle { color: #94a3b8; font-size: 16px; }
        .trial-badge {
          display: inline-block;
          background: linear-gradient(135deg, #10b981, #059669);
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          margin-top: 16px;
        }
        .plans { display: flex; flex-direction: column; gap: 16px; margin-bottom: 30px; }
        .plan {
          background: rgba(255,255,255,0.05);
          border: 2px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          padding: 24px;
          position: relative;
          transition: all 0.2s;
        }
        .plan:hover { border-color: rgba(255,255,255,0.2); }
        .plan.popular {
          border-color: #3b82f6;
          background: rgba(59,130,246,0.1);
        }
        .popular-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: #3b82f6;
          padding: 4px 16px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
        }
        .plan-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
        .plan-name { font-size: 20px; font-weight: 700; }
        .plan-desc { font-size: 14px; color: #94a3b8; }
        .plan-price { text-align: right; }
        .price { font-size: 32px; font-weight: 800; color: #60a5fa; }
        .period { font-size: 14px; color: #64748b; }
        .features { list-style: none; margin-bottom: 20px; }
        .features li {
          padding: 8px 0;
          font-size: 14px;
          color: #cbd5e1;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .features li::before {
          content: "✓";
          color: #34d399;
          font-weight: bold;
        }
        .btn {
          display: block;
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          text-align: center;
          text-decoration: none;
          transition: all 0.2s;
        }
        .btn-primary {
          background: linear-gradient(135deg, #3b82f6, #06b6d4);
          color: white;
        }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-secondary {
          background: rgba(255,255,255,0.1);
          color: white;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .btn-secondary:hover { background: rgba(255,255,255,0.15); }
        .footer {
          text-align: center;
          padding-top: 20px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }
        .footer p { color: #64748b; font-size: 14px; margin-bottom: 16px; }
        .footer-links { display: flex; justify-content: center; gap: 20px; }
        .footer-links a { color: #94a3b8; text-decoration: none; font-size: 14px; }
        .footer-links a:hover { color: white; }
        .loading { display: none; }
        .btn.loading .btn-text { display: none; }
        .btn.loading .loading { display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner {
          width: 20px; height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          display: inline-block;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🏗️</div>
          <h1>Choose Your Plan</h1>
          <p class="subtitle">Manage your construction projects like a pro</p>
          <div class="trial-badge">🎉 7-Day Free Trial</div>
        </div>

        <div class="plans">
          <!-- Starter -->
          <div class="plan">
            <div class="plan-header">
              <div>
                <div class="plan-name">Starter</div>
                <div class="plan-desc">Solo contractors</div>
              </div>
              <div class="plan-price">
                <div class="price">$49</div>
                <div class="period">/month</div>
              </div>
            </div>
            <ul class="features">
              <li>3 active projects</li>
              <li>AI estimates (20/mo)</li>
              <li>Invoice creation</li>
              <li>Email support</li>
            </ul>
            <button class="btn btn-secondary" onclick="startCheckout('starter', this)">
              <span class="btn-text">Start Free Trial</span>
              <span class="loading"><span class="spinner"></span></span>
            </button>
          </div>

          <!-- Pro (Popular) -->
          <div class="plan popular">
            <div class="popular-badge">MOST POPULAR</div>
            <div class="plan-header">
              <div>
                <div class="plan-name">Pro</div>
                <div class="plan-desc">Growing teams</div>
              </div>
              <div class="plan-price">
                <div class="price">$79</div>
                <div class="period">/month</div>
              </div>
            </div>
            <ul class="features">
              <li>10 active projects</li>
              <li>Unlimited AI estimates</li>
              <li>Team management</li>
              <li>Financial tracking</li>
              <li>Priority support</li>
            </ul>
            <button class="btn btn-primary" onclick="startCheckout('pro', this)">
              <span class="btn-text">Start Free Trial</span>
              <span class="loading"><span class="spinner"></span></span>
            </button>
          </div>

          <!-- Business -->
          <div class="plan">
            <div class="plan-header">
              <div>
                <div class="plan-name">Business</div>
                <div class="plan-desc">Large companies</div>
              </div>
              <div class="plan-price">
                <div class="price">$149</div>
                <div class="period">/month</div>
              </div>
            </div>
            <ul class="features">
              <li>Unlimited projects</li>
              <li>Unlimited AI estimates</li>
              <li>Unlimited team members</li>
              <li>Advanced analytics</li>
              <li>Phone support</li>
              <li>Custom integrations</li>
            </ul>
            <button class="btn btn-secondary" onclick="startCheckout('business', this)">
              <span class="btn-text">Start Free Trial</span>
              <span class="loading"><span class="spinner"></span></span>
            </button>
          </div>
        </div>

        <div class="footer">
          <p>Cancel anytime. No questions asked.</p>
          <div class="footer-links">
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
          </div>
        </div>
      </div>

      <script>
        async function startCheckout(tier, button) {
          button.classList.add('loading');
          try {
            const response = await fetch('${baseUrl}/api/stripe/create-guest-checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tier })
            });
            const data = await response.json();
            if (data.url) {
              window.location.href = data.url;
            } else {
              throw new Error(data.error || 'Failed to create checkout');
            }
          } catch (error) {
            alert('Error: ' + error.message);
            button.classList.remove('loading');
          }
        }
      </script>
    </body>
    </html>
  `);
});

// ============================================================
// PRIVACY POLICY PAGE
// ============================================================
app.get('/privacy', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Privacy Policy - Construction Manager</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0f172a;
          color: #e2e8f0;
          line-height: 1.7;
          padding: 20px;
        }
        .container { max-width: 700px; margin: 0 auto; }
        h1 { font-size: 28px; margin-bottom: 8px; color: white; }
        .updated { color: #64748b; font-size: 14px; margin-bottom: 32px; }
        h2 { font-size: 20px; color: white; margin-top: 32px; margin-bottom: 16px; }
        p { margin-bottom: 16px; color: #cbd5e1; }
        ul { margin-left: 20px; margin-bottom: 16px; color: #cbd5e1; }
        li { margin-bottom: 8px; }
        a { color: #60a5fa; }
        .back-link { display: inline-block; margin-bottom: 24px; color: #60a5fa; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <a href="/pricing" class="back-link">← Back to Pricing</a>
        <h1>Privacy Policy</h1>
        <p class="updated">Last Updated: January 27, 2025</p>

        <h2>1. Introduction</h2>
        <p>Construction Manager ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application.</p>

        <h2>2. Information We Collect</h2>
        <p><strong>Personal Information:</strong></p>
        <ul>
          <li>Account information: Email address, password, and user role</li>
          <li>Business information: Company name, phone number, trade specializations</li>
          <li>Worker data: Names, contact information, pay rates</li>
          <li>Project data: Addresses, budgets, financial transactions</li>
        </ul>
        <p><strong>Device Permissions:</strong></p>
        <ul>
          <li>Location: For job site distance calculations and time tracking verification</li>
          <li>Camera/Photos: For project documentation and daily reports</li>
          <li>Microphone: For voice-to-text input features</li>
          <li>Notifications: For project updates and reminders</li>
        </ul>

        <h2>3. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul>
          <li>Provide and maintain the app's functionality</li>
          <li>Process payments and manage subscriptions</li>
          <li>Enable project management and communication features</li>
          <li>Generate AI-powered estimates and suggestions</li>
          <li>Send notifications and alerts</li>
        </ul>

        <h2>4. Third-Party Services</h2>
        <p>We share data with these service providers:</p>
        <ul>
          <li><strong>Supabase:</strong> Database, authentication, file storage</li>
          <li><strong>Stripe:</strong> Payment processing</li>
          <li><strong>Twilio:</strong> SMS and WhatsApp messaging</li>
          <li><strong>Google Maps:</strong> Geocoding and location services</li>
          <li><strong>Anthropic Claude AI:</strong> AI-powered features</li>
          <li><strong>OpenAI:</strong> Image analysis</li>
          <li><strong>Deepgram:</strong> Speech-to-text transcription</li>
        </ul>

        <h2>5. Data Security</h2>
        <p>Your data is protected with:</p>
        <ul>
          <li>HTTPS/TLS encryption for all data transmission</li>
          <li>Encrypted storage at rest</li>
          <li>Row-level security ensuring users only access their own data</li>
          <li>Secure authentication with hashed passwords</li>
        </ul>

        <h2>6. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access and export your personal data</li>
          <li>Correct inaccurate information</li>
          <li>Request deletion of your account and data</li>
          <li>Opt out of optional features like location tracking</li>
        </ul>

        <h2>7. Data Retention</h2>
        <p>We retain your data for as long as your account is active. Upon account deletion, your data will be permanently removed from our systems within 30 days.</p>

        <h2>8. Children's Privacy</h2>
        <p>Construction Manager is not intended for use by children under 13 years of age. We do not knowingly collect personal information from children.</p>

        <h2>9. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify you of material changes through the app.</p>

        <h2>10. Contact Us</h2>
        <p>If you have questions about this Privacy Policy, please contact us at: <a href="mailto:privacy@constructionmanager.app">privacy@constructionmanager.app</a></p>
      </div>
    </body>
    </html>
  `);
});

// ============================================================
// TERMS OF SERVICE PAGE
// ============================================================
app.get('/terms', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Terms of Service - Construction Manager</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0f172a;
          color: #e2e8f0;
          line-height: 1.7;
          padding: 20px;
        }
        .container { max-width: 700px; margin: 0 auto; }
        h1 { font-size: 28px; margin-bottom: 8px; color: white; }
        .updated { color: #64748b; font-size: 14px; margin-bottom: 32px; }
        h2 { font-size: 20px; color: white; margin-top: 32px; margin-bottom: 16px; }
        p { margin-bottom: 16px; color: #cbd5e1; }
        ul { margin-left: 20px; margin-bottom: 16px; color: #cbd5e1; }
        li { margin-bottom: 8px; }
        a { color: #60a5fa; }
        .back-link { display: inline-block; margin-bottom: 24px; color: #60a5fa; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <a href="/pricing" class="back-link">← Back to Pricing</a>
        <h1>Terms of Service</h1>
        <p class="updated">Last Updated: January 27, 2025</p>

        <h2>1. Acceptance of Terms</h2>
        <p>By downloading, installing, or using the Construction Manager mobile application ("App"), you agree to be bound by these Terms of Service. If you do not agree, do not use the App.</p>

        <h2>2. Description of Service</h2>
        <p>Construction Manager is a project management application for construction professionals, providing:</p>
        <ul>
          <li>Project tracking and management</li>
          <li>AI-powered estimate generation</li>
          <li>Worker scheduling and time tracking</li>
          <li>Invoice and estimate creation</li>
          <li>Client communication tools</li>
        </ul>

        <h2>3. Account Registration</h2>
        <p>You must create an account with a valid email address and password. You are responsible for maintaining the confidentiality of your account credentials and all activities under your account.</p>

        <h2>4. Subscription and Payment</h2>
        <ul>
          <li>The App offers subscription plans: Starter ($49/mo), Pro ($79/mo), and Business ($149/mo)</li>
          <li>New users receive a 7-day free trial</li>
          <li>Payments are processed securely through Stripe</li>
          <li>Subscriptions auto-renew monthly unless cancelled</li>
          <li>You may cancel anytime; cancellation takes effect at the end of the billing period</li>
        </ul>

        <h2>5. User Responsibilities</h2>
        <p>You agree to:</p>
        <ul>
          <li>Use the App only for lawful purposes</li>
          <li>Provide accurate information</li>
          <li>Not share your account credentials</li>
          <li>Not attempt to reverse engineer the App</li>
          <li>Not use automated systems without permission</li>
        </ul>

        <h2>6. Intellectual Property</h2>
        <p>The App, including its design, features, and technology, is owned by Construction Manager and protected by intellectual property laws. You may not copy, modify, or distribute any part of the App without permission.</p>

        <h2>7. AI-Generated Content</h2>
        <p>AI-generated estimates and suggestions are for informational purposes only. You are responsible for verifying all information before use in actual business operations.</p>

        <h2>8. Disclaimer of Warranties</h2>
        <p>THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. We do not warrant that the App will be uninterrupted, error-free, or meet your specific requirements.</p>

        <h2>9. Limitation of Liability</h2>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, we shall not be liable for any indirect, incidental, or consequential damages. Our total liability shall not exceed the amount you paid in the twelve months preceding any claim.</p>

        <h2>10. Termination</h2>
        <p>You may terminate your account at any time. We may suspend or terminate your account if you violate these Terms. Upon termination, your right to use the App ceases immediately.</p>

        <h2>11. Changes to Terms</h2>
        <p>We may modify these Terms at any time. Continued use of the App after changes constitutes acceptance of the modified Terms.</p>

        <h2>12. Contact</h2>
        <p>Questions about these Terms? Contact us at: <a href="mailto:support@constructionmanager.app">support@constructionmanager.app</a></p>
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
