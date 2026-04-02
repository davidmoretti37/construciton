/**
 * Offline Queue Service
 * Queues write actions when offline, replays them when back online.
 * Persisted to MMKV so queued actions survive app restart.
 */

import { MMKV } from 'react-native-mmkv';
import { supabase } from '../lib/supabase';

let storage;
try {
  storage = new MMKV({ id: 'sylk-offline-queue' });
} catch (e) {
  console.warn('[OfflineQueue] MMKV init failed');
  storage = null;
}

const QUEUE_KEY = 'pending_actions';

function getQueue() {
  try {
    const raw = storage?.getString(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveQueue(queue) {
  try {
    storage?.set(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[OfflineQueue] Save error:', e.message);
  }
}

/**
 * Add an action to the offline queue
 * @param {object} action - { type, payload }
 * Types: 'complete_visit', 'uncomplete_visit', 'toggle_checklist',
 *        'update_quantity', 'submit_daily_report'
 */
export function queueAction(action) {
  const queue = getQueue();
  queue.push({
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    queuedAt: new Date().toISOString(),
  });
  saveQueue(queue);
  console.log(`[OfflineQueue] Queued: ${action.type} (${queue.length} pending)`);
}

/**
 * Get the number of pending actions
 */
export function getQueueSize() {
  return getQueue().length;
}

/**
 * Process all queued actions sequentially
 * Called when network comes back online
 * @returns {{ processed: number, failed: number }}
 */
export async function processQueue() {
  const queue = getQueue();
  if (queue.length === 0) return { processed: 0, failed: 0 };

  console.log(`[OfflineQueue] Processing ${queue.length} queued actions...`);

  let processed = 0;
  let failed = 0;
  const remaining = [];

  for (const action of queue) {
    try {
      await executeAction(action);
      processed++;
    } catch (e) {
      console.warn(`[OfflineQueue] Failed: ${action.type}`, e.message);
      // Keep failed actions that are less than 48 hours old
      const age = Date.now() - new Date(action.queuedAt).getTime();
      if (age < 48 * 60 * 60 * 1000) {
        remaining.push(action);
        failed++;
      }
      // Older than 48h — drop it
    }
  }

  saveQueue(remaining);
  console.log(`[OfflineQueue] Done: ${processed} processed, ${failed} failed, ${remaining.length} remaining`);
  return { processed, failed };
}

/**
 * Execute a single queued action against Supabase
 */
async function executeAction(action) {
  const { type, payload } = action;

  switch (type) {
    case 'complete_visit': {
      await supabase
        .from('service_visits')
        .update({
          status: 'completed',
          completed_at: payload.completed_at,
          started_at: payload.started_at || payload.completed_at,
        })
        .eq('id', payload.visit_id);
      break;
    }

    case 'uncomplete_visit': {
      await supabase
        .from('service_visits')
        .update({
          status: 'scheduled',
          completed_at: null,
        })
        .eq('id', payload.visit_id);
      break;
    }

    case 'toggle_checklist': {
      if (payload.entry_id) {
        // Update existing entry
        await supabase
          .from('daily_report_entries')
          .update({ completed: payload.completed })
          .eq('id', payload.entry_id);
      } else {
        // Need to create report + entry — complex, use the full flow
        // For now, create entry directly if report_id exists
        if (payload.report_id) {
          await supabase
            .from('daily_report_entries')
            .insert({
              report_id: payload.report_id,
              entry_type: 'checklist',
              checklist_template_id: payload.template_id,
              title: payload.title,
              completed: payload.completed,
              quantity_unit: payload.quantity_unit,
              sort_order: payload.sort_order,
            });
        }
      }
      break;
    }

    case 'update_quantity': {
      if (payload.entry_id) {
        await supabase
          .from('daily_report_entries')
          .update({ quantity: payload.quantity })
          .eq('id', payload.entry_id);
      }
      break;
    }

    default:
      console.warn(`[OfflineQueue] Unknown action type: ${type}`);
  }
}

/**
 * Clear the entire queue (e.g., on logout)
 */
export function clearQueue() {
  saveQueue([]);
}
