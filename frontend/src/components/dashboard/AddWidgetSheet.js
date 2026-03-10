import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const WIDGET_ICONS = {
  pnl: 'trending-up-outline',
  cashflow: 'bar-chart-outline',
  alerts: 'warning-outline',
  active_projects: 'construct-outline',
  workers: 'people-outline',
  supervisors: 'shield-outline',
  transactions: 'card-outline',
  overdue_invoices: 'alert-circle-outline',
  profit_margin: 'trending-up-outline',
  contract_value: 'document-text-outline',
  pending_invites: 'mail-unread-outline',
  forgotten_clockouts: 'time-outline',
  unmatched_txns: 'git-compare-outline',
  ar_aging: 'receipt-outline',
  payroll: 'wallet-outline',
  recent_reports: 'clipboard-outline',
  pipeline: 'funnel-outline',
};

const WIDGET_COLORS = {
  pnl: '#0F172A',
  cashflow: '#10B981',
  alerts: '#F59E0B',
  active_projects: '#3B82F6',
  workers: '#F59E0B',
  supervisors: '#8B5CF6',
  transactions: '#10B981',
  overdue_invoices: '#EF4444',
  profit_margin: '#10B981',
  contract_value: '#6366F1',
  pending_invites: '#3B82F6',
  forgotten_clockouts: '#F59E0B',
  unmatched_txns: '#F97316',
  ar_aging: '#6366F1',
  payroll: '#8B5CF6',
  recent_reports: '#06B6D4',
  pipeline: '#6366F1',
};

// Per-widget labels: short for square, descriptive for rectangle
const WIDGET_LABELS = {
  active_projects:    { small: 'Active',       medium: 'Active Projects' },
  workers:            { small: 'Workers',      medium: 'Total Workers' },
  supervisors:        { small: 'Supervisors',  medium: 'Your Supervisors' },
  transactions:       { small: 'Txns',         medium: 'Total Transactions' },
  overdue_invoices:   { small: 'Overdue',      medium: 'Overdue Invoices' },
  profit_margin:      { small: 'Margin',       medium: 'Profit Margin %' },
  contract_value:     { small: 'Contracts',    medium: 'Contract Value' },
  pending_invites:    { small: 'Invites',      medium: 'Pending Invites' },
  forgotten_clockouts:{ small: 'Clock-outs',   medium: 'Forgotten Clock-outs' },
  unmatched_txns:     { small: 'Unmatched',    medium: 'Unmatched Txns' },
};

// Sample values for previews
const WIDGET_VALUES = {
  profit_margin: '0%',
  contract_value: '$0',
  overdue_invoices: '0',
  payroll: '$0',
};

function getLabel(widgetId, size) {
  return WIDGET_LABELS[widgetId]?.[size] || widgetId;
}
function getValue(widgetId) {
  return WIDGET_VALUES[widgetId] || '0';
}

// ─── Small (square) preview ─── vertical: icon → value → label
function SmallPreview({ widgetId, icon, color }) {
  return (
    <View style={s.smallCard}>
      <View style={[s.miniIcon, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={10} color={color} />
      </View>
      <Text style={s.smallValue}>{getValue(widgetId)}</Text>
      <Text style={s.smallLabel} numberOfLines={1}>{getLabel(widgetId, 'small')}</Text>
    </View>
  );
}

// ─── Medium (wide) preview ─── horizontal: icon | value + longer label
function MediumStatPreview({ widgetId, icon, color }) {
  return (
    <View style={s.mediumCard}>
      <View style={[s.miniIcon, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={10} color={color} />
      </View>
      <View style={s.mediumContent}>
        <Text style={s.mediumValue}>{getValue(widgetId)}</Text>
        <Text style={s.mediumLabel} numberOfLines={1}>{getLabel(widgetId, 'medium')}</Text>
      </View>
    </View>
  );
}

// ─── Payroll previews ───
function PayrollSmallPreview({ icon, color }) {
  return (
    <View style={s.smallCard}>
      <View style={[s.miniIcon, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={10} color={color} />
      </View>
      <Text style={s.smallValue}>$0</Text>
      <Text style={s.smallLabel}>PAYROLL</Text>
    </View>
  );
}
function PayrollMediumPreview({ icon, color }) {
  return (
    <View style={s.mediumCard}>
      <View style={[s.miniIcon, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={10} color={color} />
      </View>
      <View style={s.mediumContent}>
        <Text style={s.mediumValue}>$0</Text>
        <Text style={s.mediumLabel} numberOfLines={1}>0 WORKERS PAID THIS WEEK</Text>
      </View>
    </View>
  );
}

// ─── Aging previews ───
function AgingMediumPreview({ icon, color }) {
  return (
    <View style={s.mediumCard}>
      <View style={[s.miniIcon, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={10} color={color} />
      </View>
      <View style={s.mediumContent}>
        <Text style={s.mediumValue}>$0</Text>
        <View style={s.miniBarRow}>
          <View style={[s.miniBarSeg, { flex: 3, backgroundColor: '#10B981' }]} />
          <View style={[s.miniBarSeg, { flex: 1, backgroundColor: '#F59E0B40' }]} />
        </View>
        <Text style={s.mediumLabel}>AGING</Text>
      </View>
    </View>
  );
}
function AgingLargePreview({ icon, color }) {
  return (
    <View style={s.largeCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={[s.miniIcon, { backgroundColor: color + '1A' }]}>
          <Ionicons name={icon} size={10} color={color} />
        </View>
        <Text style={s.largeValueText}>$0</Text>
      </View>
      <View style={s.bucketDotsRow}>
        <View style={[s.bucketDot, { backgroundColor: '#10B981' }]} />
        <Text style={s.bucketDotLabel}>Current</Text>
        <View style={[s.bucketDot, { backgroundColor: '#F59E0B' }]} />
        <Text style={s.bucketDotLabel}>30d</Text>
        <View style={[s.bucketDot, { backgroundColor: '#EF4444' }]} />
        <Text style={s.bucketDotLabel}>60d</Text>
      </View>
      <View style={s.miniBarRow}>
        <View style={[s.miniBarSeg, { flex: 3, backgroundColor: '#10B981' }]} />
        <View style={[s.miniBarSeg, { flex: 1, backgroundColor: '#F59E0B' }]} />
        <View style={[s.miniBarSeg, { flex: 0.5, backgroundColor: '#EF4444' }]} />
      </View>
      <Text style={s.largeLabelText}>RECEIVABLES AGING</Text>
    </View>
  );
}

// ─── Pipeline previews ───
function PipelineMediumPreview({ icon, color }) {
  return (
    <View style={s.mediumCard}>
      <View style={[s.miniIcon, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={10} color={color} />
      </View>
      <View style={s.mediumContent}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <View style={[s.bucketDot, { backgroundColor: '#94A3B8' }]} />
          <Text style={s.tinyText}>0 Draft</Text>
          <View style={[s.bucketDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={s.tinyText}>0 Unpaid</Text>
        </View>
        <Text style={s.mediumLabel}>PIPELINE</Text>
      </View>
    </View>
  );
}
function PipelineLargePreview({ icon, color }) {
  return (
    <View style={s.largeCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={[s.miniIcon, { backgroundColor: color + '1A' }]}>
          <Ionicons name={icon} size={10} color={color} />
        </View>
        <Text style={s.largeSectionTitle}>Pipeline</Text>
      </View>
      <View>
        <Text style={s.largeLabelText}>ESTIMATES</Text>
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
          <View style={[s.bucketDot, { backgroundColor: '#94A3B8' }]} />
          <Text style={s.tinyText}>Draft</Text>
          <View style={[s.bucketDot, { backgroundColor: '#3B82F6' }]} />
          <Text style={s.tinyText}>Sent</Text>
          <View style={[s.bucketDot, { backgroundColor: '#10B981' }]} />
          <Text style={s.tinyText}>Won</Text>
        </View>
      </View>
      <View>
        <Text style={s.largeLabelText}>INVOICES</Text>
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
          <View style={[s.bucketDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={s.tinyText}>Unpaid</Text>
          <View style={[s.bucketDot, { backgroundColor: '#F97316' }]} />
          <Text style={s.tinyText}>Partial</Text>
          <View style={[s.bucketDot, { backgroundColor: '#10B981' }]} />
          <Text style={s.tinyText}>Paid</Text>
        </View>
      </View>
    </View>
  );
}

// ─── PnL preview (large only) ───
function PnLPreview() {
  return (
    <View style={s.largeCard}>
      <Text style={s.largeLabelText}>THIS MONTH</Text>
      <Text style={[s.largeValueText, { color: '#0F172A' }]}>$0</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <View style={[s.miniPill, { backgroundColor: '#EF44441A' }]}>
          <Text style={{ fontSize: 6, color: '#EF4444' }}>Exp $0</Text>
        </View>
        <View style={[s.miniPill, { backgroundColor: '#10B9811A' }]}>
          <Text style={{ fontSize: 6, color: '#10B981' }}>Profit $0</Text>
        </View>
      </View>
    </View>
  );
}

// ─── CashFlow preview (large only) ───
function CashFlowPreview() {
  return (
    <View style={s.largeCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.largeSectionTitle}>Cash Flow</Text>
        <Text style={[s.tinyText, { color: '#10B981' }]}>Net: $0</Text>
      </View>
      <View style={s.miniBars}>
        {[0.6, 0.8, 0.4, 0.7].map((h, i) => (
          <View key={i} style={s.miniBarGroup}>
            <View style={[s.miniBar, { height: 16 * h, backgroundColor: '#10B981' }]} />
            <View style={[s.miniBar, { height: 16 * (h * 0.7), backgroundColor: '#EF4444' }]} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <View style={[s.bucketDot, { backgroundColor: '#10B981' }]} />
          <Text style={s.tinyText}>In</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <View style={[s.bucketDot, { backgroundColor: '#EF4444' }]} />
          <Text style={s.tinyText}>Out</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Alerts preview (medium only) ───
function AlertsPreview() {
  return (
    <View style={[s.mediumCard, { backgroundColor: '#FFFBEB' }]}>
      <View style={[s.alertAccent, { backgroundColor: '#F59E0B' }]} />
      <View style={[s.miniIcon, { backgroundColor: '#F59E0B1A' }]}>
        <Ionicons name="warning-outline" size={10} color="#F59E0B" />
      </View>
      <View style={s.mediumContent}>
        <Text style={[s.mediumValue, { fontSize: 9, color: '#92400E' }]} numberOfLines={1}>Items need review</Text>
        <Text style={s.mediumLabel}>NEEDS ATTENTION</Text>
      </View>
    </View>
  );
}

// ─── RecentReports preview (medium only) ───
function RecentReportsPreview({ icon, color }) {
  return (
    <View style={s.mediumCard}>
      <View style={[s.miniIcon, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={10} color={color} />
      </View>
      <View style={s.mediumContent}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
          <Text style={s.mediumValue}>0</Text>
          <Text style={s.tinyText}>reports</Text>
          <Text style={[s.tinyText, { color: '#CBD5E1' }]}> · </Text>
          <Text style={s.mediumValue}>0</Text>
          <Text style={s.tinyText}>photos</Text>
        </View>
        <Text style={s.mediumLabel}>DAILY REPORTS</Text>
      </View>
    </View>
  );
}

// ─── Router ───
function SizePreview({ widgetId, size, icon, color }) {
  // Single-size widgets
  if (widgetId === 'pnl') return <PnLPreview />;
  if (widgetId === 'cashflow') return <CashFlowPreview />;
  if (widgetId === 'alerts') return <AlertsPreview />;
  if (widgetId === 'recent_reports') return <RecentReportsPreview icon={icon} color={color} />;

  // Payroll
  if (widgetId === 'payroll') {
    return size === 'small'
      ? <PayrollSmallPreview icon={icon} color={color} />
      : <PayrollMediumPreview icon={icon} color={color} />;
  }

  // AR Aging
  if (widgetId === 'ar_aging') {
    return size === 'medium'
      ? <AgingMediumPreview icon={icon} color={color} />
      : <AgingLargePreview icon={icon} color={color} />;
  }

  // Pipeline
  if (widgetId === 'pipeline') {
    return size === 'medium'
      ? <PipelineMediumPreview icon={icon} color={color} />
      : <PipelineLargePreview icon={icon} color={color} />;
  }

  // StatWidget group (small/medium)
  if (size === 'small') return <SmallPreview widgetId={widgetId} icon={icon} color={color} />;
  return <MediumStatPreview widgetId={widgetId} icon={icon} color={color} />;
}

export default function AddWidgetSheet({ visible, onClose, availableWidgets, onAdd }) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>Add Widget</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {availableWidgets.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>All widgets are on your dashboard</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {availableWidgets.map((widget) => {
                const icon = WIDGET_ICONS[widget.id] || 'grid-outline';
                const color = WIDGET_COLORS[widget.id] || '#64748B';
                return (
                  <View key={widget.id} style={styles.widgetSection}>
                    <Text style={styles.widgetLabel}>{widget.label}</Text>
                    <Text style={styles.widgetDesc}>{widget.description}</Text>
                    <View style={styles.shapesRow}>
                      {widget.availableSizes.map((size) => (
                        <TouchableOpacity
                          key={size}
                          onPress={() => onAdd(widget.id, size)}
                          activeOpacity={0.7}
                        >
                          <SizePreview
                            widgetId={widget.id}
                            size={size}
                            icon={icon}
                            color={color}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Mini preview styles
const s = StyleSheet.create({
  miniIcon: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Small (square) preview
  smallCard: {
    width: 80,
    height: 80,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    padding: 8,
    justifyContent: 'space-between',
  },
  smallValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  smallLabel: {
    fontSize: 6,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  // Medium (wide) preview
  mediumCard: {
    width: 148,
    height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mediumContent: {
    flex: 1,
  },
  mediumValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  mediumLabel: {
    fontSize: 6,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  // Alert accent bar
  alertAccent: {
    width: 2,
    height: '70%',
    borderRadius: 1,
    marginRight: 2,
  },
  // Large preview
  largeCard: {
    width: 148,
    height: 80,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    padding: 8,
    justifyContent: 'space-between',
  },
  largeSectionTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0F172A',
  },
  largeLabelText: {
    fontSize: 5,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  largeValueText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  miniPill: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  miniBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    flex: 1,
    paddingTop: 4,
  },
  miniBarGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  miniBar: {
    width: 6,
    borderRadius: 2,
  },
  miniBarRow: {
    flexDirection: 'row',
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
    gap: 1,
  },
  miniBarSeg: {
    height: 3,
    borderRadius: 1.5,
  },
  bucketDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  bucketDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  bucketDotLabel: {
    fontSize: 5,
    color: '#94A3B8',
    fontWeight: '500',
  },
  tinyText: {
    fontSize: 6,
    color: '#64748B',
    fontWeight: '500',
  },
});

// Main sheet styles
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: 520,
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  list: {
    paddingHorizontal: 20,
  },
  widgetSection: {
    marginBottom: 18,
  },
  widgetLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  widgetDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
    marginBottom: 10,
  },
  shapesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  emptyWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
  },
});
