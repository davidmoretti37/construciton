import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from '../contexts/NotificationContext';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { SkeletonBox, SkeletonCard } from '../components/SkeletonLoader';
import NotificationItem from '../components/NotificationItem';
import AppointmentPopup from '../components/AppointmentPopup';
import { updateScheduleEvent, deleteScheduleEvent } from '../utils/storage/schedules';
import { supabase } from '../lib/supabase';

// Filter options
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'appointment_reminder', label: 'Appointments' },
  { id: 'daily_report_submitted', label: 'Reports' },
  { id: 'project_warning', label: 'Warnings' },
  { id: 'financial_update', label: 'Financial' },
  { id: 'worker_update', label: 'Workers' },
];

export default function NotificationsScreen({ navigation }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const {
    notifications,
    unreadCount,
    isLoading,
    refreshNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    removeNotification,
  } = useNotifications();

  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showAppointmentPopup, setShowAppointmentPopup] = useState(false);
  const [appointmentLoading, setAppointmentLoading] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshNotifications();
    setRefreshing(false);
  }, [refreshNotifications]);

  const handleNotificationPress = useCallback(async (notification) => {
    // Mark as read
    if (!notification.read) {
      await markNotificationAsRead(notification.id);

      // For bank reconciliation: save acknowledged count so future notifications only show new
      if (notification.type === 'bank_reconciliation' && notification.action_data?.current_total) {
        try {
          await supabase
            .from('notifications')
            .update({
              action_data: {
                ...notification.action_data,
                acknowledged_count: notification.action_data.current_total,
              },
            })
            .eq('id', notification.id);
        } catch (e) {
          console.warn('Failed to save acknowledged count:', e);
        }
      }
    }

    // Navigate based on action_data
    const actionData = notification.action_data || {};

    // Check if this is an appointment notification
    const eventId = actionData.params?.eventId || notification.schedule_event_id;
    if (eventId && (notification.type === 'appointment_reminder' || actionData.screen === 'Schedule' || actionData.screen === 'Chat')) {
      // Fetch appointment data and show popup instead of navigating to Chat
      try {
        setAppointmentLoading(true);
        const { data, error } = await supabase
          .from('schedule_events')
          .select('*')
          .eq('id', eventId)
          .single();

        if (error) {
          console.error('Error fetching appointment:', error);
          Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'appointment details' }));
          return;
        }

        if (data) {
          setSelectedAppointment(data);
          setShowAppointmentPopup(true);
        }
      } catch (error) {
        console.error('Error fetching appointment:', error);
        Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'appointment details' }));
      } finally {
        setAppointmentLoading(false);
      }
      return;
    }

    if (actionData.screen) {
      // Map old/invalid screen names to valid ones
      const screenMapping = {
        'Schedule': 'Chat', // Schedule screen doesn't exist, use Chat instead
      };
      const targetScreen = screenMapping[actionData.screen] || actionData.screen;

      // Screens that are inside the BottomTabNavigator need nested navigation
      const tabScreens = ['Home', 'Projects', 'Workers', 'Chat', 'More'];

      try {
        if (tabScreens.includes(targetScreen)) {
          // Navigate to nested tab screen
          navigation.navigate('MainTabs', {
            screen: targetScreen,
            params: actionData.params || {}
          });
        } else {
          // Direct navigation for screens in MainNavigator
          navigation.navigate(targetScreen, actionData.params || {});
        }
      } catch (error) {
        console.warn(`Could not navigate to ${targetScreen}:`, error);
        // Fallback to Chat tab
        navigation.navigate('MainTabs', { screen: 'Chat' });
      }
    }
  }, [markNotificationAsRead, navigation]);

  const handleMarkAllRead = useCallback(async () => {
    await markAllNotificationsAsRead();
  }, [markAllNotificationsAsRead]);

  const handleDelete = useCallback(async (notificationId) => {
    await removeNotification(notificationId);
  }, [removeNotification]);

  // Appointment popup handlers
  const handleReschedule = useCallback(async (eventId, updates) => {
    const success = await updateScheduleEvent(eventId, updates);
    if (success) {
      setShowAppointmentPopup(false);
      setSelectedAppointment(null);
    } else {
      Alert.alert(t('alerts.error'), t('messages.failedToUpdate', { item: 'appointment' }));
    }
  }, [t]);

  const handleCancelAppointment = useCallback(async (eventId) => {
    Alert.alert(
      t('alerts.confirm'),
      t('alerts.deleteConfirm'),
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            const success = await deleteScheduleEvent(eventId);
            if (success) {
              setShowAppointmentPopup(false);
              setSelectedAppointment(null);
            } else {
              Alert.alert(t('alerts.error'), t('messages.failedToDelete', { item: 'appointment' }));
            }
          }
        }
      ]
    );
  }, [t]);

  const handleClosePopup = useCallback(() => {
    setShowAppointmentPopup(false);
    setSelectedAppointment(null);
  }, []);

  // Filter notifications
  const filteredNotifications = activeFilter === 'all'
    ? notifications
    : notifications.filter(n => n.type === activeFilter);

  // Group notifications by date
  const groupedNotifications = React.useMemo(() => {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    filteredNotifications.forEach(notification => {
      const date = new Date(notification.created_at);
      date.setHours(0, 0, 0, 0);

      let groupKey;
      if (date.getTime() === today.getTime()) {
        groupKey = 'Today';
      } else if (date.getTime() === yesterday.getTime()) {
        groupKey = 'Yesterday';
      } else {
        groupKey = date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(notification);
    });

    return Object.entries(groups).map(([title, data]) => ({
      title,
      data,
    }));
  }, [filteredNotifications]);

  const renderSectionHeader = ({ section }) => (
    <View style={[styles.sectionHeader, { backgroundColor: Colors.background }]}>
      <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
        {section.title}
      </Text>
    </View>
  );

  const renderItem = ({ item }) => (
    <NotificationItem
      notification={item}
      onPress={handleNotificationPress}
      onDelete={handleDelete}
    />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-off-outline" size={64} color={Colors.secondaryText} />
      <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>
        No notifications
      </Text>
      <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
        {activeFilter === 'all'
          ? "You're all caught up!"
          : `No ${FILTERS.find(f => f.id === activeFilter)?.label.toLowerCase()} notifications`}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
          Notifications
        </Text>

        <View style={styles.headerRight}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.markAllButton}
              onPress={handleMarkAllRead}
            >
              <Text style={[styles.markAllText, { color: Colors.primaryBlue }]}>
                Mark all read
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('NotificationSettings')}
          >
            <Ionicons name="settings-outline" size={22} color={Colors.primaryText} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterContainer, { borderBottomColor: Colors.border }]}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterTab,
                activeFilter === item.id && styles.filterTabActive,
                activeFilter === item.id && { backgroundColor: Colors.primaryBlue + '15' },
              ]}
              onPress={() => setActiveFilter(item.id)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  { color: activeFilter === item.id ? Colors.primaryBlue : Colors.secondaryText },
                  activeFilter === item.id && styles.filterTabTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={{ padding: 16 }}>
          <SkeletonBox width="30%" height={12} borderRadius={4} style={{ marginBottom: 12 }} />
          <SkeletonCard lines={2} showAvatar style={{ marginBottom: 8 }} />
          <SkeletonCard lines={2} showAvatar style={{ marginBottom: 8 }} />
          <SkeletonBox width="30%" height={12} borderRadius={4} style={{ marginTop: 8, marginBottom: 12 }} />
          <SkeletonCard lines={2} showAvatar style={{ marginBottom: 8 }} />
          <SkeletonCard lines={2} showAvatar />
        </View>
      ) : (
        <FlatList
          data={groupedNotifications.flatMap(group => [
            { type: 'header', title: group.title, key: `header-${group.title}` },
            ...group.data.map(item => ({ type: 'item', ...item, key: item.id })),
          ])}
          keyExtractor={(item) => item.key || item.id}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return renderSectionHeader({ section: { title: item.title } });
            }
            return renderItem({ item });
          }}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primaryBlue}
            />
          }
          contentContainerStyle={
            filteredNotifications.length === 0 ? styles.emptyListContent : undefined
          }
        />
      )}

      {/* Appointment Popup */}
      <AppointmentPopup
        visible={showAppointmentPopup}
        appointment={selectedAppointment}
        onClose={handleClosePopup}
        onReschedule={handleReschedule}
        onCancel={handleCancelAppointment}
        loading={appointmentLoading}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markAllButton: {
    padding: 4,
  },
  markAllText: {
    fontSize: 14,
    fontWeight: '500',
  },
  settingsButton: {
    padding: 4,
  },
  filterContainer: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  filterList: {
    paddingHorizontal: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
  },
  filterTabActive: {
    borderWidth: 0,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterTabTextActive: {
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
