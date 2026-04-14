/**
 * Offline Queue Service
 * Queues write actions when offline, replays them when back online.
 * Persisted to AsyncStorage so queued actions survive app restart.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const QUEUE_KEY = 'sylk_offline_queue';

// In-memory mirror for synchronous reads
let queueMirror = null;

async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    queueMirror = raw ? JSON.parse(raw) : [];
  } catch (e) {
    queueMirror = [];
  }
  return queueMirror;
}

function getQueue() {
  return queueMirror || [];
}

function saveQueue(queue) {
  queueMirror = queue;
  AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue)).catch(e => {
    console.warn('[OfflineQueue] Save error:', e.message);
  });
}

// Load queue into memory on startup
loadQueue();

/**
 * Add an action to the offline queue.
 * Uses last-write-wins deduplication: if the same entity already has a
 * queued action, replace it with the new one (stores final state, not deltas).
 *
 * @param {object} action - { type, payload }
 * Types: 'complete_visit', 'uncomplete_visit', 'toggle_checklist',
 *        'update_quantity', 'submit_daily_report'
 */
export function queueAction(action) {
  let queue = getQueue();
  const entityKey = getEntityKey(action);

  // Deduplicate: remove any prior action for the same entity
  if (entityKey) {
    queue = queue.filter(a => getEntityKey(a) !== entityKey);
  }

  queue.push({
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    queuedAt: new Date().toISOString(),
  });
  saveQueue(queue);
}

/**
 * Get a unique key for an entity so we can deduplicate.
 * Same visit/checklist item → same key → last action wins.
 */
function getEntityKey(action) {
  const { type, payload } = action;
  switch (type) {
    case 'complete_visit':
    case 'uncomplete_visit':
      return `visit:${payload.visit_id}`;
    case 'toggle_checklist':
      return `checklist:${payload.template_id || payload.entry_id}`;
    case 'update_quantity':
      return `quantity:${payload.entry_id}`;
    default:
      return null; // no dedup for other types
  }
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
  // Ensure queue is loaded from storage
  await loadQueue();
  const queue = getQueue();
  if (queue.length === 0) return { processed: 0, failed: 0 };

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
        await supabase
          .from('daily_report_entries')
          .update({ completed: payload.completed })
          .eq('id', payload.entry_id);
      } else {
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
