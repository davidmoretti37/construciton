/**
 * SubWorkTab — engagements, bids, invoices.
 *
 * Filter chips at the top narrow the list to a single section. Cards match
 * the visual language of the Home and Documents tabs.
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

const FILTERS = [
  { key: 'all',         label: 'All' },
  { key: 'engagements', label: 'Schedule' },
  { key: 'bids',        label: 'Bids' },
  { key: 'invoices',    label: 'Invoices' },
];

export default function SubWorkTab({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [filter, setFilter] = useState('all');
  const [engagements, setEngagements] = useState([]);
  const [bids, setBids] = useState({ open_invitations: [], my_bids: [] });
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [e, b, i] = await Promise.all([
        api.listMyEngagements().catch(() => []),
        api.listMyBids().catch(() => ({ open_invitations: [], my_bids: [] })),
        api.listMyInvoices().catch(() => []),
      ]);
      setEngagements(e);
      setBids(b);
      setInvoices(i);
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

  const showEngagements = filter === 'all' || filter === 'engagements';
  const showBids        = filter === 'all' || filter === 'bids';
  const showInvoices    = filter === 'all' || filter === 'invoices';

  const totalActive = engagements.length + (bids.open_invitations || []).length + (bids.my_bids || []).length + invoices.length;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={SUB_VIOLET} />
      }
    >
      <Text style={styles.headerTitle}>Work</Text>
      <Text style={styles.headerSub}>
        {totalActive === 0
          ? 'Nothing here yet — bids and active jobs will show up once a contractor sends you something.'
          : `${totalActive} item${totalActive === 1 ? '' : 's'} across your contractors.`}
      </Text>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.chip,
                isActive && { backgroundColor: SUB_VIOLET, borderColor: SUB_VIOLET },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, isActive && { color: '#fff', fontWeight: '700' }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Schedule — engagements grouped by lifecycle phase */}
      {showEngagements && (
        <ScheduleView engagements={engagements} Colors={Colors} styles={styles} />
      )}

      {/* Bid invitations */}
      {showBids && (
        <Section
          title="Open bid invitations"
          empty={(bids.open_invitations || []).length === 0 ? 'No open invitations.' : null}
          Colors={Colors}
        >
          {(bids.open_invitations || []).map((b) => (
            <TouchableOpacity
              key={b.id}
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => navigation?.navigate?.('SubBidSubmit', { bidRequestId: b.id })}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Ionicons name="mail-outline" size={20} color={Colors.primaryText} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{b.trade || 'Bid invitation'}</Text>
                  {b.due_at && (
                    <Text style={styles.cardMeta}>Due {new Date(b.due_at).toLocaleDateString()}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
              </View>
              {b.scope_summary ? (
                <Text style={styles.cardBody} numberOfLines={3}>{b.scope_summary}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </Section>
      )}

      {showBids && (
        <Section
          title="My bids"
          empty={(bids.my_bids || []).length === 0 ? 'No bids submitted yet.' : null}
          Colors={Colors}
        >
          {(bids.my_bids || []).map((b) => (
            <TouchableOpacity
              key={b.id}
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => navigation?.navigate?.('SubBidSubmit', { bidRequestId: b.bid_request?.id || b.bid_request_id })}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Ionicons name="paper-plane-outline" size={20} color={Colors.primaryText} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle}>${Number(b.amount).toLocaleString()}</Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {b.bid_request?.trade || ''}{b.bid_request?.scope_summary ? ' · ' + b.bid_request.scope_summary : ''}
                  </Text>
                </View>
                <StatusPill status={b.status} />
              </View>
            </TouchableOpacity>
          ))}
        </Section>
      )}

      {/* Invoices */}
      {showInvoices && (
        <Section
          title="Invoices sent"
          empty={invoices.length === 0 ? 'No invoices yet.' : null}
          Colors={Colors}
        >
          {invoices.map((inv) => (
            <View key={inv.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Ionicons name="cash-outline" size={20} color={Colors.primaryText} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle}>${Number(inv.total_amount).toLocaleString()}</Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {inv.engagement?.trade || ''} · {inv.invoice_number || `#${inv.id.slice(0, 6)}`}
                  </Text>
                </View>
                <StatusPill status={inv.status} />
              </View>
            </View>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function ScheduleView({ engagements, Colors, styles }) {
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

  if (engagements.length === 0) {
    return (
      <Section title="Schedule" empty="No scheduled work yet. When a contractor accepts your bid, the job lands here." Colors={Colors} />
    );
  }

  return (
    <View>
      <ScheduleGroup title="In progress" items={active}    accent="#10B981"           Colors={Colors} styles={styles} />
      <ScheduleGroup title="Upcoming"    items={upcoming}  accent="#3B82F6"           Colors={Colors} styles={styles} />
      <ScheduleGroup title="Completed"   items={completed} accent="#6B7280" muted     Colors={Colors} styles={styles} />
      <ScheduleGroup title="Cancelled"   items={cancelled} accent="#DC2626" muted     Colors={Colors} styles={styles} />
    </View>
  );
}

function ScheduleGroup({ title, items, accent, muted, Colors, styles }) {
  if (!items?.length) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[styles.sectionTitle, { marginTop: 0 }]}>{title}</Text>
      {items.map((e) => (
        <View key={e.id} style={[styles.scheduleCard, muted && { opacity: 0.85 }]}>
          <View style={[styles.scheduleAccent, { backgroundColor: accent }]} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.scheduleTitle}>{e.trade || 'Job'}</Text>
            <Text style={styles.scheduleProject} numberOfLines={1}>
              {e.project?.name || 'Project'}
              {e.gc_business_name ? `  ·  ${e.gc_business_name}` : ''}
            </Text>
            {e.project?.location ? (
              <Text style={styles.scheduleLocation} numberOfLines={1}>
                {e.project.location}
              </Text>
            ) : null}
            <View style={styles.scheduleMetaRow}>
              {formatScheduleDates(e) ? (
                <View style={styles.scheduleMetaChip}>
                  <Ionicons name="calendar-outline" size={12} color={Colors.secondaryText} />
                  <Text style={styles.scheduleMetaText}>{formatScheduleDates(e)}</Text>
                </View>
              ) : null}
              {e.contract_amount ? (
                <View style={styles.scheduleMetaChip}>
                  <Ionicons name="cash-outline" size={12} color={Colors.secondaryText} />
                  <Text style={styles.scheduleMetaText}>
                    ${Number(e.contract_amount).toLocaleString()}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function formatScheduleDates(e) {
  const start = e.mobilized_at || e.contracted_at || e.awarded_at || e.project?.start_date || null;
  const end = e.completed_at || e.closed_out_at || e.project?.end_date || null;
  if (!start && !end) return null;
  const fmt = (s) => s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '?';
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `Started ${fmt(start)}`;
  return `Due ${fmt(end)}`;
}

function Section({ title, empty, children, Colors }) {
  return (
    <View>
      <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>{title}</Text>
      {empty ? (
        <View style={[styles.emptyBlock, { backgroundColor: Colors.cardBackground }]}>
          <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>{empty}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

function StatusPill({ status }) {
  if (!status) return null;
  let bg = '#6B728020', fg = '#6B7280';
  if (status === 'accepted' || status === 'paid' || status === 'closed_out') { bg = '#10B98120'; fg = '#10B981'; }
  else if (status === 'declined' || status === 'rejected' || status === 'void') { bg = '#DC262620'; fg = '#DC2626'; }
  else if (status === 'submitted' || status === 'sent' || status === 'in_progress' || status === 'contracted') { bg = '#3B82F620'; fg = '#3B82F6'; }
  else if (status === 'partial_paid') { bg = '#F59E0B20'; fg = '#F59E0B'; }
  return (
    <View style={[pillStyles.wrap, { backgroundColor: bg }]}>
      <Text style={[pillStyles.text, { color: fg }]}>{status.replace(/_/g, ' ')}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  text: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
});

// Static styles used by Section helper
const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: 22, marginBottom: 10,
  },
  emptyBlock: {
    borderRadius: 12, paddingVertical: 16, paddingHorizontal: 14,
  },
  emptyText: { fontSize: 14 },
});

const makeStyles = (Colors) => StyleSheet.create({
  scroll: { padding: 18, paddingBottom: 120 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 26, fontWeight: '700', color: Colors.primaryText },
  headerSub: { fontSize: 14, color: Colors.secondaryText, marginTop: 4, marginBottom: 16, lineHeight: 20 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, paddingRight: 8 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBackground,
  },
  chipText: { fontSize: 13, color: Colors.primaryText, fontWeight: '500' },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  cardIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.primaryText, textTransform: 'capitalize' },
  cardMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  cardBody: { fontSize: 13, color: Colors.primaryText, marginTop: 10, lineHeight: 19 },
  // Schedule card (mirrors GC SubcontractorDetailScreen style)
  scheduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    paddingVertical: 12,
    paddingRight: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  scheduleAccent: { width: 4, alignSelf: 'stretch' },
  scheduleTitle: { fontSize: 14, fontWeight: '600', color: Colors.primaryText, textTransform: 'capitalize' },
  scheduleProject: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  scheduleLocation: { fontSize: 11, color: Colors.secondaryText, marginTop: 2 },
  scheduleMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  scheduleMetaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: Colors.background,
    borderRadius: 5,
  },
  scheduleMetaText: { fontSize: 11, color: Colors.secondaryText, fontWeight: '600' },
});
