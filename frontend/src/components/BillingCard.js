// BillingCard — unified billing surface for a project. Replaces the legacy
// Estimates section, Draws card, and Change Orders entry row inside
// ProjectDetailView. Three vertical zones:
//   1. ACTION REQUIRED — events the owner needs to act on now (ready draws,
//      overdue invoices, CO drafts, COs awaiting response)
//   2. UPCOMING — passive heads-up (pending draws, COs that will bundle)
//   3. HISTORY — terminal-state events (paid, approved, rejected) — collapsed
//
// Data source: GET /api/portal-admin/projects/:id/billing
// Action targets: utils/storage/projectBilling.js helpers (one-tap)

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchProjectBilling, sendDrawNow, nudgeInvoice, resendChangeOrder, billChangeOrderNow,
} from '../utils/storage/projectBilling';

const C = {
  primary: '#1E40AF', primaryLight: '#DBEAFE',
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  green: '#10B981', greenBg: '#D1FAE5', greenText: '#065F46',
  red: '#EF4444', redBg: '#FEE2E2', redText: '#991B1B',
  text: '#0F172A', textSec: '#475569', textMuted: '#94A3B8',
  surface: '#FFFFFF', bg: '#F8FAFC', border: '#E2E8F0',
};

const fmt$ = (n) => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmt$$ = (n) => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Map source types to icons + accent colors. Keeps the visual language consistent.
const SOURCE_VISUAL = {
  estimate:     { icon: 'document-text-outline', color: C.textSec },
  draw:         { icon: 'cash-outline',          color: C.green },
  change_order: { icon: 'swap-horizontal',       color: C.amberDark },
  invoice:      { icon: 'receipt-outline',       color: C.primary },
};

const STATUS_PILL = {
  // Drawn from event.status / event.raw_status / event.zone
  ready:               { bg: C.greenBg,    text: C.greenText, label: 'READY' },
  pending:             { bg: C.bg,         text: C.textMuted, label: 'PENDING' },
  invoiced:            { bg: C.primaryLight, text: C.primary, label: 'INVOICED' },
  paid:                { bg: C.greenBg,    text: C.greenText, label: 'PAID' },
  skipped:             { bg: C.bg,         text: C.textMuted, label: 'SKIPPED' },
  overdue:             { bg: C.redBg,      text: C.redText,   label: 'OVERDUE' },
  unpaid:              { bg: C.amberLight, text: C.amberText, label: 'UNPAID' },
  partial:             { bg: C.amberLight, text: C.amberText, label: 'PARTIAL' },
  draft:               { bg: C.bg,         text: C.textMuted, label: 'DRAFT' },
  pending_client:      { bg: C.amberLight, text: C.amberText, label: 'AWAITING' },
  viewed:              { bg: C.amberLight, text: C.amberText, label: 'VIEWED' },
  approved:            { bg: C.greenBg,    text: C.greenText, label: 'APPROVED' },
  rejected:            { bg: C.redBg,      text: C.redText,   label: 'DECLINED' },
  void:                { bg: C.bg,         text: C.textMuted, label: 'VOIDED' },
  accepted:            { bg: C.greenBg,    text: C.greenText, label: 'ACCEPTED' },
};

function StatusPill({ status }) {
  // Match raw_status first, then status keyword inside the string
  const key = STATUS_PILL[status] ? status :
    (Object.keys(STATUS_PILL).find(k => String(status || '').toLowerCase().includes(k)) || 'pending');
  const cfg = STATUS_PILL[key] || STATUS_PILL.pending;
  return (
    <View style={[styles.pill, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.pillText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

function EventRow({ event, onAction, onOpen, isAction }) {
  const visual = SOURCE_VISUAL[event.source] || SOURCE_VISUAL.invoice;

  // Build the meta line — what makes this row actionable
  let metaLine = null;
  if (event.source === 'invoice' && event.days_overdue > 0) {
    metaLine = `${event.days_overdue} days overdue · ${fmt$(event.amount_due)} due`;
  } else if (event.source === 'change_order' && event.raw_status && ['pending_client','viewed'].includes(event.raw_status)) {
    metaLine = event.status; // already formatted "awaiting client (Nd)"
  } else if (event.source === 'change_order' && event.schedule_impact_days) {
    metaLine = `${event.schedule_impact_days > 0 ? '+' : ''}${event.schedule_impact_days} day${Math.abs(event.schedule_impact_days) === 1 ? '' : 's'}`;
  } else if (event.source === 'draw' && event.trigger_type === 'change_order_approved' && event.co_id) {
    metaLine = 'Change order';
  } else if (event.source === 'draw' && event.invoice?.invoice_number) {
    metaLine = event.invoice.invoice_number;
  }

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onOpen?.(event)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconCircle, { backgroundColor: visual.color + '15' }]}>
        <Ionicons name={visual.icon} size={16} color={visual.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowLabel} numberOfLines={1}>
            {event.label}{event.description && event.label !== event.description ? ` — ${event.description}` : ''}
          </Text>
          <StatusPill status={event.raw_status || event.status} />
        </View>
        <View style={styles.rowMeta}>
          <Text style={styles.amount}>
            {event.amount_due != null && event.source === 'invoice'
              ? fmt$(event.amount_due > 0 ? event.amount_due : event.amount)
              : fmt$(event.amount)}
          </Text>
          {metaLine ? <Text style={styles.meta}>{metaLine}</Text> : null}
        </View>
      </View>
      {isAction && event.cta_label && event.action_type ? (
        <TouchableOpacity
          style={[styles.cta, ctaStyleFor(event.action_type)]}
          onPress={(e) => { e.stopPropagation?.(); onAction?.(event); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.ctaText, ctaTextStyleFor(event.action_type)]}>
            {event.cta_label}
          </Text>
        </TouchableOpacity>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
      )}
    </TouchableOpacity>
  );
}

function ctaStyleFor(action) {
  if (action === 'send_draw' || action === 'send_co') return { backgroundColor: C.primary };
  if (action === 'nudge_invoice') return { backgroundColor: C.amberDark };
  if (action === 'resend_co') return { backgroundColor: C.amber };
  return { backgroundColor: C.text };
}
function ctaTextStyleFor(_action) {
  return { color: '#fff' };
}

export default function BillingCard({ project, navigation, onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [busyAction, setBusyAction] = useState(null);

  const projectId = project?.id;

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      const result = await fetchProjectBilling(projectId);
      setData(result);
    } catch (e) {
      console.error('BillingCard load error:', e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (event) => {
    if (busyAction) return;
    setBusyAction(event.id);
    try {
      let result;
      switch (event.action_type) {
        case 'send_draw':
          // Confirmation modal — sending an invoice is a real-world action
          await new Promise((resolve, reject) => {
            Alert.alert(
              'Send invoice?',
              `Generate an invoice for ${event.label}: ${fmt$$(event.amount)}\n${event.description}`,
              [
                { text: 'Cancel', style: 'cancel', onPress: reject },
                { text: 'Send', style: 'default', onPress: resolve },
              ]
            );
          }).catch(() => null);
          result = await sendDrawNow(event.source_id);
          break;
        case 'nudge_invoice':
          result = await nudgeInvoice(event.source_id);
          break;
        case 'resend_co':
        case 'send_co':
          result = await resendChangeOrder(event.source_id);
          break;
        case 'bill_co_now':
          result = await billChangeOrderNow(event.source_id);
          break;
        default:
          break;
      }
      if (result?.error) Alert.alert('Action failed', result.error);
      await load();
      onRefresh?.();
    } catch (e) {
      Alert.alert('Action failed', e.message || 'Something went wrong');
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpen = (event) => {
    if (!navigation) return;
    if (event.source === 'change_order') {
      navigation.navigate('ChangeOrdersList', { project, projectId });
    } else if (event.source === 'invoice') {
      // Could deep-link to an invoice screen — for now navigate to chat with context
      navigation.navigate('Chat', { prefill: `Show me invoice ${event.label}` });
    } else if (event.source === 'draw') {
      // Drill into draws via the project builder edit flow OR just stay in card
    } else if (event.source === 'estimate') {
      navigation.navigate('Chat', { prefill: `Show me estimate ${event.label}` });
    }
  };

  if (loading) {
    return (
      <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.card, { paddingVertical: 18 }]}>
        <View style={styles.headerRow}>
          <Ionicons name="cash-outline" size={18} color={C.green} />
          <Text style={styles.headerTitle}>Billing</Text>
        </View>
        <Text style={styles.emptyMsg}>No billing data yet — create an estimate or draw schedule to start.</Text>
      </View>
    );
  }

  const { project: rollup, counts, action, upcoming, history } = data;
  const contractDelta = rollup.contract_delta_from_cos || 0;
  const drawnPct = rollup.contract_amount > 0
    ? Math.min(100, (rollup.drawn_to_date / rollup.contract_amount) * 100)
    : 0;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: C.green + '15' }]}>
          <Ionicons name="cash-outline" size={16} color={C.green} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Billing</Text>
          <Text style={styles.headerSubtitle}>
            Contract {fmt$(rollup.contract_amount)}
            {contractDelta > 0 ? `  (was ${fmt$(rollup.base_contract)})` : ''}
            {' · '}{Math.round(drawnPct)}% drawn
          </Text>
        </View>
      </View>

      {/* Contract progress bar */}
      {rollup.contract_amount > 0 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${drawnPct}%` }]} />
        </View>
      )}

      {/* Quick stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Drawn</Text>
          <Text style={styles.statValue}>{fmt$(rollup.drawn_to_date)}</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Collected</Text>
          <Text style={[styles.statValue, { color: C.green }]}>{fmt$(rollup.collected)}</Text>
        </View>
        <View style={styles.statSep} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Outstanding</Text>
          <Text style={[styles.statValue, rollup.outstanding > 0 && { color: C.amberDark }]}>
            {fmt$(rollup.outstanding)}
          </Text>
        </View>
      </View>

      {/* ZONE 1: ACTION REQUIRED */}
      {action.length > 0 && (
        <View style={styles.zone}>
          <View style={styles.zoneHeader}>
            <Ionicons name="alert-circle" size={14} color={C.red} />
            <Text style={[styles.zoneLabel, { color: C.red }]}>Action required ({action.length})</Text>
          </View>
          {action.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              onAction={handleAction}
              onOpen={handleOpen}
              isAction
            />
          ))}
        </View>
      )}

      {/* ZONE 2: UPCOMING */}
      {upcoming.length > 0 && (
        <View style={styles.zone}>
          <View style={styles.zoneHeader}>
            <Ionicons name="time-outline" size={14} color={C.textSec} />
            <Text style={styles.zoneLabel}>Upcoming ({upcoming.length})</Text>
          </View>
          {upcoming.map((event) => (
            <EventRow key={event.id} event={event} onOpen={handleOpen} />
          ))}
        </View>
      )}

      {/* ZONE 3: HISTORY (collapsed by default) */}
      {history.length > 0 && (
        <View style={styles.zone}>
          <TouchableOpacity
            style={styles.zoneHeader}
            onPress={() => setHistoryExpanded(!historyExpanded)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={historyExpanded ? 'chevron-down' : 'chevron-forward'}
              size={14} color={C.textMuted}
            />
            <Text style={styles.zoneLabel}>History ({history.length})</Text>
          </TouchableOpacity>
          {historyExpanded && history.map((event) => (
            <EventRow key={event.id} event={event} onOpen={handleOpen} />
          ))}
        </View>
      )}

      {action.length === 0 && upcoming.length === 0 && history.length === 0 && (
        <Text style={styles.emptyMsg}>
          Nothing yet. Create an estimate, draw schedule, or change order in chat.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  headerSubtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  iconCircle: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  progressTrack: {
    height: 6, backgroundColor: C.bg, borderRadius: 3, marginTop: 12, overflow: 'hidden',
  },
  progressFill: {
    height: 6, backgroundColor: C.green, borderRadius: 3,
  },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, marginTop: 4,
  },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 10, color: C.textMuted, fontWeight: '600', letterSpacing: 0.5 },
  statValue: { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 2, fontVariant: ['tabular-nums'] },
  statSep: { width: 1, height: 28, backgroundColor: C.border },

  zone: { marginTop: 12 },
  zoneHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6,
  },
  zoneLabel: { fontSize: 11, fontWeight: '700', color: C.textSec, letterSpacing: 0.6, textTransform: 'uppercase' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { fontSize: 14, color: C.text, fontWeight: '600', flex: 1 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  amount: { fontSize: 13, color: C.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  meta: { fontSize: 12, color: C.textMuted },

  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  pillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },

  cta: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  ctaText: { fontSize: 12, fontWeight: '700' },

  emptyMsg: {
    fontSize: 13, color: C.textMuted, fontStyle: 'italic',
    paddingVertical: 18, textAlign: 'center',
  },
});
