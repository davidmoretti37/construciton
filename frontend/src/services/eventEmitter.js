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

export const emitProjectUpdated = (projectId) => {
  appEvents.emit('project-updated', projectId);
};

export const onProjectUpdated = (callback) => {
  appEvents.on('project-updated', callback);
  return () => appEvents.off('project-updated', callback);
};
