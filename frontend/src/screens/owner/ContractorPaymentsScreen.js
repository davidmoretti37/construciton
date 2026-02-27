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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchProjectsForOwner } from '../../utils/storage/projects';
import { fetchAllOwnerTransactions } from '../../utils/financialReportUtils';
import { export1099CSV } from '../../utils/csvExport';

const formatCurrency = (amount) => {
  return `$${parseFloat(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function ContractorPaymentsScreen({ route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();
  const { t } = useTranslation('owner');

  const currentYear = new Date().getFullYear();
  const [selectedYear] = useState(route?.params?.year || currentYear);
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedContractor, setExpandedContractor] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const projects = await fetchProjectsForOwner();
      const projectIds = (projects || []).map(p => p.id);
      const projectMap = {};
      (projects || []).forEach(p => { projectMap[p.id] = p.name; });

      const transactions = await fetchAllOwnerTransactions(projectIds);
      const yearStart = `${selectedYear}-01-01`;
      const yearEnd = `${selectedYear}-12-31`;

      const contractorMap = {};
      transactions.forEach(tx => {
        if (tx.type !== 'expense') return;
        if (tx.date < yearStart || tx.date > yearEnd) return;
        if (tx.category !== 'subcontractor' && !(tx.category === 'labor' && !tx.worker_id)) return;

        const amount = parseFloat(tx.amount || 0);
        const name = tx.description || 'Unknown Contractor';

        if (!contractorMap[name]) {
          contractorMap[name] = { name, totalPaid: 0, payments: [] };
        }
        contractorMap[name].totalPaid += amount;
        contractorMap[name].payments.push({
          date: tx.date,
          amount,
          project: projectMap[tx.project_id] || 'Unknown Project',
          category: tx.category,
        });
      });

      const list = Object.values(contractorMap)
        .sort((a, b) => b.totalPaid - a.totalPaid);

      setContractors(list);
    } catch (error) {
      console.error('Error loading contractor data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedYear]);

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
    await export1099CSV(contractors, selectedYear, `1099-contractors-${selectedYear}.csv`);
  }, [contractors, selectedYear]);

  const threshold = 600;
  const above = contractors.filter(c => c.totalPaid >= threshold);
  const below = contractors.filter(c => c.totalPaid < threshold);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('tax.contractor1099')}</Text>
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
        {/* Year + threshold info */}
        <View style={[styles.infoCard, { backgroundColor: '#FEF3C7' }]}>
          <Ionicons name="information-circle" size={18} color="#92400E" />
          <Text style={styles.infoText}>
            {t('tax.1099Info', { year: selectedYear, threshold: '$600' })}
          </Text>
        </View>

        {/* Requires 1099 */}
        {above.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: '#EF4444' }]}>
              {t('tax.requires1099Section', { count: above.length })}
            </Text>
            {above.map((c) => (
              <TouchableOpacity
                key={c.name}
                style={[styles.contractorCard, { backgroundColor: Colors.cardBackground, borderLeftColor: '#EF4444' }]}
                onPress={() => setExpandedContractor(expandedContractor === c.name ? null : c.name)}
                activeOpacity={0.7}
              >
                <View style={styles.contractorHeader}>
                  <View style={styles.contractorInfo}>
                    <Text style={[styles.contractorName, { color: Colors.primaryText }]} numberOfLines={1}>{c.name}</Text>
                    <View style={styles.badge1099}>
                      <Text style={styles.badge1099Text}>1099 REQUIRED</Text>
                    </View>
                  </View>
                  <Text style={[styles.contractorTotal, { color: '#EF4444' }]}>{formatCurrency(c.totalPaid)}</Text>
                </View>
                <Text style={[styles.paymentCount, { color: Colors.secondaryText }]}>
                  {c.payments.length} {c.payments.length === 1 ? t('tax.payment') : t('tax.payments')}
                </Text>

                {expandedContractor === c.name && (
                  <View style={[styles.paymentList, { borderTopColor: Colors.border }]}>
                    {c.payments.sort((a, b) => b.date.localeCompare(a.date)).map((p, i) => (
                      <View key={i} style={styles.paymentRow}>
                        <View>
                          <Text style={[styles.paymentDate, { color: Colors.secondaryText }]}>{p.date}</Text>
                          <Text style={[styles.paymentProject, { color: Colors.secondaryText }]}>{p.project}</Text>
                        </View>
                        <Text style={[styles.paymentAmount, { color: Colors.primaryText }]}>{formatCurrency(p.amount)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Below threshold */}
        {below.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: Colors.secondaryText }]}>
              {t('tax.belowThreshold', { count: below.length })}
            </Text>
            {below.map((c) => (
              <TouchableOpacity
                key={c.name}
                style={[styles.contractorCard, { backgroundColor: Colors.cardBackground, borderLeftColor: '#10B981' }]}
                onPress={() => setExpandedContractor(expandedContractor === c.name ? null : c.name)}
                activeOpacity={0.7}
              >
                <View style={styles.contractorHeader}>
                  <Text style={[styles.contractorName, { color: Colors.primaryText }]} numberOfLines={1}>{c.name}</Text>
                  <Text style={[styles.contractorTotal, { color: Colors.primaryText }]}>{formatCurrency(c.totalPaid)}</Text>
                </View>
                <Text style={[styles.paymentCount, { color: Colors.secondaryText }]}>
                  {c.payments.length} {c.payments.length === 1 ? t('tax.payment') : t('tax.payments')}
                  {' · '}{formatCurrency(threshold - c.totalPaid)} {t('tax.untilThreshold')}
                </Text>

                {expandedContractor === c.name && (
                  <View style={[styles.paymentList, { borderTopColor: Colors.border }]}>
                    {c.payments.sort((a, b) => b.date.localeCompare(a.date)).map((p, i) => (
                      <View key={i} style={styles.paymentRow}>
                        <View>
                          <Text style={[styles.paymentDate, { color: Colors.secondaryText }]}>{p.date}</Text>
                          <Text style={[styles.paymentProject, { color: Colors.secondaryText }]}>{p.project}</Text>
                        </View>
                        <Text style={[styles.paymentAmount, { color: Colors.primaryText }]}>{formatCurrency(p.amount)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}

        {contractors.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: Colors.cardBackground }]}>
            <Ionicons name="people-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>{t('tax.noContractors')}</Text>
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>{t('tax.noContractorsDesc')}</Text>
          </View>
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
  scrollContent: { padding: Spacing.lg, gap: Spacing.md },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  infoText: { fontSize: FontSizes.small, color: '#92400E', flex: 1, lineHeight: 20 },
  sectionLabel: { fontSize: FontSizes.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.sm },
  contractorCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  contractorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contractorInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginRight: Spacing.sm },
  contractorName: { fontSize: FontSizes.body, fontWeight: '600', flexShrink: 1 },
  contractorTotal: { fontSize: FontSizes.body, fontWeight: '700' },
  paymentCount: { fontSize: FontSizes.tiny, marginTop: 4 },
  badge1099: { backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badge1099Text: { fontSize: 9, fontWeight: '700', color: '#EF4444', letterSpacing: 0.3 },
  paymentList: { borderTopWidth: 1, marginTop: Spacing.md, paddingTop: Spacing.sm },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.xs },
  paymentDate: { fontSize: FontSizes.tiny },
  paymentProject: { fontSize: FontSizes.tiny },
  paymentAmount: { fontSize: FontSizes.small, fontWeight: '500' },
  emptyCard: { alignItems: 'center', padding: Spacing.xxl, borderRadius: BorderRadius.lg, gap: Spacing.sm },
  emptyTitle: { fontSize: FontSizes.body, fontWeight: '600' },
  emptyText: { fontSize: FontSizes.small, textAlign: 'center' },
});
