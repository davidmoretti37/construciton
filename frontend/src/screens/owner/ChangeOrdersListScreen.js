// ChangeOrdersListScreen — owner-side list of all COs for a project.
// Entry: ProjectDetailScreen → "Change Orders" row.
// Actions per CO: open detail, recall (sent → draft), void.
// New CO creation goes through chat (preview card flow).

import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fetchChangeOrders, recallChangeOrder, voidChangeOrder } from '../../utils/storage/changeOrders';

const C = {
  primary: '#1E40AF', primaryLight: '#DBEAFE',
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  green: '#10B981', greenBg: '#D1FAE5', greenText: '#065F46',
  red: '#EF4444', redBg: '#FEE2E2', redText: '#991B1B',
  text: '#0F172A', textSec: '#475569', textMuted: '#94A3B8',
  surface: '#FFFFFF', bg: '#F8FAFC', border: '#E2E8F0',
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Declined' },
];

const STATUS_DISPLAY = {
  draft: { label: 'DRAFT', bg: C.bg, text: C.textSec },
  pending_client: { label: 'AWAITING', bg: C.amberLight, text: C.amberText },
  viewed: { label: 'VIEWED', bg: C.amberLight, text: C.amberText },
  approved: { label: 'APPROVED', bg: C.greenBg, text: C.greenText },
  rejected: { label: 'DECLINED', bg: C.redBg, text: C.redText },
  void: { label: 'VOIDED', bg: C.bg, text: C.textMuted },
};

const fmt$ = (n) => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function statusMatchesTab(status, tabKey) {
  if (tabKey === 'all') return true;
  if (tabKey === 'pending') return ['draft', 'pending_client', 'viewed'].includes(status);
  if (tabKey === 'approved') return status === 'approved';
  if (tabKey === 'rejected') return status === 'rejected' || status === 'void';
  return true;
}

export default function ChangeOrdersListScreen({ route, navigation }) {
  const { project } = route.params || {};
  const projectId = project?.id || route.params?.projectId;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('all');

  const load = useCallback(async () => {
    if (!projectId) {
      setItems([]); setLoading(false); return;
    }
    try {
      const data = await fetchChangeOrders(projectId);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('CO list load failed:', e);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const summary = items.reduce(
    (acc, co) => {
      if (co.status === 'approved') acc.approvedTotal += Number(co.total_amount || 0);
      if (['pending_client', 'viewed'].includes(co.status)) acc.pendingCount += 1;
      return acc;
    },
    { approvedTotal: 0, pendingCount: 0 }
  );

  const filtered = items.filter((co) => statusMatchesTab(co.status, tab));

  const handleAction = async (co) => {
    const isSent = ['pending_client', 'viewed'].includes(co.status);
    const canVoid = co.status !== 'approved';
    const options = [];
    if (isSent) options.push({ label: 'Recall to draft', danger: false, fn: async () => {
      try { await recallChangeOrder(co.id); load(); }
      catch (e) { Alert.alert('Recall failed', e.message); }
    }});
    if (canVoid) options.push({ label: 'Void this CO', danger: true, fn: async () => {
      Alert.alert('Void change order?', 'This is reversible only by creating a new CO.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Void', style: 'destructive', onPress: async () => {
          try { await voidChangeOrder(co.id, ''); load(); }
          catch (e) { Alert.alert('Void failed', e.message); }
        }},
      ]);
    }});
    if (options.length === 0) return;

    Alert.alert(
      `CO-${String(co.co_number || 0).padStart(3, '0')}`,
      co.title || 'Change order',
      [
        ...options.map((o) => ({ text: o.label, style: o.danger ? 'destructive' : 'default', onPress: o.fn })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renderItem = ({ item: co }) => {
    const display = STATUS_DISPLAY[co.status] || STATUS_DISPLAY.draft;
    const days = Number(co.schedule_impact_days || 0);
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => handleAction(co)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.rowHeader}>
            <Text style={styles.coNumber}>CO-{String(co.co_number || 0).padStart(3, '0')}</Text>
            <View style={[styles.pill, { backgroundColor: display.bg }]}>
              <Text style={[styles.pillText, { color: display.text }]}>{display.label}</Text>
            </View>
          </View>
          <Text style={styles.coTitle} numberOfLines={2}>{co.title || 'Untitled'}</Text>
          <View style={styles.rowMeta}>
            <Text style={styles.amount}>{fmt$(co.total_amount)}</Text>
            {days !== 0 && (
              <Text style={styles.days}>
                {days > 0 ? '+' : ''}{days} day{Math.abs(days) === 1 ? '' : 's'}
              </Text>
            )}
            <Text style={styles.date}>
              {new Date(co.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.surface }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Change Orders</Text>
          <View style={{ width: 26 }} />
        </View>
      </SafeAreaView>

      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Approved total</Text>
          <Text style={styles.summaryValue}>{fmt$(summary.approvedTotal)}</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Pending</Text>
          <Text style={[styles.summaryValue, summary.pendingCount > 0 && { color: C.amberDark }]}>
            {summary.pendingCount}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.empty}><ActivityIndicator color={C.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(co) => co.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="documents-outline" size={36} color={C.textMuted} />
              <Text style={styles.emptyText}>
                {tab === 'all'
                  ? 'No change orders yet. Ask the AI to draft one.'
                  : `No ${tab === 'pending' ? 'pending' : tab} change orders.`}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={C.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },

  summary: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
    paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: C.textMuted, fontWeight: '600', letterSpacing: 0.5 },
  summaryValue: { fontSize: 18, color: C.text, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },
  summarySep: { width: 1, height: 36, backgroundColor: C.border },

  tabs: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: C.bg },
  tabActive: { backgroundColor: C.text },
  tabText: { fontSize: 13, color: C.textSec, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  coNumber: { fontSize: 12, color: C.textMuted, fontWeight: '700', letterSpacing: 0.4 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  coTitle: { fontSize: 15, color: C.text, fontWeight: '600' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  amount: { fontSize: 14, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  days: { fontSize: 12, color: C.amberDark, fontWeight: '600' },
  date: { fontSize: 12, color: C.textMuted, marginLeft: 'auto' },

  empty: { alignItems: 'center', padding: 40, gap: 12 },
  emptyText: { fontSize: 14, color: C.textMuted, textAlign: 'center' },
});
