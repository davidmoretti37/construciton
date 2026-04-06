import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fetchDashboard } from '../../services/clientPortalApi';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Design tokens from Aria
const C = {
  amber: '#F59E0B',
  amberDark: '#D97706',
  amberLight: '#FEF3C7',
  amberText: '#92400E',
  text: '#111827',
  textSec: '#6B7280',
  textMuted: '#9CA3AF',
  surface: '#FFFFFF',
  bg: '#F9FAFB',
  border: '#E5E7EB',
  green: '#D1FAE5',
  greenText: '#065F46',
  red: '#FEE2E2',
  redText: '#991B1B',
};

const shadowSm = { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 };
const shadowMd = { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 4 };

export default function ClientDashboardScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const fadeAnims = useRef([...Array(10)].map(() => new Animated.Value(0))).current;
  const slideAnims = useRef([...Array(10)].map(() => new Animated.Value(20))).current;

  const loadData = useCallback(async () => {
    try {
      const result = await fetchDashboard();
      setData(result);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Staggered card entrance animation
  useEffect(() => {
    if (data) {
      const items = [...(data.projects || []), ...(data.servicePlans || data.service_plans || [])];
      items.forEach((_, i) => {
        if (i < fadeAnims.length) {
          Animated.parallel([
            Animated.timing(fadeAnims[i], { toValue: 1, duration: 300, delay: i * 80, useNativeDriver: true }),
            Animated.timing(slideAnims[i], { toValue: 0, duration: 300, delay: i * 80, useNativeDriver: true }),
          ]).start();
        }
      });
    }
  }, [data]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading && !data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={C.amber} />
      </View>
    );
  }

  const projects = data?.projects || [];
  const servicePlans = data?.servicePlans || data?.service_plans || [];
  const outstandingInvoices = data?.outstandingInvoices || data?.outstanding_invoices || [];
  const pendingEstimates = data?.pendingEstimates || data?.pending_estimates || [];
  const branding = data?.branding || {};
  const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total || inv.amount || 0) - parseFloat(inv.amount_paid || 0)), 0);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Gradient Header */}
        <LinearGradient colors={[C.amber, C.amberDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <SafeAreaView edges={['top']} style={styles.headerInner}>
            <View style={styles.headerContent}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerName}>{branding.business_name || 'My Projects'}</Text>
                <Text style={styles.headerSubtitle}>
                  {projects.length} active project{projects.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.headerBtn}>
                  <Ionicons name="notifications-outline" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.headerBtn}>
                  <Ionicons name="settings-outline" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>

        <View style={styles.body}>
          {/* Invoice Alert Banner */}
          {outstandingInvoices.length > 0 && (
            <TouchableOpacity
              style={styles.invoiceBanner}
              onPress={() => projects.length > 0 && navigation.navigate('ClientInvoices', { projectId: projects[0].id })}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.bannerRow}>
                  <Ionicons name="alert-circle" size={18} color={C.amberDark} />
                  <Text style={styles.bannerTitle}>Payment Due</Text>
                </View>
                <Text style={styles.bannerAmount}>
                  ${totalOutstanding.toLocaleString()} — {outstandingInvoices.length} invoice{outstandingInvoices.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.bannerPayBtn}>
                <Text style={styles.bannerPayText}>Pay Now</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Pending Estimates */}
          {pendingEstimates.length > 0 && (
            <View style={[styles.invoiceBanner, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="document-text" size={18} color="#2563EB" />
              <Text style={[styles.bannerTitle, { color: '#1E40AF', marginLeft: 8 }]}>
                {pendingEstimates.length} estimate{pendingEstimates.length !== 1 ? 's' : ''} to review
              </Text>
            </View>
          )}

          {/* Projects */}
          {projects.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PROJECTS</Text>
              {projects.map((project, i) => (
                <Animated.View
                  key={project.id}
                  style={[
                    { opacity: fadeAnims[i] || 1, transform: [{ translateY: slideAnims[i] || 0 }] },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.projectCard}
                    onPress={() => navigation.navigate('ClientProjectDetail', { projectId: project.id })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cardAccent} />
                    <View style={styles.cardBody}>
                      <View style={styles.cardTop}>
                        <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                        <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
                      </View>
                      {project.location && (
                        <Text style={styles.projectLocation} numberOfLines={1}>{project.location}</Text>
                      )}
                      {project.status && (
                        <View style={[styles.statusBadge, { backgroundColor: getStatusBg(project.status) }]}>
                          <Text style={[styles.statusText, { color: getStatusColor(project.status) }]}>
                            {project.status.replace(/-/g, ' ').toUpperCase()}
                          </Text>
                        </View>
                      )}
                      {(project.percent_complete != null && project.percent_complete > 0) && (
                        <View style={styles.progressRow}>
                          <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${project.percent_complete}%` }]} />
                          </View>
                          <Text style={styles.progressLabel}>{project.percent_complete}%</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          )}

          {/* Service Plans */}
          {servicePlans.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SERVICE PLANS</Text>
              {servicePlans.map((plan, i) => {
                const idx = projects.length + i;
                return (
                  <Animated.View
                    key={plan.id}
                    style={[
                      { opacity: fadeAnims[idx] || 1, transform: [{ translateY: slideAnims[idx] || 0 }] },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.projectCard}
                      onPress={() => navigation.navigate('ClientServiceDetail', { serviceId: plan.id })}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.cardAccent, { backgroundColor: '#059669' }]} />
                      <View style={styles.cardBody}>
                        <View style={styles.cardTop}>
                          <Ionicons name="leaf" size={16} color="#059669" style={{ marginRight: 6 }} />
                          <Text style={styles.projectName} numberOfLines={1}>{plan.name}</Text>
                          <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
                        </View>
                        <Text style={styles.projectLocation}>{plan.service_type} — {plan.status}</Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>
          )}

          {/* Empty State */}
          {projects.length === 0 && servicePlans.length === 0 && (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="folder-open-outline" size={48} color={C.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No projects yet</Text>
              <Text style={styles.emptySubtext}>Your contractor will share projects with you here</Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const getStatusBg = (s) => {
  if (s === 'completed') return C.green;
  if (s === 'behind' || s === 'over-budget') return C.red;
  if (s === 'on-track' || s === 'active') return '#D1FAE5';
  return C.amberLight;
};
const getStatusColor = (s) => {
  if (s === 'completed') return C.greenText;
  if (s === 'behind' || s === 'over-budget') return C.redText;
  if (s === 'on-track' || s === 'active') return '#065F46';
  return C.amberText;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loadingContainer: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { flexGrow: 1 },
  header: { paddingBottom: 24 },
  headerInner: { paddingHorizontal: 20, paddingTop: 8 },
  headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 80 },
  headerName: { fontSize: 28, fontWeight: '700', color: '#fff' },
  headerSubtitle: { fontSize: 14, fontWeight: '400', color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, marginTop: -12, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: C.bg },

  // Invoice Banner
  invoiceBanner: { backgroundColor: C.amberLight, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerTitle: { fontSize: 14, fontWeight: '600', color: C.amberText },
  bannerAmount: { fontSize: 12, fontWeight: '400', color: C.amberText, marginTop: 2 },
  bannerPayBtn: { borderWidth: 1.5, borderColor: C.amberDark, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 },
  bannerPayText: { fontSize: 13, fontWeight: '600', color: C.amberDark },

  // Section
  section: { marginTop: 8, marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, color: C.textMuted, marginBottom: 10, paddingLeft: 4 },

  // Project Card
  projectCard: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 16, marginBottom: 12, ...shadowMd, overflow: 'hidden' },
  cardAccent: { width: 4, backgroundColor: C.amber },
  cardBody: { flex: 1, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  projectName: { flex: 1, fontSize: 17, fontWeight: '600', color: C.text },
  projectLocation: { fontSize: 13, fontWeight: '400', color: C.textSec, marginTop: 4 },
  statusBadge: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  progressTrack: { flex: 1, height: 6, backgroundColor: '#F3F4F6', borderRadius: 99 },
  progressFill: { height: 6, backgroundColor: C.amber, borderRadius: 99 },
  progressLabel: { fontSize: 12, fontWeight: '600', color: C.amber },

  // Empty
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  emptySubtext: { fontSize: 14, color: C.textSec, marginTop: 6, textAlign: 'center' },
});
