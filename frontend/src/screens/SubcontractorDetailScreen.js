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
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';
import * as api from '../services/subsService';

const TABS = [
  { key: 'Overview',    icon: 'person-outline',          activeIcon: 'person' },
  { key: 'Documents',   icon: 'folder-outline',          activeIcon: 'folder' },
  { key: 'Bids',        icon: 'mail-outline',            activeIcon: 'mail' },
  { key: 'Engagements', icon: 'briefcase-outline',       activeIcon: 'briefcase' },
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

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
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

  const onOpenDoc = useCallback(async (doc) => {
    if (!doc?.id) return;
    setOpeningDocId(doc.id);
    try {
      const res = await api.getComplianceDocSignedUrl(doc.id);
      const url = res?.url;
      if (!url) throw new Error('No signed URL returned');
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot open', 'No app available to view this document.');
      }
    } catch (e) {
      Alert.alert('Could not open', e.message || 'Try again.');
    } finally {
      setOpeningDocId(null);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const [subRes, docList, engs] = await Promise.all([
        api.getSub(sub_organization_id),
        api.listComplianceDocs(sub_organization_id),
        api.listEngagements(),
      ]);
      setSub(subRes.sub_organization);
      setDocs(docList);
      setEngagements(engs.filter((e) => e.sub_organization_id === sub_organization_id));
    } catch (e) {
      console.warn('[SubcontractorDetail] load:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sub_organization_id]);

  useEffect(() => { load(); }, [load]);

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

  // Group docs by best-of-type for the Documents tab
  const bestByType = useMemo(() => {
    const map = {};
    for (const d of docs) {
      if (!map[d.doc_type]) map[d.doc_type] = d;
    }
    return map;
  }, [docs]);
  const presentTypes = Object.keys(bestByType);
  const missingRequestable = REQUESTABLE_DOCS.filter((t) => !presentTypes.includes(t));

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

            {presentTypes.length === 0 && missingRequestable.length === 0 && (
              <Text style={[styles.emptyMini, { color: Colors.secondaryText, paddingVertical: 32, textAlign: 'center' }]}>
                Loading documents…
              </Text>
            )}
          </View>
        )}

        {activeTab === 'Bids' && (
          <View style={styles.emptyBig}>
            <Ionicons name="mail-outline" size={42} color={Colors.secondaryText} />
            <Text style={[styles.emptyBigTitle, { color: Colors.primaryText }]}>No bid history</Text>
            <Text style={[styles.emptyBigBody, { color: Colors.secondaryText }]}>
              Bids you receive from this sub will show here.
            </Text>
          </View>
        )}

        {activeTab === 'Engagements' && (
          <View>
            {engagements.length === 0 ? (
              <View style={styles.emptyBig}>
                <Ionicons name="briefcase-outline" size={42} color={Colors.secondaryText} />
                <Text style={[styles.emptyBigTitle, { color: Colors.primaryText }]}>No engagements yet</Text>
                <Text style={[styles.emptyBigBody, { color: Colors.secondaryText }]}>
                  Add this sub to a project from Project Detail.
                </Text>
              </View>
            ) : (
              engagements.map((e) => (
                <TouchableOpacity
                  key={e.id}
                  style={styles.engagementCard}
                  onPress={() => navigation.navigate('EngagementDetail', { engagement_id: e.id })}
                  activeOpacity={0.85}
                >
                  <View style={[styles.engagementIcon, { backgroundColor: Colors.primaryBlue + '15' }]}>
                    <Ionicons name="briefcase" size={18} color={Colors.primaryBlue} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.engagementTitle}>{e.trade}</Text>
                    <Text style={styles.engagementMeta}>
                      {e.contract_amount ? `$${Number(e.contract_amount).toLocaleString()}` : 'No amount set'} · {e.status}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {activeTab === 'Invoices' && (
          <View style={styles.emptyBig}>
            <Ionicons name="cash-outline" size={42} color={Colors.secondaryText} />
            <Text style={[styles.emptyBigTitle, { color: Colors.primaryText }]}>Invoices live on the engagement</Text>
            <Text style={[styles.emptyBigBody, { color: Colors.secondaryText }]}>
              Tap an engagement to see invoices, payments, and balance.
            </Text>
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
