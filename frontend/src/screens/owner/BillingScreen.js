/**
 * BillingScreen — Preview unbilled visits and create invoice for a service plan
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchBillingPreview, createInvoiceFromPlan } from '../../utils/storage/serviceRoutes';

export default function BillingScreen({ route: navRoute }) {
  const { plan } = navRoute.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();

  // Default period: current month
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [invoiceCreated, setInvoiceCreated] = useState(null);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBillingPreview(plan.id, fromDate, toDate);
      setPreview(data);
    } catch (e) {
      console.error('[Billing] Preview error:', e);
    } finally {
      setLoading(false);
    }
  }, [plan.id, fromDate, toDate]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const changeMonth = (offset) => {
    const d = new Date(fromDate + 'T12:00:00');
    d.setMonth(d.getMonth() + offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const last = new Date(y, d.getMonth() + 1, 0).getDate();
    setFromDate(`${y}-${m}-01`);
    setToDate(`${y}-${m}-${last}`);
  };

  const formatMonth = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const handleCreateInvoice = async () => {
    if (!preview || preview.total_visits === 0) {
      Alert.alert('No Visits', 'There are no billable visits in this period.');
      return;
    }

    Alert.alert(
      'Create Invoice',
      `Create invoice for $${preview.total_amount.toFixed(2)} (${preview.total_visits} visits)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            setCreating(true);
            try {
              const result = await createInvoiceFromPlan(plan.id, fromDate, toDate);
              setInvoiceCreated(result);
              Alert.alert(
                'Invoice Created',
                `Invoice ${result.invoice_number} for $${result.total.toFixed(2)} — ${result.visits_invoiced} visits.`,
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to create invoice');
            } finally {
              setCreating(false);
            }
          },
        },
      ]
    );
  };

  const billingCycleLabel = {
    per_visit: 'Per Visit',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Billing</Text>
          <Text style={[styles.headerSubtitle, { color: Colors.secondaryText }]} numberOfLines={1}>
            {plan?.name}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Month selector */}
        <View style={styles.monthPicker}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow}>
            <Ionicons name="chevron-back" size={20} color="#3B82F6" />
          </TouchableOpacity>
          <Text style={[styles.monthText, { color: Colors.primaryText }]}>{formatMonth(fromDate)}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow}>
            <Ionicons name="chevron-forward" size={20} color="#3B82F6" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#1E40AF" />
        ) : preview ? (
          <>
            {/* Summary card */}
            <View style={[styles.summaryCard, { backgroundColor: '#0F172A' }]}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total Visits</Text>
                  <Text style={styles.summaryValue}>{preview.total_visits}</Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>
                    {billingCycleLabel[preview.billing_cycle] || 'Rate'}
                  </Text>
                  <Text style={styles.summaryValue}>
                    ${preview.rate?.toFixed(2)}
                  </Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total Due</Text>
                  <Text style={[styles.summaryValue, { color: '#6EE7B7' }]}>
                    ${preview.total_amount?.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Location breakdown */}
            {preview.locations && preview.locations.length > 0 && (
              <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
                <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>By Location</Text>
                {preview.locations.map((loc, i) => (
                  <View key={i} style={[styles.locationRow, { borderColor: Colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.locationName, { color: Colors.primaryText }]}>
                        {loc.location_name}
                      </Text>
                    </View>
                    <Text style={[styles.locationCount, { color: Colors.secondaryText }]}>
                      {loc.visit_count} visit{loc.visit_count !== 1 ? 's' : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* No visits message */}
            {preview.total_visits === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={48} color={Colors.secondaryText} />
                <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>No Billable Visits</Text>
                <Text style={[styles.emptySubtitle, { color: Colors.secondaryText }]}>
                  No completed, unbilled visits found for this period.
                </Text>
              </View>
            )}

            {/* Create invoice button */}
            {preview.total_visits > 0 && !invoiceCreated && (
              <TouchableOpacity
                style={[styles.createBtn, creating && { opacity: 0.5 }]}
                onPress={handleCreateInvoice}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="document-text" size={20} color="#fff" />
                    <Text style={styles.createBtnText}>
                      Create Invoice — ${preview.total_amount?.toFixed(2)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Invoice created confirmation */}
            {invoiceCreated && (
              <View style={[styles.successCard, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="checkmark-circle" size={24} color="#059669" />
                <View>
                  <Text style={styles.successTitle}>Invoice Created</Text>
                  <Text style={styles.successDetail}>
                    {invoiceCreated.invoice_number} — ${invoiceCreated.total?.toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <Text style={[styles.emptySubtitle, { color: Colors.secondaryText, textAlign: 'center', marginTop: 40 }]}>
            Failed to load billing preview
          </Text>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.header - 4, fontWeight: '700' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  scrollContent: { paddingHorizontal: Spacing.lg },
  monthPicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md, gap: 16, marginBottom: Spacing.md,
  },
  monthArrow: { padding: 8 },
  monthText: { fontSize: FontSizes.body, fontWeight: '600', minWidth: 140, textAlign: 'center' },
  summaryCard: {
    borderRadius: BorderRadius.xl, padding: 20, marginBottom: Spacing.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  summaryValue: { fontSize: 20, fontWeight: '800', color: '#fff' },
  summaryDivider: { width: 1, height: 36 },
  section: {
    borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: FontSizes.body, fontWeight: '700', marginBottom: Spacing.md },
  locationRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.sm, borderBottomWidth: 1,
  },
  locationName: { fontSize: FontSizes.small, fontWeight: '500' },
  locationCount: { fontSize: 13 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: FontSizes.subheader, fontWeight: '700' },
  emptySubtitle: { fontSize: FontSizes.small, lineHeight: 20 },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1E40AF', paddingVertical: 16, borderRadius: BorderRadius.lg, marginTop: Spacing.lg,
  },
  createBtnText: { color: '#fff', fontSize: FontSizes.body, fontWeight: '700' },
  successCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: Spacing.lg, borderRadius: BorderRadius.lg, marginTop: Spacing.lg,
  },
  successTitle: { fontSize: FontSizes.body, fontWeight: '700', color: '#059669' },
  successDetail: { fontSize: FontSizes.small, color: '#059669', marginTop: 2 },
});
