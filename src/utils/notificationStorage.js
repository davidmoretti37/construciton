import { supabase } from '../lib/supabase';
import logger from './logger';

/**
 * Get current user ID from Supabase auth
 * @returns {Promise<string|null>} User ID or null
 */
const getCurrentUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

// =====================================================
// NOTIFICATIONS
// =====================================================

/**
 * Fetch notifications for the current user
 * @param {object} options - Query options
 * @param {number} options.limit - Max number to fetch (default 50)
 * @param {number} options.offset - Offset for pagination (default 0)
 * @param {boolean} options.unreadOnly - Only fetch unread (default false)
 * @param {string} options.type - Filter by notification type
 * @returns {Promise<Array>} Array of notifications
 */
export const fetchNotifications = async (options = {}) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      logger.warn('fetchNotifications: No user logged in');
      return [];
    }

    const { limit = 50, offset = 0, unreadOnly = false, type = null } = options;

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.eq('read', false);
    }

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching notifications:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('Error in fetchNotifications:', error);
    return [];
  }
};

/**
 * Get unread notification count
 * @returns {Promise<number>} Unread count
 */
export const getUnreadCount = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return 0;

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      logger.error('Error getting unread count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    logger.error('Error in getUnreadCount:', error);
    return 0;
  }
};

/**
 * Mark a notification as read
 * @param {string} notificationId - Notification ID
 * @returns {Promise<boolean>} Success status
 */
export const markAsRead = async (notificationId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      logger.error('Error marking notification as read:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error in markAsRead:', error);
    return false;
  }
};

/**
 * Mark all notifications as read
 * @returns {Promise<boolean>} Success status
 */
export const markAllAsRead = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      logger.error('Error marking all as read:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error in markAllAsRead:', error);
    return false;
  }
};

/**
 * Delete a notification
 * @param {string} notificationId - Notification ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteNotification = async (notificationId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      logger.error('Error deleting notification:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error in deleteNotification:', error);
    return false;
  }
};

/**
 * Create a notification (for local/in-app use)
 * @param {object} notification - Notification data
 * @returns {Promise<object|null>} Created notification or null
 */
export const createNotification = async (notification) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        icon: notification.icon || 'notifications',
        color: notification.color || '#3B82F6',
        action_type: notification.actionType || 'navigate',
        action_data: notification.actionData || {},
        project_id: notification.projectId || null,
        worker_id: notification.workerId || null,
        schedule_event_id: notification.scheduleEventId || null,
        daily_report_id: notification.dailyReportId || null,
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating notification:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Error in createNotification:', error);
    return null;
  }
};

// =====================================================
// NOTIFICATION PREFERENCES
// =====================================================

/**
 * Get notification preferences for the current user
 * @returns {Promise<object|null>} Preferences or null
 */
export const getNotificationPreferences = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('Error getting notification preferences:', error);
      return null;
    }

    // Return default preferences if none exist
    if (!data) {
      return {
        push_enabled: true,
        push_appointment_reminders: true,
        push_daily_reports: true,
        push_project_warnings: true,
        push_financial_updates: true,
        push_worker_updates: true,
        inapp_enabled: true,
        inapp_appointment_reminders: true,
        inapp_daily_reports: true,
        inapp_project_warnings: true,
        inapp_financial_updates: true,
        inapp_worker_updates: true,
        appointment_reminder_minutes: null, // null means user needs to set
        appointment_reminder_with_travel: true,
        quiet_hours_enabled: false,
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00',
      };
    }

    return data;
  } catch (error) {
    logger.error('Error in getNotificationPreferences:', error);
    return null;
  }
};

/**
 * Save notification preferences
 * @param {object} preferences - Preferences to save
 * @returns {Promise<boolean>} Success status
 */
export const saveNotificationPreferences = async (preferences) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        ...preferences,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      logger.error('Error saving notification preferences:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error in saveNotificationPreferences:', error);
    return false;
  }
};

// =====================================================
// PUSH TOKENS
// =====================================================

/**
 * Save a push token for the current user
 * @param {string} token - Expo push token
 * @param {string} deviceType - 'ios', 'android', or 'web'
 * @param {string} deviceName - Device name (optional)
 * @returns {Promise<boolean>} Success status
 */
export const savePushToken = async (token, deviceType, deviceName = null) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('push_tokens')
      .upsert({
        user_id: userId,
        expo_push_token: token,
        device_type: deviceType,
        device_name: deviceName,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,expo_push_token' });

    if (error) {
      logger.error('Error saving push token:', error);
      return false;
    }

    logger.info('Push token saved successfully');
    return true;
  } catch (error) {
    logger.error('Error in savePushToken:', error);
    return false;
  }
};

/**
 * Deactivate a push token
 * @param {string} token - Expo push token
 * @returns {Promise<boolean>} Success status
 */
export const deactivatePushToken = async (token) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('push_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('expo_push_token', token);

    if (error) {
      logger.error('Error deactivating push token:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error in deactivatePushToken:', error);
    return false;
  }
};

/**
 * Get all active push tokens for a user (used by backend)
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of push tokens
 */
export const getPushTokensForUser = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('push_tokens')
      .select('expo_push_token, device_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      logger.error('Error getting push tokens:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('Error in getPushTokensForUser:', error);
    return [];
  }
};

// =====================================================
// SCHEDULED NOTIFICATIONS
// =====================================================

/**
 * Get scheduled notifications for the current user
 * @returns {Promise<Array>} Array of scheduled notifications
 */
export const getScheduledNotifications = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('scheduled_notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('sent', false)
      .eq('cancelled', false)
      .order('scheduled_for', { ascending: true });

    if (error) {
      logger.error('Error getting scheduled notifications:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('Error in getScheduledNotifications:', error);
    return [];
  }
};

/**
 * Cancel scheduled notifications for an event
 * @param {string} scheduleEventId - Schedule event ID
 * @returns {Promise<boolean>} Success status
 */
export const cancelScheduledNotifications = async (scheduleEventId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('scheduled_notifications')
      .update({ cancelled: true })
      .eq('schedule_event_id', scheduleEventId)
      .eq('user_id', userId)
      .eq('sent', false);

    if (error) {
      logger.error('Error cancelling scheduled notifications:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error in cancelScheduledNotifications:', error);
    return false;
  }
};

// =====================================================
// REALTIME SUBSCRIPTION HELPERS
// =====================================================

/**
 * Subscribe to notification changes for the current user
 * @param {string} userId - User ID
 * @param {function} callback - Callback function (eventType, notification)
 * @returns {object} Subscription object with unsubscribe method
 */
export const subscribeToNotifications = (userId, callback) => {
  const subscription = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback(payload.eventType, payload.new || payload.old);
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      supabase.removeChannel(subscription);
    },
  };
};
