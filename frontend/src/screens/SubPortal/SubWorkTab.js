/**
 * SubWorkTab — "Jobs" tab. Single purpose: list this sub's engagements
 * grouped by lifecycle status. Tap a card → SubEngagementDetail (where
 * the bid attachments, scope, schedule, tasks, invoices, and payments
 * for that job all live).
 *
 * Bids you've submitted live inside each accepted engagement; open bid
 * invitations come through the Home inbox.
 *
 * Footer: "Send a proposal" CTA — for proactively pitching a contractor.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { LightColors, DarkColors } from '../../constants/theme';
import * as api from '../../services/subPortalService';

const SUB_VIOLET = '#8B5CF6';

export default function SubWorkTab({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [engagements, setEngagements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const e = await api.listMyEngagements().catch(() => []);
      setEngagements(e);
    } catch (e) {
      console.warn('[SubWorkTab] load:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={SUB_VIOLET} />
      </View>
    );
  }

  // Group engagements by lifecycle phase
  const upcoming = [];
  const active = [];
  const completed = [];
  const cancelled = [];
  for (const e of engagements) {
    const s = e.status;
    if (s === 'cancelled') cancelled.push(e);
    else if (s === 'closed_out' || s === 'substantially_complete') completed.push(e);
    else if (s === 'mobilized' || s === 'in_progress') active.push(e);
    else upcoming.push(e);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.secondaryText} />}
    >
      <Text style={styles.headerTitle}>Jobs</Text>
      <Text style={styles.headerSub}>
        {engagements.length === 0
          ? "Jobs you've been hired for show up here."
          : `${engagements.length} job${engagements.length === 1 ? '' : 's'}`}
      </Text>

      {engagements.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="briefcase-outline" size={26} color={Colors.secondaryText} />
          </View>
          <Text style={styles.emptyTitle}>No jobs yet</Text>
          <Text style={styles.emptyBody}>
            Once a contractor accepts a bid, the job lands here with all the docs, dates, and tasks for the work.
          </Text>
        </View>
      ) : (
        <>
          <Group title="In progress"  items={active}    accent="#10B981" navigation={navigation} Colors={Colors} styles={styles} />
          <Group title="Upcoming"     items={upcoming}  accent="#3B82F6" navigation={navigation} Colors={Colors} styles={styles} />
          <Group title="Completed"    items={completed} accent="#6B7280" navigation={navigation} Colors={Colors} styles={styles} muted />
          <Group title="Cancelled"    items={cancelled} accent="#DC2626" navigation={navigation} Colors={Colors} styles={styles} muted />
        </>
      )}

      {/* Pitch a contractor — secondary action at the bottom */}
      <View style={{ marginTop: 30 }}>
        <Text style={styles.sectionTitle}>Looking for work?</Text>
        <TouchableOpacity
          style={styles.proposeCta}
          activeOpacity={0.7}
          onPress={() => navigation?.navigate?.('SubProposalCreator')}
        >
          <View style={styles.proposeCtaIcon}>
            <Ionicons name="paper-plane-outline" size={18} color={SUB_VIOLET} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.proposeCtaTitle}>Send a proposal</Text>
            <Text style={styles.proposeCtaBody}>
              Reach out to a contractor with your scope, price, and timeline.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
        </TouchableOpacity>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function Group({ title, items, accent, muted, navigation, Colors, styles }) {
  if (!items?.length) return null;
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((e) => (
        <TouchableOpacity
          key={e.id}
          style={[styles.jobCard, muted && { opacity: 0.85 }]}
          activeOpacity={0.7}
          onPress={() => navigation?.navigate?.('SubEngagementDetail', { engagementId: e.id })}
        >
          <View style={[styles.jobAccent, { backgroundColor: accent }]} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.jobTitle} numberOfLines={1}>{e.trade || 'Job'}</Text>
            <Text style={styles.jobProject} numberOfLines={1}>
              {e.project?.name || 'Project'}
              {e.gc_business_name ? `  ·  ${e.gc_business_name}` : ''}
            </Text>
            <View style={styles.jobMetaRow}>
              {formatDates(e) ? (
                <View style={styles.jobMetaChip}>
                  <Ionicons name="calendar-outline" size={11} color={Colors.secondaryText} />
                  <Text style={styles.jobMetaText}>{formatDates(e)}</Text>
                </View>
              ) : null}
              {e.contract_amount ? (
                <View style={styles.jobMetaChip}>
                  <Ionicons name="cash-outline" size={11} color={Colors.secondaryText} />
                  <Text style={styles.jobMetaText}>${Number(e.contract_amount).toLocaleString()}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} style={{ marginRight: 4 }} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function formatDates(e) {
  const start = e.mobilization_date || e.contracted_at || e.awarded_at || e.project?.start_date || null;
  const end = e.completion_target_date || e.completed_at || e.project?.end_date || null;
  if (!start && !end) return null;
  const fmt = (s) => s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '?';
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `Started ${fmt(start)}`;
  return `Due ${fmt(end)}`;
}

const makeStyles = (Colors) => StyleSheet.create({
  scroll: { padding: 18, paddingBottom: 120 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 26, fontWeight: '700', color: Colors.primaryText },
  headerSub: { fontSize: 13, color: Colors.secondaryText, marginTop: 4, marginBottom: 14 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.secondaryText,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  emptyCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 14, padding: 24,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.primaryText, marginBottom: 6 },
  emptyBody: { fontSize: 13, color: Colors.secondaryText, textAlign: 'center', lineHeight: 19 },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    paddingVertical: 12,
    paddingRight: 8,
    marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  jobAccent: { width: 4, alignSelf: 'stretch' },
  jobTitle: { fontSize: 15, fontWeight: '600', color: Colors.primaryText, textTransform: 'capitalize' },
  jobProject: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  jobMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  jobMetaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3,
    backgroundColor: Colors.background,
    borderRadius: 5,
  },
  jobMetaText: { fontSize: 11, color: Colors.secondaryText, fontWeight: '600' },
  proposeCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  proposeCtaIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: SUB_VIOLET + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  proposeCtaTitle: { color: Colors.primaryText, fontSize: 14, fontWeight: '600' },
  proposeCtaBody: { color: Colors.secondaryText, fontSize: 12, marginTop: 2 },
});
