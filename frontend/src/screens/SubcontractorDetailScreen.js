/**
 * SubcontractorDetailScreen — full sub profile with tabs.
 *
 * Quality bar matches WorkerDetailHistoryScreen: hero card, contact-action
 * row, status-badged document cards, and a clean Request-Document modal
 * for the GC to send doc requests by email.
 *
 * Tabs: Overview / Documents / Bids / Engagements / Invoices
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Linking, Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';
import * as api from '../services/subsService';

const TABS = [
  { key: 'Overview',    icon: 'person-outline',          activeIcon: 'person' },
  { key: 'Documents',   icon: 'folder-outline',          activeIcon: 'folder' },
  { key: 'Bids',        icon: 'mail-outline',            activeIcon: 'mail' },
  { key: 'Activity',    icon: 'briefcase-outline',       activeIcon: 'briefcase' },
  { key: 'Invoices',    icon: 'cash-outline',            activeIcon: 'cash' },
];

const DOC_TYPE_META = {
  w9:                { label: 'IRS Form W-9',                 icon: 'document-text-outline', color: '#3B82F6' },
  coi_gl:            { label: 'COI — General Liability',      icon: 'shield-checkmark-outline', color: '#8B5CF6' },
  coi_wc:            { label: 'COI — Workers Comp',           icon: 'shield-checkmark-outline', color: '#06B6D4' },
  coi_auto:          { label: 'COI — Commercial Auto',        icon: 'car-outline',           color: '#F59E0B' },
  coi_umbrella:      { label: 'COI — Umbrella',               icon: 'umbrella-outline',      color: '#EC4899' },
  ai_endorsement:    { label: 'Additional Insured Endorsement', icon: 'add-circle-outline',  color: '#8B5CF6' },
  waiver_subrogation:{ label: 'Waiver of Subrogation',        icon: 'document-text-outline', color: '#6366F1' },
  license_state:     { label: 'State Contractor License',     icon: 'ribbon-outline',        color: '#10B981' },
  license_business:  { label: 'Business License',             icon: 'business-outline',      color: '#10B981' },
  drug_policy:       { label: 'Drug Testing Policy',          icon: 'medical-outline',       color: '#EF4444' },
  msa:               { label: 'Master Subcontract Agreement', icon: 'reader-outline',        color: '#0EA5E9' },
};

const REQUESTABLE_DOCS = ['coi_gl', 'coi_wc', 'coi_auto', 'ai_endorsement', 'w9', 'license_state', 'license_business', 'drug_policy'];

// Files the sub uploads themselves — not requestable, displayed in a
// separate "From sub" group in the Documents tab.
const PROJECT_FILE_META = {
  signed_contract: { label: 'Signed contract',  icon: 'create-outline',          color: '#0EA5E9' },
  invoice_pdf:     { label: 'Invoice (PDF)',    icon: 'cash-outline',            color: '#10B981' },
  proposal:        { label: 'Proposal / quote', icon: 'reader-outline',          color: '#0EA5E9' },
  change_order:    { label: 'Change order',     icon: 'swap-horizontal-outline', color: '#F59E0B' },
  work_photo:      { label: 'Work photo',       icon: 'camera-outline',          color: '#8B5CF6' },
  other_doc:       { label: 'Other document',   icon: 'document-outline',        color: '#6B7280' },
};
const PROJECT_FILE_TYPES = Object.keys(PROJECT_FILE_META);

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function ScheduleSection({ engagements, navigation, Colors, styles }) {
  // Bucket by status. The lifecycle goes:
  //   awarded → contracted → mobilized → in_progress → substantially_complete → closed_out
  // Anything before mobilized = Upcoming. mobilized + in_progress = In progress.
  // substantially_complete + closed_out = Completed. cancelled = Cancelled.
  const upcoming = [];
  const active = [];
  const completed = [];
  const cancelled = [];

  for (const e of engagements) {
    const s = e.status;
    if (s === 'cancelled') cancelled.push(e);
    else if (s === 'closed_out' || s === 'substantially_complete') completed.push(e);
    else if (s === 'mobilized' || s === 'in_progress') active.push(e);
    else upcoming.push(e); // awarded, contracted, anything else
  }

  if (engagements.length === 0) {
    return (
      <View style={styles.emptyBig}>
        <Ionicons name="calendar-outline" size={42} color={Colors.secondaryText} />
        <Text style={[styles.emptyBigTitle, { color: Colors.primaryText }]}>No scheduled work yet</Text>
        <Text style={[styles.emptyBigBody, { color: Colors.secondaryText }]}>
          Accept a bid or add this sub to a project to see them on the schedule.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <ScheduleGroup title="In progress" items={active} navigation={navigation} Colors={Colors} styles={styles} accent="#10B981" />
      <ScheduleGroup title="Upcoming"    items={upcoming} navigation={navigation} Colors={Colors} styles={styles} accent="#3B82F6" />
      <ScheduleGroup title="Completed"   items={completed} navigation={navigation} Colors={Colors} styles={styles} accent="#6B7280" muted />
      <ScheduleGroup title="Cancelled"   items={cancelled} navigation={navigation} Colors={Colors} styles={styles} accent="#DC2626" muted />
    </View>
  );
}

function ScheduleGroup({ title, items, navigation, Colors, styles, accent, muted }) {
  if (!items?.length) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[styles.sectionLabel, { marginTop: 0, marginBottom: 8 }]}>{title}</Text>
      {items.map((e) => (
        <TouchableOpacity
          key={e.id}
          style={[styles.scheduleCard, muted && { opacity: 0.85 }]}
          onPress={() => navigation.navigate('EngagementDetail', { engagement_id: e.id })}
          activeOpacity={0.7}
        >
          <View style={[styles.scheduleAccent, { backgroundColor: accent }]} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.scheduleTitle}>{e.trade || 'Job'}</Text>
            <Text style={styles.scheduleProject} numberOfLines={1}>
              {e.project?.name || 'Project'}
              {e.project?.location ? `  ·  ${e.project.location}` : ''}
            </Text>
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
          <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function formatScheduleDates(e) {
  // Prefer engagement-level timestamps; fall back to project dates.
  const start = e.mobilized_at || e.contracted_at || e.awarded_at || e.project?.start_date || null;
  const end = e.completed_at || e.closed_out_at || e.project?.end_date || null;
  if (!start && !end) return null;
  const fmt = (s) => s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '?';
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `Started ${fmt(start)}`;
  return `Due ${fmt(end)}`;
}

function bidPill(status) {
  switch (status) {
    case 'submitted':  return { label: 'Submitted',  bg: '#3B82F620', fg: '#3B82F6' };
    case 'accepted':   return { label: 'Accepted',   bg: '#10B98120', fg: '#10B981' };
    case 'declined':
    case 'rejected':   return { label: 'Declined',   bg: '#DC262620', fg: '#DC2626' };
    case 'withdrawn':  return { label: 'Withdrawn',  bg: '#6B728020', fg: '#6B7280' };
    case 'open':       return { label: 'Awaiting',   bg: '#F59E0B20', fg: '#F59E0B' };
    case 'closed':     return { label: 'Closed',     bg: '#6B728020', fg: '#6B7280' };
    case 'cancelled':  return { label: 'Cancelled',  bg: '#6B728020', fg: '#6B7280' };
    default:           return { label: status || '—', bg: '#6B728020', fg: '#6B7280' };
  }
}

function statusForDoc(d, Colors) {
  if (!d.expires_at) return { label: 'Active', color: Colors.successGreen, bg: Colors.successGreen + '15' };
  const now = new Date();
  const days = Math.floor((new Date(d.expires_at) - now) / 86400000);
  if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, color: Colors.errorRed, bg: Colors.errorRed + '15' };
  if (days <= 30) return { label: `${days}d left`, color: Colors.warningOrange, bg: Colors.warningOrange + '15' };
  return { label: 'Active', color: Colors.successGreen, bg: Colors.successGreen + '15' };
}

export default function SubcontractorDetailScreen({ route, navigation }) {
  const { sub_organization_id } = route.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [sub, setSub] = useState(null);
  const [docs, setDocs] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [bidHistory, setBidHistory] = useState([]);
  const [subInvoices, setSubInvoices] = useState([]);
  const [openingInvId, setOpeningInvId] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Request-document modal
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestingType, setRequestingType] = useState(null);
  const [requestingNote, setRequestingNote] = useState('');
  const [sending, setSending] = useState(false);

  // Doc open
  const [openingDocId, setOpeningDocId] = useState(null);

  const onOpenInvoice = useCallback(async (inv) => {
    if (!inv?.pdf_url || openingInvId) return;
    setOpeningInvId(inv.id);
    try {
      const res = await api.getEngagementInvoiceUrl(inv.engagement_id, inv.id);
      if (!res?.url) throw new Error('No URL');
      navigation.navigate('DocumentViewer', {
        fileUrl: res.url,
        fileName: inv.invoice_number ? `Invoice ${inv.invoice_number}` : `Invoice #${inv.id.slice(0, 6)}`,
        fileType: 'pdf',
      });
    } catch (e) {
      Alert.alert('Could not open', e.message || 'Try again');
    } finally {
      setOpeningInvId(null);
    }
  }, [navigation, openingInvId]);

  const onOpenDoc = useCallback(async (doc) => {
    if (!doc?.id) return;
    setOpeningDocId(doc.id);
    try {
      const res = await api.getComplianceDocSignedUrl(doc.id);
      const url = res?.url;
      if (!url) throw new Error('No signed URL returned');

      const ext = (doc.file_name || doc.file_url || '').split('.').pop()?.toLowerCase();
      const isPDF = (doc.file_mime || '').includes('pdf') || ext === 'pdf';
      const isImage = (doc.file_mime || '').startsWith('image/') ||
        ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'].includes(ext);

      navigation.navigate('DocumentViewer', {
        fileUrl: url,
        fileName: doc.file_name || `${doc.doc_type}.${ext || 'pdf'}`,
        fileType: isPDF ? 'pdf' : isImage ? 'image' : 'document',
      });
    } catch (e) {
      Alert.alert('Could not open', e.message || 'Try again.');
    } finally {
      setOpeningDocId(null);
    }
  }, [navigation]);

  const load = useCallback(async () => {
    try {
      const [subRes, docList, engs, bidList, allInvs] = await Promise.all([
        api.getSub(sub_organization_id),
        api.listComplianceDocs(sub_organization_id),
        api.listEngagements(),
        api.listBidHistoryForSub(sub_organization_id).catch((err) => {
          console.warn('[SubcontractorDetail] bid-history failed:', err.message);
          return [];
        }),
        api.listAllSubInvoices().catch((err) => {
          console.warn('[SubcontractorDetail] listAllSubInvoices failed:', err.message);
          return [];
        }),
      ]);
      setSub(subRes.sub_organization);
      setDocs(docList);
      setEngagements(engs.filter((e) => e.sub_organization_id === sub_organization_id));
      setBidHistory(bidList);
      setSubInvoices((allInvs || []).filter((i) => i.sub_organization_id === sub_organization_id));
    } catch (e) {
      console.warn('[SubcontractorDetail] load:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sub_organization_id]);

  useEffect(() => { load(); }, [load]);

  // Reload when navigating back to this screen (e.g. after sending a bid).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onSendRequest = async () => {
    if (!requestingType) return;
    setSending(true);
    try {
      await api.requestDocFromSub(sub_organization_id, requestingType);
      setRequestModalOpen(false);
      setRequestingType(null);
      setRequestingNote('');
      Alert.alert(
        'Request sent',
        `${DOC_TYPE_META[requestingType]?.label || requestingType} request emailed to ${sub?.primary_email || 'the sub'}.`,
      );
    } catch (e) {
      Alert.alert('Failed', e.message);
    } finally {
      setSending(false);
    }
  };

  // Compliance docs: best-of-type. Project files (sub-uploaded contracts,
  // invoices, photos): show every row, newest first.
  const bestByType = useMemo(() => {
    const map = {};
    for (const d of docs) {
      if (PROJECT_FILE_TYPES.includes(d.doc_type)) continue;
      if (!map[d.doc_type]) map[d.doc_type] = d;
    }
    return map;
  }, [docs]);
  const presentTypes = Object.keys(bestByType);
  const missingRequestable = REQUESTABLE_DOCS.filter((t) => !presentTypes.includes(t));

  const projectFiles = useMemo(() =>
    docs
      .filter((d) => PROJECT_FILE_TYPES.includes(d.doc_type))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [docs],
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </SafeAreaView>
    );
  }

  if (!sub) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: Colors.background }]}>
        <Ionicons name="alert-circle-outline" size={40} color={Colors.secondaryText} />
        <Text style={{ color: Colors.primaryText, marginTop: 12 }}>Subcontractor not found</Text>
      </SafeAreaView>
    );
  }

  const accountState = sub.upgraded_at
    ? { label: 'Sylk Owner', color: Colors.accent || '#8B5CF6' }
    : sub.auth_user_id
    ? { label: 'Active on Sylk', color: Colors.successGreen }
    : sub.claimed_at
    ? { label: 'Email-invited', color: Colors.warningOrange }
    : { label: 'Pending invite', color: Colors.secondaryText };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      {/* Compact top bar */}
      <View style={[styles.topbar, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.topbarTitle, { color: Colors.primaryText }]} numberOfLines={1}>
          {sub.legal_name}
        </Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Tab strip */}
      <View style={styles.tabStripWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabStrip}
        >
          {TABS.map((t) => {
            const isActive = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setActiveTab(t.key)}
                style={[styles.tab, isActive && { backgroundColor: Colors.primaryBlue }]}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive ? t.activeIcon : t.icon}
                  size={15}
                  color={isActive ? '#fff' : Colors.primaryText}
                />
                <Text style={[
                  styles.tabText,
                  { color: isActive ? '#fff' : Colors.primaryText, fontWeight: isActive ? '700' : '500' },
                ]}>
                  {t.key}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primaryBlue} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card — always visible */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={[styles.avatar, { backgroundColor: '#8B5CF6' + '20' }]}>
              <Text style={[styles.avatarText, { color: '#8B5CF6' }]}>{getInitials(sub.legal_name)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.heroName}>{sub.legal_name}</Text>
              {sub.dba ? <Text style={styles.heroDba}>DBA {sub.dba}</Text> : null}
              <View style={styles.heroChips}>
                <View style={[styles.statusPill, { backgroundColor: accountState.color + '15' }]}>
                  <View style={[styles.statusDot, { backgroundColor: accountState.color }]} />
                  <Text style={[styles.statusText, { color: accountState.color }]}>
                    {accountState.label}
                  </Text>
                </View>
                {(sub.trades || []).slice(0, 2).map((trade) => (
                  <View key={trade} style={[styles.tradeChip, { backgroundColor: Colors.lightGray }]}>
                    <Text style={[styles.tradeChipText, { color: Colors.primaryText }]}>{trade}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Contact action row */}
          {(sub.primary_email || sub.primary_phone) && (
            <View style={styles.actionRow}>
              {sub.primary_email && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => Linking.openURL(`mailto:${sub.primary_email}`)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIcon, { backgroundColor: Colors.primaryBlue + '15' }]}>
                    <Ionicons name="mail-outline" size={18} color={Colors.primaryBlue} />
                  </View>
                  <Text style={[styles.actionLabel, { color: Colors.primaryText }]}>Email</Text>
                </TouchableOpacity>
              )}
              {sub.primary_phone && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => Linking.openURL(`tel:${sub.primary_phone}`)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIcon, { backgroundColor: Colors.successGreen + '15' }]}>
                    <Ionicons name="call-outline" size={18} color={Colors.successGreen} />
                  </View>
                  <Text style={[styles.actionLabel, { color: Colors.primaryText }]}>Call</Text>
                </TouchableOpacity>
              )}
              {sub.primary_phone && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => Linking.openURL(`sms:${sub.primary_phone}`)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#06B6D4' + '15' }]}>
                    <Ionicons name="chatbubble-outline" size={18} color="#06B6D4" />
                  </View>
                  <Text style={[styles.actionLabel, { color: Colors.primaryText }]}>Text</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Tab content */}
        {activeTab === 'Overview' && (
          <View>
            <Text style={styles.sectionLabel}>Contact</Text>
            <View style={styles.card}>
              {dataRow('Legal name', sub.legal_name, Colors)}
              {sub.dba ? dataRow('DBA', sub.dba, Colors) : null}
              {sub.primary_email ? dataRow('Email', sub.primary_email, Colors) : null}
              {sub.primary_phone ? dataRow('Phone', sub.primary_phone, Colors) : null}
            </View>

            <Text style={styles.sectionLabel}>Business</Text>
            <View style={styles.card}>
              {sub.tax_id ? dataRow('EIN', sub.tax_id, Colors) : null}
              {sub.entity_type ? dataRow('Entity', sub.entity_type, Colors) : null}
              {(sub.trades || []).length > 0 ? dataRow('Trades', (sub.trades || []).join(', '), Colors) : null}
              {(sub.service_states || []).length > 0 ? dataRow('Service states', (sub.service_states || []).join(', '), Colors) : null}
              {!sub.tax_id && !sub.entity_type && !(sub.trades || []).length && !(sub.service_states || []).length && (
                <Text style={[styles.emptyMini, { color: Colors.secondaryText }]}>
                  No business details on file yet.
                </Text>
              )}
            </View>

            {(sub.address_line1 || sub.city) && (
              <>
                <Text style={styles.sectionLabel}>Address</Text>
                <View style={styles.card}>
                  {sub.address_line1 ? dataRow('Street', sub.address_line1, Colors) : null}
                  {sub.address_line2 ? dataRow('Unit', sub.address_line2, Colors) : null}
                  {sub.city ? dataRow('City', `${sub.city}${sub.state_code ? `, ${sub.state_code}` : ''} ${sub.postal_code || ''}`, Colors) : null}
                </View>
              </>
            )}
          </View>
        )}

        {activeTab === 'Documents' && (
          <View>
            {/* Big primary CTA */}
            <TouchableOpacity
              style={[styles.requestCta, { backgroundColor: Colors.primaryBlue }]}
              onPress={() => { setRequestingType(missingRequestable[0] || REQUESTABLE_DOCS[0]); setRequestModalOpen(true); }}
              activeOpacity={0.85}
            >
              <View style={styles.requestCtaIcon}>
                <Ionicons name="paper-plane-outline" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.requestCtaTitle}>Request a document</Text>
                <Text style={styles.requestCtaBody}>
                  We email {sub.primary_email || 'the sub'} a one-tap upload link.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>

            {presentTypes.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>On file</Text>
                {presentTypes.map((t) => {
                  const d = bestByType[t];
                  const meta = DOC_TYPE_META[t] || { label: t.toUpperCase(), icon: 'document-outline', color: Colors.primaryBlue };
                  const status = statusForDoc(d, Colors);
                  const isOpening = openingDocId === d.id;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={styles.docCard}
                      activeOpacity={0.7}
                      onPress={() => onOpenDoc(d)}
                      disabled={isOpening}
                    >
                      <View style={[styles.docIcon, { backgroundColor: meta.color + '15' }]}>
                        <Ionicons name={meta.icon} size={20} color={meta.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.docTitle}>{meta.label}</Text>
                        <Text style={styles.docMeta}>
                          {d.expires_at ? `Expires ${d.expires_at}` : 'No expiration'}
                          {d.policy_number ? ` · ${d.policy_number}` : ''}
                        </Text>
                      </View>
                      {isOpening ? (
                        <ActivityIndicator size="small" color={meta.color} style={{ marginRight: 6 }} />
                      ) : (
                        <View style={[styles.docStatusPill, { backgroundColor: status.bg }]}>
                          <Text style={[styles.docStatusText, { color: status.color }]}>{status.label}</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {missingRequestable.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Missing</Text>
                {missingRequestable.map((t) => {
                  const meta = DOC_TYPE_META[t] || { label: t.toUpperCase(), icon: 'document-outline', color: Colors.primaryBlue };
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.docCard, styles.docCardMissing]}
                      activeOpacity={0.7}
                      onPress={() => { setRequestingType(t); setRequestModalOpen(true); }}
                    >
                      <View style={[styles.docIcon, { backgroundColor: Colors.lightGray }]}>
                        <Ionicons name={meta.icon} size={20} color={Colors.secondaryText} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.docTitle, { color: Colors.primaryText }]}>{meta.label}</Text>
                        <Text style={[styles.docMeta, { color: Colors.secondaryText }]}>Not uploaded yet</Text>
                      </View>
                      <View style={styles.requestInline}>
                        <Ionicons name="paper-plane-outline" size={14} color={Colors.primaryBlue} />
                        <Text style={[styles.requestInlineText, { color: Colors.primaryBlue }]}>Request</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {presentTypes.length === 0 && missingRequestable.length === 0 && projectFiles.length === 0 && (
              <Text style={[styles.emptyMini, { color: Colors.secondaryText, paddingVertical: 32, textAlign: 'center' }]}>
                Loading documents…
              </Text>
            )}

            {projectFiles.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 24 }]}>From sub</Text>
                {projectFiles.map((d) => {
                  const meta = PROJECT_FILE_META[d.doc_type] || { label: d.doc_type, icon: 'document-outline', color: Colors.primaryBlue };
                  const isOpening = openingDocId === d.id;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={styles.docCard}
                      activeOpacity={0.7}
                      onPress={() => onOpenDoc(d)}
                      disabled={isOpening}
                    >
                      <View style={[styles.docIcon, { backgroundColor: meta.color + '15' }]}>
                        <Ionicons name={meta.icon} size={20} color={meta.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.docTitle}>{meta.label}</Text>
                        <Text style={styles.docMeta} numberOfLines={1}>
                          {d.file_name || ''}
                          {d.created_at ? `  ·  ${new Date(d.created_at).toLocaleDateString()}` : ''}
                        </Text>
                      </View>
                      {isOpening
                        ? <ActivityIndicator size="small" color={meta.color} style={{ marginRight: 6 }} />
                        : <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} style={{ marginLeft: 6 }} />}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </View>
        )}

        {activeTab === 'Bids' && (
          <View>
            <TouchableOpacity
              style={styles.getBidsCta}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('BidRequestCreator', { subOrganizationId: sub_organization_id })}
            >
              <View style={styles.getBidsIcon}>
                <Ionicons name="paper-plane" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.getBidsTitle}>Send bid invitation</Text>
                <Text style={styles.getBidsBody}>
                  Pick a project + trade, AI drafts the scope, attach plans/photos, send.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>

            {bidHistory.length === 0 ? (
              <View style={[styles.emptyBig, { paddingTop: 28 }]}>
                <Ionicons name="mail-outline" size={42} color={Colors.secondaryText} />
                <Text style={[styles.emptyBigTitle, { color: Colors.primaryText }]}>No bids sent yet</Text>
                <Text style={[styles.emptyBigBody, { color: Colors.secondaryText }]}>
                  Bid invitations and responses will show here.
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 18 }]}>History</Text>
                {bidHistory.map((br) => {
                  const status = br.my_bid?.status || br.status; // sub's bid status takes precedence
                  const pill = bidPill(status);
                  return (
                    <TouchableOpacity
                      key={br.id}
                      style={styles.bidCard}
                      activeOpacity={0.7}
                      onPress={() => navigation.navigate('BidResponseDetail', {
                        bidRequestId: br.id,
                        subOrgId: sub_organization_id,
                      })}
                    >
                      <View style={styles.bidCardHeader}>
                        <View style={[styles.bidIconWrap, { backgroundColor: '#0EA5E915' }]}>
                          <Ionicons name="mail" size={20} color="#0EA5E9" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.bidCardTitle} numberOfLines={1}>
                              {br.trade}
                            </Text>
                            {br.originated_by_role === 'sub' && (
                              <View style={styles.fromSubBadge}>
                                <Text style={styles.fromSubBadgeText}>From sub</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.bidCardMeta} numberOfLines={1}>
                            {br.project?.name || (br.originated_by_role === 'sub' ? 'Unsolicited proposal' : 'Project')}
                            {br.due_at ? ` · due ${new Date(br.due_at).toLocaleDateString()}` : ''}
                          </Text>
                        </View>
                        <View style={[styles.bidStatusPill, { backgroundColor: pill.bg }]}>
                          <Text style={[styles.bidStatusText, { color: pill.fg }]}>{pill.label}</Text>
                        </View>
                      </View>
                      {br.scope_summary ? (
                        <Text style={styles.bidCardBody} numberOfLines={2}>{br.scope_summary}</Text>
                      ) : null}
                      <View style={styles.bidCardFooter}>
                        {br.attachment_count > 0 && (
                          <View style={styles.bidMetaChip}>
                            <Ionicons name="attach" size={12} color={Colors.secondaryText} />
                            <Text style={styles.bidMetaChipText}>{br.attachment_count}</Text>
                          </View>
                        )}
                        {br.my_bid ? (
                          <View style={[styles.bidMetaChip, { backgroundColor: '#10B98115' }]}>
                            <Ionicons name="cash" size={12} color="#10B981" />
                            <Text style={[styles.bidMetaChipText, { color: '#10B981', fontWeight: '700' }]}>
                              ${Number(br.my_bid.amount).toLocaleString()}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.awaitingText}>Awaiting response</Text>
                        )}
                        <Text style={styles.bidSentDate}>
                          Sent {new Date(br.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </View>
        )}

        {activeTab === 'Activity' && (
          <ScheduleSection
            engagements={engagements}
            navigation={navigation}
            Colors={Colors}
            styles={styles}
          />
        )}

        {activeTab === 'Invoices' && (
          <View>
            {subInvoices.length === 0 ? (
              <View style={styles.emptyBig}>
                <Ionicons name="cash-outline" size={42} color={Colors.secondaryText} />
                <Text style={[styles.emptyBigTitle, { color: Colors.primaryText }]}>No invoices yet</Text>
                <Text style={[styles.emptyBigBody, { color: Colors.secondaryText }]}>
                  When this sub uploads invoices from their Jobs tab, they'll appear here.
                </Text>
              </View>
            ) : (
              <>
                {/* Overview */}
                {(() => {
                  const totalInvoiced = subInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
                  const totalPaid = subInvoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount || 0), 0);
                  const outstanding = totalInvoiced - totalPaid;
                  return (
                    <View style={styles.invOverview}>
                      <View style={styles.invStat}>
                        <Text style={styles.invStatLabel}>Invoiced</Text>
                        <Text style={styles.invStatValue}>${totalInvoiced.toLocaleString()}</Text>
                      </View>
                      <View style={styles.invStatSep} />
                      <View style={styles.invStat}>
                        <Text style={styles.invStatLabel}>Paid</Text>
                        <Text style={[styles.invStatValue, { color: '#10B981' }]}>${totalPaid.toLocaleString()}</Text>
                      </View>
                      <View style={styles.invStatSep} />
                      <View style={styles.invStat}>
                        <Text style={styles.invStatLabel}>Outstanding</Text>
                        <Text style={[styles.invStatValue, outstanding > 0 && { color: '#F59E0B' }]}>${outstanding.toLocaleString()}</Text>
                      </View>
                    </View>
                  );
                })()}

                {subInvoices.map((inv) => {
                  const total = Number(inv.total_amount || 0);
                  const status = inv.status || 'sent';
                  const isPaid = status === 'paid';
                  const pillColor = isPaid ? '#10B981' : status === 'rejected' ? '#DC2626' : '#3B82F6';
                  const isOpening = openingInvId === inv.id;
                  return (
                    <TouchableOpacity
                      key={inv.id}
                      style={styles.invRow}
                      activeOpacity={0.7}
                      onPress={() => onOpenInvoice(inv)}
                      disabled={!inv.pdf_url}
                    >
                      <View style={[styles.invIcon, { backgroundColor: pillColor + '15' }]}>
                        <Ionicons name="cash-outline" size={18} color={pillColor} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={styles.invTopRow}>
                          <Text style={styles.invAmount}>${total.toLocaleString()}</Text>
                          <View style={[styles.invPill, { backgroundColor: pillColor + '15' }]}>
                            <Text style={[styles.invPillText, { color: pillColor }]}>{status.replace(/_/g, ' ')}</Text>
                          </View>
                        </View>
                        <Text style={styles.invMeta} numberOfLines={1}>
                          {inv.trade ? inv.trade : ''}
                          {inv.project_name ? `${inv.trade ? '  ·  ' : ''}${inv.project_name}` : ''}
                        </Text>
                        <Text style={styles.invDate} numberOfLines={1}>
                          {inv.submitted_at ? `Sent ${new Date(inv.submitted_at).toLocaleDateString()}` : ''}
                          {inv.due_at ? `  ·  Due ${new Date(inv.due_at).toLocaleDateString()}` : ''}
                        </Text>
                      </View>
                      {isOpening
                        ? <ActivityIndicator size="small" color={Colors.secondaryText} />
                        : inv.pdf_url
                          ? <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
                          : null}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Request Document Modal */}
      <Modal
        visible={requestModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setRequestModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: Colors.cardBackground || '#fff' }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Request a document</Text>
            <Text style={styles.modalSub}>
              We'll email {sub.primary_email || 'the sub'} a one-tap upload link.
            </Text>

            <Text style={styles.modalLabel}>Document type</Text>
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {REQUESTABLE_DOCS.map((t) => {
                const meta = DOC_TYPE_META[t];
                const isSelected = requestingType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.docPickerRow,
                      isSelected && { borderColor: Colors.primaryBlue, backgroundColor: Colors.primaryBlue + '08' },
                    ]}
                    onPress={() => setRequestingType(t)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.docPickerIcon, { backgroundColor: meta.color + '15' }]}>
                      <Ionicons name={meta.icon} size={18} color={meta.color} />
                    </View>
                    <Text style={[styles.docPickerLabel, { color: Colors.primaryText }]}>{meta.label}</Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={Colors.primaryBlue} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtnCancel, { borderColor: Colors.border }]}
                onPress={() => setRequestModalOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalBtnCancelText, { color: Colors.primaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtnSend,
                  { backgroundColor: Colors.primaryBlue, opacity: !requestingType || sending ? 0.5 : 1 },
                ]}
                onPress={onSendRequest}
                disabled={!requestingType || sending}
                activeOpacity={0.85}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={16} color="#fff" />
                    <Text style={styles.modalBtnSendText}>Send request</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function dataRow(label, value, Colors) {
  return (
    <View style={dataRowStyles.row}>
      <Text style={[dataRowStyles.label, { color: Colors.secondaryText }]}>{label}</Text>
      <Text style={[dataRowStyles.value, { color: Colors.primaryText }]} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

const dataRowStyles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, fontWeight: '600' },
  value: { fontSize: 15 },
});

const makeStyles = (Colors) => StyleSheet.create({
  root: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 6 },
  topbarTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },

  // Tab strip
  tabStripWrap: { height: 48, justifyContent: 'center' },
  tabStrip: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  tab: {
    height: 36, paddingHorizontal: 14, borderRadius: 18,
    backgroundColor: Colors.cardBackground || '#fff',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabText: { fontSize: 13 },

  body: { padding: 16, paddingBottom: 80 },

  // Hero card
  heroCard: {
    backgroundColor: Colors.cardBackground || '#fff',
    borderRadius: 16, padding: 18, marginBottom: 18,
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  heroHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700' },
  heroName: { fontSize: 20, fontWeight: '700', color: Colors.primaryText, marginBottom: 2 },
  heroDba: { fontSize: 13, color: Colors.secondaryText, marginBottom: 8 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  tradeChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tradeChipText: { fontSize: 11, fontWeight: '600' },

  // Action row
  actionRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginTop: 16, paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  actionBtn: { alignItems: 'center', flex: 1 },
  actionIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: 12, marginTop: 6, fontWeight: '600' },

  // Section labels & generic card
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.secondaryText,
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 8, marginTop: 16, paddingHorizontal: 4,
  },
  card: {
    backgroundColor: Colors.cardBackground || '#fff',
    borderRadius: 14, overflow: 'hidden',
    shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  emptyMini: { padding: 14, fontSize: 13, fontStyle: 'italic' },

  // Documents tab
  requestCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
    shadowColor: '#0F172A', shadowOpacity: 0.1, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  requestCtaIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  requestCtaTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  requestCtaBody: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  getBidsCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#8B5CF6',
    borderRadius: 14, padding: 14,
    shadowColor: '#0F172A', shadowOpacity: 0.1, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  getBidsIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  getBidsTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  getBidsBody: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  bidCard: {
    backgroundColor: Colors.cardBackground || '#fff',
    borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  bidCardHeader: { flexDirection: 'row', alignItems: 'center' },
  bidIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  bidCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.primaryText, textTransform: 'capitalize' },
  fromSubBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: '#8B5CF615',
    borderRadius: 4,
  },
  fromSubBadgeText: {
    fontSize: 9, fontWeight: '700',
    color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: 0.4,
  },
  bidCardMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  bidCardBody: { fontSize: 13, color: Colors.primaryText, marginTop: 10, lineHeight: 19 },
  bidCardFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    flexWrap: 'wrap',
  },
  bidStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  bidStatusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  bidMetaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#6B728010', paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 5,
  },
  bidMetaChipText: { fontSize: 11, color: Colors.secondaryText, fontWeight: '600' },
  awaitingText: { fontSize: 11, color: Colors.secondaryText, fontStyle: 'italic' },
  bidSentDate: { fontSize: 11, color: Colors.secondaryText, marginLeft: 'auto' },
  invOverview: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground || '#fff',
    borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  invStat: { flex: 1 },
  invStatSep: { width: 1, backgroundColor: Colors.border, marginHorizontal: 6 },
  invStatLabel: { fontSize: 10, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  invStatValue: { fontSize: 17, fontWeight: '700', color: Colors.primaryText, marginTop: 4 },
  invRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.cardBackground || '#fff',
    borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  invIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  invTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  invAmount: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.primaryText },
  invPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  invPillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  invMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 3, textTransform: 'capitalize' },
  invDate: { fontSize: 11, color: Colors.secondaryText, marginTop: 2 },
  scheduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground || '#fff',
    borderRadius: 12,
    padding: 12,
    paddingLeft: 0,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  scheduleAccent: {
    width: 4,
    alignSelf: 'stretch',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  scheduleTitle: { fontSize: 14, fontWeight: '600', color: Colors.primaryText, textTransform: 'capitalize' },
  scheduleProject: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  scheduleMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  scheduleMetaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: Colors.background,
    borderRadius: 5,
  },
  scheduleMetaText: { fontSize: 11, color: Colors.secondaryText, fontWeight: '600' },
  docCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.cardBackground || '#fff',
    borderRadius: 12, padding: 14, marginBottom: 8,
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  docCardMissing: {
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    shadowOpacity: 0, elevation: 0,
  },
  docIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  docTitle: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  docMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  docStatusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  docStatusText: { fontSize: 11, fontWeight: '700' },
  requestInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  requestInlineText: { fontSize: 12, fontWeight: '700' },

  // Engagements
  engagementCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.cardBackground || '#fff',
    borderRadius: 12, padding: 14, marginBottom: 8,
    shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  engagementIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  engagementTitle: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  engagementMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },

  // Empty states
  emptyBig: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyBigTitle: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptyBigBody: { fontSize: 13, marginTop: 6, textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 32,
  },
  modalHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, marginBottom: 14,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.primaryText },
  modalSub: { fontSize: 13, color: Colors.secondaryText, marginTop: 4, marginBottom: 18 },
  modalLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.secondaryText,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },
  docPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 12, marginBottom: 6,
    borderWidth: 1, borderColor: 'transparent',
  },
  docPickerIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  docPickerLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtnCancel: {
    flex: 1, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  modalBtnCancelText: { fontSize: 15, fontWeight: '600' },
  modalBtnSend: {
    flex: 2, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
  },
  modalBtnSendText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
