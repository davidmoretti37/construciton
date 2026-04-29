/**
 * AuditLogScreen
 *
 * Owner-facing full-text audit log with filters. Shows the last N
 * write operations across the company; the filter chips narrow by
 * entity type, action, and date range. Tapping a row expands to
 * show the full diff.
 *
 * Performance: server caps at 200 rows per query, the screen
 * defaults to 50 and refreshes via pull-to-refresh.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { API_URL } from '../../config/api';
import { supabase } from '../../lib/supabase';
import { formatAuditEntry } from '../../utils/auditDiff';

const ENTITY_FILTERS = [
  { id: null, labelKey: 'audit.filters.all' },
  { id: 'project', labelKey: 'audit.entityTypes.project' },
  { id: 'estimate', labelKey: 'audit.entityTypes.estimate' },
  { id: 'invoice', labelKey: 'audit.entityTypes.invoice' },
  { id: 'customer', labelKey: 'audit.entityTypes.customer' },
  { id: 'worker', labelKey: 'audit.entityTypes.worker' },
  { id: 'transaction', labelKey: 'audit.entityTypes.transaction' },
  { id: 'time_entry', labelKey: 'audit.entityTypes.time_entry' },
  { id: 'service_plan', labelKey: 'audit.entityTypes.service_plan' },
  { id: 'visit', labelKey: 'audit.entityTypes.visit' },
];

const ACTION_FILTERS = [
  { id: null, labelKey: 'audit.filters.allActions' },
  { id: 'create', labelKey: 'audit.actions.create' },
  { id: 'update', labelKey: 'audit.actions.update' },
  { id: 'delete', labelKey: 'audit.actions.delete' },
];

const DATE_RANGES = [
  { id: 'today', labelKey: 'audit.dateRanges.today' },
  { id: '7d', labelKey: 'audit.dateRanges.7d' },
  { id: '30d', labelKey: 'audit.dateRanges.30d' },
  { id: 'all', labelKey: 'audit.dateRanges.all' },
];

function dateRangeBounds(range) {
  if (range === 'all') return {};
  const now = new Date();
  const end = now.toISOString();
  if (range === 'today') {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    return { start: s.toISOString(), end };
  }
  const days = range === '7d' ? 7 : 30;
  const s = new Date(now); s.setDate(s.getDate() - days);
  return { start: s.toISOString(), end };
}

export default function AuditLogScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
  const styles = makeStyles(Colors);

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [entityFilter, setEntityFilter] = useState(null);
  const [actionFilter, setActionFilter] = useState(null);
  const [dateRange, setDateRange] = useState('7d');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const params = new URLSearchParams();
      params.set('limit', '100');
      if (entityFilter) params.set('entity_type', entityFilter);
      if (actionFilter) params.set('action', actionFilter);
      const { start, end } = dateRangeBounds(dateRange);
      if (start) params.set('start_date', start);
      if (end) params.set('end_date', end);

      const resp = await fetch(`${API_URL}/api/audit/recent?${params}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Client': 'mobile',
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setEntries(json.entries || []);
    } catch (e) {
      setError(e.message || 'Failed to load audit log');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [entityFilter, actionFilter, dateRange]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = search
    ? entries.filter((e) => {
      const haystack = `${e.actor_name || ''} ${e.entity_type} ${e.action} ${JSON.stringify(e.changes || []).slice(0, 500)}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    })
    : entries;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('audit.title')}</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('audit.searchPlaceholder')}
          placeholderTextColor={Colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {ENTITY_FILTERS.map((f) => (
          <FilterChip
            key={String(f.id)}
            label={t(f.labelKey)}
            active={entityFilter === f.id}
            onPress={() => setEntityFilter(f.id)}
            Colors={Colors}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {ACTION_FILTERS.map((f) => (
          <FilterChip
            key={String(f.id)}
            label={t(f.labelKey)}
            active={actionFilter === f.id}
            onPress={() => setActionFilter(f.id)}
            Colors={Colors}
          />
        ))}
        {DATE_RANGES.map((f) => (
          <FilterChip
            key={f.id}
            label={t(f.labelKey)}
            active={dateRange === f.id}
            onPress={() => setDateRange(f.id)}
            Colors={Colors}
          />
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.text} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('buttons.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="time-outline" size={40} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>{t('audit.empty')}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={Colors.text}
            />
          }
        >
          {filtered.map((entry) => (
            <AuditEntryRow
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              Colors={Colors}
              t={t}
            />
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function FilterChip({ label, active, onPress, Colors }) {
  return (
    <TouchableOpacity
      style={[
        chipStyles.chip,
        {
          backgroundColor: active ? Colors.primary : Colors.cardBackground,
          borderColor: active ? Colors.primary : Colors.border,
        },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          chipStyles.chipText,
          { color: active ? '#FFFFFF' : Colors.text },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function AuditEntryRow({ entry, expanded, onToggle, Colors, t }) {
  const styles = makeStyles(Colors);
  const headline = formatAuditEntry(entry, t);
  const actor = entry.actor_name || t('audit.system');
  const when = new Date(entry.created_at).toLocaleString();

  const verbColour = entry.action === 'delete' ? Colors.error
    : entry.action === 'create' ? Colors.success
      : Colors.text;

  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={styles.entry}>
      <View style={styles.entryHead}>
        <View style={[styles.actionBadge, { backgroundColor: verbColour + '22', borderColor: verbColour }]}>
          <Text style={[styles.actionBadgeText, { color: verbColour }]}>
            {t(`audit.actions.${entry.action}`, { defaultValue: entry.action })}
          </Text>
        </View>
        <Text style={styles.entityLabel}>
          {t(`audit.entityTypes.${entry.entity_type}`, { defaultValue: entry.entity_type })}
        </Text>
        <Text style={styles.when}>{when}</Text>
      </View>
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.actor}>{t('audit.by', { actor })}</Text>

      {expanded && entry.changes && entry.changes.length > 0 && (
        <View style={styles.diff}>
          {entry.changes.map((c, i) => (
            <View key={i} style={styles.diffRow}>
              <Text style={styles.diffField}>{c.field}</Text>
              <Text style={styles.diffValue}>
                {formatVal(c.before)} → {formatVal(c.after)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

function formatVal(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
  if (typeof v === 'string' && v.length > 80) return `${v.slice(0, 77)}…`;
  return String(v);
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

const makeStyles = (Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.medium,
    paddingTop: Spacing.medium,
    paddingBottom: Spacing.small,
  },
  title: {
    fontSize: FontSizes.large,
    fontWeight: '700',
    color: Colors.text,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.medium,
    paddingVertical: Spacing.small,
    marginHorizontal: Spacing.medium,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.medium,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.medium,
    color: Colors.text,
  },
  chipRow: {
    paddingHorizontal: Spacing.medium,
    paddingVertical: Spacing.small,
  },
  list: {
    paddingHorizontal: Spacing.medium,
  },
  entry: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.medium,
    padding: Spacing.medium,
    marginBottom: Spacing.small,
  },
  entryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  entityLabel: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    fontWeight: '600',
    flex: 1,
  },
  when: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
  },
  headline: {
    fontSize: FontSizes.medium,
    color: Colors.text,
    marginBottom: 4,
  },
  actor: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
  },
  diff: {
    marginTop: Spacing.small,
    paddingTop: Spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  diffRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  diffField: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    color: Colors.text,
    width: 140,
  },
  diffValue: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.large,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSizes.medium,
    marginBottom: Spacing.medium,
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  retryText: {
    color: Colors.primary,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: FontSizes.medium,
    color: Colors.textSecondary,
    marginTop: Spacing.medium,
  },
});
