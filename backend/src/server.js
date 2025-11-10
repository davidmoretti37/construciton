require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Streaming chat endpoint
app.post('/api/chat/stream', async (req, res) => {
  const { messages, max_tokens = 800, temperature = 0.3 } = req.body;

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

    console.log('🚀 Starting streaming request to OpenRouter...');

    // Call OpenRouter with streaming
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages,
        max_tokens: Math.min(max_tokens, 300), // Cap at 300 tokens = ~225 words max
        temperature,
        stream: true,
        // Performance optimizations
        top_p: 0.9, // Faster sampling
        frequency_penalty: 0.3, // Reduce repetition = shorter responses
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter error:', errorText);
      res.write(`data: ${JSON.stringify({ error: 'AI service error' })}\n\n`);
      res.end();
      return;
    }

    console.log('✅ Connected to OpenRouter, streaming chunks...');

    // Stream the response back to client
    let chunkCount = 0;
    const startTime = Date.now();

    response.body.on('data', (chunk) => {
      chunkCount++;

      // First chunk timing
      if (chunkCount === 1) {
        const latency = Date.now() - startTime;
        console.log(`⚡ First chunk arrived in ${latency}ms`);
      }

      // Forward chunk directly to client
      res.write(chunk);
    });

    response.body.on('end', () => {
      const totalTime = Date.now() - startTime;
      console.log(`✅ Stream complete: ${chunkCount} chunks in ${totalTime}ms`);
      res.end();
    });

    response.body.on('error', (error) => {
      console.error('Stream error:', error);
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
      console.log('⚠️ Client disconnected');
      response.body.destroy();
    });

  } catch (error) {
    console.error('Server error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Streaming relay server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Stream endpoint: http://localhost:${PORT}/api/chat/stream`);
});
