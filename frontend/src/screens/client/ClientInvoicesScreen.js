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
import { getColors, LightColors, Spacing, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchProjectInvoices, payInvoice } from '../../services/clientPortalApi';

export default function ClientInvoicesScreen({ route, navigation }) {
  const { projectId } = route.params;
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handlePay = async (invoice) => {
    try {
      setPaying(invoice.id);
      const result = await payInvoice(invoice.id);
      if (result?.url) {
        await Linking.openURL(result.url);
        // Refresh on return
        setTimeout(() => loadData(), 2000);
      }
    } catch (e) {
      Alert.alert('Payment Error', e.message || 'Failed to start payment');
    } finally {
      setPaying(null);
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'paid': return { bg: '#D1FAE5', text: '#059669' };
      case 'partial': return { bg: '#FEF3C7', text: '#D97706' };
      case 'overdue': return { bg: '#FEE2E2', text: '#DC2626' };
      default: return { bg: '#DBEAFE', text: '#2563EB' };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={28} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Invoices</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.primaryBlue} />}
      >
        {invoices.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color={Colors.secondaryText} />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>No invoices yet</Text>
          </View>
        ) : (
          invoices.map((invoice) => {
            const status = getStatusStyle(invoice.status);
            const amount = parseFloat(invoice.amount || 0);
            const paid = parseFloat(invoice.amount_paid || 0);
            const remaining = amount - paid;
            const canPay = invoice.status !== 'paid' && remaining > 0;

            return (
              <View key={invoice.id} style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.invoiceNumber, { color: Colors.primaryText }]}>
                      {invoice.invoice_number || `Invoice`}
                    </Text>
                    {invoice.description && (
                      <Text style={[styles.description, { color: Colors.secondaryText }]} numberOfLines={2}>
                        {invoice.description}
                      </Text>
                    )}
                    <Text style={[styles.date, { color: Colors.secondaryText }]}>
                      {invoice.date ? new Date(invoice.date).toLocaleDateString() : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.amount, { color: Colors.primaryText }]}>${amount.toLocaleString()}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusText, { color: status.text }]}>
                        {invoice.status?.charAt(0).toUpperCase() + invoice.status?.slice(1)}
                      </Text>
                    </View>
                  </View>
                </View>

                {canPay && (
                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={() => handlePay(invoice)}
                    disabled={paying === invoice.id}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scrollContent: { padding: 16 },
  card: { padding: 16, borderRadius: BorderRadius.lg, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  invoiceNumber: { fontSize: 16, fontWeight: '700' },
  description: { fontSize: 13, marginTop: 4 },
  date: { fontSize: 12, marginTop: 4 },
  amount: { fontSize: 20, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', paddingVertical: 12, borderRadius: BorderRadius.md, marginTop: 14 },
  payBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
});
