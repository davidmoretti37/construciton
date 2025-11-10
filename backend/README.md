# Construction Manager - Streaming Relay Server

This is a lightweight Express server that provides **true streaming** for the Construction Manager mobile app.

## Why This Server?

React Native's `fetch()` doesn't support native streaming, so we built this relay server to:
- ✅ Reduce latency from 3-5s to **200-500ms** for first word
- ✅ Stream AI responses in real-time as they arrive
- ✅ Provide ChatGPT-like typing experience

## Setup

1. Install dependencies:
```bash
cd backend
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Add your OPENROUTER_API_KEY to .env
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## How It Works

```
Mobile App → Relay Server → OpenRouter API
     ↓            ↓
     ←─────── Stream chunks in real-time
```

The server:
1. Receives chat requests from the mobile app
2. Calls OpenRouter's streaming API
3. Forwards SSE chunks to the client as they arrive
4. Logs performance metrics (first chunk latency, total time)

## Endpoints

- `GET /health` - Health check
- `POST /api/chat/stream` - Streaming chat endpoint

## Performance

Expected latencies:
- **First word:** 200-500ms (vs 3-5s without relay)
- **Total response:** Same as before, but perceived as faster
- **Chunks:** Forwarded immediately with no buffering

## Production Deployment

For production, deploy to:
- Railway.app
- Render.com
- Fly.io
- Any Node.js hosting

Then update `RELAY_URL` in `src/services/aiService.js` with your production URL.
