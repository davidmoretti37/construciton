/**
 * AuditTrail
 *
 * Collapsible "history" section that lives on entity detail screens
 * (project, estimate, invoice, customer). Loads /api/audit/entity/
 * lazily — only when the section is expanded — so the parent screen
 * isn't slowed down by a query nobody opens.
 *
 * Renders one row per audit entry with the actor name, the verb,
 * a human-readable diff, and a relative timestamp.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../config/api';
import { supabase } from '../lib/supabase';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { formatAuditEntry } from '../utils/auditDiff';

const RELATIVE_THRESHOLDS = [
  { limit: 60, divisor: 1, unit: 'second' },
  { limit: 3600, divisor: 60, unit: 'minute' },
  { limit: 86400, divisor: 3600, unit: 'hour' },
  { limit: 604800, divisor: 86400, unit: 'day' },
];

function formatRelative(iso, t) {
  if (!iso) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  for (const { limit, divisor, unit } of RELATIVE_THRESHOLDS) {
    if (diffSec < limit) {
      const n = Math.max(1, Math.floor(diffSec / divisor));
      return t('audit.relative', { count: n, unit: t(`audit.units.${unit}${n === 1 ? '' : 's'}`) });
    }
  }
  // Fall back to a YYYY-MM-DD date for anything older than a week.
  return new Date(iso).toLocaleDateString();
}

export default function AuditTrail({ entityType, entityId, defaultExpanded = false }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = makeStyles(Colors);

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  const loadEntries = useCallback(async () => {
    if (!entityType || !entityId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const resp = await fetch(
        `${API_URL}/api/audit/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'X-Client': 'mobile',
          },
        },
      );
      // Soft-fail on 404 / 403: backend route missing on a stale deploy or
      // tenant scope unresolved → render the empty state, not an error.
      if (resp.status === 404 || resp.status === 403) {
        setEntries([]);
        return;
      }
      if (!resp.ok) throw new Error('couldnt_load');
      const json = await resp.json();
      setEntries(json.entries || []);
    } catch (e) {
      setError('couldnt_load');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && entries === null && !loading) {
      loadEntries();
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={toggle} activeOpacity={0.7}>
        <View style={styles.headerLeft}>
          <Ionicons name="time-outline" size={18} color={Colors.text} />
          <Text style={styles.title}>{t('audit.title')}</Text>
          {entries !== null && (
            <Text style={styles.count}>{entries.length}</Text>
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {loading && (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={Colors.text} />
            </View>
          )}
          {error && !loading && (
            <View style={styles.center}>
              <Text style={styles.errorText}>{t('audit.couldntLoad', "Couldn't load activity history")}</Text>
              <TouchableOpacity onPress={loadEntries}>
                <Text style={styles.retryText}>{t('buttons.retry')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {!loading && !error && entries && entries.length === 0 && (
            <Text style={styles.emptyText}>{t('audit.empty')}</Text>
          )}
          {!loading && !error && entries && entries.length > 0 && (
            <ScrollView style={styles.list} nestedScrollEnabled>
              {entries.map((entry) => (
                <AuditRow key={entry.id} entry={entry} t={t} Colors={Colors} />
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

function AuditRow({ entry, t, Colors }) {
  const styles = makeStyles(Colors);
  const headline = formatAuditEntry(entry, t);
  const actor = entry.actor_name || t('audit.system');
  const when = formatRelative(entry.created_at, t);

  // Colour the action verb.
  const verbColour = entry.action === 'delete' ? Colors.error
    : entry.action === 'create' ? Colors.success
      : Colors.text;

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={[styles.actor, { color: verbColour }]} numberOfLines={1}>
          {t('audit.by', { actor })}
        </Text>
        <Text style={styles.when}>{when}</Text>
      </View>
      <Text style={styles.headline} numberOfLines={3}>
        {headline}
      </Text>
      {entry.changes && entry.changes.length > 0 && (
        <View style={styles.changes}>
          {entry.changes.slice(0, 4).map((c, i) => (
            <Text key={i} style={styles.changeLine} numberOfLines={2}>
              <Text style={styles.field}>{c.field}: </Text>
              <Text>
                {formatValue(c.before)} → {formatValue(c.after)}
              </Text>
            </Text>
          ))}
          {entry.changes.length > 4 && (
            <Text style={styles.moreText}>
              +{entry.changes.length - 4} {t('audit.moreChanges')}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function formatValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  if (typeof v === 'string' && v.length > 60) return `${v.slice(0, 57)}…`;
  return String(v);
}

const makeStyles = (Colors) =>
  StyleSheet.create({
    container: {
      backgroundColor: Colors.cardBackground,
      borderRadius: BorderRadius.lg,
      marginHorizontal: Spacing.lg,
      marginVertical: Spacing.md,
      overflow: 'hidden',
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: Spacing.lg,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      fontSize: FontSizes.body,
      fontWeight: '600',
      color: Colors.text,
    },
    count: {
      fontSize: FontSizes.small,
      color: Colors.textSecondary,
      marginLeft: 4,
    },
    body: {
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.lg,
    },
    list: {
      maxHeight: 360,
    },
    row: {
      paddingVertical: Spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: Colors.border,
    },
    rowHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    actor: {
      fontSize: FontSizes.small,
      fontWeight: '600',
      flex: 1,
      marginRight: 8,
    },
    when: {
      fontSize: FontSizes.small,
      color: Colors.textSecondary,
    },
    headline: {
      fontSize: FontSizes.small,
      color: Colors.text,
      lineHeight: 18,
    },
    changes: {
      marginTop: 4,
      paddingLeft: 8,
    },
    changeLine: {
      fontSize: FontSizes.small,
      color: Colors.textSecondary,
      lineHeight: 18,
    },
    field: {
      fontWeight: '600',
      color: Colors.text,
    },
    moreText: {
      fontSize: FontSizes.small,
      color: Colors.textSecondary,
      fontStyle: 'italic',
      marginTop: 2,
    },
    center: {
      alignItems: 'center',
      paddingVertical: Spacing.lg,
    },
    errorText: {
      fontSize: FontSizes.small,
      color: Colors.error,
      marginBottom: 8,
    },
    retryText: {
      fontSize: FontSizes.small,
      color: Colors.primary,
      fontWeight: '600',
    },
    emptyText: {
      fontSize: FontSizes.small,
      color: Colors.textSecondary,
      paddingVertical: Spacing.lg,
      textAlign: 'center',
    },
  });
