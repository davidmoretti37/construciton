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
import { TAX_CATEGORY_LABELS, DEFAULT_TAX_CATEGORY } from '../../constants/transactionCategories';
import { fetchProjectsForOwner } from '../../utils/storage/projects';
import { fetchAllOwnerTransactions } from '../../utils/financialReportUtils';
import { exportTransactionsCSV, export1099CSV } from '../../utils/csvExport';

const formatCurrency = (amount) => {
  return `$${parseFloat(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function TaxSummaryScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation('owner');

  // Optional project scope from FinancialReportScreen's By-Project view.
  const projectId = route?.params?.projectId || null;
  const projectName = route?.params?.projectName || null;

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const years = [currentYear, currentYear - 1, currentYear - 2];

  const loadData = useCallback(async () => {
    try {
      const projects = await fetchProjectsForOwner();
      // Restrict to selected project when in By-Project mode
      const projectIds = projectId
        ? [projectId]
        : (projects || []).map(p => p.id);
      const transactions = await fetchAllOwnerTransactions(projectIds);

      const yearStart = `${selectedYear}-01-01`;
      const yearEnd = `${selectedYear}-12-31`;
      const yearTxs = transactions.filter(tx => tx.date >= yearStart && tx.date <= yearEnd);

      let totalRevenue = 0;
      let totalExpenses = 0;
      const taxBreakdown = {};
      const contractorPayments = {};

      yearTxs.forEach(tx => {
        const amount = parseFloat(tx.amount || 0);
        if (tx.type === 'income') {
          totalRevenue += amount;
        } else if (tx.type === 'expense') {
          totalExpenses += amount;
          const taxCat = tx.tax_category || DEFAULT_TAX_CATEGORY[tx.category] || 'other_deduction';
          taxBreakdown[taxCat] = (taxBreakdown[taxCat] || 0) + amount;

          if (tx.category === 'subcontractor' || (tx.category === 'labor' && !tx.worker_id)) {
            const name = tx.description || 'Unknown Contractor';
            if (!contractorPayments[name]) contractorPayments[name] = 0;
            contractorPayments[name] += amount;
          }
        }
      });

      const contractors = Object.entries(contractorPayments)
        .map(([name, totalPaid]) => ({ name, totalPaid, requires1099: totalPaid >= 600 }))
        .sort((a, b) => b.totalPaid - a.totalPaid);

      setData({
        totalRevenue,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        taxBreakdown,
        contractors,
        contractorsAboveThreshold: contractors.filter(c => c.requires1099).length,
        totalContractorPayments: contractors.reduce((s, c) => s + c.totalPaid, 0),
        transactions: yearTxs,
        projects,
      });
    } catch (error) {
      console.error('Error loading tax data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedYear, projectId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleExportCSV = useCallback(async () => {
    if (!data) return;
    await exportTransactionsCSV(data.transactions, data.projects, `tax-summary-${selectedYear}.csv`);
  }, [data, selectedYear]);

  const handleExport1099 = useCallback(async () => {
    if (!data?.contractors?.length) return;
    await export1099CSV(
      data.contractors.filter(c => c.requires1099),
      `1099-contractors-${selectedYear}.csv`
    );
  }, [data, selectedYear]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      </SafeAreaView>
    );
  }

  const { totalRevenue = 0, totalExpenses = 0, netProfit = 0, taxBreakdown = {}, contractors = [], contractorsAboveThreshold = 0 } = data || {};
  const sortedTaxCats = Object.entries(taxBreakdown).sort(([, a], [, b]) => b - a);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('tax.title')}</Text>
          <Text style={{ fontSize: 11, color: Colors.secondaryText, marginTop: 1 }} numberOfLines={1}>
            {projectId ? (projectName || 'This Project') : 'All Projects'}
          </Text>
        </View>
        {contractorsAboveThreshold > 0 && (
          <TouchableOpacity onPress={handleExport1099} style={styles.headerBtn} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
        )}
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
        {/* Year Selector */}
        <View style={styles.yearRow}>
          {years.map(y => (
            <TouchableOpacity
              key={y}
              style={[styles.yearPill, selectedYear === y && { backgroundColor: '#1E40AF' }]}
              onPress={() => setSelectedYear(y)}
              activeOpacity={0.7}
            >
              <Text style={[styles.yearText, { color: selectedYear === y ? '#FFF' : Colors.secondaryText }]}>{y}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary Card */}
        <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
          <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>{t('tax.annualSummary')}</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('tax.grossRevenue')}</Text>
            <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(totalRevenue)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('tax.totalDeductions')}</Text>
            <Text style={[styles.summaryValue, { color: '#EF4444' }]}>-{formatCurrency(totalExpenses)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.netRow, { borderTopColor: Colors.border }]}>
            <Text style={[styles.summaryLabel, { color: Colors.primaryText, fontWeight: '700' }]}>{t('tax.netProfit')}</Text>
            <Text style={[styles.summaryValue, { color: netProfit >= 0 ? '#10B981' : '#EF4444', fontWeight: '700' }]}>
              {formatCurrency(netProfit)}
            </Text>
          </View>
        </View>

        {/* Schedule C Breakdown */}
        <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
          <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>{t('tax.deductionsByCategory')}</Text>
          <Text style={[styles.cardSubtitle, { color: Colors.secondaryText }]}>{t('tax.scheduleCMapping')}</Text>
          {sortedTaxCats.length === 0 ? (
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>{t('tax.noExpenses')}</Text>
          ) : (
            sortedTaxCats.map(([cat, amount]) => {
              const pct = totalExpenses > 0 ? ((amount / totalExpenses) * 100).toFixed(0) : 0;
              return (
                <View key={cat} style={styles.taxCatRow}>
                  <View style={styles.taxCatInfo}>
                    <Text style={[styles.taxCatLabel, { color: Colors.primaryText }]}>{TAX_CATEGORY_LABELS[cat] || cat}</Text>
                    <Text style={[styles.taxCatPct, { color: Colors.secondaryText }]}>{pct}%</Text>
                  </View>
                  <Text style={[styles.taxCatAmount, { color: Colors.primaryText }]}>{formatCurrency(amount)}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* 1099 Summary */}
        <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>{t('tax.contractor1099')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('ContractorPayments', { year: selectedYear })} activeOpacity={0.7}>
              <Text style={styles.seeAllText}>{t('tax.seeAll')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.contractorSummary}>
            <View style={styles.contractorStat}>
              <Text style={[styles.contractorStatNum, { color: '#EF4444' }]}>{contractorsAboveThreshold}</Text>
              <Text style={[styles.contractorStatLabel, { color: Colors.secondaryText }]}>{t('tax.require1099')}</Text>
            </View>
            <View style={styles.contractorStat}>
              <Text style={[styles.contractorStatNum, { color: Colors.primaryText }]}>{contractors.length}</Text>
              <Text style={[styles.contractorStatLabel, { color: Colors.secondaryText }]}>{t('tax.totalContractors')}</Text>
            </View>
          </View>
          {contractors.slice(0, 3).map((c) => (
            <View key={c.name} style={styles.contractorRow}>
              <View style={styles.contractorInfo}>
                <Text style={[styles.contractorName, { color: Colors.primaryText }]} numberOfLines={1}>{c.name}</Text>
                {c.requires1099 && (
                  <View style={styles.badge1099}>
                    <Text style={styles.badge1099Text}>1099</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.contractorAmount, { color: c.requires1099 ? '#EF4444' : Colors.primaryText }]}>
                {formatCurrency(c.totalPaid)}
              </Text>
            </View>
          ))}
        </View>

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
  yearRow: { flexDirection: 'row', gap: Spacing.sm },
  yearPill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    backgroundColor: '#E5E7EB',
  },
  yearText: { fontSize: FontSizes.small, fontWeight: '600' },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: { fontSize: FontSizes.body, fontWeight: '600', marginBottom: 4 },
  cardSubtitle: { fontSize: FontSizes.tiny, marginBottom: Spacing.md },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  summaryLabel: { fontSize: FontSizes.small },
  summaryValue: { fontSize: FontSizes.body, fontWeight: '600' },
  netRow: { borderTopWidth: 1, marginTop: Spacing.xs, paddingTop: Spacing.md },
  taxCatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  taxCatInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  taxCatLabel: { fontSize: FontSizes.small },
  taxCatPct: { fontSize: FontSizes.tiny },
  taxCatAmount: { fontSize: FontSizes.small, fontWeight: '600' },
  contractorSummary: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.md },
  contractorStat: { alignItems: 'center' },
  contractorStatNum: { fontSize: 24, fontWeight: '700' },
  contractorStatLabel: { fontSize: FontSizes.tiny },
  contractorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  contractorInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginRight: Spacing.sm },
  contractorName: { fontSize: FontSizes.small, fontWeight: '500', flexShrink: 1 },
  contractorAmount: { fontSize: FontSizes.small, fontWeight: '600' },
  badge1099: { backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badge1099Text: { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  seeAllText: { fontSize: FontSizes.small, fontWeight: '600', color: '#1E40AF' },
  emptyText: { fontSize: FontSizes.small, paddingVertical: Spacing.md, textAlign: 'center' },
});
