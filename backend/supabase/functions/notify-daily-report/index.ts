import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { shouldSendPush, shouldCreateInApp, PREFS_COLUMNS } from '../_shared/notificationGate.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const NOTIFICATION_TYPE = 'daily_report_submitted'

/**
 * This function is triggered when a daily_report is created.
 * It notifies the project owner that a worker has submitted their report.
 */
serve(async (req) => {
  try {
    const payload = await req.json()
    console.log('📋 Daily report notification trigger:', payload)

    const { type, table, record } = payload

    // Only process INSERT on daily_reports
    if (table !== 'daily_reports' || type !== 'INSERT') {
      return new Response('Not a daily_reports insert', { status: 200 })
    }

    const report = record
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get the worker info
    const { data: worker } = await supabase
      .from('workers')
      .select('id, full_name, owner_id')
      .eq('id', report.worker_id)
      .single()

    if (!worker) {
      console.log('Worker not found')
      return new Response('Worker not found', { status: 200 })
    }

    // Get the project info
    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', report.project_id)
      .single()

    if (!project) {
      console.log('Project not found')
      return new Response('Project not found', { status: 200 })
    }

    // Get the phase info if available
    let phaseName = ''
    if (report.phase_id) {
      const { data: phase } = await supabase
        .from('project_phases')
        .select('name')
        .eq('id', report.phase_id)
        .single()
      if (phase) {
        phaseName = phase.name
      }
    }

    // Build notification
    const title = 'Daily Report Submitted'
    let body = `${worker.full_name} submitted a daily report for ${project.name}`
    if (phaseName) {
      body += ` - ${phaseName}`
    }

    const photoCount = report.photos?.length || 0
    if (photoCount > 0) {
      body += ` (${photoCount} photo${photoCount > 1 ? 's' : ''})`
    }

    // Send to one recipient: respects their notification_preferences row for
    // both push and in-app, and falls back to safe defaults if none exists.
    const notifyUser = async (recipientId: string) => {
      const { data: prefs } = await supabase
        .from('notification_preferences')
        .select(PREFS_COLUMNS)
        .eq('user_id', recipientId)
        .single()

      const pushAllowed = shouldSendPush(prefs, NOTIFICATION_TYPE)
      const inAppAllowed = shouldCreateInApp(prefs, NOTIFICATION_TYPE)

      if (inAppAllowed) {
        await supabase.from('notifications').insert({
          user_id: recipientId,
          title,
          body,
          type: NOTIFICATION_TYPE,
          icon: 'document-text',
          color: '#10B981',
          action_data: {
            screen: 'DailyReportDetail',
            params: { reportId: report.id },
          },
          project_id: report.project_id,
          worker_id: worker.id,
          daily_report_id: report.id,
        })
      }

      if (pushAllowed) {
        const { data: tokens } = await supabase
          .from('push_tokens')
          .select('expo_push_token')
          .eq('user_id', recipientId)
          .eq('is_active', true)

        if (tokens && tokens.length > 0) {
          const messages = tokens.map(t => ({
            to: t.expo_push_token,
            title,
            body,
            sound: 'default',
            data: {
              type: 'daily_report_submitted',
              screen: 'DailyReportDetail',
              params: { reportId: report.id },
            },
            channelId: 'workers',
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
      }
    }

    // Owner always gets notified.
    await notifyUser(worker.owner_id)

    // Fan out to assigned supervisor when present, distinct from owner, and
    // granted can_manage_workers by the owner.
    const { data: projWithSup } = await supabase
      .from('projects')
      .select('assigned_supervisor_id')
      .eq('id', report.project_id)
      .single()
    const supId = projWithSup?.assigned_supervisor_id
    if (supId && supId !== worker.owner_id) {
      const { data: sup } = await supabase
        .from('profiles')
        .select('can_manage_workers')
        .eq('id', supId)
        .single()
      if (sup?.can_manage_workers) {
        await notifyUser(supId)
      }
    }

    console.log('Daily report notification sent')

    return new Response(JSON.stringify({ sent: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in notify-daily-report:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
