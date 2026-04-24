import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getProjectTransactions, deleteTransaction } from '../utils/storage';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useCachedFetch } from '../hooks/useCachedFetch';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
} from '../constants/transactionCategories';

const CATEGORY_ICONS = {
  labor: 'people',
  materials: 'construct',
  equipment: 'hammer',
  permits: 'document-text',
  subcontractor: 'business',
  misc: 'ellipsis-horizontal-circle',
};

export default function ProjectTransactionsScreen({ route, navigation }) {
  const { t } = useTranslation(['owner', 'common']);
  const { projectId, projectName, transactionType, servicePlanId, servicePlanName, filterType, subcategoryFilter } = route.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [typeFilter, setTypeFilter] = useState(transactionType || filterType || 'all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tradeFilter, setTradeFilter] = useState(subcategoryFilter || 'all');

  // Support both projects and service plans
  const entityId = projectId || servicePlanId;
  const entityName = projectName || servicePlanName || 'Transactions';
  const isServicePlan = !!servicePlanId;

  const fetchTransactions = useCallback(async () => {
    if (isServicePlan) {
      const { supabase } = require('../lib/supabase');
      const { data, error } = await supabase
        .from('project_transactions')
        .select(`
          id, project_id, service_plan_id, type, category, subcategory, phase_id, description, amount, date, worker_id,
          payment_method, notes, receipt_url, line_items, is_auto_generated, created_by, created_at,
          workers (id, full_name)
        `)
        .eq('service_plan_id', servicePlanId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    } else {
      const data = await getProjectTransactions(projectId, null);
      return data || [];
    }
  }, [projectId, servicePlanId, isServicePlan]);

  const { data: rawTransactions, loading, refreshing, refresh, optimisticUpdate } = useCachedFetch(
    `transactions:${entityId}`,
    fetchTransactions,
    { staleTTL: 15000, maxAge: 3 * 60 * 1000 }
  );
  const transactions = rawTransactions || [];

  // ── Project phases (for phase-aware trade filter) ────────
  // Transactions added via the AI chat store phase_id but leave subcategory
  // null, so the legacy subcategory-only chip filter hides them. We fetch
  // the project's phases and match by EITHER subcategory OR phase_id.
  const [projectPhases, setProjectPhases] = useState([]);
  useEffect(() => {
    if (!projectId || isServicePlan) return;
    let cancelled = false;
    (async () => {
      const { supabase } = require('../lib/supabase');
      const { data, error } = await supabase
        .from('project_phases')
        .select('id, name')
        .eq('project_id', projectId);
      if (!cancelled && !error && data) setProjectPhases(data);
    })();
    return () => { cancelled = true; };
  }, [projectId, isServicePlan]);

  const phaseNameById = useMemo(() => {
    const map = {};
    projectPhases.forEach(p => { map[p.id] = p.name; });
    return map;
  }, [projectPhases]);

  const onRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleDeleteTransaction = (transaction) => {
    Alert.alert(
      t('common:alerts.confirm'),
      t('owner:transactions.deleteConfirm'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('common:buttons.delete'),
          style: 'destructive',
          onPress: () => {
            // Optimistic: remove from UI immediately
            const rollback = optimisticUpdate((prev) =>
              (prev || []).filter(tx => tx.id !== transaction.id)
            );
            // Server delete in background
            deleteTransaction(transaction.id).catch(() => {
              rollback();
              Alert.alert(t('common:alerts.error'), t('common:messages.failedToDelete', { item: t('owner:transactions.transaction') }));
            });
          },
        },
      ]
    );
  };

  const handleViewTransaction = (transaction) => {
    navigation.navigate('TransactionDetail', {
      transaction,
      projectId,
      projectName,
      onRefresh: refresh,
    });
  };

  const handleAddTransaction = () => {
    navigation.navigate('TransactionEntry', {
      projectId,
      projectName,
      onSave: refresh,
      ...(subcategoryFilter && { prefillSubcategory: subcategoryFilter.toLowerCase() }),
    });
  };

  // ── Filtering ────────────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;
    if (typeFilter !== 'all') {
      filtered = filtered.filter(tx => tx.type === typeFilter);
    }
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(tx => tx.category === categoryFilter);
    }
    if (tradeFilter !== 'all') {
      const needle = tradeFilter.toLowerCase();
      filtered = filtered.filter(tx => {
        if ((tx.subcategory || '').toLowerCase() === needle) return true;
        const phaseName = tx.phase_id ? phaseNameById[tx.phase_id] : null;
        return phaseName ? phaseName.toLowerCase() === needle : false;
      });
    }
    return filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [transactions, typeFilter, categoryFilter, tradeFilter, phaseNameById]);

  // ── Available category filters (only show categories with data) ──
  const availableCategories = useMemo(() => {
    const typeFiltered = typeFilter !== 'all'
      ? transactions.filter(tx => tx.type === typeFilter)
      : transactions;
    const cats = new Set(typeFiltered.map(tx => tx.category).filter(Boolean));
    return CATEGORIES.filter(c => cats.has(c));
  }, [transactions, typeFilter]);

  // ── Available trade/subcategory filters ─────────────────
  // A transaction contributes to a chip via its subcategory OR via the name
  // of its linked phase. Each transaction increments at most one chip (phase
  // name wins over subcategory when both are present) so counts stay accurate.
  const availableTrades = useMemo(() => {
    let base = transactions;
    if (typeFilter !== 'all') base = base.filter(tx => tx.type === typeFilter);
    if (categoryFilter !== 'all') base = base.filter(tx => tx.category === categoryFilter);
    const trades = new Map();
    base.forEach(tx => {
      const phaseName = tx.phase_id ? phaseNameById[tx.phase_id] : null;
      const chipName = phaseName || tx.subcategory;
      if (!chipName) return;
      const key = chipName.toLowerCase();
      if (!trades.has(key)) trades.set(key, { name: chipName, count: 0 });
      trades.get(key).count++;
    });
    return Array.from(trades.values()).sort((a, b) => b.count - a.count);
  }, [transactions, typeFilter, categoryFilter, phaseNameById]);

  // ── Totals ───────────────────────────────────────────────
  const totals = useMemo(() => {
    const result = { expenses: 0, income: 0 };
    filteredTransactions.forEach(tx => {
      if (tx.type === 'expense') result.expenses += parseFloat(tx.amount) || 0;
      else result.income += parseFloat(tx.amount) || 0;
    });
    return result;
  }, [filteredTransactions]);

  // ── Group transactions by date into SectionList data ─────
  const sections = useMemo(() => {
    const groups = {};
    filteredTransactions.forEach(tx => {
      const dateKey = tx.date || 'unknown';
      if (!groups[dateKey]) groups[dateKey] = { total: 0, data: [] };
      groups[dateKey].data.push(tx);
      groups[dateKey].total += (tx.type === 'expense' ? -1 : 1) * (parseFloat(tx.amount) || 0);
    });

    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, group]) => ({
        title: dateKey,
        formattedDate: formatSectionDate(dateKey),
        sectionTotal: group.total,
        data: group.data,
      }));
  }, [filteredTransactions]);

  const formatCurrency = (amount) => {
    return `$${Math.abs(parseFloat(amount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // ── Loading State ────────────────────────────────────────
  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.header, { backgroundColor: Colors.cardBackground, borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('owner:transactions.transactionHistory')}</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.cardBackground, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]} numberOfLines={1}>
          {subcategoryFilter ? `${entityName} · ${subcategoryFilter}` : entityName}
        </Text>
        <TouchableOpacity
          onPress={handleAddTransaction}
          style={[styles.addButton, { backgroundColor: Colors.primaryBlue }]}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        {(!transactionType || transactionType !== 'income') && (
          <View style={[styles.summaryCard, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('owner:transactions.totalExpenses')}</Text>
            <Text style={[styles.summaryAmount, { color: '#EF4444' }]}>
              {formatCurrency(totals.expenses)}
            </Text>
          </View>
        )}
        {(!transactionType || transactionType !== 'expense') && (
          <View style={[styles.summaryCard, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('owner:transactions.totalIncome')}</Text>
            <Text style={[styles.summaryAmount, { color: '#10B981' }]}>
              {formatCurrency(totals.income)}
            </Text>
          </View>
        )}
      </View>

      {/* Type Filter */}
      {!transactionType && (
        <View style={styles.filtersSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {[
              { key: 'all', label: t('owner:transactions.filterAll') },
              { key: 'expense', label: t('owner:transactions.filterExpenses') },
              { key: 'income', label: t('owner:transactions.filterIncome') },
            ].map(f => (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterPill,
                  { borderColor: Colors.border },
                  typeFilter === f.key && styles.filterPillActive,
                ]}
                onPress={() => { setTypeFilter(f.key); setCategoryFilter('all'); setTradeFilter('all'); }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.filterPillText,
                  { color: Colors.secondaryText },
                  typeFilter === f.key && styles.filterPillTextActive,
                ]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Category Filter (only show when there are categories) */}
      {availableCategories.length > 1 && (
        <View style={styles.filtersSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <TouchableOpacity
              style={[
                styles.categoryPill,
                { borderColor: Colors.border },
                categoryFilter === 'all' && styles.categoryPillActive,
              ]}
              onPress={() => setCategoryFilter('all')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.categoryPillText,
                { color: Colors.secondaryText },
                categoryFilter === 'all' && styles.categoryPillTextActive,
              ]}>{t('owner:transactions.filterAll')}</Text>
            </TouchableOpacity>
            {availableCategories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryPill,
                  { borderColor: Colors.border },
                  categoryFilter === cat && { backgroundColor: CATEGORY_COLORS[cat], borderColor: CATEGORY_COLORS[cat] },
                ]}
                onPress={() => setCategoryFilter(cat === categoryFilter ? 'all' : cat)}
                activeOpacity={0.7}
              >
                <View style={[styles.catDot, { backgroundColor: categoryFilter === cat ? '#fff' : CATEGORY_COLORS[cat] }]} />
                <Text style={[
                  styles.categoryPillText,
                  { color: Colors.secondaryText },
                  categoryFilter === cat && { color: '#fff' },
                ]}>{CATEGORY_LABELS[cat]}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Trade / Service Filter */}
      {availableTrades.length > 1 && (
        <View style={styles.filtersSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <TouchableOpacity
              style={[
                styles.categoryPill,
                { borderColor: Colors.border },
                tradeFilter === 'all' && styles.filterPillActive,
              ]}
              onPress={() => setTradeFilter('all')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.categoryPillText,
                { color: Colors.secondaryText },
                tradeFilter === 'all' && styles.filterPillTextActive,
              ]}>All Trades</Text>
            </TouchableOpacity>
            {availableTrades.map(trade => {
              const isActive = tradeFilter.toLowerCase() === trade.name.toLowerCase();
              return (
                <TouchableOpacity
                  key={trade.name}
                  style={[
                    styles.categoryPill,
                    { borderColor: Colors.border },
                    isActive && styles.filterPillActive,
                  ]}
                  onPress={() => setTradeFilter(isActive ? 'all' : trade.name)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="construct-outline" size={12} color={isActive ? '#fff' : Colors.secondaryText} />
                  <Text style={[
                    styles.categoryPillText,
                    { color: Colors.secondaryText },
                    isActive && styles.filterPillTextActive,
                  ]}>{trade.name} ({trade.count})</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Transactions SectionList */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryText} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={56} color={Colors.secondaryText} />
            <Text style={[styles.emptyStateText, { color: Colors.primaryText }]}>{t('owner:transactions.noTransactions')}</Text>
            <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
              {t('owner:transactions.noTransactionsDesc')}
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: Colors.background }]}>
            <Text style={[styles.sectionDate, { color: Colors.primaryText }]}>{section.formattedDate}</Text>
            <Text style={[
              styles.sectionTotal,
              { color: section.sectionTotal >= 0 ? '#10B981' : '#EF4444' },
            ]}>
              {section.sectionTotal >= 0 ? '+' : '-'}{formatCurrency(Math.abs(section.sectionTotal))}
            </Text>
          </View>
        )}
        renderItem={({ item: transaction }) => (
          <TouchableOpacity
            style={[styles.transactionCard, { backgroundColor: Colors.cardBackground }]}
            onPress={() => handleViewTransaction(transaction)}
            activeOpacity={0.7}
          >
            <View style={styles.transactionLeft}>
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${getCategoryColor(transaction.category)}15` },
                ]}
              >
                <Ionicons
                  name={CATEGORY_ICONS[transaction.category] || (transaction.type === 'income' ? 'cash' : 'ellipsis-horizontal-circle')}
                  size={20}
                  color={getCategoryColor(transaction.category)}
                />
              </View>
              <View style={styles.transactionInfo}>
                <Text style={[styles.transactionDescription, { color: Colors.primaryText }]} numberOfLines={1}>
                  {transaction.description || '-'}
                </Text>
                <View style={styles.transactionMeta}>
                  {transaction.category && (
                    <Text style={[styles.transactionCategory, { color: getCategoryColor(transaction.category) }]}>
                      {CATEGORY_LABELS[transaction.category] || transaction.category}
                    </Text>
                  )}
                  {transaction.payment_method && (
                    <>
                      <View style={styles.metaDot} />
                      <Text style={[styles.transactionMetaText, { color: Colors.secondaryText }]}>
                        {transaction.payment_method.charAt(0).toUpperCase() + transaction.payment_method.slice(1)}
                      </Text>
                    </>
                  )}
                  {transaction.receipt_url && (
                    <>
                      <View style={styles.metaDot} />
                      <Ionicons name="camera" size={12} color={Colors.secondaryText} />
                    </>
                  )}
                  {transaction.is_auto_generated && (
                    <>
                      <View style={styles.metaDot} />
                      <Ionicons name="flash" size={12} color="#9CA3AF" />
                    </>
                  )}
                  {transaction.date && (
                    <>
                      <View style={styles.metaDot} />
                      <Text style={[styles.transactionMetaText, { color: Colors.secondaryText }]}>
                        {formatShortDate(transaction.date)}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </View>
            <View style={styles.transactionRight}>
              <Text
                style={[
                  styles.transactionAmount,
                  { color: transaction.type === 'expense' ? '#EF4444' : '#10B981' },
                ]}
              >
                {transaction.type === 'expense' ? '-' : '+'}
                {formatCurrency(transaction.amount)}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

// ── Helpers ──────────────────────────────────────────────

function formatSectionDate(dateStr) {
  if (!dateStr || dateStr === 'unknown') return 'Unknown Date';
  try {
    const date = new Date(dateStr + 'T12:00:00');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (target.getTime() === today.getTime()) return 'Today';
    if (target.getTime() === yesterday.getTime()) return 'Yesterday';

    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || '#6B7280';
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  // Summary
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
  },
  summaryAmount: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },

  // Filters
  filtersSection: {
    paddingVertical: 6,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillActive: {
    backgroundColor: '#1E40AF',
    borderColor: '#1E40AF',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  categoryPillActive: {
    backgroundColor: '#1E40AF',
    borderColor: '#1E40AF',
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  categoryPillTextActive: {
    color: '#fff',
  },
  catDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Section Headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionDate: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTotal: {
    fontSize: 13,
    fontWeight: '600',
  },

  // List
  listContent: {
    paddingBottom: 40,
    paddingHorizontal: 16,
  },

  // Transaction cards
  transactionCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  transactionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  transactionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  transactionCategory: {
    fontSize: 12,
    fontWeight: '600',
  },
  transactionMetaText: {
    fontSize: 12,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#D1D5DB',
  },
  transactionRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyStateSubtext: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
