import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { fetchDashboard, fetchMoneySummary, payInvoice, createPaymentIntent } from '../../services/clientPortalApi';

const C = {
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
  green: '#10B981', greenBg: '#D1FAE5', greenText: '#065F46',
  red: '#EF4444', redBg: '#FEE2E2', redText: '#991B1B',
};

const STATUS = {
  paid: { bg: C.greenBg, text: C.greenText, label: 'PAID' },
  partial: { bg: C.amberLight, text: C.amberText, label: 'PARTIAL' },
  overdue: { bg: C.redBg, text: C.redText, label: 'OVERDUE' },
  unpaid: { bg: C.amberLight, text: C.amberText, label: 'DUE' },
};

export default function ClientMoneyScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [paying, setPaying] = useState(null);
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  const loadData = useCallback(async () => {
    try {
      const dashboard = await fetchDashboard();
      const projects = dashboard?.projects || [];
      if (projects.length > 0) {
        const data = await fetchMoneySummary(projects[0].id);
        setSummary(data);
      }
    } catch (e) {
      console.error('Money load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handlePay = async (invoice) => {
    try {
      setPaying(invoice.id);

      // Try native Payment Sheet first
      const intentData = await createPaymentIntent(invoice.id).catch(() => null);

      if (intentData?.clientSecret) {
        // Native in-app payment
        const { error: initError } = await initPaymentSheet({
          paymentIntentClientSecret: intentData.clientSecret,
          customerEphemeralKeySecret: intentData.ephemeralKey,
          customerId: intentData.customerId,
          merchantDisplayName: 'Sylk',
          allowsDelayedPaymentMethods: true, // ACH
          applePay: { merchantCountryCode: 'US' },
          googlePay: { merchantCountryCode: 'US', testEnv: true },
        });

        if (initError) {
          console.error('Payment sheet init error:', initError);
          // Fall back to browser
          const result = await payInvoice(invoice.id);
          if (result?.url) await Linking.openURL(result.url);
          return;
        }

        const { error: presentError } = await presentPaymentSheet();

        if (presentError) {
          if (presentError.code !== 'Canceled') {
            Alert.alert('Payment Failed', presentError.message);
          }
          return;
        }

        // Payment succeeded
        Alert.alert('Payment Successful', 'Your payment has been processed.');
        loadData();
      } else {
        // Fallback to browser checkout
        const result = await payInvoice(invoice.id);
        if (result?.url) {
          await Linking.openURL(result.url);
          setTimeout(() => loadData(), 2000);
        }
      }
    } catch (e) {
      Alert.alert('Payment Error', e.message || 'Failed to start payment');
    } finally {
      setPaying(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator size="large" color={C.amber} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const contractAmount = summary?.contractAmount || 0;
  const totalPaid = summary?.totalPaid || 0;
  const remaining = summary?.remaining || 0;
  const invoices = summary?.invoices || [];
  const progress = contractAmount > 0 ? Math.min((totalPaid / contractAmount) * 100, 100) : 0;
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid');
  const paidInvoices = invoices.filter(i => i.status === 'paid');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Money</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.amber} />
        }
      >
        {/* Budget Overview Card */}
        {contractAmount > 0 && (
          <View style={styles.budgetCard}>
            <View style={styles.budgetHeader}>
              <Text style={styles.budgetLabel}>Budget Overview</Text>
              <Ionicons name="wallet" size={18} color={C.amber} />
            </View>

            {/* Progress Bar */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressPercent}>{Math.round(progress)}% paid</Text>
              <Text style={styles.progressRemaining}>${remaining.toLocaleString()} remaining</Text>
            </View>

            {/* Budget Numbers */}
            <View style={styles.budgetGrid}>
              <View style={styles.budgetItem}>
                <Text style={styles.budgetItemLabel}>Contract</Text>
                <Text style={styles.budgetItemValue}>${contractAmount.toLocaleString()}</Text>
              </View>
              <View style={[styles.budgetItem, styles.budgetItemCenter]}>
                <Text style={styles.budgetItemLabel}>Paid</Text>
                <Text style={[styles.budgetItemValue, { color: C.green }]}>${totalPaid.toLocaleString()}</Text>
              </View>
              <View style={styles.budgetItem}>
                <Text style={styles.budgetItemLabel}>Remaining</Text>
                <Text style={[styles.budgetItemValue, { color: C.amber }]}>${remaining.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Unpaid Invoices */}
        {unpaidInvoices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>OUTSTANDING</Text>
            {unpaidInvoices.map((invoice) => {
              const status = STATUS[invoice.status] || STATUS.unpaid;
              const amount = parseFloat(invoice.total || 0);
              const paid = parseFloat(invoice.amount_paid || 0);
              const due = amount - paid;

              return (
                <View key={invoice.id} style={[styles.invoiceCard, styles.invoiceCardUnpaid]}>
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceNum}>{invoice.invoice_number || 'INV'}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                    </View>
                  </View>
                  {invoice.project_name && <Text style={styles.invoiceProject} numberOfLines={1}>{invoice.project_name}</Text>}
                  <View style={[styles.invoiceRow, { marginTop: 8 }]}>
                    <Text style={styles.invoiceAmount}>${amount.toLocaleString()}</Text>
                    {invoice.due_date && (
                      <Text style={styles.invoiceDate}>Due {new Date(invoice.due_date).toLocaleDateString()}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={() => handlePay(invoice)}
                    disabled={paying === invoice.id}
                    activeOpacity={0.8}
                  >
                    {paying === invoice.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="card-outline" size={16} color="#fff" />
                        <Text style={styles.payBtnText}>Pay ${due.toLocaleString()}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Paid Invoices */}
        {paidInvoices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PAID</Text>
            {paidInvoices.map((invoice) => (
              <View key={invoice.id} style={styles.invoiceCard}>
                <View style={styles.invoiceRow}>
                  <Text style={styles.invoiceNum}>{invoice.invoice_number || 'INV'}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: C.greenBg }]}>
                    <Text style={[styles.statusText, { color: C.greenText }]}>PAID</Text>
                  </View>
                </View>
                {invoice.project_name && <Text style={styles.invoiceProject} numberOfLines={1}>{invoice.project_name}</Text>}
                <View style={[styles.invoiceRow, { marginTop: 8 }]}>
                  <Text style={[styles.invoiceAmount, { color: C.textSec }]}>${parseFloat(invoice.total || 0).toLocaleString()}</Text>
                  {invoice.paid_date && (
                    <Text style={styles.invoiceDate}>Paid {new Date(invoice.paid_date).toLocaleDateString()}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Empty State */}
        {invoices.length === 0 && contractAmount === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="card-outline" size={48} color={C.border} />
            <Text style={styles.emptyTitle}>No financial activity yet</Text>
            <Text style={styles.emptySub}>Invoices and payments will appear here</Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: C.text },
  scrollContent: { paddingHorizontal: 16 },

  // Budget Card
  budgetCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 20, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 4,
  },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  budgetLabel: { fontSize: 17, fontWeight: '700', color: C.text },
  progressTrack: { height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: C.amber, borderRadius: 4 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progressPercent: { fontSize: 13, fontWeight: '600', color: C.amber },
  progressRemaining: { fontSize: 13, color: C.textMuted },
  budgetGrid: { flexDirection: 'row', marginTop: 20, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 16 },
  budgetItem: { flex: 1 },
  budgetItemCenter: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border, paddingHorizontal: 12 },
  budgetItemLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: C.textMuted, textTransform: 'uppercase' },
  budgetItemValue: { fontSize: 17, fontWeight: '700', color: C.text, marginTop: 4, fontVariant: ['tabular-nums'] },

  // Section
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: C.textMuted, marginBottom: 12, paddingLeft: 4 },

  // Invoice Card
  invoiceCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  invoiceCardUnpaid: { borderLeftWidth: 4, borderLeftColor: C.amber },
  invoiceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invoiceNum: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: C.textMuted, textTransform: 'uppercase' },
  invoiceProject: { fontSize: 16, fontWeight: '600', color: C.text, marginTop: 6 },
  invoiceAmount: { fontSize: 24, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  invoiceDate: { fontSize: 12, color: C.textMuted },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.amber, paddingVertical: 13, borderRadius: 12, marginTop: 14,
  },
  payBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Empty
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginTop: 12 },
  emptySub: { fontSize: 14, color: C.textMuted, marginTop: 4 },
});
