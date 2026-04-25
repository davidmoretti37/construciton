// Shared gating logic for notification delivery. Used by every edge
// function that fires notifications so the user-facing "Notifications"
// settings (push_*, inapp_*, quiet_hours_*) actually take effect.
//
// Default-allow when no preferences row exists for the user — that's the
// first-run state, and the settings screen creates the row on save.

const TYPE_TO_CATEGORY: Record<string, string> = {
  // Appointments
  'appointment_reminder': 'appointment_reminders',
  // Daily / worker reports
  'daily_report_submitted': 'daily_reports',
  'daily_report': 'daily_reports',
  // Project updates / warnings
  'project_warning': 'project_warnings',
  'project_status': 'project_warnings',
  'project_update': 'project_warnings',
  'task_update': 'project_warnings',
  // Money — payments, expenses, bank reconciliation
  'financial_update': 'financial_updates',
  'payment_received': 'financial_updates',
  'payment_reminder': 'financial_updates',
  'bank_reconciliation': 'financial_updates',
  // Worker lifecycle — invites, clock events, assignment changes
  'worker_update': 'worker_updates',
  'worker_invite': 'worker_updates',
  'clock_in': 'worker_updates',
  'clock_out': 'worker_updates',
};

export function categoryFor(type: string): string | null {
  return TYPE_TO_CATEGORY[type] || null;
}

/** Compares HH:MM strings; supports overnight windows (e.g. 22:00 → 07:00). */
export function isInQuietHours(currentHM: string, start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false;
  if (start > end) {
    // Overnight: quiet if past start OR before end
    return currentHM >= start || currentHM < end;
  }
  return currentHM >= start && currentHM < end;
}

/**
 * Should we send a push notification right now?
 * Returns true when prefs missing (default-allow). Suppresses on:
 *  - push_enabled = false
 *  - push_<category> = false
 *  - quiet hours window (push only — in-app still inserts)
 */
export function shouldSendPush(prefs: any, type: string, now: Date = new Date()): boolean {
  if (!prefs) return true;
  if (prefs.push_enabled === false) return false;
  const cat = categoryFor(type);
  if (cat && prefs[`push_${cat}`] === false) return false;
  if (prefs.quiet_hours_enabled) {
    const hm = now.toTimeString().slice(0, 5);
    if (isInQuietHours(hm, prefs.quiet_hours_start, prefs.quiet_hours_end)) return false;
  }
  return true;
}

/**
 * Should we insert an in-app notification row?
 * Quiet hours intentionally do NOT suppress — the inbox should still
 * collect entries silently so users see them on next open.
 */
export function shouldCreateInApp(prefs: any, type: string): boolean {
  if (!prefs) return true;
  if (prefs.inapp_enabled === false) return false;
  const cat = categoryFor(type);
  if (cat && prefs[`inapp_${cat}`] === false) return false;
  return true;
}

/** Convenience: all the columns we need for both gates in one fetch. */
export const PREFS_COLUMNS =
  'push_enabled, inapp_enabled, ' +
  'push_appointment_reminders, inapp_appointment_reminders, ' +
  'push_daily_reports, inapp_daily_reports, ' +
  'push_project_warnings, inapp_project_warnings, ' +
  'push_financial_updates, inapp_financial_updates, ' +
  'push_worker_updates, inapp_worker_updates, ' +
  'quiet_hours_enabled, quiet_hours_start, quiet_hours_end';
