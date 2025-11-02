# AI Integration Guide

This guide shows how to connect the Chat screen to a real AI API (OpenAI or Anthropic Claude).

## Architecture

```
Mobile App (ChatScreen)
    ↓ HTTP Request
Backend API (Node.js/Express)
    ↓ AI API Call
OpenAI GPT-4 or Anthropic Claude
    ↓ Response
Backend API
    ↓ HTTP Response
Mobile App (Shows AI message)
```

## Option 1: Using OpenAI API

### Backend Setup (Node.js/Express)

```javascript
// backend/server.js
const express = require('express');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post('/api/chat', async (req, res) => {
  const { message, projectData } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a construction project management assistant. 
          Current project data: ${JSON.stringify(projectData)}
          Help users manage their projects, answer questions about status, 
          budgets, workers, and schedules.`
        },
        {
          role: "user",
          content: message
        }
      ],
    });

    res.json({
      response: completion.choices[0].message.content
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

### Mobile App Update

In `src/screens/ChatScreen.js`, replace the `handleSend` function:

```javascript
const handleSend = async () => {
  if (inputText.trim() === '') return;

  const newMessage = {
    id: Date.now().toString(),
    text: inputText,
    isUser: true,
    timestamp: new Date(),
  };

  setMessages([...messages, newMessage]);
  setInputText('');

  // Show typing indicator
  const typingMessage = {
    id: 'typing',
    text: '...',
    isUser: false,
    timestamp: new Date(),
  };
  setMessages(prev => [...prev, typingMessage]);

  try {
    // Call your backend
    const response = await fetch('YOUR_BACKEND_URL/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: inputText,
        projectData: {
          // Add current project data here
          activeProjects: 8,
          workers: 12,
          // ... more context
        }
      }),
    });

    const data = await response.json();

    // Remove typing indicator and add real response
    setMessages(prev => {
      const filtered = prev.filter(m => m.id !== 'typing');
      return [
        ...filtered,
        {
          id: (Date.now() + 1).toString(),
          text: data.response,
          isUser: false,
          timestamp: new Date(),
        }
      ];
    });
  } catch (error) {
    // Handle error
    setMessages(prev => {
      const filtered = prev.filter(m => m.id !== 'typing');
      return [
        ...filtered,
        {
          id: (Date.now() + 1).toString(),
          text: 'Sorry, I encountered an error. Please try again.',
          isUser: false,
          timestamp: new Date(),
        }
      ];
    });
  }
};
```

## Option 2: Using Anthropic Claude API

### Backend Setup

```javascript
// backend/server.js
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

app.post('/api/chat', async (req, res) => {
  const { message, projectData } = req.body;

  try {
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Context: You are a construction project management assistant.
          Current projects: ${JSON.stringify(projectData)}
          
          User question: ${message}
          
          Provide helpful, concise answers about project status, budgets, and schedules.`
        }
      ],
    });

    res.json({
      response: completion.content[0].text
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

The mobile app code is the same as Option 1.

## Adding Context for Better Responses

The AI should have access to real project data:

```javascript
// Example: Fetch project data and send to AI
const getProjectContext = async () => {
  // Fetch from your database
  const projects = await fetch('YOUR_API/projects').then(r => r.json());
  const workers = await fetch('YOUR_API/workers').then(r => r.json());
  const stats = await fetch('YOUR_API/stats').then(r => r.json());

  return {
    projects: projects.map(p => ({
      name: p.name,
      budget: p.budget,
      spent: p.spent,
      status: p.status,
      workers: p.workers,
    })),
    workers: workers.map(w => ({
      name: w.name,
      status: w.status,
      currentProject: w.currentProject,
    })),
    stats: {
      totalProjects: stats.totalProjects,
      activeProjects: stats.activeProjects,
      monthlyIncome: stats.monthlyIncome,
    }
  };
};

// In your backend route
app.post('/api/chat', async (req, res) => {
  const { message, userId } = req.body;
  
  // Get real data
  const context = await getProjectContext(userId);
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `You are a construction PM assistant. Here's the current state:
        Projects: ${JSON.stringify(context.projects)}
        Workers: ${JSON.stringify(context.workers)}
        Stats: ${JSON.stringify(context.stats)}
        
        Answer questions using this data.`
      },
      {
        role: "user",
        content: message
      }
    ],
  });

  res.json({ response: completion.choices[0].message.content });
});
```

## Screenshot Analysis (AI Vision)

For creating projects from screenshots:

```javascript
// Backend route for screenshot analysis
app.post('/api/analyze-screenshot', async (req, res) => {
  const { imageBase64 } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract project details from this conversation screenshot.
              Find: worker name, location/address, date, time, task description, budget.
              Return as JSON with these fields.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 500
    });

    const extractedData = JSON.parse(completion.choices[0].message.content);
    res.json(extractedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

In mobile app:

```javascript
import * as ImagePicker from 'expo-image-picker';

const handleScreenshotUpload = async () => {
  // Request permission
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    alert('Sorry, we need camera roll permissions!');
    return;
  }

  // Pick image
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.5,
    base64: true,
  });

  if (!result.canceled) {
    // Send to backend
    const response = await fetch('YOUR_API/analyze-screenshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: result.assets[0].base64
      })
    });

    const data = await response.json();
    // data now contains: { worker, location, date, time, task, budget }
    
    // Show confirmation screen with extracted data
    showProjectConfirmation(data);
  }
};
```

## Environment Variables

### Backend (.env file)
```
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...

DATABASE_URL=postgresql://...
PORT=3000
```

### Install dependencies
```bash
npm install openai
# or
npm install @anthropic-ai/sdk

npm install express cors dotenv
```

## Security Best Practices

1. **Never put API keys in mobile app** - Always call through your backend
2. **Add authentication** - Verify user identity before processing requests
3. **Rate limiting** - Prevent abuse of AI API calls
4. **Input validation** - Sanitize user input before sending to AI
5. **Cost monitoring** - Track AI API usage to avoid surprises

## Cost Estimates

**OpenAI GPT-4:**
- ~$0.03 per chat message (input + output)
- ~1,000 messages = $30
- ~10,000 messages = $300

**Anthropic Claude:**
- ~$0.015 per chat message
- ~2,000 messages = $30
- ~20,000 messages = $300

Plan accordingly based on expected usage!

## Testing

Test your AI integration:

```javascript
// Simple test
const testMessage = "How many active projects do I have?";
const response = await fetch('YOUR_API/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: testMessage,
    projectData: { activeProjects: 8 }
  })
});
const data = await response.json();
console.log(data.response); // Should mention "8 active projects"
```

## Next Steps

1. Set up backend server
2. Get AI API key (OpenAI or Anthropic)
3. Test locally
4. Deploy backend (Railway, Render, Vercel)
5. Update mobile app with backend URL
6. Test end-to-end
7. Monitor costs and usage

You're ready to make your AI-powered construction app a reality!
