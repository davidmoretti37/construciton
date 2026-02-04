require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Utilities
const logger = require('./utils/logger');
const { fetchOpenRouter, fetchOpenRouterVision, fetchOpenRouterStream, fetchGroq } = require('./utils/fetchWithRetry');
const pdfParse = require('pdf-parse');

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

// Document extraction can receive large PDF base64 payloads
app.use('/api/documents', express.json({ limit: '50mb' }));
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

// Billing complete page - redirect back to app after managing billing
app.get('/billing-complete', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Billing Updated</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               display: flex; justify-content: center; align-items: center;
               min-height: 100vh; margin: 0; background: #1a1a2e; color: white; }
        .container { text-align: center; padding: 40px; }
        h1 { margin-bottom: 10px; color: #10b981; }
        p { color: #888; line-height: 1.6; }
        .checkmark { font-size: 64px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="checkmark">✓</div>
        <h1>Billing Updated</h1>
        <p>Your changes have been saved.<br>You can close this page to return to the app.</p>
      </div>
    </body>
    </html>
  `);
});

// ============================================================
// PRICING PAGE - Premium design with animations
// ============================================================
app.get('/pricing', (req, res) => {
  const baseUrl = process.env.NODE_ENV === 'production'
    ? 'https://construciton-production.up.railway.app'
    : `http://localhost:${PORT}`;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <title>Construction Manager - Pricing</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg-primary: #030014;
          --bg-card: rgba(255, 255, 255, 0.03);
          --border-subtle: rgba(255, 255, 255, 0.06);
          --border-hover: rgba(255, 255, 255, 0.1);
          --text-primary: #ffffff;
          --text-secondary: #a1a1aa;
          --text-muted: #71717a;
          --accent-blue: #3b82f6;
          --accent-purple: #8b5cf6;
          --accent-cyan: #06b6d4;
          --accent-emerald: #10b981;
        }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: var(--bg-primary);
          min-height: 100vh;
          color: var(--text-primary);
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        /* Animated Background */
        .bg-gradient {
          position: fixed;
          inset: 0;
          z-index: -1;
          overflow: hidden;
        }

        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.5;
          animation: float 20s ease-in-out infinite;
        }

        .orb-1 {
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, transparent 70%);
          top: -200px;
          left: -200px;
          animation-delay: 0s;
        }

        .orb-2 {
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%);
          top: 50%;
          right: -150px;
          animation-delay: -5s;
        }

        .orb-3 {
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(6, 182, 212, 0.3) 0%, transparent 70%);
          bottom: -100px;
          left: 30%;
          animation-delay: -10s;
        }

        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -30px) scale(1.05); }
          50% { transform: translate(-20px, 20px) scale(0.95); }
          75% { transform: translate(20px, 10px) scale(1.02); }
        }

        /* Grid pattern overlay */
        .grid-pattern {
          position: fixed;
          inset: 0;
          z-index: -1;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px 60px;
          position: relative;
        }

        /* Header */
        .header {
          text-align: center;
          margin-bottom: 60px;
          animation: fadeInUp 0.8s ease-out;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .logo {
          width: 72px;
          height: 72px;
          background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          font-size: 32px;
          box-shadow: 0 20px 40px -10px rgba(59, 130, 246, 0.3);
          animation: logoGlow 3s ease-in-out infinite;
        }

        @keyframes logoGlow {
          0%, 100% { box-shadow: 0 20px 40px -10px rgba(59, 130, 246, 0.3); }
          50% { box-shadow: 0 25px 50px -5px rgba(139, 92, 246, 0.4); }
        }

        h1 {
          font-size: clamp(32px, 5vw, 48px);
          font-weight: 800;
          margin-bottom: 16px;
          background: linear-gradient(135deg, #fff 0%, #a1a1aa 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.02em;
        }

        .subtitle {
          font-size: 18px;
          color: var(--text-secondary);
          max-width: 400px;
          margin: 0 auto 24px;
          line-height: 1.6;
        }

        .trial-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2));
          border: 1px solid rgba(16, 185, 129, 0.3);
          padding: 10px 20px;
          border-radius: 100px;
          font-size: 14px;
          font-weight: 600;
          color: var(--accent-emerald);
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }

        /* Pricing Cards Container */
        .plans {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 24px;
          margin-bottom: 60px;
        }

        /* Individual Plan Card */
        .plan {
          background: var(--bg-card);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          padding: 32px;
          position: relative;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          animation: fadeInUp 0.8s ease-out backwards;
          overflow: hidden;
        }

        .plan:nth-child(1) { animation-delay: 0.1s; }
        .plan:nth-child(2) { animation-delay: 0.2s; }
        .plan:nth-child(3) { animation-delay: 0.3s; }

        .plan::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 24px;
          padding: 1px;
          background: linear-gradient(135deg, transparent, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          transition: background 0.4s ease;
        }

        .plan:hover {
          transform: translateY(-8px);
          border-color: var(--border-hover);
          box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.5);
        }

        .plan:hover::before {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(139, 92, 246, 0.3));
        }

        /* Popular Plan Styling */
        .plan.popular {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.05));
          border-color: rgba(59, 130, 246, 0.3);
          transform: scale(1.02);
        }

        .plan.popular:hover {
          transform: scale(1.02) translateY(-8px);
        }

        .plan.popular::before {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.5), rgba(139, 92, 246, 0.5));
        }

        .popular-badge {
          position: absolute;
          top: -1px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
          padding: 8px 20px;
          border-radius: 0 0 12px 12px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .plan-name {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .plan-desc {
          font-size: 14px;
          color: var(--text-muted);
          margin-bottom: 24px;
        }

        .price-container {
          margin-bottom: 24px;
        }

        .price {
          font-size: 48px;
          font-weight: 800;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #fff, var(--accent-blue));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .plan.popular .price {
          background: linear-gradient(135deg, #fff, var(--accent-cyan));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .period {
          font-size: 16px;
          color: var(--text-muted);
          font-weight: 500;
        }

        .features {
          list-style: none;
          margin-bottom: 32px;
        }

        .features li {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          font-size: 14px;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-subtle);
        }

        .features li:last-child {
          border-bottom: none;
        }

        .check-icon {
          width: 20px;
          height: 20px;
          background: linear-gradient(135deg, var(--accent-emerald), var(--accent-cyan));
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .check-icon svg {
          width: 12px;
          height: 12px;
          stroke: white;
          stroke-width: 3;
        }

        /* Buttons */
        .btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 16px 24px;
          border: none;
          border-radius: 14px;
          font-family: inherit;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
          border: 1px solid var(--border-subtle);
        }

        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: var(--border-hover);
          transform: translateY(-2px);
        }

        .btn-primary {
          background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
          color: white;
          box-shadow: 0 10px 30px -10px rgba(59, 130, 246, 0.5);
        }

        .btn-primary:hover {
          box-shadow: 0 15px 40px -10px rgba(59, 130, 246, 0.6);
          transform: translateY(-2px);
        }

        /* Shimmer effect */
        .btn-primary::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          animation: shimmer 3s infinite;
        }

        @keyframes shimmer {
          0% { left: -100%; }
          100% { left: 100%; }
        }

        .btn.loading .btn-text { display: none; }
        .btn.loading .loading-spinner { display: flex; }

        .loading-spinner {
          display: none;
          align-items: center;
          gap: 8px;
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Trust Section */
        .trust-section {
          text-align: center;
          margin-bottom: 40px;
          animation: fadeInUp 0.8s ease-out 0.4s backwards;
        }

        .trust-badges {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 32px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }

        .trust-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-muted);
          font-size: 14px;
        }

        .trust-badge svg {
          width: 20px;
          height: 20px;
          opacity: 0.7;
        }

        .guarantee {
          color: var(--text-secondary);
          font-size: 14px;
        }

        /* Footer */
        .footer {
          text-align: center;
          padding-top: 32px;
          border-top: 1px solid var(--border-subtle);
          animation: fadeInUp 0.8s ease-out 0.5s backwards;
        }

        .footer-links {
          display: flex;
          justify-content: center;
          gap: 32px;
          margin-bottom: 20px;
        }

        .footer-links a {
          color: var(--text-muted);
          text-decoration: none;
          font-size: 14px;
          transition: color 0.2s;
        }

        .footer-links a:hover {
          color: var(--text-primary);
        }

        .copyright {
          color: var(--text-muted);
          font-size: 13px;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .container {
            padding: 24px 16px 40px;
          }

          .header {
            margin-bottom: 40px;
          }

          .plans {
            gap: 16px;
          }

          .plan {
            padding: 24px;
          }

          .plan.popular {
            transform: none;
          }

          .plan.popular:hover {
            transform: translateY(-8px);
          }

          .price {
            font-size: 40px;
          }

          .trust-badges {
            gap: 20px;
          }

          .footer-links {
            gap: 24px;
          }
        }
      </style>
    </head>
    <body>
      <!-- Animated Background -->
      <div class="bg-gradient">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
      </div>
      <div class="grid-pattern"></div>

      <div class="container">
        <!-- Header -->
        <div class="header">
          <div class="logo">🏗️</div>
          <h1>Simple, transparent pricing</h1>
          <p class="subtitle">Choose the perfect plan for your construction business. Scale as you grow.</p>
          <div class="trial-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
            </svg>
            7-day free trial on all plans
          </div>
        </div>

        <!-- Pricing Cards -->
        <div class="plans">
          <!-- Starter -->
          <div class="plan">
            <div class="plan-name">Starter</div>
            <div class="plan-desc">Perfect for solo contractors</div>
            <div class="price-container">
              <span class="price">$49</span>
              <span class="period">/month</span>
            </div>
            <ul class="features">
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                3 active projects
              </li>
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                AI-powered estimates (20/mo)
              </li>
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                Professional invoicing
              </li>
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                Email support
              </li>
            </ul>
            <button class="btn btn-secondary" onclick="startCheckout('starter', this)">
              <span class="btn-text">Start free trial</span>
              <span class="loading-spinner"><span class="spinner"></span> Processing...</span>
            </button>
          </div>

          <!-- Pro (Popular) -->
          <div class="plan popular">
            <div class="popular-badge">Most Popular</div>
            <div class="plan-name">Pro</div>
            <div class="plan-desc">For growing teams</div>
            <div class="price-container">
              <span class="price">$79</span>
              <span class="period">/month</span>
            </div>
            <ul class="features">
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                10 active projects
              </li>
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                Unlimited AI estimates
              </li>
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                Team management
              </li>
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                Financial tracking
              </li>
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                Priority support
              </li>
            </ul>
            <button class="btn btn-primary" onclick="startCheckout('pro', this)">
              <span class="btn-text">Start free trial</span>
              <span class="loading-spinner"><span class="spinner"></span> Processing...</span>
            </button>
          </div>

          <!-- Business -->
          <div class="plan">
            <div class="plan-name">Business</div>
            <div class="plan-desc">For established companies</div>
            <div class="price-container">
              <span class="price">$149</span>
              <span class="period">/month</span>
            </div>
            <ul class="features">
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                Unlimited projects
              </li>
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                Unlimited AI estimates
              </li>
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                Unlimited team members
              </li>
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                Advanced analytics
              </li>
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                Phone support
              </li>
              <li>
                <span class="check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></span>
                Custom integrations
              </li>
            </ul>
            <button class="btn btn-secondary" onclick="startCheckout('business', this)">
              <span class="btn-text">Start free trial</span>
              <span class="loading-spinner"><span class="spinner"></span> Processing...</span>
            </button>
          </div>
        </div>

        <!-- Trust Section -->
        <div class="trust-section">
          <div class="trust-badges">
            <div class="trust-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              SSL Secured
            </div>
            <div class="trust-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Stripe Payments
            </div>
            <div class="trust-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              Cancel anytime
            </div>
          </div>
          <p class="guarantee">30-day money-back guarantee. No questions asked.</p>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="footer-links">
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
          </div>
          <p class="copyright">© 2025 Construction Manager. All rights reserved.</p>
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
// PDF text extraction endpoint
app.post('/api/documents/extract-text', aiLimiter, async (req, res) => {
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
