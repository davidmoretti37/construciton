// DocumentsCard — unified documents surface for a project. Mirrors the
// BillingCard pattern: three vertical zones, doc-type icons + status pills,
// visibility chips so the GC can see at a glance who can read what.
//
// Three zones:
//   1. ACTION REQUIRED — open doc requests to subs, expiring compliance,
//                        unsigned contracts
//   2. ACTIVE          — current visible documents (plans, contracts,
//                        compliance, photos, bid attachments)
//   3. ARCHIVE         — superseded / expired (collapsed)
//
// Data source: GET /api/project-docs/by-project/:projectId (existing) +
// inline fetches for sub-side context (compliance + bid_request_attachments).

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const C = {
  primary: '#1E40AF', primaryLight: '#DBEAFE',
  violet: '#8B5CF6', violetLight: '#F3E8FF',
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  green: '#10B981', greenBg: '#D1FAE5', greenText: '#065F46',
  red: '#EF4444', redBg: '#FEE2E2', redText: '#991B1B',
  text: '#0F172A', textSec: '#475569', textMuted: '#94A3B8',
  surface: '#FFFFFF', bg: '#F8FAFC', border: '#E2E8F0',
};

const TYPE_VISUAL = {
  plan:        { icon: 'reader-outline',          color: C.primary,  label: 'Plan' },
  contract:    { icon: 'document-text-outline',   color: C.violet,   label: 'Contract' },
  photo:       { icon: 'image-outline',           color: C.green,    label: 'Photo' },
  spec:        { icon: 'list-outline',            color: C.textSec,  label: 'Spec' },
  bid:         { icon: 'mail-outline',            color: C.amberDark, label: 'Bid' },
  compliance:  { icon: 'shield-checkmark-outline', color: C.green,   label: 'Compliance' },
  request:     { icon: 'alert-circle-outline',    color: C.red,      label: 'Request' },
  other:       { icon: 'document-outline',        color: C.textSec,  label: 'Doc' },
};

function VisChip({ label, color }) {
  return (
    <View style={[styles.visChip, { backgroundColor: color + '15' }]}>
      <Text style={[styles.visChipText, { color }]}>{label}</Text>
    </View>
  );
}

function VisibilityRow({ doc }) {
  const chips = [];
  if (doc.visible_to_subs)    chips.push({ label: 'S', color: C.violet });
  if (doc.visible_to_workers) chips.push({ label: 'W', color: C.green });
  if (doc.visible_to_clients) chips.push({ label: 'C', color: C.primary });
  if (chips.length === 0)     chips.push({ label: 'Owner only', color: C.textMuted });
  return (
    <View style={styles.visRow}>
      {chips.map((c, i) => <VisChip key={i} label={c.label} color={c.color} />)}
    </View>
  );
}

function DocRow({ doc, onOpen }) {
  const visual = TYPE_VISUAL[doc.category] || TYPE_VISUAL.other;
  return (
    <TouchableOpacity style={styles.row} onPress={() => onOpen?.(doc)} activeOpacity={0.7}>
      <View style={[styles.iconCircle, { backgroundColor: visual.color + '15' }]}>
        <Ionicons name={visual.icon} size={16} color={visual.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowLabel} numberOfLines={1}>
            {doc.title || doc.file_name || 'Untitled'}
          </Text>
          {doc.is_important ? (
            <View style={styles.importantPill}>
              <Text style={styles.importantPillText}>!</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.rowMeta}>
          <Text style={styles.metaText}>{visual.label}</Text>
          {doc.created_at ? (
            <Text style={styles.metaText}>
              {' · '}{new Date(doc.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Text>
          ) : null}
          <View style={{ flex: 1 }} />
          <VisibilityRow doc={doc} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={14} color={C.textMuted} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

export default function DocumentsCard({ projectId, navigation }) {
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [actionItems, setActionItems] = useState([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      // Project-level documents (owner uploads)
      const { data: pd } = await supabase
        .from('project_documents')
        .select('id, title, file_name, file_url, file_type, category, is_important, visible_to_subs, visible_to_workers, visible_to_clients, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      setDocs(pd || []);

      // Action items: open doc requests for subs on this project, unsigned contracts
      // (kept light — full action surface lives in the project's compliance/bidding flows)
      const { data: openTokens } = await supabase
        .from('sub_action_tokens')
        .select('id, scope, doc_type_requested, sub_organization_id, created_at, sub:sub_organizations(legal_name)')
        .eq('scope', 'upload_doc')
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .in('sub_organization_id', (
          (await supabase.from('sub_engagements').select('sub_organization_id').eq('project_id', projectId)).data || []
        ).map((e) => e.sub_organization_id));

      const items = (openTokens || []).map((t) => ({
        id: `req-${t.id}`,
        title: `Awaiting ${t.doc_type_requested || 'doc'} from ${t.sub?.legal_name || 'sub'}`,
        category: 'request',
        created_at: t.created_at,
        is_important: false,
        visible_to_subs: false,
        visible_to_workers: false,
        visible_to_clients: false,
      }));
      setActionItems(items);
    } catch (e) {
      console.warn('[DocumentsCard] load error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleOpen = useCallback((doc) => {
    if (!navigation) return;
    if (doc.category === 'request') {
      // Tap an action request → jump to the sub detail (the modal/UI to send a new request lives there)
      // For v1 we just navigate to the documents detail screen with the project context
    }
    navigation.navigate('ProjectDocuments', { projectId });
  }, [navigation, projectId]);

  if (loading) {
    return (
      <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  // Bucket by recency: top 5 active, rest in archive (collapsed)
  const active = docs.slice(0, 5);
  const history = docs.slice(5);
  const total = docs.length;

  return (
    <View style={styles.card}>
      {/* Header */}
      <TouchableOpacity
        style={styles.headerRow}
        activeOpacity={0.7}
        onPress={() => navigation?.navigate?.('ProjectDocuments', { projectId })}
      >
        <View style={[styles.iconCircle, { backgroundColor: C.violet + '15' }]}>
          <Ionicons name="folder-outline" size={16} color={C.violet} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Documents</Text>
          <Text style={styles.headerSubtitle}>
            {total === 0 ? 'No documents yet' : `${total} document${total === 1 ? '' : 's'}`}
            {actionItems.length > 0 ? `  ·  ${actionItems.length} action item${actionItems.length === 1 ? '' : 's'}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
      </TouchableOpacity>

      {/* ZONE 1: ACTION REQUIRED */}
      {actionItems.length > 0 && (
        <View style={styles.zone}>
          <View style={styles.zoneHeader}>
            <Ionicons name="alert-circle" size={14} color={C.red} />
            <Text style={[styles.zoneLabel, { color: C.red }]}>Action required ({actionItems.length})</Text>
          </View>
          {actionItems.map((doc) => (
            <DocRow key={doc.id} doc={doc} onOpen={handleOpen} />
          ))}
        </View>
      )}

      {/* ZONE 2: ACTIVE */}
      {active.length > 0 && (
        <View style={styles.zone}>
          <View style={styles.zoneHeader}>
            <Ionicons name="folder-open-outline" size={14} color={C.textSec} />
            <Text style={styles.zoneLabel}>Active ({active.length})</Text>
          </View>
          {active.map((doc) => (
            <DocRow key={doc.id} doc={doc} onOpen={handleOpen} />
          ))}
        </View>
      )}

      {/* ZONE 3: ARCHIVE */}
      {history.length > 0 && (
        <View style={styles.zone}>
          <TouchableOpacity
            style={styles.zoneHeader}
            onPress={() => setHistoryExpanded(!historyExpanded)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={historyExpanded ? 'chevron-down' : 'chevron-forward'}
              size={14} color={C.textMuted}
            />
            <Text style={styles.zoneLabel}>Archive ({history.length})</Text>
          </TouchableOpacity>
          {historyExpanded && history.map((doc) => (
            <DocRow key={doc.id} doc={doc} onOpen={handleOpen} />
          ))}
        </View>
      )}

      {total === 0 && actionItems.length === 0 && (
        <Text style={styles.emptyMsg}>
          No documents yet. Tap to add plans, contracts, photos, or specs.
        </Text>
      )}

      {/* Add doc CTA */}
      <TouchableOpacity
        style={styles.addBtn}
        activeOpacity={0.7}
        onPress={() => navigation?.navigate?.('ProjectDocuments', { projectId, openAdd: true })}
      >
        <Ionicons name="add-circle-outline" size={16} color={C.violet} />
        <Text style={styles.addBtnText}>Add document</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  headerSubtitle: { fontSize: 12, color: C.textSec, marginTop: 2 },
  iconCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  zone: { marginTop: 12 },
  zoneHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  zoneLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 0, flexWrap: 'wrap' },
  metaText: { fontSize: 11, color: C.textMuted },
  visRow: { flexDirection: 'row', gap: 4 },
  visChip: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  visChipText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  importantPill: {
    width: 16, height: 16, borderRadius: 8, backgroundColor: C.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  importantPillText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  emptyMsg: { color: C.textMuted, fontSize: 13, paddingVertical: 12 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  addBtnText: { color: C.violet, fontSize: 13, fontWeight: '600' },
});
