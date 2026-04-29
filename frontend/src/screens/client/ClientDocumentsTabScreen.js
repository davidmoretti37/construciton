// ClientDocumentsTabScreen — replaces the Messages tab.
// Two sections:
//   1. ACTIVITY — feed of "what happened" (signed estimate, paid invoice,
//      approved CO, sent draw invoice). Pulled from approval_events / billing.
//   2. DOCUMENTS — every PDF / file shared with the client.

import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fetchDashboard, fetchProjectBilling } from '../../services/clientPortalApi';
import { supabase } from '../../lib/supabase';
import ClientHeader from '../../components/ClientHeader';

const C = {
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
  green: '#10B981', greenBg: '#D1FAE5', greenText: '#065F46',
  blue: '#3B82F6', blueBg: '#DBEAFE',
  red: '#EF4444', redBg: '#FEE2E2',
};

const fetchDocuments = async (projectId) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return [];
  const { API_URL } = require('../../config/api');
  const res = await fetch(`${API_URL}/api/portal/projects/${projectId}/documents`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) return [];
  return res.json();
};

const fetchApprovals = async (projectId) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return [];
  const { API_URL } = require('../../config/api');
  const res = await fetch(`${API_URL}/api/portal/projects/${projectId}/approvals`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) return [];
  return res.json();
};

const ACTIVITY_VISUAL = {
  approved:        { icon: 'checkmark-circle', color: C.green,    label: 'Approved' },
  signed_off:      { icon: 'create-outline',   color: C.blue,     label: 'Signed' },
  sent:            { icon: 'paper-plane-outline', color: C.amber, label: 'Sent' },
  viewed:          { icon: 'eye-outline',      color: C.textSec,  label: 'Viewed' },
  paid:            { icon: 'cash-outline',     color: C.green,    label: 'Paid' },
  rejected:        { icon: 'close-circle',     color: C.red,      label: 'Declined' },
  changes_requested: { icon: 'alert-circle',   color: C.amber,    label: 'Changes requested' },
};

const ENTITY_LABEL = {
  estimate: 'Estimate',
  invoice: 'Invoice',
  change_order: 'Change Order',
  phase: 'Phase',
  material_selection: 'Material',
};

function ActivityRow({ event }) {
  const v = ACTIVITY_VISUAL[event.action] || ACTIVITY_VISUAL.viewed;
  const entityLabel = ENTITY_LABEL[event.entity_type] || event.entity_type;
  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: v.color + '20' }]}>
        <Ionicons name={v.icon} size={16} color={v.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.activityTitle}>
          {entityLabel} {v.label.toLowerCase()}
          {event.actor_type === 'client' ? ' by you' : ''}
        </Text>
        <Text style={styles.activitySub} numberOfLines={2}>
          {event.notes || `${entityLabel} ${event.entity_id?.slice(0, 8)}`} · {new Date(event.created_at).toLocaleDateString()}
        </Text>
      </View>
    </View>
  );
}

function DocumentRow({ doc }) {
  const isImage = doc.mime_type?.startsWith('image/');
  return (
    <TouchableOpacity
      style={styles.docRow}
      onPress={() => doc.download_url && Linking.openURL(doc.download_url)}
      activeOpacity={0.7}
    >
      <View style={[styles.docIcon, { backgroundColor: isImage ? '#F3E8FF' : '#DBEAFE' }]}>
        <Ionicons name={isImage ? 'image-outline' : 'document-text-outline'} size={18} color={isImage ? '#8B5CF6' : C.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.docTitle} numberOfLines={1}>{doc.title || doc.file_name}</Text>
        <Text style={styles.docSub}>
          {doc.category ? doc.category[0].toUpperCase() + doc.category.slice(1) : 'Document'} ·
          {' '}{new Date(doc.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
    </TouchableOpacity>
  );
}

export default function ClientDocumentsTabScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [billingHistory, setBillingHistory] = useState([]);

  const load = useCallback(async () => {
    try {
      const dashboard = await fetchDashboard();
      const projects = dashboard?.projects || [];
      if (projects.length > 0) {
        const proj = projects[0];
        setActiveProject(proj);
        const [docs, apps, billing] = await Promise.all([
          fetchDocuments(proj.id).catch(() => []),
          fetchApprovals(proj.id).catch(() => []),
          fetchProjectBilling(proj.id).catch(() => null),
        ]);
        setDocuments(Array.isArray(docs) ? docs : []);
        setApprovals(Array.isArray(apps) ? apps : []);
        setBillingHistory(billing?.history || []);
      }
    } catch (e) {
      console.error('Documents load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Combine approval events + history events into a single timeline
  const activityFeed = [...approvals]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 30);

  if (loading) {
    return (
      <View style={styles.container}>
        <ClientHeader title="Documents" subtitle={activeProject?.name} navigation={navigation} />
        <ActivityIndicator size="large" color={C.amber} style={{ marginTop: 80 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ClientHeader title="Documents" subtitle={activeProject?.name} navigation={navigation} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.amber} />
        }
      >
        {/* Activity feed — what happened recently */}
        {activityFeed.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
            {activityFeed.map((evt) => (
              <ActivityRow key={evt.id} event={evt} />
            ))}
          </View>
        )}

        {/* Documents — files shared by the contractor */}
        {documents.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DOCUMENTS ({documents.length})</Text>
            {documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={42} color={C.textMuted} />
            <Text style={styles.emptyTitle}>No documents yet</Text>
            <Text style={styles.emptySub}>Your contractor will share contracts, permits, and other files here.</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: { padding: 16 },

  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: C.textMuted, marginBottom: 12, paddingLeft: 4 },

  activityRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: C.surface, padding: 12, borderRadius: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4,
  },
  activityIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  activityTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  activitySub: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, padding: 14, borderRadius: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4,
  },
  docIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  docTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  docSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: C.text },
  emptySub: { fontSize: 13, color: C.textMuted, textAlign: 'center' },
});
