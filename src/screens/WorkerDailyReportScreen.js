import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getCurrentUserId } from '../utils/storage';
import { supabase } from '../lib/supabase';

export default function WorkerDailyReportScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState([]);
  const [workerId, setWorkerId] = useState(null);

  // Track if initial load has happened
  const hasLoadedRef = useRef(false);

  // Initial load - only once
  useEffect(() => {
    if (!hasLoadedRef.current) {
      loadReports();
      hasLoadedRef.current = true;
    }
  }, []);

  // Reload when navigating back after creating a report
  useFocusEffect(
    useCallback(() => {
      if (route.params?.refresh) {
        loadReports();
        // Clear the param so it doesn't keep refreshing
        navigation.setParams({ refresh: undefined });
      }
    }, [route.params?.refresh])
  );

  const loadReports = async (isRefresh = false) => {
    try {
      // Only show full loading screen on initial load, not refreshes
      if (!isRefresh && reports.length === 0) {
        setLoading(true);
      }

      const currentUserId = await getCurrentUserId();

      // Get worker ID
      const { data: workerData, error: workerError } = await supabase
        .from('workers')
        .select('id')
        .eq('user_id', currentUserId)
        .single();

      if (workerError || !workerData) {
        console.error('Error fetching worker:', workerError);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setWorkerId(workerData.id);

      // Fetch all reports for this worker
      const { data, error } = await supabase
        .from('daily_reports')
        .select(`
          *,
          projects (id, name),
          project_phases (id, name)
        `)
        .eq('worker_id', workerData.id)
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching reports:', error);
      } else {
        setReports(data || []);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadReports(true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const getPhotoCount = (report) => {
    return report.photos?.length || 0;
  };

  const getNotesPreview = (report) => {
    if (!report.notes) return null;
    const maxLength = 60;
    if (report.notes.length <= maxLength) return report.notes;
    return report.notes.substring(0, maxLength) + '...';
  };

  const renderReportItem = ({ item: report }) => {
    const photoCount = getPhotoCount(report);
    const notesPreview = getNotesPreview(report);

    return (
      <TouchableOpacity
        style={[styles.reportCard, { backgroundColor: Colors.white }]}
        onPress={() => navigation.navigate('DailyReportDetail', { report })}
        activeOpacity={0.7}
      >
        <View style={styles.reportHeader}>
          <Text style={[styles.reportDate, { color: Colors.primaryText }]}>
            {formatDate(report.report_date)}
          </Text>
          {photoCount > 0 && (
            <View style={[styles.photoBadge, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name="camera" size={14} color={Colors.primaryBlue} />
              <Text style={[styles.photoBadgeText, { color: Colors.primaryBlue }]}>
                {photoCount}
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.projectName, { color: Colors.primaryText }]}>
          {report.projects?.name || 'Unknown Project'}
        </Text>

        {report.project_phases?.name && (
          <Text style={[styles.phaseName, { color: Colors.secondaryText }]}>
            {report.project_phases.name}
          </Text>
        )}

        {notesPreview && (
          <Text style={[styles.notesPreview, { color: Colors.secondaryText }]} numberOfLines={2}>
            {notesPreview}
          </Text>
        )}

        <View style={styles.reportFooter}>
          <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="document-text-outline" size={64} color={Colors.border} />
      <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>
        No Reports Yet
      </Text>
      <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
        Tap the + button to create your first daily report
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
        <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
          Loading reports...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top Bar - matches other worker screens */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Daily Reports</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={22} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={reports}
        renderItem={renderReportItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          reports.length === 0 && styles.emptyListContent
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primaryBlue}
          />
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: '#1F2937' }]}
        onPress={() => navigation.navigate('DailyReportForm')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.body,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
  },
  topBarTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
  },
  listContent: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  emptyListContent: {
    flex: 1,
  },
  reportCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  reportDate: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  photoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  photoBadgeText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  projectName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  phaseName: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.sm,
  },
  notesPreview: {
    fontSize: FontSizes.small,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  reportFooter: {
    alignItems: 'flex-end',
    marginTop: Spacing.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.title,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 24,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
