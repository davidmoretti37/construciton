/**
 * SubHomeTab — landing page for the sub portal.
 *
 * Shows: pending action items, recent activity, profile summary card,
 * Upgrade-to-Sylk-Owner banner.
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

export default function SubHomeTab() {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [profile, setProfile] = useState(null);
  const [subOrg, setSubOrg] = useState(null);
  const [docs, setDocs] = useState([]);
  const [bids, setBids] = useState({ open_invitations: [], my_bids: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await api.getMe();
      setProfile(me.profile);
      setSubOrg(me.sub_organization);
      if (me.sub_organization?.id) {
        try {
          const list = await api.listMyDocuments(me.sub_organization.id);
          setDocs(list);
        } catch (_) { setDocs([]); }
      }
      try { setBids(await api.listMyBids()); } catch (_) {}
    } catch (e) {
      console.warn('[SubHomeTab] load:', e.message);
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

  // Pending action items
  const pending = [];
  const now = new Date();
  for (const d of docs) {
    if (!d.expires_at) continue;
    const days = Math.floor((new Date(d.expires_at) - now) / 86400000);
    if (days <= 30) {
      pending.push({
        key: `doc-${d.id}`,
        kind: days < 0 ? 'expired' : 'expiring',
        title: `${d.doc_type.toUpperCase()} ${days < 0 ? 'expired' : `expires in ${days}d`}`,
        body: 'Tap to upload renewed copy.',
        icon: days < 0 ? 'close-circle-outline' : 'alert-circle-outline',
        color: days < 0 ? Colors.errorRed : Colors.warningOrange,
      });
    }
  }
  for (const inv of (bids.open_invitations || [])) {
    pending.push({
      key: `bid-${inv.id}`,
      kind: 'bid_invite',
      title: `Bid invitation: ${inv.trade}`,
      body: inv.scope_summary?.slice(0, 80) || 'Tap to view scope and submit.',
      icon: 'mail-outline',
      color: Colors.primaryBlue,
    });
  }

  const isFreeTier = profile?.subscription_tier === 'free';

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
      }
    >
      {/* Profile summary card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(subOrg?.legal_name || 'S').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.profileName}>{subOrg?.legal_name || 'My business'}</Text>
          <Text style={styles.profileMeta}>{(subOrg?.trades || []).join(', ') || 'Set your trades'}</Text>
        </View>
        <TouchableOpacity onPress={() => {/* nav to profile edit */ }}>
          <Ionicons name="settings-outline" size={22} color={Colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Upgrade banner — Free tier only */}
      {isFreeTier && (
        <View style={styles.upgradeBanner}>
          <Ionicons name="rocket-outline" size={28} color="#fff" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.upgradeTitle}>Run your own jobs through Sylk</Text>
            <Text style={styles.upgradeBody}>
              Track customers, send invoices, manage your crew. Free for 14 days.
            </Text>
          </View>
          <TouchableOpacity style={styles.upgradeBtn}>
            <Text style={styles.upgradeBtnText}>Try free</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pending actions */}
      <Text style={styles.sectionTitle}>Action items</Text>
      {pending.length === 0 ? (
        <Text style={styles.emptyText}>You're all caught up. 🎉</Text>
      ) : (
        pending.map((p) => (
          <View key={p.key} style={[styles.actionCard, { borderLeftColor: p.color }]}>
            <Ionicons name={p.icon} size={22} color={p.color} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.actionTitle}>{p.title}</Text>
              <Text style={styles.actionBody}>{p.body}</Text>
            </View>
          </View>
        ))
      )}

      {/* Recent activity */}
      <Text style={styles.sectionTitle}>Recent</Text>
      {(bids.my_bids || []).slice(0, 5).map((b) => (
        <View key={b.id} style={styles.activityCard}>
          <Text style={styles.activityTitle}>
            ${Number(b.amount).toLocaleString()} bid · {b.bid_request?.trade || ''}
          </Text>
          <Text style={styles.activityMeta}>{b.status}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (Colors) => StyleSheet.create({
  scroll: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 16,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryBlue,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  profileName: { fontSize: 16, fontWeight: '700', color: Colors.primaryText },
  profileMeta: { fontSize: 13, color: Colors.secondaryText, marginTop: 2 },
  upgradeBanner: {
    backgroundColor: Colors.accent || '#8B5CF6',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  upgradeTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  upgradeBody: { color: '#fff', opacity: 0.9, fontSize: 12, marginTop: 2 },
  upgradeBtn: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  upgradeBtnText: { color: '#5B21B6', fontWeight: '700', fontSize: 13 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.secondaryText,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 8,
  },
  emptyText: { color: Colors.secondaryText, fontSize: 14, paddingVertical: 8 },
  actionCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    marginBottom: 8,
  },
  actionTitle: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  actionBody: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  activityCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  activityTitle: { fontSize: 14, color: Colors.primaryText, fontWeight: '600' },
  activityMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
});
