import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/**
 * This function should be called by a cron job every minute
 * to process scheduled notifications (like appointment reminders)
 */
serve(async (req) => {
  try {
    console.log('⏰ Processing scheduled notifications...')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get all pending scheduled notifications that are due
    const now = new Date().toISOString()
    const { data: pendingNotifications, error: fetchError } = await supabase
      .from('scheduled_notifications')
      .select('*')
      .eq('sent', false)
      .eq('cancelled', false)
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(100) // Process max 100 at a time

    if (fetchError) {
      console.error('Error fetching scheduled notifications:', fetchError)
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      console.log('No pending notifications to process')
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`Found ${pendingNotifications.length} notifications to process`)

    let processed = 0
    let failed = 0

    for (const notification of pendingNotifications) {
      try {
        // Get user's push tokens
        const { data: tokens } = await supabase
          .from('push_tokens')
          .select('expo_push_token')
          .eq('user_id', notification.user_id)
          .eq('is_active', true)

        if (tokens && tokens.length > 0) {
          // Get user's preferences to check if notifications are enabled
          const { data: prefs } = await supabase
            .from('notification_preferences')
            .select('push_enabled, push_appointment_reminders, quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
            .eq('user_id', notification.user_id)
            .single()

          // Check if we should send
          let shouldSend = true
          if (prefs) {
            if (!prefs.push_enabled) shouldSend = false
            if (notification.type === 'appointment_reminder' && !prefs.push_appointment_reminders) shouldSend = false
            if (prefs.quiet_hours_enabled) {
              const currentTime = new Date().toTimeString().slice(0, 5)
              if (isInQuietHours(currentTime, prefs.quiet_hours_start, prefs.quiet_hours_end)) {
                shouldSend = false
              }
            }
          }

          if (shouldSend) {
            // Send push notification
            const messages = tokens.map(t => ({
              to: t.expo_push_token,
              title: notification.title,
              body: notification.body,
              sound: 'default',
              data: notification.action_data || {},
              channelId: 'appointments',
              priority: 'high',
            }))

            await fetch(EXPO_PUSH_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify(messages),
            })

            // Also create in-app notification
            await supabase.from('notifications').insert({
              user_id: notification.user_id,
              title: notification.title,
              body: notification.body,
              type: notification.type,
              icon: 'calendar',
              color: '#3B82F6',
              action_data: notification.action_data || {},
              schedule_event_id: notification.schedule_event_id,
            })
          }
        }

        // Mark as sent
        await supabase
          .from('scheduled_notifications')
          .update({ sent: true, sent_at: new Date().toISOString() })
          .eq('id', notification.id)

        processed++
      } catch (err) {
        console.error(`Error processing notification ${notification.id}:`, err)
        failed++
      }
    }

    console.log(`Processed: ${processed}, Failed: ${failed}`)

    return new Response(JSON.stringify({ processed, failed }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in process-scheduled-notifications:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

function isInQuietHours(current: string, start: string, end: string): boolean {
  if (start > end) {
    return current >= start || current < end
  }
  return current >= start && current < end
}
