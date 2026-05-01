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

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
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

  // Invoice upload modal state
  const [invoiceForEng, setInvoiceForEng] = useState(null); // engagement object
  const [invAmount, setInvAmount] = useState('');
  const [invDueAt, setInvDueAt] = useState('');
  const [invFile, setInvFile] = useState(null);
  const [invSubmitting, setInvSubmitting] = useState(false);
  const pickerBusyRef = useRef(false);

  const closeInvoice = () => {
    if (invSubmitting) return;
    setInvoiceForEng(null);
    setInvAmount('');
    setInvDueAt('');
    setInvFile(null);
  };

  const onPickInvoiceFile = async () => {
    if (pickerBusyRef.current) return;
    pickerBusyRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled) setInvFile(result.assets?.[0]);
    } catch (e) {
      Alert.alert('Could not pick file', e.message);
    } finally {
      pickerBusyRef.current = false;
    }
  };

  const onSubmitInvoice = async () => {
    if (!invoiceForEng) return;
    const amt = Number(invAmount);
    if (!amt || amt <= 0) { Alert.alert('Add an amount'); return; }
    if (!invFile) { Alert.alert('Attach the invoice PDF'); return; }
    if (invDueAt && !/^\d{4}-\d{2}-\d{2}$/.test(invDueAt.trim())) {
      Alert.alert('Invalid due date', 'Use YYYY-MM-DD or leave blank.');
      return;
    }
    setInvSubmitting(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(invFile.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await api.uploadInvoiceToEngagement(invoiceForEng.id, {
        file_base64: base64,
        file_name: invFile.name,
        amount: amt,
        due_at: invDueAt.trim() || null,
      });
      Alert.alert('Invoice sent', `$${amt.toLocaleString()} sent to ${invoiceForEng.gc_business_name || 'the contractor'}.`,
        [{ text: 'OK', onPress: closeInvoice }]);
      load();
    } catch (e) {
      Alert.alert('Could not send', e.message || 'Try again');
    } finally {
      setInvSubmitting(false);
    }
  };

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
          <Group title="In progress"  items={active}    accent="#10B981" canInvoice navigation={navigation} Colors={Colors} styles={styles} onSendInvoice={setInvoiceForEng} />
          <Group title="Upcoming"     items={upcoming}  accent="#3B82F6" canInvoice navigation={navigation} Colors={Colors} styles={styles} onSendInvoice={setInvoiceForEng} />
          <Group title="Completed"    items={completed} accent="#6B7280" canInvoice navigation={navigation} Colors={Colors} styles={styles} onSendInvoice={setInvoiceForEng} muted />
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

      {/* Send invoice modal */}
      <Modal visible={!!invoiceForEng} animationType="slide" transparent onRequestClose={closeInvoice}>
        <View style={styles.modalOverlay}>
          <View style={[styles.invSheet, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Send invoice</Text>
              <TouchableOpacity onPress={closeInvoice} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetSub}>
              {invoiceForEng?.trade ? `${invoiceForEng.trade} · ` : ''}{invoiceForEng?.project?.name || 'Job'}
              {invoiceForEng?.gc_business_name ? `  ·  ${invoiceForEng.gc_business_name}` : ''}
            </Text>

            <Text style={styles.fieldLabel}>Amount</Text>
            <View style={styles.amountWrap}>
              <Text style={styles.dollar}>$</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={Colors.placeholder || '#9CA3AF'}
                value={invAmount}
                onChangeText={setInvAmount}
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={styles.fieldLabel}>Due date (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.placeholder || '#9CA3AF'}
              value={invDueAt}
              onChangeText={setInvDueAt}
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Invoice file (PDF)</Text>
            {invFile ? (
              <View style={styles.filePicked}>
                <View style={styles.fileIcon}>
                  <Ionicons name="document-text-outline" size={20} color={Colors.primaryText} />
                </View>
                <Text style={styles.fileName} numberOfLines={1}>{invFile.name}</Text>
                <TouchableOpacity onPress={() => setInvFile(null)}>
                  <Ionicons name="close-circle" size={20} color={Colors.secondaryText} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.pickBtn} onPress={onPickInvoiceFile} activeOpacity={0.7}>
                <Ionicons name="document-attach-outline" size={20} color={Colors.primaryText} />
                <Text style={styles.pickBtnText}>Pick a PDF</Text>
              </TouchableOpacity>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeInvoice} disabled={invSubmitting} activeOpacity={0.7}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, invSubmitting && { opacity: 0.6 }]}
                onPress={onSubmitInvoice}
                disabled={invSubmitting}
                activeOpacity={0.85}
              >
                {invSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={16} color="#fff" />
                    <Text style={styles.sendBtnText}>Send invoice</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Group({ title, items, accent, muted, canInvoice, navigation, Colors, styles, onSendInvoice }) {
  if (!items?.length) return null;
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((e) => (
        <View key={e.id} style={[styles.jobCard, muted && { opacity: 0.85 }]}>
          <View style={[styles.jobAccent, { backgroundColor: accent }]} />
          <View style={{ flex: 1, marginLeft: 12, paddingRight: 8 }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation?.navigate?.('SubEngagementDetail', { engagementId: e.id })}
            >
              <View style={styles.jobTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobTitle} numberOfLines={1}>{e.trade || 'Job'}</Text>
                  <Text style={styles.jobProject} numberOfLines={1}>
                    {e.project?.name || 'Project'}
                    {e.gc_business_name ? `  ·  ${e.gc_business_name}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
              </View>
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
            </TouchableOpacity>

            {canInvoice && (
              <TouchableOpacity
                style={styles.sendInvoiceBtn}
                activeOpacity={0.7}
                onPress={() => onSendInvoice?.(e)}
              >
                <Ionicons name="cash-outline" size={14} color="#10B981" />
                <Text style={styles.sendInvoiceText}>Send invoice</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
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
  jobTopRow: { flexDirection: 'row', alignItems: 'center' },
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
  sendInvoiceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#10B98115',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999,
    marginTop: 10,
  },
  sendInvoiceText: { color: '#10B981', fontSize: 12, fontWeight: '700' },

  // Invoice modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  invSheet: {
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 30,
  },
  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, marginBottom: 14,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: Colors.primaryText },
  sheetSub: { fontSize: 13, color: Colors.secondaryText, marginTop: 6, marginBottom: 18 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 8, marginBottom: 6 },
  amountWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    paddingHorizontal: 16, backgroundColor: Colors.background,
  },
  dollar: { fontSize: 24, fontWeight: '600', color: Colors.secondaryText, marginRight: 6 },
  amountInput: { flex: 1, fontSize: 24, fontWeight: '700', color: Colors.primaryText, paddingVertical: 12 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, fontSize: 15,
    color: Colors.primaryText, backgroundColor: Colors.background,
  },
  pickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: Colors.background,
  },
  pickBtnText: { fontSize: 14, color: Colors.primaryText, fontWeight: '600' },
  filePicked: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    backgroundColor: Colors.background,
  },
  fileIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center', justifyContent: 'center',
  },
  fileName: { flex: 1, fontSize: 13, color: Colors.primaryText, fontWeight: '500' },
  cancelBtn: {
    paddingVertical: 14, paddingHorizontal: 22,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  cancelBtnText: { color: Colors.primaryText, fontWeight: '600', fontSize: 14 },
  sendBtn: {
    flex: 1, flexDirection: 'row', gap: 8,
    paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#10B981',
  },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
