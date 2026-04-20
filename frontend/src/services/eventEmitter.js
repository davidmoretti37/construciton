// Simple observer pattern (no external dependencies needed)
class SimpleEventEmitter {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => callback(data));
  }
}

const appEvents = new SimpleEventEmitter();

// ── Project events ──────────────────────────────────────
export const emitProjectUpdated = (projectId) => {
  appEvents.emit('project-updated', projectId);
};

export const onProjectUpdated = (callback) => {
  appEvents.on('project-updated', callback);
  return () => appEvents.off('project-updated', callback);
};

// ── Generic data invalidation ───────────────────────────
// Allows any screen to signal that a cache key's data changed,
// so other screens showing the same data can refresh.

export const emitDataChanged = (cacheKey, payload) => {
  appEvents.emit(`data-changed:${cacheKey}`, payload);
};

export const onDataChanged = (cacheKey, callback) => {
  appEvents.on(`data-changed:${cacheKey}`, callback);
  return () => appEvents.off(`data-changed:${cacheKey}`, callback);
};

// ── Transaction events ──────────────────────────────────
export const emitTransactionDeleted = (transactionId) => {
  appEvents.emit('transaction-deleted', transactionId);
};

export const onTransactionDeleted = (callback) => {
  appEvents.on('transaction-deleted', callback);
  return () => appEvents.off('transaction-deleted', callback);
};

// ── Phase events ────────────────────────────────────────
export const emitPhaseUpdated = (phaseId) => {
  appEvents.emit('phase-updated', phaseId);
};

export const onPhaseUpdated = (callback) => {
  appEvents.on('phase-updated', callback);
  return () => appEvents.off('phase-updated', callback);
};

// ── Task events ─────────────────────────────────────────
export const emitTaskCompleted = (taskId) => {
  appEvents.emit('task-completed', taskId);
};

export const onTaskCompleted = (callback) => {
  appEvents.on('task-completed', callback);
  return () => appEvents.off('task-completed', callback);
};

// ── Estimate events ─────────────────────────────────────
export const emitEstimateChanged = (estimateId) => {
  appEvents.emit('estimate-changed', estimateId);
};

export const onEstimateChanged = (callback) => {
  appEvents.on('estimate-changed', callback);
  return () => appEvents.off('estimate-changed', callback);
};

// ── Invoice events ──────────────────────────────────────
export const emitInvoiceChanged = (invoiceId) => {
  appEvents.emit('invoice-changed', invoiceId);
};

export const onInvoiceChanged = (callback) => {
  appEvents.on('invoice-changed', callback);
  return () => appEvents.off('invoice-changed', callback);
};

// ── Worker events ───────────────────────────────────────
export const emitWorkerChanged = (workerId) => {
  appEvents.emit('worker-changed', workerId);
};

export const onWorkerChanged = (callback) => {
  appEvents.on('worker-changed', callback);
  return () => appEvents.off('worker-changed', callback);
};

// ── Cache invalidation (bridges event bus → useCachedFetch) ──
export const emitCacheInvalidated = (cacheKey) => {
  appEvents.emit(`cache-invalidated:${cacheKey}`);
};

export const onCacheInvalidated = (cacheKey, callback) => {
  appEvents.on(`cache-invalidated:${cacheKey}`, callback);
  return () => appEvents.off(`cache-invalidated:${cacheKey}`, callback);
};
