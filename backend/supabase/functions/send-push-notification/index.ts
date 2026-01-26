import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // Get user's notification preferences
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', notification.userId)
      .single()

    // Check if push notifications are enabled
    if (prefs && !prefs.push_enabled) {
      console.log('Push notifications disabled for user')
      return jsonResponse({ sent: false, reason: 'push_disabled' })
    }

    // Check if this notification type is enabled
    const typeKey = `push_${notification.type.replace(/_/g, '_')}s`
    if (prefs && prefs[typeKey] === false) {
      console.log(`Notification type ${notification.type} disabled for user`)
      return jsonResponse({ sent: false, reason: 'type_disabled' })
    }

    // Check quiet hours
    if (prefs?.quiet_hours_enabled) {
      const now = new Date()
      const currentTime = now.toTimeString().slice(0, 5) // HH:MM
      if (isInQuietHours(currentTime, prefs.quiet_hours_start, prefs.quiet_hours_end)) {
        console.log('Within quiet hours, not sending push')
        return jsonResponse({ sent: false, reason: 'quiet_hours' })
      }
    }

    // Get user's push tokens
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('expo_push_token, device_type')
      .eq('user_id', notification.userId)
      .eq('is_active', true)

    if (!tokens || tokens.length === 0) {
      console.log('No active push tokens found for user')
      return jsonResponse({ sent: false, reason: 'no_tokens' })
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

    // Also create an in-app notification
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

    return jsonResponse({
      sent: true,
      tokens: tokens.length,
      expo: expoResult,
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

function isInQuietHours(current: string, start: string, end: string): boolean {
  // Handle overnight quiet hours (e.g., 22:00 to 07:00)
  if (start > end) {
    // Overnight: quiet if current >= start OR current < end
    return current >= start || current < end
  } else {
    // Same day: quiet if current >= start AND current < end
    return current >= start && current < end
  }
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
