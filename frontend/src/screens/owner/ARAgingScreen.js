import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchAgingReport } from '../../utils/storage/invoices';
import { exportInvoicesCSV } from '../../utils/csvExport';

const BUCKET_COLORS = {
  current: '#10B981',
  days30: '#F59E0B',
  days60: '#F97316',
  days90: '#EF4444',
  over90: '#991B1B',
};

const formatCurrency = (amount) => {
  if (amount == null || amount === 0) return '$0';
  return `$${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function ARAgingScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation('owner');

  // Optional project scope — passed from FinancialReportScreen when in
  // By-Project view. Null/undefined = company-wide (all projects).
  const projectId = route?.params?.projectId || null;
  const projectName = route?.params?.projectName || null;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedClient, setExpandedClient] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const result = await fetchAgingReport(projectId);
      setData(result);
    } catch (error) {
      console.error('Error loading aging data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleExportCSV = useCallback(async () => {
    if (!data) return;
    const allInvoices = data.clients.flatMap((c) => c.invoices);
    await exportInvoicesCSV(allInvoices, 'ar-aging-report.csv');
  }, [data]);

  const bucketLabels = {
    current: t('aging.current'),
    days30: '1-30',
    days60: '31-60',
    days90: '61-90',
    over90: '90+',
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      </SafeAreaView>
    );
  }

  const { clients = [], totals = {} } = data || {};

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('aging.title')}</Text>
          <Text style={{ fontSize: 11, color: Colors.secondaryText, marginTop: 1 }} numberOfLines={1}>
            {projectId ? (projectName || 'This Project') : 'All Projects'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleExportCSV} style={styles.headerBtn} activeOpacity={0.7}>
          <Ionicons name="download-outline" size={22} color="#1E40AF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1E40AF" />}
      >
        {/* Total Outstanding */}
        <View style={[styles.totalCard, { backgroundColor: Colors.cardBackground }]}>
          <Text style={[styles.totalLabel, { color: Colors.secondaryText }]}>{t('aging.totalOutstanding')}</Text>
          <Text style={[styles.totalAmount, { color: Colors.primaryText }]}>{formatCurrency(totals.total)}</Text>
          <View style={styles.bucketRow}>
            {['current', 'days30', 'days60', 'days90', 'over90'].map((bucket) => (
              <View key={bucket} style={styles.bucketItem}>
                <View style={[styles.bucketDot, { backgroundColor: BUCKET_COLORS[bucket] }]} />
                <Text style={[styles.bucketLabel, { color: Colors.secondaryText }]}>{bucketLabels[bucket]}</Text>
                <Text style={[styles.bucketAmount, { color: BUCKET_COLORS[bucket] }]}>{formatCurrency(totals[bucket])}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Aging Bar */}
        {totals.total > 0 && (
          <View style={[styles.agingBar, { backgroundColor: Colors.lightGray }]}>
            {['current', 'days30', 'days60', 'days90', 'over90'].map((bucket) => {
              const pct = totals[bucket] / totals.total;
              if (pct <= 0) return null;
              return (
                <View key={bucket} style={{ flex: pct, height: '100%', backgroundColor: BUCKET_COLORS[bucket] }} />
              );
            })}
          </View>
        )}

        {/* Client List */}
        {clients.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: Colors.cardBackground }]}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>{t('aging.allCurrent')}</Text>
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>{t('aging.noOutstanding')}</Text>
          </View>
        ) : (
          clients.map((client) => (
            <TouchableOpacity
              key={client.name}
              style={[styles.clientCard, { backgroundColor: Colors.cardBackground }]}
              onPress={() => setExpandedClient(expandedClient === client.name ? null : client.name)}
              activeOpacity={0.7}
            >
              <View style={styles.clientHeader}>
                <View style={styles.clientInfo}>
                  <Text style={[styles.clientName, { color: Colors.primaryText }]} numberOfLines={1}>{client.name}</Text>
                  <Text style={[styles.clientTotal, { color: Colors.secondaryText }]}>
                    {client.invoices.length} {client.invoices.length === 1 ? t('aging.invoice') : t('aging.invoices')}
                  </Text>
                </View>
                <View style={styles.clientRight}>
                  <Text style={[styles.clientAmount, { color: client.over90 > 0 ? BUCKET_COLORS.over90 : client.days90 > 0 ? BUCKET_COLORS.days90 : Colors.primaryText }]}>
                    {formatCurrency(client.total)}
                  </Text>
                  <Ionicons name={expandedClient === client.name ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.secondaryText} />
                </View>
              </View>

              {/* Bucket summary row */}
              <View style={styles.clientBuckets}>
                {['current', 'days30', 'days60', 'days90', 'over90'].map((bucket) => (
                  <View key={bucket} style={styles.clientBucket}>
                    <Text style={[styles.clientBucketLabel, { color: Colors.secondaryText }]}>{bucketLabels[bucket]}</Text>
                    <Text style={[styles.clientBucketAmount, { color: client[bucket] > 0 ? BUCKET_COLORS[bucket] : Colors.border }]}>
                      {client[bucket] > 0 ? formatCurrency(client[bucket]) : '-'}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Expanded invoice list */}
              {expandedClient === client.name && (
                <View style={[styles.invoiceList, { borderTopColor: Colors.border }]}>
                  {client.invoices.map((inv) => (
                    <View key={inv.id} style={styles.invoiceRow}>
                      <View style={styles.invoiceInfo}>
                        <Text style={[styles.invoiceNum, { color: Colors.primaryText }]}>#{inv.invoice_number}</Text>
                        <Text style={[styles.invoiceProject, { color: Colors.secondaryText }]}>{inv.project_name || ''}</Text>
                      </View>
                      <View style={styles.invoiceRight}>
                        <Text style={[styles.invoiceAmount, { color: BUCKET_COLORS[inv.bucket] }]}>{formatCurrency(inv.balance)}</Text>
                        {inv.daysOverdue > 0 && (
                          <Text style={[styles.invoiceDays, { color: BUCKET_COLORS[inv.bucket] }]}>
                            {inv.daysOverdue}d
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.subheader, fontWeight: '700', letterSpacing: -0.3 },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.lg },
  totalCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  totalLabel: { fontSize: FontSizes.small, marginBottom: 4 },
  totalAmount: { fontSize: 28, fontWeight: '700', marginBottom: Spacing.md },
  bucketRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bucketItem: { alignItems: 'center', gap: 4 },
  bucketDot: { width: 8, height: 8, borderRadius: 4 },
  bucketLabel: { fontSize: 10, fontWeight: '600' },
  bucketAmount: { fontSize: FontSizes.small, fontWeight: '600' },
  agingBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  clientCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  clientHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  clientInfo: { flex: 1, marginRight: Spacing.sm },
  clientName: { fontSize: FontSizes.body, fontWeight: '600' },
  clientTotal: { fontSize: FontSizes.tiny, marginTop: 2 },
  clientRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  clientAmount: { fontSize: FontSizes.body, fontWeight: '700' },
  clientBuckets: { flexDirection: 'row', justifyContent: 'space-between' },
  clientBucket: { alignItems: 'center', flex: 1 },
  clientBucketLabel: { fontSize: 9, fontWeight: '600', marginBottom: 2 },
  clientBucketAmount: { fontSize: FontSizes.tiny, fontWeight: '600' },
  invoiceList: { borderTopWidth: 1, marginTop: Spacing.md, paddingTop: Spacing.sm },
  invoiceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.xs },
  invoiceInfo: { flex: 1 },
  invoiceNum: { fontSize: FontSizes.small, fontWeight: '500' },
  invoiceProject: { fontSize: FontSizes.tiny },
  invoiceRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  invoiceAmount: { fontSize: FontSizes.small, fontWeight: '600' },
  invoiceDays: { fontSize: FontSizes.tiny, fontWeight: '600' },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  emptyTitle: { fontSize: FontSizes.body, fontWeight: '600' },
  emptyText: { fontSize: FontSizes.small, textAlign: 'center' },
});
