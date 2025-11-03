# AI Agent Setup Guide

## 🤖 Your Personalized Construction Management AI Agent

Your app now has a smart AI assistant called **ConstructBot** that understands your construction business!

---

## ✅ What's Been Set Up

### 1. **Agent Prompt System** (`src/services/agentPrompt.js`)
- Detailed instructions for how the AI should behave
- Construction-specific knowledge
- Rules for using real data vs making things up
- Response formatting guidelines

### 2. **AI Service** (`src/services/aiService.js`)
- Handles communication with OpenRouter API
- Maintains conversation history
- Feeds project context to the AI

### 3. **Updated ChatScreen** (`src/screens/ChatScreen.js`)
- Integrated with the new AI agent
- Tracks conversation history
- Provides context to each message

---

## 🚀 How to Use It

### **Current State:**
Right now, the AI will work but has **NO real project data** - it's using empty placeholder data.

### **Try These Queries:**
```
"Hello, who are you?"
"What can you help me with?"
"How many projects do I have?"
```

The AI will respond based on the empty context (0 projects, 0 workers, etc.)

---

## 🔧 Next Steps: Add REAL Data

To make this truly useful, you need to feed REAL data from your app. Here's how:

### **Option 1: Quick Test with Sample Data**

Edit `src/services/aiService.js` and replace the `getProjectContext()` function:

```javascript
export const getProjectContext = () => {
  return {
    currentDate: new Date().toISOString(),

    projects: [
      {
        name: "Martinez Kitchen Remodel",
        client: "Juan Martinez",
        status: "active",
        budget: 20000,
        spent: 15000,
        percentComplete: 75,
        startDate: "2025-10-25",
        endDate: "2025-11-01",
        daysRemaining: 2,
        workers: ["José", "María"],
        lastActivity: "2 hours ago",
        tasks: [
          { name: "Install cabinets", status: "complete" },
          { name: "Connect plumbing", status: "in-progress" },
          { name: "Clean up", status: "pending" }
        ]
      },
      {
        name: "Johnson Bathroom",
        client: "Sarah Johnson",
        status: "active",
        budget: 10000,
        spent: 7100,
        percentComplete: 50,
        startDate: "2025-10-20",
        endDate: "2025-11-05",
        daysRemaining: 8,
        workers: ["Carlos"],
        lastActivity: "1 day ago",
        tasks: [
          { name: "Demo old fixtures", status: "complete" },
          { name: "Install new shower", status: "in-progress" },
          { name: "Tile work", status: "pending" }
        ]
      }
    ],

    workers: [
      {
        name: "José",
        status: "working",
        currentProject: "Martinez Kitchen Remodel",
        clockInTime: "8:00 AM",
        hoursToday: 6.5,
        hoursThisWeek: 32
      },
      {
        name: "María",
        status: "working",
        currentProject: "Martinez Kitchen Remodel",
        clockInTime: "8:00 AM",
        hoursToday: 6.5,
        hoursThisWeek: 30
      },
      {
        name: "Carlos",
        status: "off",
        currentProject: null,
        clockInTime: null,
        hoursToday: 0,
        hoursThisWeek: 28
      }
    ],

    stats: {
      activeProjects: 2,
      completedThisMonth: 5,
      totalWorkers: 3,
      workersOnSiteToday: 2,
      monthlyIncome: 22100,
      monthlyBudget: 30000,
      pendingPayments: 5000,
      hoursThisMonth: 180
    },

    alerts: [
      {
        type: "warning",
        message: "Johnson Bathroom is behind schedule",
        project: "Johnson Bathroom"
      }
    ]
  };
};
```

**Now try these queries:**
```
"How's the Martinez project?"
"Who's working today?"
"Am I over budget anywhere?"
"How much have I made this month?"
"Which projects are behind?"
```

### **Option 2: Integrate with Real Data (Future)**

When you have a proper database/state management:

```javascript
// In aiService.js
export const getProjectContext = (appState) => {
  return {
    currentDate: new Date().toISOString(),
    projects: appState.projects.map(p => ({
      name: p.name,
      client: p.clientName,
      status: p.status,
      budget: p.budget,
      spent: p.totalSpent,
      percentComplete: p.progress,
      // ... etc
    })),
    // ... map other data
  };
};

// In ChatScreen.js
const handleSend = async (text, withSearch) => {
  // Get real data from your app state/context
  const projectContext = getProjectContext(yourAppState);
  const aiResponse = await sendMessageToAI(text, projectContext, conversationHistory);
  // ...
};
```

---

## 🎯 Testing Your Agent

Try these test queries to see if the agent is working correctly:

### ✅ **Good Tests:**
```
"How's Martinez Kitchen going?"
→ Should mention exact budget ($15,000/$20,000), workers (José, María), and progress (75%)

"Am I over budget on anything?"
→ Should say no, or list specific projects if any are over

"Who's working today?"
→ Should list José and María

"How much did I make this month?"
→ Should say $22,100 earned

"Which projects are behind?"
→ Should mention Johnson Bathroom specifically
```

### ❌ **Tests That Should Fail Gracefully:**
```
"What's the weather?"
→ Should say it doesn't have weather data

"Tell me about the Trump project"
→ Should say it doesn't see that project

"Call José"
→ Should say it can't make calls
```

---

## 🛠️ Customization

### **Change the AI's Personality:**

Edit `src/services/agentPrompt.js`:

```javascript
// Make it more casual
"Be friendly and casual - use contractions, emojis, and keep it light"

// Make it more formal
"Be professional and formal - no emojis, use complete sentences"

// Make it bilingual
"Always respond in both English and Spanish"
```

### **Change the Model:**

Edit `src/services/aiService.js`:

```javascript
// Use GPT-4 (more expensive but smarter)
model: 'openai/gpt-4',

// Use a cheaper/faster model
model: 'openai/gpt-3.5-turbo',

// Use a different provider through OpenRouter
model: 'anthropic/claude-3-haiku',
```

### **Adjust Response Length:**

Edit `src/services/aiService.js`:

```javascript
max_tokens: 500, // Current - about 3-4 sentences
max_tokens: 200, // Shorter responses
max_tokens: 1000, // Longer, detailed responses
```

---

## 💰 Cost Considerations

**OpenRouter Pricing** (approximate):
- GPT-3.5-turbo: ~$0.0015 per 1000 tokens
- GPT-4: ~$0.03 per 1000 tokens
- Claude Haiku: ~$0.0005 per 1000 tokens

**Typical conversation:**
- User message: ~50 tokens
- AI response: ~150 tokens
- Context/prompt: ~300 tokens
- **Total: ~500 tokens per message = $0.00075 (less than 1 cent!)**

---

## 🐛 Troubleshooting

### **"I don't have that information yet"**
- ✅ Good! This means the AI is following instructions
- Add real data to `getProjectContext()`

### **AI makes up project names**
- ❌ Bad! The prompt isn't strong enough
- Check that your `projectContext` is being passed correctly
- Verify API key is working

### **No response at all**
- Check console for errors
- Verify API key in `.env`
- Check internet connection
- Restart dev server with `--clear`

### **Error: "API Key not found"**
- Make sure `.env` has `OPENROUTER_API_KEY=...`
- Restart server with `npx expo start --clear`

---

## 📚 Advanced Features (Future)

### **1. Voice Input**
Add speech-to-text so users can talk to the agent while on job sites

### **2. Photo Analysis**
Let the AI analyze photos from job sites and update project status

### **3. Automatic Project Creation**
"Schedule José for bathroom at 123 Main St tomorrow 9 AM" → Creates project automatically

### **4. SMS Integration**
Text the agent and get project updates via SMS

### **5. Multi-language**
Automatic detection and response in Spanish/English

---

## 🎉 You're All Set!

Your AI agent is ready to go! Test it out with some queries and watch it respond with context-aware, construction-specific answers.

**Remember:** The more real data you feed it, the more useful it becomes!
