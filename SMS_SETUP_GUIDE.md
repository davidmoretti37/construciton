# SMS/WhatsApp Integration - Complete Setup Guide

## Overview

This integration allows contractors to give clients a phone number they can text for project updates. The AI automatically responds to routine questions and escalates complex/sensitive topics to the contractor.

**Key Features:**
- ✅ AI auto-responds to safe questions (status, timeline, budget)
- ✅ Escalates complaints, payment, schedule questions to contractor
- ✅ Per-client AI toggle (enable/disable AI for specific clients)
- ✅ Push notifications when contractor attention needed
- ✅ Works with both SMS and WhatsApp
- ✅ Conversation history stored in database

---

## Setup Steps

### Step 1: Run Database Migration (5 minutes)

1. Open your **Supabase Dashboard** → SQL Editor
2. Copy and run `/supabase/sms_integration_schema.sql`
3. Verify tables created:
   - `conversations` table
   - `projects.client_phone` column
   - `projects.ai_responses_enabled` column
   - `profiles.business_phone_number` column

---

### Step 2: Deploy Edge Function (10 minutes)

#### A. Set Environment Variables

```bash
cd /Users/david/Downloads/construction-manager

# Set secrets in Supabase
npx supabase secrets set OPENROUTER_API_KEY=your_openrouter_key_here
```

#### B. Deploy Function

```bash
# Deploy the SMS webhook
npx supabase functions deploy sms-webhook

# Note the function URL - you'll need it for Twilio
# Example: https://your-project.supabase.co/functions/v1/sms-webhook
```

---

### Step 3: Create Twilio Account (15 minutes)

#### Option A: Managed Numbers (You provide numbers to contractors)

1. **Create Twilio account**: https://www.twilio.com/try-twilio
2. **Get a phone number**:
   - Go to Console → Phone Numbers → Buy a Number
   - Select one with SMS + MMS capabilities
   - Cost: ~$1-2/month per number
3. **Configure webhook**:
   - Go to Phone Numbers → Manage → Active Numbers
   - Click your number
   - Under "Messaging Configuration":
     - **A message comes in**: Webhook
     - **URL**: `https://your-project.supabase.co/functions/v1/sms-webhook`
     - **HTTP**: POST
   - Save
4. **Get credentials**:
   - Account SID
   - Auth Token
   - Phone Number

#### Option B: BYOT (Contractors bring their own Twilio)

Each contractor creates their own Twilio account and enters credentials in app settings.

---

### Step 4: Store Twilio Credentials

Add credentials to contractor's profile:

```sql
-- In Supabase SQL Editor
UPDATE public.profiles
SET
  business_phone_number = '+15551234567',
  twilio_account_sid = 'ACxxxxx',
  twilio_auth_token = 'your_auth_token',
  phone_provisioned_at = NOW()
WHERE id = 'user-id-here';
```

Or (better) add a settings screen in the app for contractors to enter these.

---

### Step 5: Test the Integration (10 minutes)

#### A. Add Client Phone to Project

1. Open a project in your app
2. Add client phone number: `+15551234567`
3. Enable "AI Auto-Responses" toggle
4. Save project

#### B. Send Test SMS

```
Text from your phone to the Twilio number:
"What's my project status?"
```

**Expected behavior:**
- AI should respond with project details within 5-10 seconds
- Conversation should appear in database `conversations` table
- If it works, you'll see the AI response!

#### C. Test Escalation

```
Text: "I have a complaint about the work"
```

**Expected behavior:**
- NO AI auto-response (because it's a complaint)
- Conversation logged with `needs_attention = true`
- Push notification sent to contractor (when implemented)
- Contractor can respond manually from app

---

## How It Works

### Message Flow

```
1. Client texts Twilio number
         ↓
2. Twilio webhook → Supabase Edge Function
         ↓
3. Look up project by client phone
         ↓
4. Classify intent (complaint, payment, schedule, general)
         ↓
5. Decision point:

   AI DISABLED for this client?
   YES → Notify contractor, don't respond

   Complaint/Payment/Schedule?
   YES → Notify contractor, don't respond

   AI confidence < 0.7?
   YES → Notify contractor, don't respond

   All clear?
   NO → Generate AI response, send to client
         ↓
6. Log conversation in database
```

### Escalation Rules

Messages are escalated to contractor (NO auto-response) if:
1. ✅ AI responses disabled for this client
2. ✅ Message contains complaint keywords (problem, issue, wrong, terrible, etc.)
3. ✅ Message about payment (pay, money, invoice, bill, etc.)
4. ✅ Message about schedule changes (reschedule, cancel, delay, etc.)
5. ✅ AI confidence score < 0.7
6. ✅ Message too short/unclear (< 10 characters)

### What AI Can Handle

AI auto-responds to questions like:
- "What's my project status?"
- "When will you finish?"
- "How much is left to pay?"
- "What's the completion percentage?"
- "Who's working on my project?"

### What Gets Escalated

These go to contractor:
- "I'm not happy with the work" (complaint)
- "How do I pay you?" (payment)
- "Can you come tomorrow instead?" (schedule)
- "???" (unclear)

---

## App UI Components (To Be Built)

### 1. Project Edit Modal - Add Phone Field

```javascript
// In EditProjectModal.js or similar
<TextInput
  placeholder="Client Phone Number"
  value={clientPhone}
  onChangeText={setClientPhone}
  keyboardType="phone-pad"
  autoComplete="tel"
/>

<View style={styles.toggleRow}>
  <Text>Enable AI Auto-Responses</Text>
  <Switch
    value={aiEnabled}
    onValueChange={setAiEnabled}
  />
</View>
```

### 2. Project Detail Screen - Conversations Section

```javascript
// Show conversations inline in project screen
import { fetchConversations, sendManualMessage } from '../utils/storage';

const [conversations, setConversations] = useState([]);
const [unhandledCount, setUnhandledCount] = useState(0);

// Fetch conversations on mount
useEffect(() => {
  loadConversations();
}, [projectId]);

const loadConversations = async () => {
  const convos = await fetchConversations(projectId);
  setConversations(convos);

  const count = convos.filter(c => c.needs_attention).length;
  setUnhandledCount(count);
};

// Real-time updates
useEffect(() => {
  const subscription = supabase
    .channel('conversations')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'conversations',
      filter: `project_id=eq.${projectId}`
    }, (payload) => {
      setConversations(prev => [...prev, payload.new]);
      if (payload.new.needs_attention) {
        setUnhandledCount(prev => prev + 1);
      }
    })
    .subscribe();

  return () => subscription.unsubscribe();
}, [projectId]);

// Render
<View style={styles.conversationsSection}>
  <Text style={styles.sectionTitle}>
    Client Messages {unhandledCount > 0 && `(${unhandledCount} need attention)`}
  </Text>

  {conversations.map(conv => (
    <View key={conv.id} style={[
      styles.message,
      conv.direction === 'inbound' ? styles.inbound : styles.outbound,
      conv.needs_attention && styles.needsAttention
    ]}>
      <Text style={styles.messageBody}>{conv.message_body}</Text>
      {conv.ai_response && (
        <Text style={styles.aiResponse}>AI: {conv.ai_response}</Text>
      )}
      <Text style={styles.timestamp}>
        {new Date(conv.created_at).toLocaleString()}
      </Text>
    </View>
  ))}

  {/* Manual reply input */}
  <TextInput
    placeholder="Reply to client..."
    value={replyText}
    onChangeText={setReplyText}
    onSubmitEditing={handleSendReply}
  />
</View>
```

### 3. Settings Screen - Twilio Setup

```javascript
// Add to SettingsScreen.js
<View style={styles.section}>
  <Text style={styles.sectionTitle}>SMS/WhatsApp Setup</Text>

  {!twilioConfigured ? (
    <>
      <Text>Configure Twilio to enable client messaging</Text>
      <TextInput
        placeholder="Twilio Account SID"
        value={twilioSid}
        onChangeText={setTwilioSid}
        secureTextEntry
      />
      <TextInput
        placeholder="Twilio Auth Token"
        value={twilioToken}
        onChangeText={setTwilioToken}
        secureTextEntry
      />
      <TextInput
        placeholder="Your Twilio Phone Number"
        value={twilioPhone}
        onChangeText={setTwilioPhone}
        keyboardType="phone-pad"
      />
      <Button title="Save Twilio Settings" onPress={saveTwilioSettings} />
    </>
  ) : (
    <>
      <Text>✅ Twilio configured: {twilioPhone}</Text>
      <Button title="Test SMS" onPress={sendTestSMS} />
      <Button title="Update Settings" onPress={() => setTwilioConfigured(false)} />
    </>
  )}
</View>
```

---

## Testing Checklist

### ✅ Basic SMS Test
- [ ] Client texts "What's my project status?"
- [ ] AI responds within 10 seconds
- [ ] Response contains actual project data
- [ ] Conversation logged in database

### ✅ Escalation Test
- [ ] Client texts "I have a complaint"
- [ ] NO AI auto-response
- [ ] `needs_attention` flag set to true
- [ ] Contractor notified (when push notifications implemented)

### ✅ AI Disabled Test
- [ ] Disable AI for client (toggle off)
- [ ] Client texts any message
- [ ] NO AI auto-response
- [ ] All messages escalated to contractor

### ✅ Manual Reply Test
- [ ] Contractor types manual reply in app
- [ ] Message sent via Twilio
- [ ] Client receives message
- [ ] Conversation logged as `handled_by: contractor`

### ✅ WhatsApp Test
- [ ] Join WhatsApp sandbox
- [ ] Send message via WhatsApp
- [ ] AI responds via WhatsApp
- [ ] Works same as SMS

---

## Cost Estimate (per contractor)

| Item | Monthly Cost |
|------|-------------|
| Twilio phone number | $1-2 |
| 50 SMS received | $0.38 |
| 50 SMS sent | $0.38 |
| 50 AI calls | $0.10 |
| **Total** | **~$2-3/month** |

**Your pricing options:**
- Charge contractors $5/month (you make $2-3 profit)
- Include in base subscription
- Let them use their own Twilio (BYOT - free for you)

---

## Troubleshooting

### Client texts but no response

1. **Check webhook URL**:
   - Go to Twilio Console → Phone Numbers
   - Verify webhook URL is correct
   - Should be `https://your-project.supabase.co/functions/v1/sms-webhook`

2. **Check Edge Function logs**:
   ```bash
   npx supabase functions logs sms-webhook
   ```

3. **Check client phone in database**:
   ```sql
   SELECT * FROM projects WHERE client_phone = '+15551234567';
   ```

### AI always escalates

1. Check AI confidence scores in conversations table:
   ```sql
   SELECT message_body, ai_confidence, intent_classification, needs_attention
   FROM conversations
   ORDER BY created_at DESC
   LIMIT 10;
   ```

2. If confidence always low, AI might need better project data

### Messages sent but not received

1. Check Twilio delivery logs in Twilio Console
2. Verify client phone number format: `+15551234567` (include country code)
3. Check Twilio account balance

---

## Next Steps

### Now:
1. ✅ Run database migration
2. ✅ Deploy edge function
3. ✅ Set up Twilio account
4. ✅ Test with one project

### Soon:
1. Add phone field to project creation UI
2. Add conversations view to project screen
3. Add Twilio settings screen
4. Implement push notifications

### Later:
1. Add photo messaging (MMS)
2. Add appointment scheduling via SMS
3. Add payment reminders
4. Multi-language support

---

## Security Considerations

1. **Verify Twilio Webhooks**: Add signature validation to prevent spoofing
2. **Rate Limiting**: Prevent spam by limiting messages per client
3. **Phone Number Privacy**: Never expose contractor's personal number
4. **Data Encryption**: Twilio credentials stored encrypted in database

---

## Support

**Common Questions:**

Q: Can clients send photos?
A: Yes, via MMS or WhatsApp. You'll need to handle media URLs from Twilio webhook.

Q: What if client uses Android?
A: Works perfectly - SMS is universal.

Q: Can multiple contractors use the same Twilio account?
A: Yes, each gets their own phone number from your master account.

Q: How do I make money from this?
A: Charge contractors $5/month for managed phone number ($2-3 profit per contractor).

---

You're all set! Test it out and let me know if you hit any issues. 🚀
