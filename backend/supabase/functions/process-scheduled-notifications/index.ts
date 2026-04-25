import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { shouldSendPush, shouldCreateInApp, PREFS_COLUMNS } from '../_shared/notificationGate.ts'

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

        // Load user prefs once and gate push + in-app independently. The
        // previous block only checked push_appointment_reminders for the
        // appointment_reminder type and silently skipped category checks
        // for any other scheduled type. It also coupled in-app insertion
        // to the push decision, so toggling push off in Settings wiped
        // the inbox row too.
        const { data: prefs } = await supabase
          .from('notification_preferences')
          .select(PREFS_COLUMNS)
          .eq('user_id', notification.user_id)
          .single()

        const pushAllowed = shouldSendPush(prefs, notification.type)
        const inAppAllowed = shouldCreateInApp(prefs, notification.type)

        // ---- Push ----
        if (pushAllowed && tokens && tokens.length > 0) {
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
        }

        // ---- In-app ----
        if (inAppAllowed) {
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
