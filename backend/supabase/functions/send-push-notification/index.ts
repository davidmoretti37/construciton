import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { shouldSendPush, shouldCreateInApp, PREFS_COLUMNS } from '../_shared/notificationGate.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface NotificationRequest {
  userId: string
  title: string
  body: string
  type: string
  data?: Record<string, any>
  projectId?: string
  workerId?: string
  scheduleEventId?: string
  dailyReportId?: string
}

serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    }

    const notification: NotificationRequest = await req.json()
    console.log('📬 Send push notification request:', notification)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Load the user's notification preferences. Push and in-app delivery
    // are gated separately by the shared helper so the Settings screen
    // toggles actually take effect — the previous heuristic
    // `push_${type.replace(/_/g, '_')}s` accidentally worked for some types
    // (appointment_reminder → push_appointment_reminders) but generated
    // bogus keys for others (daily_report_submitted →
    // push_daily_report_submitteds, which doesn't exist), letting every
    // disabled-by-user category through.
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select(PREFS_COLUMNS)
      .eq('user_id', notification.userId)
      .single()

    const pushAllowed = shouldSendPush(prefs, notification.type)
    const inAppAllowed = shouldCreateInApp(prefs, notification.type)

    if (!pushAllowed && !inAppAllowed) {
      console.log('Both push and in-app suppressed by user prefs', { type: notification.type })
      return jsonResponse({ sent: false, reason: 'all_disabled' })
    }

    // ---- In-app notification ----
    // Always insert when allowed by inapp_*; quiet hours don't suppress
    // the inbox row on purpose so users see the notification next time
    // they open the app.
    if (inAppAllowed) {
      const { error: insertError } = await supabase
        .from('notifications')
        .insert({
          user_id: notification.userId,
          title: notification.title,
          body: notification.body,
          type: notification.type,
          icon: getIconForType(notification.type),
          color: getColorForType(notification.type),
          action_data: notification.data || {},
          project_id: notification.projectId || null,
          worker_id: notification.workerId || null,
          schedule_event_id: notification.scheduleEventId || null,
          daily_report_id: notification.dailyReportId || null,
        })

      if (insertError) {
        console.error('Error creating in-app notification:', insertError)
      }
    }

    // ---- Push notification ----
    if (!pushAllowed) {
      console.log('Push suppressed by user prefs', { type: notification.type })
      return jsonResponse({ sent: false, reason: 'push_disabled', inAppCreated: inAppAllowed })
    }

    // Get user's push tokens
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('expo_push_token, device_type')
      .eq('user_id', notification.userId)
      .eq('is_active', true)

    if (!tokens || tokens.length === 0) {
      console.log('No active push tokens found for user')
      return jsonResponse({ sent: false, reason: 'no_tokens', inAppCreated: inAppAllowed })
    }

    console.log(`Found ${tokens.length} push tokens for user`)

    // Prepare Expo push messages
    const messages = tokens.map(t => ({
      to: t.expo_push_token,
      title: notification.title,
      body: notification.body,
      sound: 'default',
      data: {
        type: notification.type,
        ...notification.data,
      },
      // Android-specific
      channelId: getAndroidChannelId(notification.type),
      priority: 'high',
      // iOS-specific
      badge: 1,
    }))

    // Send to Expo Push API
    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    })

    const expoResult = await expoResponse.json()
    console.log('Expo push response:', expoResult)

    return jsonResponse({
      sent: true,
      tokens: tokens.length,
      expo: expoResult,
      inAppCreated: inAppAllowed,
    })
  } catch (error) {
    console.error('Error in send-push-notification:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

function jsonResponse(data: any) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function getAndroidChannelId(type: string): string {
  switch (type) {
    case 'appointment_reminder':
      return 'appointments'
    case 'daily_report_submitted':
    case 'worker_update':
      return 'workers'
    case 'project_warning':
      return 'projects'
    default:
      return 'default'
  }
}

function getIconForType(type: string): string {
  switch (type) {
    case 'appointment_reminder':
      return 'calendar'
    case 'daily_report_submitted':
      return 'document-text'
    case 'project_warning':
      return 'warning'
    case 'financial_update':
      return 'cash'
    case 'worker_update':
      return 'person'
    default:
      return 'notifications'
  }
}

function getColorForType(type: string): string {
  switch (type) {
    case 'appointment_reminder':
      return '#3B82F6' // blue
    case 'daily_report_submitted':
      return '#10B981' // green
    case 'project_warning':
      return '#F59E0B' // orange
    case 'financial_update':
      return '#8B5CF6' // purple
    case 'worker_update':
      return '#6366F1' // indigo
    default:
      return '#6B7280' // gray
  }
}
