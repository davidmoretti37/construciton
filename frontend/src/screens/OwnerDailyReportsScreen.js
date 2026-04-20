import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getCurrentUserId } from '../utils/storage';
import { supabase } from '../lib/supabase';
import { useCachedFetch } from '../hooks/useCachedFetch';

export default function OwnerDailyReportsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('workers');

  const fetchReports = useCallback(async () => {
    const currentUserId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('daily_reports')
      .select(`
        *,
        projects!inner (id, name, user_id),
        project_phases (id, name),
        workers (id, full_name, trade)
      `)
      .eq('projects.user_id', currentUserId)
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }, []);

  const { data: reports, loading, refreshing, refresh } = useCachedFetch(
    'owner:dailyReports',
    fetchReports,
    { staleTTL: 15000, maxAge: 3 * 60 * 1000 }
  );

  const onRefresh = () => {
    refresh();
  };

  const formatDate = (dateString) => {
    if (!dateString) return t('reports.unknownDate');
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return t('common:time.today');
    } else if (date.toDateString() === yesterday.toDateString()) {
      return t('common:time.yesterday');
    }

    return date.toLocaleDateString(undefined, {
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

  const getReporterName = (report) => {
    if (report.reporter_type === 'owner') {
      return t('reports.you');
    }
    if (report.reporter_type === 'supervisor') {
      return report.profiles?.business_name || t('reports.supervisor');
    }
    return report.workers?.full_name || t('reports.unknownWorker');
  };

  const renderReportItem = ({ item: report }) => {
    const photoCount = getPhotoCount(report);
    const reporterName = getReporterName(report);
    const isOwnerReport = report.reporter_type === 'owner';
    const workDone = report.tags?.[0] || '';
    const weather = report.weather;
    const manpowerCount = report.manpower?.length || 0;
    const delayCount = report.delays?.length || 0;
    const materialCount = report.materials?.length || 0;

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
          <View style={styles.headerBadges}>
            {isOwnerReport && (
              <View style={[styles.ownerBadge, { backgroundColor: '#10B981' + '20' }]}>
                <Text style={[styles.ownerBadgeText, { color: '#10B981' }]}>{t('reports.owner')}</Text>
              </View>
            )}
            {weather?.conditions && (
              <View style={[styles.photoBadge, { backgroundColor: '#F59E0B20' }]}>
                <Ionicons name={weather.conditions === 'sunny' ? 'sunny-outline' : weather.conditions === 'rain' ? 'rainy-outline' : 'cloud-outline'} size={13} color="#F59E0B" />
                {weather.temp && <Text style={[styles.photoBadgeText, { color: '#F59E0B' }]}>{weather.temp}°</Text>}
              </View>
            )}
            {photoCount > 0 && (
              <View style={[styles.photoBadge, { backgroundColor: Colors.primaryBlue + '20' }]}>
                <Ionicons name="camera" size={13} color={Colors.primaryBlue} />
                <Text style={[styles.photoBadgeText, { color: Colors.primaryBlue }]}>{photoCount}</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={[styles.projectName, { color: Colors.primaryText }]}>
          {report.projects?.name || t('reports.unknownProject')}
        </Text>

        <View style={styles.reporterRow}>
          <Ionicons name={isOwnerReport ? "person" : "construct"} size={14} color={Colors.secondaryText} />
          <Text style={[styles.reporterName, { color: Colors.secondaryText }]}>{reporterName}</Text>
          {report.workers?.trade && (
            <>
              <Text style={[styles.separator, { color: Colors.secondaryText }]}> · </Text>
              <Text style={[styles.phaseName, { color: Colors.secondaryText }]}>{report.workers.trade}</Text>
            </>
          )}
        </View>

        {workDone ? (
          <Text style={[styles.notesPreview, { color: Colors.secondaryText }]} numberOfLines={2}>{workDone}</Text>
        ) : null}

        {/* Detail badges */}
        {(manpowerCount > 0 || delayCount > 0 || materialCount > 0) && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            {manpowerCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="people-outline" size={12} color={Colors.secondaryText} />
                <Text style={{ fontSize: 11, color: Colors.secondaryText }}>{manpowerCount} on site</Text>
              </View>
            )}
            {materialCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="cube-outline" size={12} color={Colors.secondaryText} />
                <Text style={{ fontSize: 11, color: Colors.secondaryText }}>{materialCount} materials</Text>
              </View>
            )}
            {delayCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="warning-outline" size={12} color="#F59E0B" />
                <Text style={{ fontSize: 11, color: '#F59E0B' }}>{delayCount} delay{delayCount > 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>
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
        {t('reports.noReportsYet')}
      </Text>
      <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
        {t('reports.createFirstReport')}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
        <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
          {t('reports.loadingReports')}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('reports.dailyReports')}</Text>
      </View>

      <FlatList
        data={reports || []}
        renderItem={renderReportItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          (!reports || reports.length === 0) && styles.emptyListContent
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
        style={[styles.fab, { backgroundColor: Colors.primaryBlue }]}
        onPress={() => navigation.navigate('DailyReportForm', { isOwner: true })}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: FontSizes.title,
    fontWeight: '700',
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
  headerBadges: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  reportDate: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  ownerBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  ownerBadgeText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
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
  reporterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  reporterName: {
    fontSize: FontSizes.small,
  },
  separator: {
    fontSize: FontSizes.small,
  },
  phaseName: {
    fontSize: FontSizes.small,
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
    bottom: 20,
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
