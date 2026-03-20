import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getCurrentUserId } from '../utils/storage';
import { getWorkerExpenses } from '../utils/storage/transactions';
import { supabase } from '../lib/supabase';

export default function WorkerDailyReportScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('workers');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [workerId, setWorkerId] = useState(null);
  const [activeView, setActiveView] = useState('reports'); // 'reports' | 'expenses'

  // Track if initial load has happened
  const hasLoadedRef = useRef(false);

  // Initial load - only once
  useEffect(() => {
    if (!hasLoadedRef.current) {
      loadData();
      hasLoadedRef.current = true;
    }
  }, []);

  // Reload when navigating back after creating a report or expense
  useFocusEffect(
    useCallback(() => {
      if (route.params?.refresh) {
        loadData();
        // Clear the param so it doesn't keep refreshing
        navigation.setParams({ refresh: undefined });
      }
    }, [route.params?.refresh])
  );

  const loadData = async (isRefresh = false) => {
    try {
      // Only show full loading screen on initial load, not refreshes
      if (!isRefresh && reports.length === 0 && expenses.length === 0) {
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

      // Fetch reports and expenses in parallel
      const [reportsResult, expensesResult] = await Promise.all([
        supabase
          .from('daily_reports')
          .select(`
            *,
            projects (id, name),
            project_phases (id, name)
          `)
          .eq('worker_id', workerData.id)
          .order('report_date', { ascending: false })
          .order('created_at', { ascending: false }),
        getWorkerExpenses(workerData.id)
      ]);

      if (reportsResult.error) {
        console.error('Error fetching reports:', reportsResult.error);
      } else {
        setReports(reportsResult.data || []);
      }

      setExpenses(expensesResult || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
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

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
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

  const getCategoryLabel = (category) => {
    const keys = {
      materials: 'categories.materials',
      equipment: 'categories.equipment',
      permits: 'categories.permits',
      subcontractor: 'categories.subcontractor',
      misc: 'categories.miscellaneous',
    };
    return t(keys[category] || 'categories.other');
  };

  const getCategoryIcon = (category) => {
    const icons = {
      materials: 'cube',
      equipment: 'construct',
      permits: 'document',
      subcontractor: 'people',
      misc: 'ellipsis-horizontal',
    };
    return icons[category] || 'cash';
  };

  const renderReportItem = ({ item: report }) => {
    const photoCount = getPhotoCount(report);
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
          <View style={{ flexDirection: 'row', gap: 6 }}>
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

        {workDone ? (
          <Text style={[styles.notesPreview, { color: Colors.secondaryText }]} numberOfLines={2}>
            {workDone}
          </Text>
        ) : report.project_phases?.name ? (
          <Text style={[styles.phaseName, { color: Colors.secondaryText }]}>
            {report.project_phases.name}
          </Text>
        ) : null}

        {/* Detail badges */}
        {(manpowerCount > 0 || delayCount > 0 || materialCount > 0) && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            {manpowerCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="people-outline" size={12} color={Colors.secondaryText} />
                <Text style={{ fontSize: 11, color: Colors.secondaryText }}>{manpowerCount}</Text>
              </View>
            )}
            {materialCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="cube-outline" size={12} color={Colors.secondaryText} />
                <Text style={{ fontSize: 11, color: Colors.secondaryText }}>{materialCount}</Text>
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

  const renderExpenseItem = ({ item: expense }) => {
    const expenseColor = Colors.error || '#DC2626';
    return (
      <TouchableOpacity
        style={[styles.reportCard, { backgroundColor: Colors.white }]}
        onPress={() => navigation.navigate('ExpenseDetail', { expense })}
        activeOpacity={0.7}
      >
        <View style={styles.reportHeader}>
          <Text style={[styles.reportDate, { color: Colors.primaryText }]}>
            {formatDate(expense.date)}
          </Text>
          <View style={[styles.amountBadge, { backgroundColor: expenseColor + '20' }]}>
            <Text style={[styles.amountText, { color: expenseColor }]}>
              {formatCurrency(expense.amount)}
            </Text>
          </View>
        </View>

        <Text style={[styles.projectName, { color: Colors.primaryText }]}>
          {expense.description || t('reports.expense')}
        </Text>

        <View style={styles.expenseDetails}>
          <View style={styles.categoryBadge}>
            <Ionicons
              name={getCategoryIcon(expense.category)}
              size={14}
              color={Colors.secondaryText}
            />
            <Text style={[styles.categoryText, { color: Colors.secondaryText }]}>
              {getCategoryLabel(expense.category)}
            </Text>
          </View>
          <Text style={[styles.projectNameSmall, { color: Colors.secondaryText }]}>
            {expense.projects?.name || t('reports.unknownProject')}
          </Text>
        </View>

        {expense.receipt_url && (
          <View style={[styles.receiptBadge, { backgroundColor: Colors.primaryBlue + '20' }]}>
            <Ionicons name="receipt" size={14} color={Colors.primaryBlue} />
            <Text style={[styles.receiptText, { color: Colors.primaryBlue }]}>
              {t('reports.receiptAttached')}
            </Text>
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
      <Ionicons
        name={activeView === 'reports' ? 'document-text-outline' : 'receipt-outline'}
        size={64}
        color={Colors.border}
      />
      <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>
        {activeView === 'reports' ? t('reports.noReportsYet') : t('reports.noExpensesYet')}
      </Text>
      <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
        {activeView === 'reports'
          ? t('reports.createFirstReport')
          : t('reports.createFirstExpense')}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
        <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
          {t('common:status.loading')}
        </Text>
      </View>
    );
  }

  const currentData = activeView === 'reports' ? reports : expenses;
  const activeToggleColor = Colors.primaryText;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.white }]}>
        <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>{t('tabs.reports')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={22} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      {/* Toggle */}
      <View style={[styles.toggleContainer, { backgroundColor: Colors.white }]}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            { borderColor: Colors.border },
            activeView === 'reports' && { backgroundColor: activeToggleColor, borderColor: activeToggleColor }
          ]}
          onPress={() => setActiveView('reports')}
        >
          <Ionicons
            name="document-text"
            size={18}
            color={activeView === 'reports' ? Colors.white : Colors.secondaryText}
          />
          <Text style={[
            styles.toggleText,
            { color: activeView === 'reports' ? Colors.white : Colors.secondaryText }
          ]}>
            {t('reports.dailyReports')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            { borderColor: Colors.border },
            activeView === 'expenses' && { backgroundColor: activeToggleColor, borderColor: activeToggleColor }
          ]}
          onPress={() => setActiveView('expenses')}
        >
          <Ionicons
            name="receipt"
            size={18}
            color={activeView === 'expenses' ? Colors.white : Colors.secondaryText}
          />
          <Text style={[
            styles.toggleText,
            { color: activeView === 'expenses' ? Colors.white : Colors.secondaryText }
          ]}>
            {t('reports.expenses')}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={currentData}
        renderItem={activeView === 'reports' ? renderReportItem : renderExpenseItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          currentData.length === 0 && styles.emptyListContent
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
        style={[styles.fab, { backgroundColor: Colors.primaryText }]}
        onPress={() => {
          if (activeView === 'reports') {
            navigation.navigate('DailyReportForm');
          } else {
            navigation.navigate('ExpenseForm');
          }
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  topBarTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  toggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
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
  amountBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  amountText: {
    fontSize: FontSizes.body,
    fontWeight: '700',
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
  expenseDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryText: {
    fontSize: FontSizes.small,
  },
  projectNameSmall: {
    fontSize: FontSizes.small,
  },
  receiptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
  },
  receiptText: {
    fontSize: FontSizes.small,
    fontWeight: '500',
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
