# WhatsApp & SMS Integration Guide

## Overview
Allow clients to text you via SMS or WhatsApp and get automatic AI responses about their project status, updates, and questions.

---

## Architecture

```
Client (SMS/WhatsApp)
    ↓
Twilio (receives message)
    ↓
Webhook → Supabase Edge Function
    ↓
AI Agent (generates response)
    ↓
Supabase (logs conversation)
    ↓
Twilio (sends response)
    ↓
Client (receives answer)
    +
    ↓
App (shows notification & conversation history)
```

---

## Setup Steps

### 1. Twilio Setup (30 minutes)

1. **Create account**: https://www.twilio.com/try-twilio
2. **Get phone number** (SMS + WhatsApp capable)
   - Cost: ~$1-2/month
3. **Get credentials**:
   - Account SID
   - Auth Token
   - Phone Number

4. **Setup WhatsApp Sandbox** (for testing):
   - Go to Twilio Console → Messaging → Try it out → Send a WhatsApp message
   - Follow instructions to join sandbox

### 2. Add to Database Schema

```sql
-- Add phone field to projects
ALTER TABLE public.projects
ADD COLUMN client_phone TEXT;

-- Create conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  message_type TEXT CHECK (message_type IN ('sms', 'whatsapp')),
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  message_body TEXT NOT NULL,
  ai_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own conversations
CREATE POLICY "Users can view own conversations"
  ON public.conversations
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- Create index for faster lookups
CREATE INDEX idx_conversations_project ON public.conversations(project_id);
CREATE INDEX idx_conversations_from ON public.conversations(from_number);
```

### 3. Create Supabase Edge Function

```bash
# In your project root
supabase functions new whatsapp-webhook
```

**File: `supabase/functions/whatsapp-webhook/index.ts`**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    // Parse Twilio webhook data
    const formData = await req.formData()
    const from = formData.get('From') as string
    const body = formData.get('Body') as string
    const messageType = from.includes('whatsapp') ? 'whatsapp' : 'sms'

    console.log(`Received ${messageType} from ${from}: ${body}`)

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Find project by client phone number
    const phoneNumber = from.replace('whatsapp:', '').replace('tel:', '')
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*, profiles!inner(id, business_name)')
      .eq('client_phone', phoneNumber)
      .single()

    let aiResponse = ''

    if (project) {
      // Client found - get project context and call AI
      const projectContext = {
        currentDate: new Date().toISOString(),
        businessInfo: { name: project.profiles.business_name },
        projects: [project],
        stats: {
          totalIncomeCollected: project.income_collected,
          totalExpenses: project.expenses,
          totalProfit: project.income_collected - project.expenses,
        }
      }

      // Call AI agent (simplified - use your actual agent logic)
      const aiResult = await callAI(body, projectContext)
      aiResponse = aiResult.text
    } else {
      // Client not found
      aiResponse = "Hi! I don't have your phone number in my system yet. Please contact us directly to get started."
    }

    // Log conversation in database
    if (project) {
      await supabase.from('conversations').insert({
        project_id: project.id,
        from_number: phoneNumber,
        to_number: TWILIO_PHONE_NUMBER,
        message_type: messageType,
        direction: 'inbound',
        message_body: body,
        ai_response: aiResponse,
      })
    }

    // Send response via Twilio
    await sendTwilioMessage(from, aiResponse)

    // Return TwiML response (required by Twilio)
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response('Error', { status: 500 })
  }
})

async function callAI(message: string, projectContext: any) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a helpful construction project assistant. The client is texting to ask about their project. Keep responses SHORT (2-3 sentences max) since this is SMS/WhatsApp. Project context: ${JSON.stringify(projectContext)}`
        },
        { role: 'user', content: message }
      ],
      max_tokens: 150,
      temperature: 0.5,
    }),
  })

  const data = await response.json()
  return { text: data.choices[0].message.content }
}

async function sendTwilioMessage(to: string, message: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`

  const params = new URLSearchParams({
    From: to.includes('whatsapp') ? `whatsapp:${TWILIO_PHONE_NUMBER}` : TWILIO_PHONE_NUMBER,
    To: to,
    Body: message,
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  return response.json()
}
```

### 4. Deploy Edge Function

```bash
# Set environment variables
supabase secrets set TWILIO_ACCOUNT_SID=your_account_sid
supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token
supabase secrets set TWILIO_PHONE_NUMBER=your_phone_number
supabase secrets set OPENROUTER_API_KEY=your_openrouter_key

# Deploy
supabase functions deploy whatsapp-webhook
```

### 5. Configure Twilio Webhook

1. Go to Twilio Console → Phone Numbers → Manage → Active Numbers
2. Click your phone number
3. Under "Messaging Configuration":
   - **A message comes in**: Webhook
   - **URL**: `https://your-project.supabase.co/functions/v1/whatsapp-webhook`
   - **HTTP**: POST
4. Save

For WhatsApp:
1. Go to Twilio Console → Messaging → Try it out → WhatsApp sandbox settings
2. Set webhook to same URL

---

## App Updates

### 1. Add Phone Field to Project Form

```javascript
// In your project creation/edit modal
<TextInput
  placeholder="Client Phone Number"
  value={clientPhone}
  onChangeText={setClientPhone}
  keyboardType="phone-pad"
/>
```

### 2. Create Conversations Screen

```javascript
// src/screens/ConversationsScreen.js
import { supabase } from '../lib/supabase';

export default function ConversationsScreen({ route }) {
  const { projectId } = route.params;
  const [conversations, setConversations] = useState([]);

  useEffect(() => {
    fetchConversations();

    // Real-time updates
    const subscription = supabase
      .channel('conversations')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversations',
        filter: `project_id=eq.${projectId}`
      }, (payload) => {
        setConversations(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => subscription.unsubscribe();
  }, []);

  const fetchConversations = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    setConversations(data || []);
  };

  return (
    <ScrollView>
      {conversations.map(conv => (
        <View key={conv.id} style={{
          alignSelf: conv.direction === 'inbound' ? 'flex-start' : 'flex-end',
          backgroundColor: conv.direction === 'inbound' ? '#e5e5ea' : '#007aff',
          padding: 10,
          borderRadius: 18,
          margin: 5,
        }}>
          <Text style={{
            color: conv.direction === 'inbound' ? '#000' : '#fff'
          }}>
            {conv.message_body}
          </Text>
          {conv.ai_response && (
            <Text style={{ color: '#666', fontSize: 12, marginTop: 5 }}>
              AI: {conv.ai_response}
            </Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
```

### 3. Add Push Notifications (Optional)

When a client texts, send push notification to contractor's phone.

---

## Testing

### Test SMS:
```bash
# Send test SMS to your Twilio number
# AI should respond based on project data
```

### Test WhatsApp:
1. Join WhatsApp sandbox (send code to sandbox number)
2. Send message: "What's my project status?"
3. AI responds with project details

---

## Security Considerations

1. **Verify Twilio Webhook**:
   ```typescript
   // Verify request is actually from Twilio
   import { validateRequest } from 'twilio'

   const signature = req.headers.get('x-twilio-signature')
   const url = req.url
   const params = Object.fromEntries(await req.formData())

   const isValid = validateRequest(
     TWILIO_AUTH_TOKEN,
     signature,
     url,
     params
   )

   if (!isValid) {
     return new Response('Unauthorized', { status: 401 })
   }
   ```

2. **Rate Limiting**: Prevent spam by limiting messages per client
3. **Privacy**: Only share project info with verified client phone numbers

---

## Limitations & Considerations

### SMS Limitations:
- 160 character limit (AI needs to be concise)
- No rich media (images, buttons)
- Carrier fees apply

### WhatsApp Advantages:
- Supports images, buttons
- More popular internationally
- Free for clients
- Requires WhatsApp Business API approval for production

### WhatsApp Limitations:
- Need approval for production use
- 24-hour message window (can only initiate conversation within 24h of client's last message)
- Templates required for marketing messages

---

## Advanced Features

### 1. Photo Updates via WhatsApp
Client sends photo of work progress → AI analyzes → Updates project

### 2. Appointment Scheduling
Client: "When can you come by?"
AI: "Available slots: Tomorrow 2pm, Friday 10am. Reply 1 or 2 to book."

### 3. Payment Reminders
Auto-send payment reminders when project reaches milestones

### 4. Multi-Language
Detect client's language and respond accordingly

---

## Cost Breakdown (100 messages/month)

| Item | Cost |
|------|------|
| Twilio phone number | $2/month |
| 50 SMS sent | $0.38 |
| 50 SMS received | $0.38 |
| 50 WhatsApp messages | $0.25 |
| AI calls (100 messages) | $0.20 |
| **Total** | **~$3.21/month** |

Very affordable for the value!

---

## Alternative: Notification-Only (Simpler)

If full two-way conversation is too complex, start with notifications only:

1. Client texts → You get notified in app
2. You tap notification → Opens conversation
3. You type response → Sends via Twilio

This requires:
- ✅ Webhook to receive messages
- ✅ Push notifications
- ❌ No AI auto-response (you respond manually)

**Difficulty:** ⭐⭐ (Easy) vs ⭐⭐⭐⭐ (Full AI integration)

---

## Next Steps

1. **Start simple**: Notification-only first
2. **Test thoroughly**: Use WhatsApp sandbox
3. **Get client feedback**: See if they want SMS or WhatsApp
4. **Add AI gradually**: Once notifications work, add auto-responses

Let me know if you want me to help implement any of these steps!
