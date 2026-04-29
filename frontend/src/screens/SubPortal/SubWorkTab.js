/**
 * SubWorkTab — combined view of engagements, bids, invoices, payments.
 *
 * Internal sub-filter chips at top to narrow the list.
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

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'engagements', label: 'Engagements' },
  { key: 'bids', label: 'Bids' },
  { key: 'invoices', label: 'Invoices' },
];

export default function SubWorkTab() {
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
        api.listMyEngagements(),
        api.listMyBids(),
        api.listMyInvoices(),
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
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.headerTitle}>Work</Text>

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.chip,
                isActive && { backgroundColor: Colors.primaryBlue, borderColor: Colors.primaryBlue },
              ]}
            >
              <Text style={[styles.chipText, isActive && { color: '#fff' }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Engagements */}
      {(filter === 'all' || filter === 'engagements') && (
        <>
          <Text style={styles.sectionTitle}>Engagements</Text>
          {engagements.length === 0 && (
            <Text style={styles.emptyText}>No active engagements yet.</Text>
          )}
          {engagements.map((e) => (
            <View key={e.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{e.trade}</Text>
                <Text style={[styles.statusPill, { color: Colors.primaryBlue }]}>{e.status}</Text>
              </View>
              <Text style={styles.cardMeta}>
                {e.contract_amount ? `$${Number(e.contract_amount).toLocaleString()}` : 'No amount set'}
                {e.payment_terms ? ` · ${e.payment_terms.replace(/_/g, ' ')}` : ''}
              </Text>
              {e.scope_summary && <Text style={styles.cardBody}>{e.scope_summary.slice(0, 120)}</Text>}
            </View>
          ))}
        </>
      )}

      {/* Bid invitations */}
      {(filter === 'all' || filter === 'bids') && (
        <>
          <Text style={styles.sectionTitle}>Open bid invitations</Text>
          {(bids.open_invitations || []).length === 0 && (
            <Text style={styles.emptyText}>No open invitations.</Text>
          )}
          {(bids.open_invitations || []).map((b) => (
            <View key={b.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{b.trade}</Text>
                {b.due_at && <Text style={styles.cardMeta}>Due {new Date(b.due_at).toLocaleDateString()}</Text>}
              </View>
              {b.scope_summary && <Text style={styles.cardBody}>{b.scope_summary.slice(0, 140)}</Text>}
            </View>
          ))}

          <Text style={styles.sectionTitle}>My bids</Text>
          {(bids.my_bids || []).length === 0 && (
            <Text style={styles.emptyText}>No bids submitted yet.</Text>
          )}
          {(bids.my_bids || []).map((b) => (
            <View key={b.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>${Number(b.amount).toLocaleString()}</Text>
                <Text style={[styles.statusPill, { color: pillColor(b.status, Colors) }]}>{b.status}</Text>
              </View>
              <Text style={styles.cardMeta}>{b.bid_request?.trade} — {b.bid_request?.scope_summary?.slice(0, 100)}</Text>
            </View>
          ))}
        </>
      )}

      {/* Invoices */}
      {(filter === 'all' || filter === 'invoices') && (
        <>
          <Text style={styles.sectionTitle}>Invoices sent</Text>
          {invoices.length === 0 && <Text style={styles.emptyText}>No invoices yet.</Text>}
          {invoices.map((inv) => (
            <View key={inv.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>${Number(inv.total_amount).toLocaleString()}</Text>
                <Text style={[styles.statusPill, { color: pillColor(inv.status, Colors) }]}>{inv.status}</Text>
              </View>
              <Text style={styles.cardMeta}>
                {inv.engagement?.trade || ''} · invoice {inv.invoice_number || `#${inv.id.slice(0, 6)}`}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function pillColor(status, Colors) {
  if (status === 'accepted' || status === 'paid') return Colors.successGreen;
  if (status === 'declined' || status === 'rejected' || status === 'void') return Colors.errorRed;
  if (status === 'draft' || status === 'submitted' || status === 'sent') return Colors.primaryBlue;
  if (status === 'partial_paid') return Colors.warningOrange;
  return Colors.secondaryText;
}

const makeStyles = (Colors) => StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 80 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.primaryText, marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBackground,
  },
  chipText: { fontSize: 13, color: Colors.primaryText, fontWeight: '500' },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.secondaryText,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 8,
  },
  emptyText: { color: Colors.secondaryText, fontSize: 14, paddingVertical: 6 },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.primaryText },
  cardMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 4 },
  cardBody: { fontSize: 13, color: Colors.primaryText, marginTop: 6 },
  statusPill: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
});
