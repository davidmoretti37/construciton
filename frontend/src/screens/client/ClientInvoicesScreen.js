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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fetchProjectInvoices, payInvoice } from '../../services/clientPortalApi';

const C = {
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
};

const STATUS = {
  paid: { bg: '#D1FAE5', text: '#065F46', label: 'PAID' },
  partial: { bg: C.amberLight, text: C.amberText, label: 'PARTIAL' },
  overdue: { bg: '#FEE2E2', text: '#991B1B', label: 'OVERDUE' },
  unpaid: { bg: C.amberLight, text: C.amberText, label: 'DUE' },
};

export default function ClientInvoicesScreen({ route, navigation }) {
  const { projectId } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [paying, setPaying] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchProjectInvoices(projectId);
      setInvoices(data || []);
    } catch (e) {
      console.error('Invoices load error:', e);
    } finally { setLoading(false); setRefreshing(false); }
  }, [projectId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handlePay = async (invoice) => {
    try {
      setPaying(invoice.id);
      const result = await payInvoice(invoice.id);
      if (result?.url) {
        await Linking.openURL(result.url);
        setTimeout(() => loadData(), 2000);
      }
    } catch (e) {
      Alert.alert('Payment Error', e.message || 'Failed to start payment');
    } finally { setPaying(null); }
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={C.amber} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Gradient Header */}
      <LinearGradient colors={[C.amber, C.amberDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <SafeAreaView edges={['top']} style={styles.headerInner}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invoices</Text>
          <View style={{ width: 36 }} />
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.amber} />}
        showsVerticalScrollIndicator={false}
      >
        {invoices.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="receipt-outline" size={40} color={C.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No invoices yet</Text>
          </View>
        ) : (
          invoices.map((invoice) => {
            const status = STATUS[invoice.status] || STATUS.unpaid;
            const amount = parseFloat(invoice.total || invoice.amount || 0);
            const paid = parseFloat(invoice.amount_paid || 0);
            const remaining = amount - paid;
            const canPay = invoice.status !== 'paid' && remaining > 0;

            return (
              <View key={invoice.id} style={styles.card}>
                {/* Row 1: Invoice # and date */}
                <View style={styles.cardRow}>
                  <Text style={styles.invoiceNum}>{invoice.invoice_number || 'INV'}</Text>
                  <Text style={styles.invoiceDate}>
                    {invoice.date || invoice.due_date ? new Date(invoice.due_date || invoice.date).toLocaleDateString() : ''}
                  </Text>
                </View>

                {/* Row 2: Project name */}
                {invoice.project_name && (
                  <Text style={styles.projectName}>{invoice.project_name}</Text>
                )}
                {invoice.description && !invoice.project_name && (
                  <Text style={styles.projectName} numberOfLines={2}>{invoice.description}</Text>
                )}

                {/* Row 3: Amount + Status */}
                <View style={[styles.cardRow, { marginTop: 8 }]}>
                  <Text style={styles.amount}>${amount.toLocaleString()}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                  </View>
                </View>

                {/* Pay Button */}
                {canPay && (
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
                        <Text style={styles.payBtnText}>Pay ${remaining.toLocaleString()}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loadingContainer: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  header: { paddingBottom: 20 },
  headerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  scrollContent: { padding: 16, paddingTop: 20 },

  card: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invoiceNum: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: C.textMuted, textTransform: 'uppercase' },
  invoiceDate: { fontSize: 12, fontWeight: '400', color: C.textMuted },
  projectName: { fontSize: 16, fontWeight: '600', color: C.text, marginTop: 6 },
  amount: { fontSize: 24, fontWeight: '700', color: C.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.amber, paddingVertical: 13, borderRadius: 12, marginTop: 14,
  },
  payBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.text },
});
