import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchDashboard } from '../../services/clientPortalApi';

export default function ClientDashboardScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const result = await fetchDashboard();
      console.log('CLIENT DASHBOARD:', JSON.stringify(result).substring(0, 500));
      setData(result);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading && !data) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const projects = data?.projects || [];
  const servicePlans = data?.servicePlans || data?.service_plans || [];
  const outstandingInvoices = data?.outstandingInvoices || data?.outstanding_invoices || [];
  const pendingEstimates = data?.pendingEstimates || data?.pending_estimates || [];
  const branding = data?.branding || {};

  const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) - parseFloat(inv.amount_paid || 0)), 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryBlue} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
            {branding.business_name || 'My Projects'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
              <Ionicons name="notifications-outline" size={24} color={Colors.primaryText} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
              <Ionicons name="settings-outline" size={24} color={Colors.primaryText} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Outstanding Invoices Banner */}
        {outstandingInvoices.length > 0 && (
          <TouchableOpacity
            style={[styles.banner, { backgroundColor: '#FEF3C7' }]}
            onPress={() => {
              if (projects.length > 0) navigation.navigate('ClientInvoices', { projectId: projects[0].id });
            }}
          >
            <Ionicons name="receipt-outline" size={20} color="#D97706" />
            <Text style={styles.bannerText}>
              {outstandingInvoices.length} outstanding invoice{outstandingInvoices.length !== 1 ? 's' : ''} — ${totalOutstanding.toLocaleString()}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#D97706" />
          </TouchableOpacity>
        )}

        {/* Pending Estimates Banner */}
        {pendingEstimates.length > 0 && (
          <View style={[styles.banner, { backgroundColor: '#DBEAFE' }]}>
            <Ionicons name="document-text-outline" size={20} color="#2563EB" />
            <Text style={[styles.bannerText, { color: '#1E40AF' }]}>
              {pendingEstimates.length} estimate{pendingEstimates.length !== 1 ? 's' : ''} awaiting your review
            </Text>
          </View>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Projects</Text>
            {projects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={[styles.card, { backgroundColor: Colors.cardBackground }]}
                onPress={() => navigation.navigate('ClientProjectDetail', { projectId: project.id })}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <Ionicons name="briefcase" size={20} color={Colors.primaryBlue} />
                  <Text style={[styles.cardTitle, { color: Colors.primaryText }]} numberOfLines={1}>
                    {project.name}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
                </View>
                {project.location && (
                  <Text style={[styles.cardSubtext, { color: Colors.secondaryText }]} numberOfLines={1}>
                    {project.location}
                  </Text>
                )}
                {project.status && (
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(project.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(project.status) }]}>
                      {project.status.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Service Plans */}
        {servicePlans.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Service Plans</Text>
            {servicePlans.map((plan) => (
              <TouchableOpacity
                key={plan.id}
                style={[styles.card, { backgroundColor: Colors.cardBackground }]}
                onPress={() => navigation.navigate('ClientServiceDetail', { serviceId: plan.id })}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <Ionicons name="leaf" size={20} color="#059669" />
                  <Text style={[styles.cardTitle, { color: Colors.primaryText }]} numberOfLines={1}>
                    {plan.name}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
                </View>
                <Text style={[styles.cardSubtext, { color: Colors.secondaryText }]}>
                  {plan.service_type} — {plan.status}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Empty State */}
        {projects.length === 0 && servicePlans.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={64} color={Colors.secondaryText} />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>No projects yet</Text>
            <Text style={[styles.emptySubtext, { color: Colors.secondaryText }]}>
              Your contractor will share projects with you here
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const getStatusColor = (status) => {
  switch (status) {
    case 'on-track': return '#059669';
    case 'active': return '#059669';
    case 'behind': return '#D97706';
    case 'over-budget': return '#DC2626';
    case 'completed': return '#6B7280';
    default: return '#3B82F6';
  }
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: Spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: BorderRadius.lg, marginBottom: Spacing.sm },
  bannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#92400E' },
  section: { marginTop: Spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.sm },
  card: { padding: 16, borderRadius: BorderRadius.lg, marginBottom: Spacing.sm, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
  cardSubtext: { fontSize: 13, marginTop: 4, marginLeft: 30 },
  statusBadge: { alignSelf: 'flex-start', marginTop: 8, marginLeft: 30, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '600' },
  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  emptySubtext: { fontSize: 14, marginTop: 6, textAlign: 'center' },
});
