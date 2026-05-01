/**
 * EngagementDetailScreen — full engagement view for the GC.
 *
 * Shows: compliance banner, contract amount + payment terms, invoices,
 * payment records, balance, change-status, request MSA, record payment.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert, Modal, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';
import * as api from '../services/subsService';

const DOC_TYPE_LABELS = {
  w9: 'IRS Form W-9',
  coi_gl: 'General Liability COI',
  coi_wc: 'Workers Comp COI',
  coi_auto: 'Commercial Auto COI',
  coi_umbrella: 'Umbrella COI',
  ai_endorsement: 'Additional Insured Endorsement',
  waiver_subrogation: 'Waiver of Subrogation',
  license_state: 'State Contractor License',
  license_business: 'Business License',
  drug_policy: 'Drug Testing Policy',
  msa: 'Master Subcontract Agreement',
};

function prettyDocType(t) {
  return DOC_TYPE_LABELS[t] || (t || '').toUpperCase();
}

function invStatusPill(status) {
  switch (status) {
    case 'paid':     return { label: 'Paid',     bg: '#10B98115', fg: '#10B981' };
    case 'sent':
    case 'submitted':return { label: 'Sent',     bg: '#3B82F615', fg: '#3B82F6' };
    case 'approved': return { label: 'Approved', bg: '#10B98115', fg: '#10B981' };
    case 'rejected': return { label: 'Rejected', bg: '#DC262615', fg: '#DC2626' };
    case 'partial_paid': return { label: 'Partial', bg: '#F59E0B15', fg: '#F59E0B' };
    case 'draft':    return { label: 'Draft',    bg: '#6B728015', fg: '#6B7280' };
    default:         return { label: status || '—', bg: '#6B728015', fg: '#6B7280' };
  }
}

export default function EngagementDetailScreen({ route, navigation }) {
  const { engagement_id } = route.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [engagement, setEngagement] = useState(null);
  const [compliance, setCompliance] = useState({ passes: true, blockers: [], warnings: [] });
  const [invoices, setInvoices] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('check');
  const [paymentReference, setPaymentReference] = useState('');

  const [datesModalOpen, setDatesModalOpen] = useState(false);
  const [mobDate, setMobDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [savingDates, setSavingDates] = useState(false);
  const [pickerField, setPickerField] = useState(null); // 'mob' | 'end' | null

  const [openingInvoiceId, setOpeningInvoiceId] = useState(null);

  const onOpenInvoice = async (inv) => {
    if (!inv?.pdf_url || openingInvoiceId) return;
    setOpeningInvoiceId(inv.id);
    try {
      const res = await api.getEngagementInvoiceUrl(engagement_id, inv.id);
      if (!res?.url) throw new Error('No URL');
      navigation.navigate('DocumentViewer', {
        fileUrl: res.url,
        fileName: inv.invoice_number ? `Invoice ${inv.invoice_number}` : `Invoice #${inv.id.slice(0, 6)}`,
        fileType: 'pdf',
      });
    } catch (e) {
      Alert.alert('Could not open', e.message || 'Try again');
    } finally {
      setOpeningInvoiceId(null);
    }
  };

  const onSaveDates = async () => {
    const isValidDate = (s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
    if (!isValidDate(mobDate) || !isValidDate(endDate)) {
      Alert.alert('Invalid date', 'Use the format YYYY-MM-DD (e.g. 2026-05-15) or leave blank.');
      return;
    }
    if (mobDate.trim() && endDate.trim() && mobDate.trim() > endDate.trim()) {
      Alert.alert('Date order', 'Completion date must be on or after the mobilization date.');
      return;
    }
    setSavingDates(true);
    try {
      await api.updateEngagement(engagement_id, {
        mobilization_date: mobDate.trim() || null,
        completion_target_date: endDate.trim() || null,
      });
      await load();
      setDatesModalOpen(false);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Try again');
    } finally {
      setSavingDates(false);
    }
  };

  const fmtDate = (s) => s
    ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const load = useCallback(async () => {
    try {
      const [engRes, invList, balRes] = await Promise.all([
        api.getEngagement(engagement_id),
        api.listEngagementInvoices(engagement_id),
        api.getEngagementBalance(engagement_id).catch(() => null),
      ]);
      setEngagement(engRes.engagement);
      setCompliance(engRes.compliance || { passes: true, blockers: [], warnings: [] });
      setTasks(engRes.tasks || []);
      setInvoices(invList);
      setBalance(balRes?.balance || null);
    } catch (e) {
      console.warn('[EngagementDetail] load:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [engagement_id]);

  useEffect(() => { load(); }, [load]);

  const onRecordPayment = async () => {
    try {
      await api.recordPayment(engagement_id, {
        amount: parseFloat(paymentAmount),
        paid_at: new Date().toISOString().slice(0, 10),
        method: paymentMethod,
        reference: paymentReference || null,
      });
      setPaymentModalOpen(false);
      setPaymentAmount('');
      setPaymentReference('');
      load();
    } catch (e) {
      Alert.alert('Failed', e.message);
    }
  };

  const onRequestMSA = async () => {
    try {
      await api.createSubcontract(engagement_id, {
        contract_type: 'msa',
        title: 'Master Subcontract Agreement',
      });
      Alert.alert('Sent', 'Master Subcontract emailed to sub for signature.');
    } catch (e) {
      Alert.alert('Failed', e.message);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </SafeAreaView>
    );
  }

  if (!engagement) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: Colors.background }]}>
        <Text style={{ color: Colors.primaryText }}>Engagement not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>{engagement.sub?.legal_name || 'Subcontractor'}</Text>
          <Text style={styles.meta}>{engagement.trade} · {engagement.status}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Compliance card — itemized, not blocking */}
        {((compliance.blockers || []).length + (compliance.warnings || []).length) > 0 && (
          <View style={styles.complianceCard}>
            <View style={styles.complianceHeader}>
              <Ionicons name="shield-checkmark-outline" size={16} color={Colors.secondaryText} />
              <Text style={styles.complianceTitle}>Compliance</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.complianceMeta}>
                {(compliance.blockers || []).length + (compliance.warnings || []).length} item{((compliance.blockers || []).length + (compliance.warnings || []).length) === 1 ? '' : 's'}
              </Text>
            </View>
            {[...(compliance.blockers || []), ...(compliance.warnings || [])].map((issue, idx) => {
              const isBlocker = (compliance.blockers || []).includes(issue);
              return (
                <TouchableOpacity
                  key={`${issue.doc_type}-${idx}`}
                  style={[styles.complianceRow, idx === 0 && styles.complianceRowFirst]}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (engagement?.sub?.id || engagement?.sub_organization_id) {
                      navigation.navigate('SubcontractorDetail', {
                        sub_organization_id: engagement.sub?.id || engagement.sub_organization_id,
                      });
                    }
                  }}
                >
                  <View style={[styles.complianceDot, { backgroundColor: isBlocker ? '#DC2626' : '#F59E0B' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.complianceDocType}>{prettyDocType(issue.doc_type)}</Text>
                    <Text style={styles.complianceReason} numberOfLines={2}>
                      {issue.detail || issue.reason}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={Colors.secondaryText} />
                </TouchableOpacity>
              );
            })}
            <Text style={styles.complianceFootnote}>
              These are heads-ups — payment isn't blocked. Tap a row to request the doc from the sub.
            </Text>
          </View>
        )}

        {/* Balance card */}
        {balance && (
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Contract</Text>
            <Text style={styles.balanceValue}>${Number(balance.contract_amount).toLocaleString()}</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceMeta}>Invoiced</Text>
              <Text style={styles.balanceMeta}>${Number(balance.invoiced_amount).toLocaleString()}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceMeta}>Paid</Text>
              <Text style={styles.balanceMeta}>${Number(balance.paid_amount).toLocaleString()}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={[styles.balanceMeta, { fontWeight: '700' }]}>Outstanding</Text>
              <Text style={[styles.balanceMeta, { fontWeight: '700', color: Colors.primaryText }]}>
                ${Number(balance.outstanding).toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        {/* Schedule card */}
        <TouchableOpacity
          style={styles.scheduleCard}
          activeOpacity={0.7}
          onPress={() => {
            setMobDate(engagement.mobilization_date || '');
            setEndDate(engagement.completion_target_date || '');
            setDatesModalOpen(true);
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.scheduleLabel}>Schedule</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
              <Text style={styles.scheduleDate}>
                {fmtDate(engagement.mobilization_date) || <Text style={styles.scheduleDatePending}>Set start</Text>}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={Colors.secondaryText} style={{ marginHorizontal: 8 }} />
              <Text style={styles.scheduleDate}>
                {fmtDate(engagement.completion_target_date) || <Text style={styles.scheduleDatePending}>Set end</Text>}
              </Text>
            </View>
          </View>
          <Ionicons name="pencil" size={16} color={Colors.secondaryText} />
        </TouchableOpacity>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={onRequestMSA} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={16} color={Colors.primaryText} style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnText}>Send MSA</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setPaymentModalOpen(true)} activeOpacity={0.7}>
            <Ionicons name="cash-outline" size={16} color={Colors.primaryText} style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnText}>Record payment</Text>
          </TouchableOpacity>
        </View>

        {tasks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Tasks</Text>
            {tasks.map((t) => {
              const done = t.status === 'completed';
              return (
                <View key={t.id} style={styles.taskRow}>
                  <View style={[styles.taskCheck, done && { backgroundColor: Colors.successGreen, borderColor: Colors.successGreen }]}>
                    {done ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.taskTitle, done && { color: Colors.secondaryText, textDecorationLine: 'line-through' }]} numberOfLines={2}>
                      {t.title}
                    </Text>
                    {t.description ? (
                      <Text style={styles.taskDesc} numberOfLines={2}>{t.description}</Text>
                    ) : null}
                    {(t.start_date || t.end_date) ? (
                      <Text style={styles.taskDates}>
                        {fmtDate(t.start_date) || '?'}{t.end_date ? ` → ${fmtDate(t.end_date)}` : ''}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </>
        )}

        <Text style={styles.sectionTitle}>Invoices from sub</Text>
        {invoices.length === 0 ? (
          <View style={styles.invoicesEmpty}>
            <Ionicons name="cash-outline" size={22} color={Colors.secondaryText} />
            <Text style={styles.invoicesEmptyText}>No invoices yet — sub uploads invoices from their Jobs tab.</Text>
          </View>
        ) : (
          <>
            {/* Overview */}
            {(() => {
              const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
              const totalPaid = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount || 0), 0);
              const outstanding = totalInvoiced - totalPaid;
              return (
                <View style={styles.invoiceOverview}>
                  <View style={styles.invoiceStat}>
                    <Text style={styles.invoiceStatLabel}>Invoiced</Text>
                    <Text style={styles.invoiceStatValue}>${totalInvoiced.toLocaleString()}</Text>
                  </View>
                  <View style={styles.invoiceStatSep} />
                  <View style={styles.invoiceStat}>
                    <Text style={styles.invoiceStatLabel}>Paid</Text>
                    <Text style={[styles.invoiceStatValue, { color: '#10B981' }]}>${totalPaid.toLocaleString()}</Text>
                  </View>
                  <View style={styles.invoiceStatSep} />
                  <View style={styles.invoiceStat}>
                    <Text style={styles.invoiceStatLabel}>Outstanding</Text>
                    <Text style={[styles.invoiceStatValue, outstanding > 0 && { color: '#F59E0B' }]}>${outstanding.toLocaleString()}</Text>
                  </View>
                </View>
              );
            })()}

            {invoices.map((inv) => {
              const status = inv.status || 'sent';
              const pill = invStatusPill(status);
              const isOpening = openingInvoiceId === inv.id;
              return (
                <TouchableOpacity
                  key={inv.id}
                  style={styles.invoiceRow}
                  activeOpacity={0.7}
                  onPress={() => onOpenInvoice(inv)}
                  disabled={!inv.pdf_url || isOpening}
                >
                  <View style={[styles.invoiceIconWrap, { backgroundColor: pill.bg }]}>
                    <Ionicons name="document-text-outline" size={18} color={pill.fg} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={styles.invoiceTitleRow}>
                      <Text style={styles.invoiceAmount}>${Number(inv.total_amount).toLocaleString()}</Text>
                      <View style={[styles.invoicePill, { backgroundColor: pill.bg }]}>
                        <Text style={[styles.invoicePillText, { color: pill.fg }]}>{pill.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.invoiceMeta} numberOfLines={1}>
                      {inv.invoice_number ? `#${inv.invoice_number}` : `#${inv.id.slice(0, 6)}`}
                      {inv.submitted_at ? `  ·  Sent ${new Date(inv.submitted_at).toLocaleDateString()}` : ''}
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
      </ScrollView>

      <Modal visible={paymentModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Record payment</Text>
            <Text style={styles.label}>Amount</Text>
            <TextInput
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <Text style={styles.label}>Method</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {['check', 'ach', 'zelle', 'venmo', 'wire', 'cash'].map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setPaymentMethod(m)}
                  style={[
                    styles.methodChip,
                    paymentMethod === m && { backgroundColor: Colors.primaryBlue, borderColor: Colors.primaryBlue },
                  ]}
                >
                  <Text style={[styles.methodChipText, paymentMethod === m && { color: '#fff' }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Reference (check #, etc.)</Text>
            <TextInput
              value={paymentReference}
              onChangeText={setPaymentReference}
              style={styles.input}
              autoCapitalize="characters"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.lightGray }]} onPress={() => setPaymentModalOpen(false)}>
                <Text style={{ color: Colors.primaryText, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.successGreen }]} onPress={onRecordPayment}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Schedule edit modal */}
      <Modal visible={datesModalOpen} animationType="slide" transparent onRequestClose={() => !savingDates && setDatesModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.scheduleSheet, { backgroundColor: Colors.cardBackground || '#fff' }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Schedule this job</Text>
              <TouchableOpacity onPress={() => !savingDates && setDatesModalOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetSubtitle}>
              When does Lana start and when's it due? The sub sees these dates on their job package.
            </Text>

            {/* Mobilization */}
            <TouchableOpacity
              style={styles.dateField}
              activeOpacity={0.7}
              onPress={() => setPickerField('mob')}
            >
              <View style={styles.dateFieldIcon}>
                <Ionicons name="play-outline" size={16} color={Colors.primaryText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateFieldLabel}>Mobilization</Text>
                <Text style={[styles.dateFieldValue, !mobDate && styles.dateFieldEmpty]}>
                  {mobDate ? new Date(mobDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Tap to set'}
                </Text>
              </View>
              {mobDate ? (
                <TouchableOpacity onPress={() => setMobDate('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={18} color={Colors.secondaryText} />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
              )}
            </TouchableOpacity>

            {/* Completion */}
            <TouchableOpacity
              style={styles.dateField}
              activeOpacity={0.7}
              onPress={() => setPickerField('end')}
            >
              <View style={styles.dateFieldIcon}>
                <Ionicons name="flag-outline" size={16} color={Colors.primaryText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateFieldLabel}>Completion</Text>
                <Text style={[styles.dateFieldValue, !endDate && styles.dateFieldEmpty]}>
                  {endDate ? new Date(endDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Tap to set'}
                </Text>
              </View>
              {endDate ? (
                <TouchableOpacity onPress={() => setEndDate('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={18} color={Colors.secondaryText} />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
              )}
            </TouchableOpacity>

            {pickerField && (
              <View style={Platform.OS === 'ios' ? styles.iosPickerWrap : null}>
                <DateTimePicker
                  value={(() => {
                    const v = pickerField === 'mob' ? mobDate : endDate;
                    return v ? new Date(v + 'T12:00:00') : new Date();
                  })()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant="light"
                  textColor={Colors.primaryText}
                  accentColor={Colors.primaryBlue || '#3B82F6'}
                  style={Platform.OS === 'ios' ? { alignSelf: 'stretch' } : undefined}
                  onChange={(event, selectedDate) => {
                    if (Platform.OS === 'android') setPickerField(null);
                    if (selectedDate) {
                      const iso = selectedDate.toISOString().split('T')[0];
                      if (pickerField === 'mob') setMobDate(iso);
                      else setEndDate(iso);
                    }
                  }}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity onPress={() => setPickerField(null)} style={styles.iosPickerDone}>
                    <Text style={styles.iosPickerDoneText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => !savingDates && setDatesModalOpen(false)}
                disabled={savingDates}
                activeOpacity={0.7}
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetSave, savingDates && { opacity: 0.6 }]}
                onPress={onSaveDates}
                disabled={savingDates}
                activeOpacity={0.85}
              >
                {savingDates ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.sheetSaveText}>Save schedule</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (Colors) => StyleSheet.create({
  root: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingTop: 4, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 8 },
  heading: { fontSize: 18, fontWeight: '700', color: Colors.primaryText, textTransform: 'capitalize' },
  meta: { fontSize: 13, color: Colors.secondaryText, marginTop: 2, textTransform: 'capitalize' },
  body: { padding: 16, paddingBottom: 80 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, marginBottom: 14,
  },
  bannerText: { fontSize: 12, fontWeight: '600', flex: 1 },
  complianceCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  complianceHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingBottom: 8,
  },
  complianceTitle: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  complianceMeta: { fontSize: 11, color: Colors.secondaryText },
  complianceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  complianceRowFirst: { borderTopWidth: 0 },
  complianceDot: { width: 6, height: 6, borderRadius: 3 },
  complianceDocType: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  complianceReason: { fontSize: 12, color: Colors.secondaryText, marginTop: 2, lineHeight: 17 },
  complianceFootnote: {
    fontSize: 11, color: Colors.secondaryText, marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
    fontStyle: 'italic',
  },
  balanceCard: {
    backgroundColor: Colors.cardBackground, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  balanceLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  balanceValue: { fontSize: 26, fontWeight: '700', color: Colors.primaryText, marginVertical: 6 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  balanceMeta: { fontSize: 13, color: Colors.secondaryText },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  scheduleCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  scheduleLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  scheduleDate: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  scheduleDatePending: { color: Colors.secondaryText, fontStyle: 'italic', fontWeight: '400' },
  taskRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  taskCheck: {
    width: 18, height: 18, borderRadius: 4,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  taskTitle: { fontSize: 14, fontWeight: '600', color: Colors.primaryText, lineHeight: 19 },
  taskDesc: { fontSize: 12, color: Colors.secondaryText, marginTop: 4, lineHeight: 17 },
  taskDates: { fontSize: 11, color: Colors.secondaryText, marginTop: 4, fontWeight: '500' },
  actionBtn: {
    flex: 1, flexDirection: 'row',
    paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  actionBtnText: { color: Colors.primaryText, fontWeight: '600', fontSize: 14 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.secondaryText,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6, marginBottom: 8,
  },
  emptyText: { color: Colors.secondaryText, fontSize: 14, paddingVertical: 8 },
  invoiceCard: {
    backgroundColor: Colors.cardBackground, borderRadius: 12,
    padding: 14, marginBottom: 6, flexDirection: 'row', alignItems: 'center',
  },
  invoiceTitle: { fontSize: 15, fontWeight: '700', color: Colors.primaryText },
  invoiceMeta: { fontSize: 12, color: Colors.secondaryText, marginTop: 2 },
  invoicesEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  invoicesEmptyText: { flex: 1, fontSize: 13, color: Colors.secondaryText },
  invoiceOverview: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  invoiceStat: { flex: 1 },
  invoiceStatSep: { width: 1, backgroundColor: Colors.border, marginHorizontal: 6 },
  invoiceStatLabel: { fontSize: 10, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  invoiceStatValue: { fontSize: 17, fontWeight: '700', color: Colors.primaryText, marginTop: 4 },
  invoiceRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  invoiceIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  invoiceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  invoiceAmount: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.primaryText },
  invoicePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  invoicePillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.primaryText, marginBottom: 12 },
  label: { fontSize: 13, color: Colors.secondaryText, marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12, fontSize: 15,
  },
  methodChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.border,
  },
  methodChipText: { fontSize: 13, color: Colors.primaryText },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },

  // ── Schedule sheet ──────────────────────────────────────────────────────
  scheduleSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 30,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 14,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: Colors.primaryText },
  sheetSubtitle: { fontSize: 13, color: Colors.secondaryText, marginTop: 6, marginBottom: 18, lineHeight: 19 },
  dateField: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 10,
  },
  dateFieldIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center', justifyContent: 'center',
  },
  dateFieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  dateFieldValue: { fontSize: 15, fontWeight: '600', color: Colors.primaryText, marginTop: 2 },
  dateFieldEmpty: { color: Colors.secondaryText, fontWeight: '400', fontStyle: 'italic' },
  iosPickerWrap: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  iosPickerDone: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
    alignItems: 'center',
  },
  iosPickerDoneText: { color: Colors.primaryBlue || '#3B82F6', fontWeight: '700', fontSize: 15 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  sheetCancel: {
    paddingVertical: 14, paddingHorizontal: 22,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.cardBackground,
  },
  sheetCancelText: { color: Colors.primaryText, fontWeight: '600', fontSize: 14 },
  sheetSave: {
    flex: 1,
    paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  sheetSaveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
