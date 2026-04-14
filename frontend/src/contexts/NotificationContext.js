import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useAuth } from './AuthContext';
import {
  fetchNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  savePushToken,
  subscribeToNotifications,
  getNotificationPreferences,
} from '../utils/notificationStorage';
import logger from '../utils/logger';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    return {
      notifications: [],
      unreadCount: 0,
      isLoading: true,
      expoPushToken: null,
      refreshNotifications: () => {},
      markNotificationAsRead: () => {},
      markAllNotificationsAsRead: () => {},
      removeNotification: () => {},
    };
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { user, isOwner, isWorker, isSupervisor, isClient } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [expoPushToken, setExpoPushToken] = useState(null);
  const [preferences, setPreferences] = useState(null);

  const notificationListener = useRef();
  const responseListener = useRef();
  const realtimeSubscription = useRef();

  // Track push token registration attempts
  const pushTokenRetryCount = useRef(0);
  const maxPushTokenRetries = 3;

  // Register for push notifications with retry logic
  const registerForPushNotifications = useCallback(async (retryAttempt = 0) => {
    if (!Device.isDevice) {
      // Silently skip on simulators - no need to log warning
      return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      // Only log once, not on retries
      if (retryAttempt === 0) {
        logger.warn('Push notification permission not granted');
      }
      return null;
    }

    // Get Expo push token
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });
      const token = tokenData.data;

      logger.info('Expo push token registered successfully');

      // Save token to database
      const deviceType = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
      await savePushToken(token, deviceType, Device.modelName);

      setExpoPushToken(token);
      pushTokenRetryCount.current = 0; // Reset on success
      return token;
    } catch (error) {
      // Check if it's a transient server error
      const isTransientError = error.message?.includes('503') ||
                               error.message?.includes('SERVICE_UNAVAILABLE') ||
                               error.message?.includes('no healthy upstream') ||
                               error.message?.includes('high load');

      if (isTransientError && retryAttempt < maxPushTokenRetries) {
        // Retry with exponential backoff (2s, 4s, 8s)
        const delay = Math.pow(2, retryAttempt + 1) * 1000;
        setTimeout(() => {
          registerForPushNotifications(retryAttempt + 1);
        }, delay);
        return null;
      }

      // Only log error on first attempt or final failure
      if (retryAttempt === 0 || retryAttempt >= maxPushTokenRetries) {
        // Log a simpler message instead of the full error
      }
      return null;
    }
  }, []);

  // Load notifications from database
  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    try {
      const [notifs, count] = await Promise.all([
        fetchNotifications({ limit: 50 }),
        getUnreadCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (error) {
      logger.error('Error loading notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Load preferences
  const loadPreferences = useCallback(async () => {
    if (!user) return;
    const prefs = await getNotificationPreferences();
    setPreferences(prefs);
  }, [user]);

  // Initialize on user change
  useEffect(() => {
    if (user && (isOwner || isWorker || isSupervisor || isClient)) {
      setIsLoading(true);
      loadNotifications();
      loadPreferences();
      registerForPushNotifications();

      // Set up realtime subscription
      realtimeSubscription.current = subscribeToNotifications(user.id, (eventType, notification) => {
        if (eventType === 'INSERT') {
          setNotifications(prev => [notification, ...prev]);
          setUnreadCount(prev => prev + 1);
        } else if (eventType === 'UPDATE') {
          setNotifications(prev =>
            prev.map(n => (n.id === notification.id ? notification : n))
          );
          // Recalculate unread count
          getUnreadCount().then(setUnreadCount);
        } else if (eventType === 'DELETE') {
          setNotifications(prev => prev.filter(n => n.id !== notification.id));
          getUnreadCount().then(setUnreadCount);
        }
      });
    } else {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
    }

    return () => {
      if (realtimeSubscription.current) {
        realtimeSubscription.current.unsubscribe();
      }
    };
  }, [user, isOwner, isWorker, isSupervisor, isClient, loadNotifications, loadPreferences, registerForPushNotifications]);

  // Set up notification listeners
  useEffect(() => {
    // Handle notification received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      logger.debug('Notification received in foreground:', notification);
      // Refresh notifications to include any new ones
      loadNotifications();
    });

    // Handle notification response (user tapped notification)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      logger.debug('Notification tapped:', response);
      const data = response.notification.request.content.data;

      // Handle navigation based on notification data
      if (data?.screen) {
        // Navigation will be handled by the app's navigation system
        // The data object contains the screen and params to navigate to
        logger.debug('Navigate to:', data.screen, data.params);
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [loadNotifications]);

  // Configure Android notification channel
  useEffect(() => {
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
      });

      // Channel for appointment reminders
      Notifications.setNotificationChannelAsync('appointments', {
        name: 'Appointments',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
        description: 'Reminders for upcoming appointments',
      });

      // Channel for worker updates
      Notifications.setNotificationChannelAsync('workers', {
        name: 'Worker Updates',
        importance: Notifications.AndroidImportance.DEFAULT,
        description: 'Updates about workers and daily reports',
      });

      // Channel for project alerts
      Notifications.setNotificationChannelAsync('projects', {
        name: 'Project Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#F59E0B',
        description: 'Warnings and alerts about your projects',
      });
    }
  }, []);

  // Public methods
  const refreshNotifications = useCallback(async () => {
    setIsLoading(true);
    await loadNotifications();
  }, [loadNotifications]);

  const markNotificationAsRead = useCallback(async (notificationId) => {
    const success = await markAsRead(notificationId);
    if (success) {
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, read: true, read_at: new Date().toISOString() } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    return success;
  }, []);

  const markAllNotificationsAsRead = useCallback(async () => {
    const success = await markAllAsRead();
    if (success) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    }
    return success;
  }, []);

  const removeNotification = useCallback(async (notificationId) => {
    const notification = notifications.find(n => n.id === notificationId);
    const success = await deleteNotification(notificationId);
    if (success) {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (notification && !notification.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    }
    return success;
  }, [notifications]);

  const value = {
    notifications,
    unreadCount,
    isLoading,
    expoPushToken,
    preferences,
    refreshNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    removeNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
