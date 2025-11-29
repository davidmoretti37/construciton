import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/**
 * This function is triggered when a schedule_event is created or updated.
 * It calculates when to send the reminder based on:
 * 1. Event start time
 * 2. User's reminder preference (e.g., 30 minutes before)
 * 3. Travel time (if enabled and available)
 * 4. Intelligent buffer based on distance
 */
serve(async (req) => {
  try {
    const payload = await req.json()
    console.log('📅 Schedule appointment reminder trigger:', payload)

    const { type, table, record, old_record } = payload

    // Only process schedule_events
    if (table !== 'schedule_events') {
      return new Response('Not a schedule_event', { status: 200 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const event = record

    // Handle DELETE - cancel any scheduled notifications
    if (type === 'DELETE' && old_record) {
      console.log('Cancelling scheduled notifications for deleted event')
      await supabase
        .from('scheduled_notifications')
        .update({ cancelled: true })
        .eq('schedule_event_id', old_record.id)
        .eq('sent', false)

      return new Response(JSON.stringify({ action: 'cancelled' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Handle INSERT or UPDATE
    if (type === 'INSERT' || type === 'UPDATE') {
      // If UPDATE, first cancel existing scheduled notifications
      if (type === 'UPDATE') {
        await supabase
          .from('scheduled_notifications')
          .update({ cancelled: true })
          .eq('schedule_event_id', event.id)
          .eq('sent', false)
      }

      // Get user's notification preferences
      const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('appointment_reminder_minutes, appointment_reminder_with_travel')
        .eq('user_id', event.owner_id)
        .single()

      // Default reminder: 30 minutes before
      let reminderMinutes = prefs?.appointment_reminder_minutes || 30

      // Add travel time if enabled and available
      if (prefs?.appointment_reminder_with_travel && event.estimated_travel_time_minutes) {
        reminderMinutes += event.estimated_travel_time_minutes

        // Add intelligent buffer based on travel time
        // Short trips: 10 min buffer
        // Medium trips: 15 min buffer
        // Long trips: 20 min buffer
        const travelMinutes = event.estimated_travel_time_minutes
        if (travelMinutes < 15) {
          reminderMinutes += 10
        } else if (travelMinutes < 45) {
          reminderMinutes += 15
        } else {
          reminderMinutes += 20
        }
      }

      // Calculate when to send the reminder
      const eventStart = new Date(event.start_datetime)
      const reminderTime = new Date(eventStart.getTime() - (reminderMinutes * 60 * 1000))

      // Don't schedule if reminder time is in the past
      if (reminderTime <= new Date()) {
        console.log('Reminder time is in the past, not scheduling')
        return new Response(JSON.stringify({ action: 'skipped', reason: 'past' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Build notification message
      let body = `"${event.title}" starting soon`
      if (event.estimated_travel_time_minutes) {
        const totalMinutes = Math.round((eventStart.getTime() - new Date().getTime()) / 60000)
        body = `Time to leave! "${event.title}" in ${Math.round(reminderMinutes)} min, ${event.estimated_travel_time_minutes} min drive away`
      }
      if (event.location) {
        body += ` at ${event.location}`
      }

      // Create scheduled notification
      const { data: scheduled, error } = await supabase
        .from('scheduled_notifications')
        .insert({
          user_id: event.owner_id,
          schedule_event_id: event.id,
          scheduled_for: reminderTime.toISOString(),
          title: 'Appointment Reminder',
          body: body,
          type: 'appointment_reminder',
          action_data: {
            screen: 'Chat',
            params: { prompt: `Tell me about my appointment: ${event.title}` },
          },
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating scheduled notification:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }

      console.log('Scheduled notification created:', scheduled)

      return new Response(JSON.stringify({
        action: 'scheduled',
        reminderTime: reminderTime.toISOString(),
        minutesBefore: reminderMinutes,
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Error in schedule-appointment-reminder:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
