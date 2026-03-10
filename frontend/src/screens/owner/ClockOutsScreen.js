import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { checkForgottenClockOuts, remoteClockOutWorker, remoteClockOutSupervisor } from '../../utils/storage/timeTracking';

export default function ClockOutsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const forgotten = await checkForgottenClockOuts(0); // 0 = all active sessions
      const all = [
        ...forgotten.workers.map(w => ({
          id: w.id,
          type: 'worker',
          name: w.worker_name,
          project: w.project_name,
          clockIn: w.clock_in,
          hours: w.hoursElapsed,
          workerId: w.worker_id,
        })),
        ...forgotten.supervisors.map(s => ({
          id: s.id,
          type: 'supervisor',
          name: s.supervisor_name,
          project: s.project_name,
          clockIn: s.clock_in,
          hours: s.hoursElapsed,
          supervisorId: s.supervisor_id,
        })),
      ].sort((a, b) => parseFloat(b.hours) - parseFloat(a.hours));
      setSessions(all);
    } catch (error) {
      console.error('Error loading clock-out data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleRemoteClockOut = (session) => {
    Alert.alert(
      'Clock Out',
      `Clock out ${session.name} from ${session.project}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clock Out',
          style: 'destructive',
          onPress: async () => {
            const result = session.type === 'worker'
              ? await remoteClockOutWorker(session.workerId)
              : await remoteClockOutSupervisor(session.supervisorId);
            if (result.success) {
              Alert.alert('Success', `${session.name} has been clocked out.`);
              loadData();
            } else {
              Alert.alert('Error', result.error || 'Failed to clock out.');
            }
          },
        },
      ]
    );
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getHoursColor = (hours) => {
    const h = parseFloat(hours);
    if (h >= 10) return '#EF4444';
    if (h >= 8) return '#F59E0B';
    return '#10B981';
  };

  const renderItem = ({ item }) => (
    <View style={[styles.card, { backgroundColor: Colors.white }]}>
      <View style={styles.cardLeft}>
        <View style={[styles.avatar, { backgroundColor: item.type === 'supervisor' ? '#8B5CF61A' : '#F59E0B1A' }]}>
          <Ionicons
            name={item.type === 'supervisor' ? 'shield' : 'person'}
            size={18}
            color={item.type === 'supervisor' ? '#8B5CF6' : '#F59E0B'}
          />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.name, { color: Colors.primaryText }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.project, { color: Colors.secondaryText }]} numberOfLines={1}>
            {item.project}
          </Text>
          <Text style={[styles.time, { color: Colors.secondaryText }]}>
            Clocked in {formatDate(item.clockIn)} at {formatTime(item.clockIn)}
          </Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        <Text style={[styles.hours, { color: getHoursColor(item.hours) }]}>{item.hours}h</Text>
        <TouchableOpacity
          style={styles.clockOutBtn}
          onPress={() => handleRemoteClockOut(item)}
        >
          <Ionicons name="time-outline" size={16} color="#EF4444" />
          <Text style={styles.clockOutText}>Clock Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Active Clock-Ins</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={sessions}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={[styles.list, sessions.length === 0 && styles.emptyList]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryBlue} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={64} color={Colors.border} />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>All Clear</Text>
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              No one is currently clocked in.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  list: { padding: 16, paddingBottom: 100 },
  emptyList: { flex: 1 },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: { flex: 1, marginRight: 10 },
  name: { fontSize: 15, fontWeight: '600' },
  project: { fontSize: 13, marginTop: 2 },
  time: { fontSize: 11, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  hours: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  clockOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#EF44441A',
  },
  clockOutText: { fontSize: 11, fontWeight: '600', color: '#EF4444' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
