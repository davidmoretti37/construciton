import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!

// Escalation keywords - if message contains these, always escalate
const ESCALATION_KEYWORDS = {
  complaint: ['problem', 'issue', 'wrong', 'bad', 'terrible', 'awful', 'upset', 'angry', 'complaint', 'sue', 'lawyer'],
  payment: ['pay', 'payment', 'money', 'cost', 'price', 'invoice', 'bill', 'charge', 'owe', 'refund'],
  schedule: ['reschedule', 'cancel', 'change date', 'move', 'delay', 'postpone', 'earlier', 'later', 'when can you'],
}

serve(async (req) => {
  try {
    console.log('📱 SMS Webhook received')

    // Parse Twilio webhook data (form-encoded)
    const formData = await req.formData()
    const from = formData.get('From') as string
    const body = formData.get('Body') as string
    const to = formData.get('To') as string
    const messageType = from.includes('whatsapp') ? 'whatsapp' : 'sms'

    console.log(`📨 Message from ${from}: "${body}"`)

    // Clean phone number (remove whatsapp: prefix if present)
    const cleanFrom = from.replace('whatsapp:', '').replace('tel:', '').trim()
    const cleanTo = to.replace('whatsapp:', '').replace('tel:', '').trim()

    // Initialize Supabase client (service role for full access)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Find project by client phone number
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        *,
        profiles!inner(
          id,
          business_name,
          business_phone,
          business_email,
          twilio_account_sid,
          twilio_auth_token,
          trades,
          pricing
        )
      `)
      .eq('client_phone', cleanFrom)
      .single()

    if (projectError || !project) {
      console.log('❌ No project found for phone:', cleanFrom)
      // Client not in system - just log and ignore
      await logConversation(supabase, null, cleanFrom, cleanTo, messageType, body, null, 'unknown', true, 'pending')

      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
        { headers: { 'Content-Type': 'text/xml' } }
      )
    }

    console.log(`✅ Found project: ${project.name} (AI enabled: ${project.ai_responses_enabled})`)

    // Classify intent
    const intent = classifyIntent(body)
    console.log(`🎯 Intent classified as: ${intent}`)

    // Determine if should escalate
    const shouldEscalate = !project.ai_responses_enabled || shouldEscalateMessage(intent, body)

    if (shouldEscalate) {
      console.log(`🚨 Escalating to contractor - ${!project.ai_responses_enabled ? 'AI disabled' : intent}`)

      // Log conversation as needing attention
      await logConversation(supabase, project.id, cleanFrom, cleanTo, messageType, body, null, intent, true, 'pending')

      // Send push notification to contractor
      await sendPushNotification(supabase, project.profiles.id, project.name, body)

      // Don't auto-respond - contractor will respond manually
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
        { headers: { 'Content-Type': 'text/xml' } }
      )
    }

    // AI can handle this - generate response
    console.log('🤖 Generating AI response...')
    const aiResponse = await generateAIResponse(body, project)

    // Check AI confidence - if low, escalate
    if (aiResponse.confidence < 0.7) {
      console.log(`⚠️ Low confidence (${aiResponse.confidence}) - escalating`)
      await logConversation(supabase, project.id, cleanFrom, cleanTo, messageType, body, null, intent, true, 'pending')
      await sendPushNotification(supabase, project.profiles.id, project.name, body)

      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
        { headers: { 'Content-Type': 'text/xml' } }
      )
    }

    // Log conversation with AI response
    await logConversation(supabase, project.id, cleanFrom, cleanTo, messageType, body, aiResponse.text, intent, false, 'ai', aiResponse.confidence)

    // Send AI response via Twilio
    console.log(`✉️ Sending AI response: "${aiResponse.text}"`)
    await sendTwilioMessage(
      project.profiles.twilio_account_sid,
      project.profiles.twilio_auth_token,
      cleanTo, // from our number
      from, // to client (preserve whatsapp: prefix if it was there)
      aiResponse.text
    )

    // Return empty TwiML (required by Twilio)
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  } catch (error) {
    console.error('❌ Error in SMS webhook:', error)
    return new Response('Error', { status: 500 })
  }
})

/**
 * Classify message intent based on keywords
 */
function classifyIntent(message: string): string {
  const lowerMessage = message.toLowerCase()

  // Check for complaints
  if (ESCALATION_KEYWORDS.complaint.some(kw => lowerMessage.includes(kw))) {
    return 'complaint'
  }

  // Check for payment questions
  if (ESCALATION_KEYWORDS.payment.some(kw => lowerMessage.includes(kw))) {
    return 'payment'
  }

  // Check for schedule changes
  if (ESCALATION_KEYWORDS.schedule.some(kw => lowerMessage.includes(kw))) {
    return 'schedule'
  }

  return 'general'
}

/**
 * Determine if message should be escalated to contractor
 */
function shouldEscalateMessage(intent: string, message: string): boolean {
  // Always escalate these intents
  if (['complaint', 'payment', 'schedule'].includes(intent)) {
    return true
  }

  // If message is very short or unclear, escalate
  if (message.trim().length < 10) {
    return true
  }

  return false
}

/**
 * Generate AI response using OpenRouter
 */
async function generateAIResponse(message: string, project: any) {
  // Build project context
  const projectContext = {
    name: project.name,
    client: project.client,
    contractAmount: project.contract_amount,
    incomeCollected: project.income_collected,
    expenses: project.expenses,
    profit: (project.income_collected || 0) - (project.expenses || 0),
    status: project.status,
    percentComplete: project.percent_complete,
    startDate: project.start_date,
    endDate: project.end_date,
    daysRemaining: project.days_remaining,
  }

  const systemPrompt = `You are a helpful construction project assistant responding via SMS to a client.

CRITICAL RULES:
- Keep responses VERY SHORT (2-3 sentences max) - this is SMS!
- Be professional and friendly
- Use exact numbers from the project data
- If you're not confident in your answer, return confidence < 0.7

Project Data:
${JSON.stringify(projectContext, null, 2)}

Client's question: "${message}"

Respond in JSON format:
{
  "text": "Your short response here",
  "confidence": 0.95
}

If the question is about complaints, payments, or schedule changes, set confidence to 0.5 or lower.`

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 150,
      temperature: 0.5,
      response_format: { type: "json_object" },
    }),
  })

  const data = await response.json()
  const result = JSON.parse(data.choices[0].message.content)

  return {
    text: result.text,
    confidence: result.confidence || 0.8,
  }
}

/**
 * Log conversation to database
 */
async function logConversation(
  supabase: any,
  projectId: string | null,
  from: string,
  to: string,
  messageType: string,
  body: string,
  aiResponse: string | null,
  intent: string,
  needsAttention: boolean,
  handledBy: string,
  confidence?: number
) {
  await supabase.from('conversations').insert({
    project_id: projectId,
    from_number: from,
    to_number: to,
    message_type: messageType,
    direction: 'inbound',
    message_body: body,
    ai_response: aiResponse,
    ai_confidence: confidence,
    intent_classification: intent,
    needs_attention: needsAttention,
    handled_by: handledBy,
  })
}

/**
 * Send push notification to contractor
 */
async function sendPushNotification(supabase: any, userId: string, projectName: string, messagePreview: string) {
  // TODO: Implement push notifications using Expo push notifications
  // For now, just log
  console.log(`🔔 Would send push notification to user ${userId}: "${projectName}: ${messagePreview}"`)

  // In production, you would:
  // 1. Get user's Expo push token from database
  // 2. Send push notification via Expo API
  // Example:
  // await fetch('https://exp.host/--/api/v2/push/send', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     to: expoPushToken,
  //     title: `Message from ${projectName}`,
  //     body: messagePreview,
  //     data: { projectId, screen: 'ProjectMessages' }
  //   })
  // })
}

/**
 * Send message via Twilio
 */
async function sendTwilioMessage(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

  const params = new URLSearchParams({
    From: to.includes('whatsapp:') ? `whatsapp:${from}` : from,
    To: to,
    Body: body,
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Failed to send Twilio message:', error)
    throw new Error('Failed to send message')
  }

  return response.json()
}
