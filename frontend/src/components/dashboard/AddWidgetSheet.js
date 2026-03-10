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
import { LinearGradient } from 'expo-linear-gradient';
import { WIDGET_PALETTES } from './widgets/widgetColors';

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

const WIDGET_LABELS = {
  pnl:                 { small: 'P&L',         medium: 'P&L Summary',          large: 'P&L Summary' },
  cashflow:            { small: 'Cash Flow',    medium: 'Cash Flow',            large: 'Cash Flow' },
  alerts:              { small: 'Alerts',       medium: 'Needs Attention',      large: 'Needs Attention' },
  active_projects:     { small: 'Projects',     medium: 'Active Projects',      large: 'Active Projects' },
  workers:             { small: 'Workers',      medium: 'Total Workers',        large: 'Total Workers' },
  supervisors:         { small: 'Supervisors',  medium: 'Supervisors',          large: 'Supervisors' },
  transactions:        { small: 'Txns',         medium: 'Transactions',         large: 'Transactions' },
  overdue_invoices:    { small: 'Overdue',      medium: 'Overdue Invoices',     large: 'Overdue Invoices' },
  profit_margin:       { small: 'Margin',       medium: 'Profit Margin',        large: 'Profit Margin' },
  contract_value:      { small: 'Contracts',    medium: 'Contract Value',       large: 'Contract Value' },
  pending_invites:     { small: 'Invites',      medium: 'Pending Invites',      large: 'Pending Invites' },
  forgotten_clockouts: { small: 'Clock-outs',   medium: 'Forgotten Clock-outs', large: 'Forgotten Clock-outs' },
  unmatched_txns:      { small: 'Unmatched',    medium: 'Unmatched Txns',       large: 'Unmatched Txns' },
  ar_aging:            { small: 'Aging',        medium: 'AR Aging',             large: 'AR Aging' },
  payroll:             { small: 'Payroll',      medium: 'Payroll',              large: 'Payroll' },
  recent_reports:      { small: 'Reports',      medium: 'Daily Reports',        large: 'Daily Reports' },
  pipeline:            { small: 'Pipeline',     medium: 'Pipeline',             large: 'Pipeline' },
};

function getLabel(widgetId, size) {
  return WIDGET_LABELS[widgetId]?.[size] || widgetId;
}

// ─── Generic gradient preview card ───
function GradientPreview({ widgetId, size, icon }) {
  const palette = WIDGET_PALETTES[widgetId] || { gradient: ['#64748B', '#94A3B8'], accent: '#FFFFFF', text: '#FFFFFF' };
  const iconName = icon || WIDGET_ICONS[widgetId] || 'grid-outline';
  const label = getLabel(widgetId, size);

  if (size === 'large') {
    return (
      <LinearGradient colors={palette.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.largeCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={[s.miniIcon, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <Ionicons name={iconName} size={10} color={palette.accent} />
          </View>
          <Text style={[s.largeSectionTitle, { color: palette.text }]}>{label}</Text>
        </View>
        <Text style={[s.largeValueText, { color: palette.accent }]}>--</Text>
        <Text style={[s.largeLabelText, { color: 'rgba(255,255,255,0.5)' }]}>{label.toUpperCase()}</Text>
      </LinearGradient>
    );
  }

  if (size === 'medium') {
    return (
      <LinearGradient colors={palette.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.mediumCard}>
        <View style={[s.miniIcon, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
          <Ionicons name={iconName} size={10} color={palette.accent} />
        </View>
        <View style={s.mediumContent}>
          <Text style={[s.mediumValue, { color: palette.text }]}>--</Text>
          <Text style={[s.mediumLabel, { color: 'rgba(255,255,255,0.5)' }]}>{label.toUpperCase()}</Text>
        </View>
      </LinearGradient>
    );
  }

  // small
  return (
    <LinearGradient colors={palette.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.smallCard}>
      <View style={[s.miniIcon, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
        <Ionicons name={iconName} size={10} color={palette.accent} />
      </View>
      <Text style={[s.smallValue, { color: palette.text }]}>--</Text>
      <Text style={[s.smallLabel, { color: 'rgba(255,255,255,0.5)' }]}>{label.toUpperCase()}</Text>
    </LinearGradient>
  );
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
                          <GradientPreview widgetId={widget.id} size={size} icon={icon} />
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
  smallCard: {
    width: 80,
    height: 80,
    borderRadius: 10,
    padding: 8,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  smallValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  smallLabel: {
    fontSize: 6,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  mediumCard: {
    width: 148,
    height: 56,
    borderRadius: 10,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  mediumContent: {
    flex: 1,
  },
  mediumValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  mediumLabel: {
    fontSize: 6,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  largeCard: {
    width: 148,
    height: 80,
    borderRadius: 10,
    padding: 8,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  largeSectionTitle: {
    fontSize: 9,
    fontWeight: '700',
  },
  largeLabelText: {
    fontSize: 5,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  largeValueText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
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
