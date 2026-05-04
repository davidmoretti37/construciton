import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { fetchLatestBusinessInsights } from '../utils/storage/insights';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, getColors } from '../constants/theme';
import { routeForBriefItem } from '../utils/notificationRouter';

// Phase-3 surface: top-of-home anomaly briefing. Designed to read as a
// premium dashboard card — neutral surface, single subtle accent stripe
// on the leading edge, severity carried by tags rather than background tint.

// Display metadata for each insight kind. Routing is handled by
// routeForBriefItem() so taps land on a screen where the user can ACT
// on the issue (force clock-out, force-resolve project, drill into AR
// for the specific client) — not a generic tab.
const KIND_META = {
  forgotten_clock_out: { icon: 'time-outline',          label: 'Forgotten clock-out' },
  worker_silent:       { icon: 'document-text-outline', label: 'Reports overdue' },
  budget_burn:         { icon: 'trending-up-outline',   label: 'Budget burn' },
  project_stale:       { icon: 'pulse-outline',         label: 'No recent activity' },
  invoice_overdue:     { icon: 'wallet-outline',        label: 'Receivable overdue' },
};

export default function MorningBriefCard() {
  const navigation = useNavigation();
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchLatestBusinessInsights();
    setData(result);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const surface = Colors.card || Colors.white;
  const border  = Colors.border;
  const textP   = Colors.primaryText;
  const textS   = Colors.secondaryText;

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
        <ActivityIndicator size="small" color={textS} />
      </View>
    );
  }

  // ---- Empty / all-clear state ----
  if (!data || data.item_count === 0) {
    return (
      <View style={[styles.card, styles.cardClean, { backgroundColor: surface, borderColor: border }]}>
        <View style={[styles.accentStripe, { backgroundColor: '#10B981' }]} />
        <View style={styles.cleanRow}>
          <View style={[styles.iconChip, { backgroundColor: '#10B98115' }]}>
            <Ionicons name="checkmark" size={16} color="#10B981" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.eyebrow, { color: textS }]}>MORNING BRIEF</Text>
            <Text style={[styles.cleanTitle, { color: textP }]}>All clear</Text>
          </View>
          <Text style={[styles.timestamp, { color: textS }]}>{formatRelative(data?.generated_at)}</Text>
        </View>
      </View>
    );
  }

  const items     = data.items || [];
  const visible   = expanded ? items : items.slice(0, 3);
  const hasUrgent = data.high_count > 0;
  const accent    = hasUrgent ? '#DC2626' : '#D97706';

  return (
    <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      {/* Subtle severity stripe on the leading edge */}
      <View style={[styles.accentStripe, { backgroundColor: accent }]} />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: textS }]}>MORNING BRIEF</Text>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: textP }]}>
              {data.item_count} {data.item_count === 1 ? 'thing' : 'things'} to look at
            </Text>
          </View>
        </View>
        <Text style={[styles.timestamp, { color: textS }]}>{formatRelative(data.generated_at)}</Text>
      </View>

      {/* Severity chips */}
      <View style={styles.chipRow}>
        {data.high_count > 0 && (
          <View style={[styles.chip, { backgroundColor: '#DC262610' }]}>
            <View style={[styles.chipDot, { backgroundColor: '#DC2626' }]} />
            <Text style={[styles.chipText, { color: '#991B1B' }]}>
              {data.high_count} urgent
            </Text>
          </View>
        )}
        {data.medium_count > 0 && (
          <View style={[styles.chip, { backgroundColor: '#D9770610' }]}>
            <View style={[styles.chipDot, { backgroundColor: '#D97706' }]} />
            <Text style={[styles.chipText, { color: '#92400E' }]}>
              {data.medium_count} to review
            </Text>
          </View>
        )}
      </View>

      {/* Items */}
      <View style={[styles.itemList, { borderTopColor: border }]}>
        {visible.map((item, idx) => {
          const meta = KIND_META[item.kind] || { icon: 'alert-circle-outline', label: item.kind };
          const isHigh = item.severity === 'high';
          return (
            <TouchableOpacity
              key={`${item.kind}-${item.ref_id || idx}`}
              style={[
                styles.itemRow,
                idx < visible.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border },
              ]}
              activeOpacity={0.55}
              onPress={() => {
                try { routeForBriefItem(item, navigation); }
                catch (e) { /* nav can fail mid-transition; ignore */ }
              }}
            >
              <View style={[styles.itemIcon, { backgroundColor: isDark ? '#FFFFFF08' : '#0000000A' }]}>
                <Ionicons name={meta.icon} size={15} color={textS} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.itemSubject, { color: textP }]} numberOfLines={1}>
                  {item.subject}
                </Text>
                <Text style={[styles.itemKind, { color: textS }]} numberOfLines={1}>
                  {meta.label}{detailSuffix(item)}
                </Text>
              </View>
              <View style={[styles.tag, { backgroundColor: isHigh ? '#DC262612' : '#D9770612' }]}>
                <Text style={[styles.tagText, { color: isHigh ? '#991B1B' : '#92400E' }]}>
                  {isHigh ? 'URGENT' : 'REVIEW'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={textS} style={{ marginLeft: 6, opacity: 0.5 }} />
            </TouchableOpacity>
          );
        })}
      </View>

      {items.length > 3 && (
        <TouchableOpacity onPress={() => setExpanded(e => !e)} style={[styles.expand, { borderTopColor: border }]}>
          <Text style={[styles.expandText, { color: textP }]}>
            {expanded ? 'Show less' : `View ${items.length - 3} more`}
          </Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={textP} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24 && d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (hours < 48) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function detailSuffix(item) {
  const d = item?.detail || {};
  switch (item.kind) {
    case 'forgotten_clock_out':
      return d.hours_open ? ` · ${d.hours_open}h open` : '';
    case 'worker_silent':
      return d.days_clocked_30d ? ` · ${d.days_clocked_30d} days on site, no reports` : '';
    case 'budget_burn':
      return d.budget_used_pct != null ? ` · ${d.budget_used_pct}% used` : '';
    case 'project_stale':
      return d.days_since_activity ? ` · ${d.days_since_activity}d idle` : '';
    case 'invoice_overdue':
      return d.oldest_overdue_days ? ` · ${d.oldest_overdue_days}d overdue` : '';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  cardClean: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  accentStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  // ---- header ----
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  timestamp: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  // ---- chips ----
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  // ---- items ----
  itemList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  itemIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemSubject: {
    fontSize: 13.5,
    fontWeight: '600',
    letterSpacing: -0.1,
    marginBottom: 2,
  },
  itemKind: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 8,
  },
  tagText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  // ---- expand ----
  expand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  // ---- clean / empty state ----
  cleanRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
