# Security & Environment Setup Guide

This document provides comprehensive guidance for setting up and managing secrets in the Construction Manager application.

## Table of Contents

- [Quick Start](#quick-start)
- [API Keys Overview](#api-keys-overview)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Production Deployment](#production-deployment)
- [GitHub Actions Secrets](#github-actions-secrets)
- [Secret Rotation](#secret-rotation)
- [Security Best Practices](#security-best-practices)

---

## Quick Start

1. Copy example files to create your local environment:
   ```bash
   # Backend
   cp backend/.env.example backend/.env

   # Frontend
   cp frontend/.env.example frontend/.env
   ```

2. Fill in your API keys (see sections below for how to obtain each)

3. Never commit `.env` files to version control

---

## API Keys Overview

| Service | Variable | Location | Purpose |
|---------|----------|----------|---------|
| OpenRouter | `OPENROUTER_API_KEY` | backend/.env | AI chat & analysis |
| Deepgram | `DEEPGRAM_API_KEY` | backend/.env | Voice transcription |
| Google Maps | `GOOGLE_MAPS_API_KEY` | backend/.env | Geocoding & distances |
| Supabase | `EXPO_PUBLIC_SUPABASE_URL` | frontend/.env | Database connection |
| Supabase | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | frontend/.env | Public database access |

---

## Backend Setup

### OpenRouter API Key

OpenRouter provides access to multiple AI models including Claude and GPT.

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Sign up or log in
3. Click "Create Key"
4. Copy the key (starts with `sk-or-`)
5. Add to `backend/.env`:
   ```
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   ```

**Cost**: Pay-per-use based on model and tokens

### Deepgram API Key

Deepgram powers voice-to-text transcription.

1. Go to [console.deepgram.com](https://console.deepgram.com)
2. Sign up for a free account (includes $200 credit)
3. Navigate to API Keys
4. Create a new key
5. Add to `backend/.env`:
   ```
   DEEPGRAM_API_KEY=your-deepgram-key-here
   ```

**Cost**: Free tier includes $200 credit, then pay-per-minute

### Google Maps API Key

Google Maps powers geocoding and distance calculations.

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable these APIs:
   - Geocoding API
   - Distance Matrix API
4. Go to Credentials > Create Credentials > API Key
5. (Recommended) Restrict the key to only the APIs above
6. Add to `backend/.env`:
   ```
   GOOGLE_MAPS_API_KEY=AIza-your-key-here
   ```

**Cost**: $200/month free credit, then pay-per-request

---

## Frontend Setup

### Supabase Configuration

Supabase provides the database and authentication.

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project (or create one)
3. Go to Project Settings > API
4. Copy the URL and anon key
5. Add to `frontend/.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
   ```

**Note**: The anon key is designed to be public. Row Level Security (RLS) policies protect your data.

### Backend URL

Point to your backend server:

```
# Local development
EXPO_PUBLIC_BACKEND_URL=http://localhost:3000

# Production
EXPO_PUBLIC_BACKEND_URL=https://your-api.example.com
```

---

## Production Deployment

### Backend Deployment (e.g., Railway, Render, Vercel)

Set these environment variables in your hosting platform:

```
OPENROUTER_API_KEY=sk-or-v1-...
DEEPGRAM_API_KEY=...
GOOGLE_MAPS_API_KEY=AIza...
PORT=3000
```

### Frontend Deployment (Expo EAS)

Environment variables are configured in `frontend/eas.json`:

```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_BACKEND_URL": "https://your-production-api.com"
      }
    }
  }
}
```

For sensitive values, use EAS Secrets:
```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://..."
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..."
```

---

## GitHub Actions Secrets

For CI/CD pipelines, configure these secrets in your repository:

**Settings > Secrets and variables > Actions > New repository secret**

| Secret Name | Description |
|-------------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `EXPO_PUBLIC_BACKEND_URL` | Production backend URL |
| `OPENROUTER_API_KEY` | (If backend CI needs it) |
| `DEEPGRAM_API_KEY` | (If backend CI needs it) |
| `GOOGLE_MAPS_API_KEY` | (If backend CI needs it) |

---

## Secret Rotation

If you suspect a key has been compromised, rotate it immediately:

### OpenRouter
1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Delete the compromised key
3. Create a new key
4. Update all deployments

### Deepgram
1. Go to [console.deepgram.com](https://console.deepgram.com)
2. Navigate to API Keys
3. Delete and recreate the key
4. Update all deployments

### Google Maps
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Click on the API key
3. Click "Regenerate key"
4. Update all deployments

### Supabase
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Project Settings > API
3. Click "Generate a new key" under anon key
4. Update all deployments

---

## Security Best Practices

### Do

- Use `.env.example` files as templates (never with real values)
- Rotate keys immediately if exposed
- Use different keys for development and production
- Restrict API keys to specific APIs/domains when possible
- Review access logs regularly

### Don't

- Commit `.env` files to version control
- Share API keys in plain text (Slack, email, etc.)
- Use production keys in development
- Store keys in frontend code (use backend proxy)
- Ignore key rotation after team member departure

### Verifying Your Setup

Check that `.env` files are properly ignored:

```bash
# Should show nothing (files are ignored)
git status | grep "\.env"

# Verify .gitignore includes
cat .gitignore | grep "env"
```

---

## Questions?

If you have security concerns or questions about this setup, please contact the project maintainer.
