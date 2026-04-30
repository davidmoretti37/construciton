/**
 * EngagementDetailScreen — full engagement view for the GC.
 *
 * Shows: compliance banner, contract amount + payment terms, invoices,
 * payment records, balance, change-status, request MSA, record payment.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';
import * as api from '../services/subsService';

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

  const onSaveDates = async () => {
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
        {/* Compliance banner */}
        {!compliance.passes && (
          <View style={[styles.banner, { backgroundColor: Colors.errorRed + '20', borderColor: Colors.errorRed }]}>
            <Ionicons name="alert-circle" size={20} color={Colors.errorRed} />
            <Text style={[styles.bannerText, { color: Colors.errorRed }]}>
              {compliance.blockers.length} compliance issue{compliance.blockers.length === 1 ? '' : 's'} blocking payment
            </Text>
          </View>
        )}
        {compliance.passes && compliance.warnings.length > 0 && (
          <View style={[styles.banner, { backgroundColor: Colors.warningOrange + '20', borderColor: Colors.warningOrange }]}>
            <Ionicons name="alert-circle-outline" size={20} color={Colors.warningOrange} />
            <Text style={[styles.bannerText, { color: Colors.warningOrange }]}>
              {compliance.warnings.length} compliance warning{compliance.warnings.length === 1 ? '' : 's'}
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
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.primaryBlue }]} onPress={onRequestMSA}>
            <Text style={styles.actionBtnText}>Send MSA</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.successGreen }]} onPress={() => setPaymentModalOpen(true)}>
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
          <Text style={styles.emptyText}>No invoices yet.</Text>
        ) : (
          invoices.map((inv) => (
            <View key={inv.id} style={styles.invoiceCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.invoiceTitle}>${Number(inv.total_amount).toLocaleString()}</Text>
                <Text style={styles.invoiceMeta}>{inv.invoice_number || `#${inv.id.slice(0, 6)}`} · {inv.status}</Text>
              </View>
            </View>
          ))
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
      <Modal visible={datesModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: Colors.cardBackground || '#fff' }]}>
            <Text style={styles.modalTitle}>Schedule</Text>
            <Text style={styles.modalLabel}>Mobilization date</Text>
            <TextInput
              style={styles.modalInput}
              value={mobDate}
              onChangeText={setMobDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.secondaryText}
              autoCapitalize="none"
            />
            <Text style={styles.modalLabel}>Completion target</Text>
            <TextInput
              style={styles.modalInput}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.secondaryText}
              autoCapitalize="none"
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setDatesModalOpen(false)}>
                <Text style={{ color: Colors.primaryText, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: Colors.primaryBlue, opacity: savingDates ? 0.6 : 1 }]}
                onPress={onSaveDates}
                disabled={savingDates}
              >
                {savingDates ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4 },
  backBtn: { padding: 8 },
  heading: { fontSize: 22, fontWeight: '700', color: Colors.primaryText },
  meta: { fontSize: 13, color: Colors.secondaryText, marginTop: 2 },
  body: { padding: 16, paddingBottom: 80 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14,
  },
  bannerText: { fontSize: 13, fontWeight: '600' },
  balanceCard: {
    backgroundColor: Colors.cardBackground, borderRadius: 14, padding: 16, marginBottom: 14,
    shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  balanceLabel: { fontSize: 12, color: Colors.secondaryText, textTransform: 'uppercase' },
  balanceValue: { fontSize: 28, fontWeight: '700', color: Colors.primaryText, marginVertical: 4 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  balanceMeta: { fontSize: 14, color: Colors.secondaryText },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
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
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontWeight: '700' },
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
});
