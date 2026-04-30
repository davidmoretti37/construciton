/**
 * SubHomeTab — landing page for the sub portal.
 *
 * Shows: pending action items (inbound requests + expiring docs + bid invites),
 * profile summary, recent activity. Tapping a doc-request action opens the
 * upload flow with the doc_type prefilled and the action_token_id ready to
 * consume on success.
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

const DOC_LABEL = {
  w9: 'W-9', coi_gl: 'General Liability COI', coi_wc: 'Workers Comp COI',
  coi_auto: 'Auto COI', coi_umbrella: 'Umbrella COI',
  ai_endorsement: 'Additional Insured Endorsement', license_state: 'State License',
  license_business: 'Business License', drug_policy: 'Drug Testing Policy',
};

export default function SubHomeTab({ navigation, onNavigateTab }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [profile, setProfile] = useState(null);
  const [subOrg, setSubOrg] = useState(null);
  const [docs, setDocs] = useState([]);
  const [bids, setBids] = useState({ open_invitations: [], my_bids: [] });
  const [pendingRequests, setPendingRequests] = useState([]);
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
      try { setPendingRequests(await api.listPendingRequests()); } catch (_) { setPendingRequests([]); }
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
        <ActivityIndicator size="large" color={SUB_VIOLET} />
      </View>
    );
  }

  // Build action items list
  const pending = [];

  for (const r of pendingRequests) {
    if (r.scope === 'upload_doc') {
      const docName = DOC_LABEL[r.doc_type_requested] || (r.doc_type_requested || '').toUpperCase();
      pending.push({
        key: `req-${r.id}`,
        kind: 'doc_request',
        title: r.sender_name ? `${r.sender_name} requested your ${docName}` : `Document requested: ${docName}`,
        body: 'Tap to upload — snap a photo or pick a PDF.',
        icon: 'document-attach-outline',
        color: SUB_VIOLET,
        onPress: () => navigation?.navigate?.('SubUpload', {
          docType: r.doc_type_requested,
          actionTokenId: r.id,
        }),
      });
    } else if (r.scope === 'sign_contract') {
      pending.push({
        key: `req-${r.id}`,
        kind: 'sign_contract',
        title: r.sender_name ? `${r.sender_name} sent a contract to sign` : 'Contract awaiting your signature',
        body: 'Tap to review and sign.',
        icon: 'create-outline',
        color: '#3B82F6',
      });
    } else if (r.scope === 'submit_bid') {
      pending.push({
        key: `req-${r.id}`,
        kind: 'submit_bid',
        title: r.sender_name ? `${r.sender_name} invited you to bid` : 'New bid invitation',
        body: 'Tap to view scope and submit.',
        icon: 'mail-outline',
        color: '#0EA5E9',
        onPress: r.bid_request_id
          ? () => navigation?.navigate?.('SubBidSubmit', { bidRequestId: r.bid_request_id })
          : () => onNavigateTab?.('work'),
      });
    }
  }

  const now = new Date();
  for (const d of docs) {
    if (!d.expires_at) continue;
    const days = Math.floor((new Date(d.expires_at) - now) / 86400000);
    if (days <= 30) {
      pending.push({
        key: `doc-${d.id}`,
        kind: days < 0 ? 'expired' : 'expiring',
        title: `${(DOC_LABEL[d.doc_type] || d.doc_type.toUpperCase())} ${days < 0 ? 'expired' : `expires in ${days}d`}`,
        body: 'Tap to upload renewed copy.',
        icon: days < 0 ? 'close-circle-outline' : 'alert-circle-outline',
        color: days < 0 ? '#DC2626' : '#F59E0B',
        onPress: () => onNavigateTab?.('documents'),
      });
    }
  }

  for (const inv of (bids.open_invitations || [])) {
    if (pending.some((p) => p.kind === 'submit_bid' && p.key.endsWith(inv.id))) continue;
    pending.push({
      key: `bid-${inv.id}`,
      kind: 'bid_invite',
      title: `Bid invitation: ${inv.trade}`,
      body: inv.scope_summary?.slice(0, 80) || 'Tap to view scope and submit.',
      icon: 'mail-outline',
      color: '#0EA5E9',
      onPress: () => navigation?.navigate?.('SubBidSubmit', { bidRequestId: inv.id }),
    });
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={SUB_VIOLET} />
      }
    >
      {/* Greeting */}
      <Text style={styles.greeting}>
        Hi, {(subOrg?.legal_name || 'there').split(' ')[0]}
      </Text>
      <Text style={styles.subGreeting}>Here's what needs your attention.</Text>

      {/* Profile summary card */}
      <TouchableOpacity
        style={styles.profileCard}
        activeOpacity={0.9}
        onPress={() => onNavigateTab?.('settings')}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(subOrg?.legal_name || 'S').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.profileName} numberOfLines={1}>
            {subOrg?.legal_name || 'My business'}
          </Text>
          <Text style={styles.profileMeta} numberOfLines={1}>
            {(subOrg?.trades || []).join(', ') || 'Set your trades'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={Colors.secondaryText} />
      </TouchableOpacity>

      {/* Action items */}
      <Text style={styles.sectionTitle}>Action items</Text>
      {pending.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle" size={28} color="#10B981" />
          <Text style={styles.emptyText}>You're all caught up.</Text>
        </View>
      ) : (
        pending.map((p) => (
          <TouchableOpacity
            key={p.key}
            activeOpacity={p.onPress ? 0.7 : 1}
            disabled={!p.onPress}
            onPress={p.onPress}
            style={[styles.actionCard, { borderLeftColor: p.color }]}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: p.color + '15' }]}>
              <Ionicons name={p.icon} size={20} color={p.color} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.actionTitle} numberOfLines={2}>{p.title}</Text>
              <Text style={styles.actionBody} numberOfLines={1}>{p.body}</Text>
            </View>
            {p.onPress && (
              <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
            )}
          </TouchableOpacity>
        ))
      )}

      {/* Recent activity */}
      {(bids.my_bids || []).length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent bids</Text>
          {(bids.my_bids || []).slice(0, 5).map((b) => (
            <View key={b.id} style={styles.activityCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityTitle}>
                  ${Number(b.amount).toLocaleString()} · {b.bid_request?.trade || 'Bid'}
                </Text>
                {b.bid_request?.scope_summary && (
                  <Text style={styles.activityMeta} numberOfLines={1}>
                    {b.bid_request.scope_summary}
                  </Text>
                )}
              </View>
              <Text style={[styles.activityStatus, { color: pillColor(b.status) }]}>
                {b.status}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function pillColor(status) {
  if (status === 'accepted' || status === 'paid') return '#10B981';
  if (status === 'declined' || status === 'rejected') return '#DC2626';
  if (status === 'submitted' || status === 'sent') return '#3B82F6';
  return '#6B7280';
}

const makeStyles = (Colors) => StyleSheet.create({
  scroll: { padding: 18, paddingBottom: 120 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  greeting: { fontSize: 26, fontWeight: '700', color: Colors.primaryText },
  subGreeting: { fontSize: 14, color: Colors.secondaryText, marginTop: 4, marginBottom: 18 },
  profileCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 8,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: SUB_VIOLET,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  profileName: { fontSize: 17, fontWeight: '700', color: Colors.primaryText },
  profileMeta: { fontSize: 13, color: Colors.secondaryText, marginTop: 3 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.secondaryText,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 10,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  emptyText: { color: Colors.primaryText, fontSize: 15, fontWeight: '500' },
  actionCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    marginBottom: 10,
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  actionIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  actionTitle: { fontSize: 14, fontWeight: '600', color: Colors.primaryText, lineHeight: 19 },
  actionBody: { fontSize: 12, color: Colors.secondaryText, marginTop: 3 },
  activityCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  activityTitle: { fontSize: 14, color: Colors.primaryText, fontWeight: '600' },
  activityMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  activityStatus: {
    fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.4, marginLeft: 10,
  },
});
