/**
 * BankReconciliationScreen
 * Main reconciliation dashboard showing bank transactions with match status.
 * Filter by status, assign unmatched transactions to projects.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getBankTransactions,
  getReconciliationSummary,
  ignoreBankTransaction,
  editBankTransaction,
} from '../../services/bankService';
import { getSubcategoryLabel } from '../../constants/transactionCategories';

const OWNER_COLORS = {
  primary: '#1E40AF',
  primaryLight: '#1E40AF20',
  danger: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  purple: '#8B5CF6',
};

const FILTER_TABS = [
  { key: 'all', labelKey: 'reconciliation.filterAll' },
  { key: 'unmatched', labelKey: 'reconciliation.filterUnmatched' },
  { key: 'suggested_match', labelKey: 'reconciliation.filterReview' },
  { key: 'matched', labelKey: 'reconciliation.filterMatched' },
  { key: 'ignored', labelKey: 'reconciliation.filterIgnored' },
];

export default function BankReconciliationScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('owner');

  const initialFilter = route.params?.filter || 'all';
  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [txResult, summaryResult] = await Promise.all([
        getBankTransactions(
          activeFilter === 'all' ? {} :
          activeFilter === 'matched' ? { match_status: 'auto_matched' } :
          { match_status: activeFilter }
        ),
        getReconciliationSummary(),
      ]);

      // For "matched" tab, combine all matched statuses
      if (activeFilter === 'matched') {
        const allMatched = await Promise.all([
          getBankTransactions({ match_status: 'auto_matched' }),
          getBankTransactions({ match_status: 'manually_matched' }),
          getBankTransactions({ match_status: 'created' }),
        ]);
        const combined = [
          ...(allMatched[0].transactions || []),
          ...(allMatched[1].transactions || []),
          ...(allMatched[2].transactions || []),
        ].sort((a, b) => new Date(b.date) - new Date(a.date));
        setTransactions(combined);
      } else {
        setTransactions(txResult.transactions || []);
      }

      setSummary(summaryResult);
    } catch (error) {
      console.error('Error loading reconciliation data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [activeFilter])
  );

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    setLoading(true);
  };

  const handleIgnore = async (txId) => {
    try {
      await ignoreBankTransaction(txId);
      setTransactions(prev => prev.filter(t => t.id !== txId));
      loadData();
    } catch (error) {
      console.error('Error ignoring transaction:', error);
    }
  };

  const handleAssign = (transaction) => {
    navigation.navigate('BankTransactionAssign', { transaction });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'auto_matched': return { color: OWNER_COLORS.success, label: t('reconciliation.statusAutoMatched'), icon: 'checkmark-circle' };
      case 'suggested_match': return { color: OWNER_COLORS.warning, label: t('reconciliation.statusReview'), icon: 'help-circle' };
      case 'manually_matched': return { color: OWNER_COLORS.primary, label: t('reconciliation.statusMatched'), icon: 'checkmark-circle' };
      case 'created': return { color: OWNER_COLORS.purple, label: t('reconciliation.statusAssigned'), icon: 'arrow-forward-circle' };
      case 'ignored': return { color: Colors.secondaryText, label: t('reconciliation.statusIgnored'), icon: 'eye-off' };
      case 'unmatched': return { color: OWNER_COLORS.danger, label: t('reconciliation.statusUnmatched'), icon: 'alert-circle' };
      default: return { color: Colors.secondaryText, label: status, icon: 'help-circle' };
    }
  };

  const formatAmount = (amount) => {
    const abs = Math.abs(amount);
    return `$${abs.toFixed(2)}`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const renderSummaryCard = () => {
    if (!summary || summary.message) return null;

    return (
      <View style={[styles.summaryCard, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNumber, { color: OWNER_COLORS.success }]}>
              {summary.matched_total || 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('reconciliation.matched')}</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: Colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNumber, { color: OWNER_COLORS.danger }]}>
              {summary.unmatched || 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('reconciliation.unmatched')}</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: Colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNumber, { color: OWNER_COLORS.warning }]}>
              {summary.suggested_matches || 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('reconciliation.review')}</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: Colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNumber, { color: Colors.primaryText }]}>
              {summary.total_transactions || 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('reconciliation.total')}</Text>
          </View>
        </View>

        {summary.unmatched > 0 && (
          <View style={[styles.unmatchedBanner, { backgroundColor: OWNER_COLORS.danger + '10' }]}>
            <Ionicons name="alert-circle" size={16} color={OWNER_COLORS.danger} />
            <Text style={[styles.unmatchedText, { color: OWNER_COLORS.danger }]}>
              ${summary.unmatched_total_amount?.toFixed(2) || '0.00'} {t('reconciliation.inUnrecordedExpenses')}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const getTypeColor = (txType) => {
    switch (txType) {
      case 'expense': return OWNER_COLORS.danger;
      case 'income': return OWNER_COLORS.success;
      case 'transfer': return '#6B7280';
      default: return OWNER_COLORS.warning; // unknown
    }
  };

  const getTypeLabel = (txType) => {
    switch (txType) {
      case 'expense': return 'Expense';
      case 'income': return 'Income';
      case 'transfer': return 'Transfer';
      default: return 'Unknown';
    }
  };

  const handleQuickClassify = async (txId, type) => {
    try {
      await editBankTransaction(txId, { transaction_type: type });
      loadData();
    } catch (err) {
      console.error('Quick classify error:', err);
    }
  };

  const renderTransaction = ({ item }) => {
    const badge = getStatusBadge(item.match_status);
    const txType = item.transaction_type;
    const isUnknown = !txType;
    const displayType = txType || 'unknown';
    const typeColor = getTypeColor(displayType);
    const isOverhead = item.assigned_category === 'overhead';
    const linkedProject = isOverhead ? null : (item.matched_transaction?.project?.name || item.assigned_project?.name);
    const isLowConfidence = item.classification_confidence === 'low';
    const subcategoryLabel = item.subcategory ? getSubcategoryLabel(item.subcategory) : null;

    return (
      <View style={[styles.txCard, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
        <View style={styles.txMain}>
          <View style={styles.txLeft}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={[styles.txDate, { color: Colors.secondaryText }]}>{formatDate(item.date)}</Text>
              {isUnknown && (
                <View style={{ backgroundColor: '#F59E0B20', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                  <Text style={{ color: '#F59E0B', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>UNKNOWN</Text>
                </View>
              )}
              {txType === 'transfer' && (
                <View style={{ backgroundColor: '#6B728015', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                  <Text style={{ color: '#6B7280', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>TRANSFER</Text>
                </View>
              )}
              {!isUnknown && isLowConfidence && txType !== 'expense' && (
                <View style={{ backgroundColor: '#F59E0B15', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                  <Text style={{ color: '#F59E0B', fontSize: 9, fontWeight: '600' }}>Verify</Text>
                </View>
              )}
              {item.worker_id && (
                <View style={{ backgroundColor: '#3B82F620', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                  <Text style={{ color: '#3B82F6', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>WORKER</Text>
                </View>
              )}
            </View>
            <Text style={[styles.txDescription, { color: Colors.primaryText }]} numberOfLines={1}>
              {item.merchant_name || item.description}
            </Text>
            {item.description !== item.merchant_name && item.merchant_name && (
              <Text style={[styles.txSubDesc, { color: Colors.secondaryText }]} numberOfLines={1}>
                {item.description}
              </Text>
            )}
            {subcategoryLabel && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Text style={{ color: Colors.secondaryText, fontSize: 11, fontStyle: 'italic' }}>{subcategoryLabel}</Text>
              </View>
            )}
            {linkedProject && (
              <View style={styles.linkedProject}>
                <Ionicons name="business-outline" size={12} color={OWNER_COLORS.primary} />
                <Text style={[styles.linkedProjectText, { color: OWNER_COLORS.primary }]}>{linkedProject}</Text>
              </View>
            )}
            {isOverhead && (
              <View style={styles.linkedProject}>
                <Ionicons name="business-outline" size={12} color="#F59E0B" />
                <Text style={[styles.linkedProjectText, { color: '#F59E0B' }]}>Overhead</Text>
              </View>
            )}
          </View>
          <View style={styles.txRight}>
            <Text style={[styles.txAmount, { color: typeColor }]}>
              {displayType === 'expense' ? '-' : displayType === 'income' ? '+' : ''}{formatAmount(item.amount)}
            </Text>
            <View style={[styles.txBadge, { backgroundColor: badge.color + '15' }]}>
              <Ionicons name={badge.icon} size={12} color={badge.color} />
              <Text style={[styles.txBadgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          </View>
        </View>

        {/* Quick classify buttons for unknown transactions */}
        {isUnknown && (
          <View style={[styles.txActions, { borderTopColor: Colors.border }]}>
            {[
              { type: 'expense', label: 'Expense', color: OWNER_COLORS.danger, icon: 'arrow-down-circle-outline' },
              { type: 'income', label: 'Income', color: OWNER_COLORS.success, icon: 'arrow-up-circle-outline' },
              { type: 'transfer', label: 'Transfer', color: '#6B7280', icon: 'swap-horizontal-outline' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.type}
                style={[styles.txActionBtn, { backgroundColor: opt.color + '10' }]}
                onPress={() => handleQuickClassify(item.id, opt.type)}
              >
                <Ionicons name={opt.icon} size={14} color={opt.color} />
                <Text style={[styles.txActionText, { color: opt.color }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.txActionBtn, { backgroundColor: Colors.border + '50' }]}
              onPress={() => handleIgnore(item.id)}
            >
              <Ionicons name="bookmark-outline" size={14} color={Colors.secondaryText} />
              <Text style={[styles.txActionText, { color: Colors.secondaryText }]}>Register</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action buttons for unmatched/suggested (only when type is known) */}
        {!isUnknown && (item.match_status === 'unmatched' || item.match_status === 'suggested_match') && (
          <View style={[styles.txActions, { borderTopColor: Colors.border }]}>
            <TouchableOpacity
              style={[styles.txActionBtn, { backgroundColor: OWNER_COLORS.primary + '10' }]}
              onPress={() => handleAssign(item)}
            >
              <Ionicons name="arrow-forward-circle-outline" size={16} color={OWNER_COLORS.primary} />
              <Text style={[styles.txActionText, { color: OWNER_COLORS.primary }]}>Project</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.txActionBtn, { backgroundColor: '#F59E0B10' }]}
              onPress={() => navigation.navigate('BankTransactionAssign', { transaction: item, isOverhead: true })}
            >
              <Ionicons name="business-outline" size={16} color="#F59E0B" />
              <Text style={[styles.txActionText, { color: '#F59E0B' }]}>Overhead</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.txActionBtn, { backgroundColor: Colors.border + '50' }]}
              onPress={() => handleIgnore(item.id)}
            >
              <Ionicons name="eye-off-outline" size={16} color={Colors.secondaryText} />
              <Text style={[styles.txActionText, { color: Colors.secondaryText }]}>Ignore</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('reconciliation.title')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('BankConnection')} style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={22} color={Colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Summary */}
      {renderSummaryCard()}

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          data={FILTER_TABS}
          keyExtractor={(item) => item.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterTab,
                activeFilter === item.key && { backgroundColor: OWNER_COLORS.primary },
                activeFilter !== item.key && { backgroundColor: Colors.cardBackground, borderColor: Colors.border, borderWidth: 1 },
              ]}
              onPress={() => handleFilterChange(item.key)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  { color: activeFilter === item.key ? '#FFF' : Colors.secondaryText },
                ]}
              >
                {t(item.labelKey)}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Transaction List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={OWNER_COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransaction}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />
          }
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <Ionicons name="checkmark-circle" size={48} color={OWNER_COLORS.success} />
              <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>
                {activeFilter === 'unmatched' ? t('reconciliation.allCaughtUp') : t('reconciliation.noTransactions')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: Colors.secondaryText }]}>
                {activeFilter === 'unmatched'
                  ? t('reconciliation.allMatchedDesc')
                  : t('reconciliation.noFilterMatchDesc')}
              </Text>
            </View>
          }
        />
      )}
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  settingsButton: {
    padding: Spacing.xs,
  },
  summaryCard: {
    margin: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.lg,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
  },
  unmatchedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  unmatchedText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  filterContainer: {
    paddingBottom: Spacing.sm,
  },
  filterList: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
  },
  filterTabText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 40,
  },
  txCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  txMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.lg,
  },
  txLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  txDate: {
    fontSize: FontSizes.tiny,
    marginBottom: 2,
  },
  txDescription: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  txSubDesc: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
  linkedProject: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: 4,
  },
  linkedProjectText: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  txBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 4,
    marginTop: Spacing.xs,
  },
  txBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  txActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  txActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  txActionText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  emptyList: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: FontSizes.small,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
});
