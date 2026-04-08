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
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fetchDashboard, fetchProject, fetchProjectPhotos, fetchProjectSummaries } from '../../services/clientPortalApi';

const { width: SW } = Dimensions.get('window');

const C = {
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
};
const shadowSm = { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 };
const shadowMd = { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 4 };

export default function ClientDashboardScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [viewerIndex, setViewerIndex] = useState(0);
  const [showViewer, setShowViewer] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const result = await fetchDashboard();

      // If single project, load detail before showing anything
      const projects = result?.projects || [];
      if (projects.length === 1) {
        const [detail, photoData, summaryData] = await Promise.all([
          fetchProject(projects[0].id).catch(() => null),
          fetchProjectPhotos(projects[0].id).catch(() => []),
          fetchProjectSummaries(projects[0].id).catch(() => []),
        ]);
        setProjectDetail(detail);
        setPhotos(photoData || []);
        setSummaries(summaryData || []);
      } else {
        setProjectDetail(null);
        setPhotos([]);
        setSummaries([]);
      }

      // Set data last so everything renders at once
      setData(result);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  if (loading && !data) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={C.amber} /></View>;
  }

  const projects = data?.projects || [];
  const servicePlans = data?.servicePlans || data?.service_plans || [];
  const outstandingInvoices = data?.outstandingInvoices || data?.outstanding_invoices || [];
  const pendingEstimates = data?.pendingEstimates || data?.pending_estimates || [];
  const branding = data?.branding || {};
  const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total || inv.amount || 0) - parseFloat(inv.amount_paid || 0)), 0);

  const isSingleProject = projects.length === 1 && projectDetail;
  const phases = projectDetail?.phases || [];
  const currentPhaseIdx = phases.findIndex(p => p.status !== 'completed');
  const photoUrls = photos.flat ? photos.flat().filter(p => p.url || typeof p === 'string').map(p => p.url || p).slice(0, 6) : [];
  const gridW = (SW - 48) / 3;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.amber} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Gradient Header */}
        <LinearGradient colors={[C.amber, C.amberDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <SafeAreaView edges={['top']} style={styles.headerInner}>
            <View style={styles.headerContent}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerName}>{branding.business_name || 'My Projects'}</Text>
                <Text style={styles.headerSubtitle}>
                  {isSingleProject ? projectDetail.name : `${projects.length} active project${projects.length !== 1 ? 's' : ''}`}
                </Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Notifications')} style={styles.headerBtn}>
                  <Ionicons name="notifications-outline" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Settings')} style={styles.headerBtn}>
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
              onPress={() => projects.length > 0 && navigation.getParent()?.navigate('ClientInvoices', { projectId: projects[0].id })}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.bannerRow}>
                  <Ionicons name="alert-circle" size={18} color={C.amberDark} />
                  <Text style={styles.bannerTitle}>Payment Due</Text>
                </View>
                <Text style={styles.bannerAmount}>${totalOutstanding.toLocaleString()} — {outstandingInvoices.length} invoice{outstandingInvoices.length !== 1 ? 's' : ''}</Text>
              </View>
              <View style={styles.bannerPayBtn}>
                <Text style={styles.bannerPayText}>Pay Now</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* ═══ SINGLE PROJECT: INLINE DETAIL ═══ */}
          {isSingleProject ? (
            <>
              {/* Project Info */}
              <View style={styles.infoRow}>
                {projectDetail.status && (
                  <View style={styles.infoChip}>
                    <Ionicons name="flag" size={14} color={C.amber} />
                    <Text style={styles.infoChipText}>{projectDetail.status.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
                  </View>
                )}
                {projectDetail.location && (
                  <View style={styles.infoChip}>
                    <Ionicons name="location" size={14} color={C.amber} />
                    <Text style={styles.infoChipText} numberOfLines={1}>{projectDetail.location}</Text>
                  </View>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionPrimary} onPress={() => navigation.getParent()?.navigate('ClientInvoices', { projectId: projects[0].id })} activeOpacity={0.8}>
                  <Ionicons name="receipt-outline" size={18} color="#fff" />
                  <Text style={styles.actionPrimaryText}>Invoices</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionSecondary} onPress={() => navigation.getParent()?.navigate('ClientMessages', { projectId: projects[0].id, projectName: projectDetail.name })} activeOpacity={0.8}>
                  <Ionicons name="chatbubbles-outline" size={18} color={C.text} />
                  <Text style={styles.actionSecondaryText}>Messages</Text>
                </TouchableOpacity>
              </View>

              {/* Phase Stepper */}
              {phases.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>PHASES</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepper}>
                    {phases.map((phase, i) => {
                      const isCompleted = phase.status === 'completed';
                      const isCurrent = i === currentPhaseIdx;
                      return (
                        <View key={phase.id} style={styles.stepItem}>
                          {i > 0 && <View style={[styles.stepLine, isCompleted && styles.stepLineCompleted]} />}
                          <View style={[styles.stepCircle, isCompleted && styles.stepCircleCompleted, isCurrent && styles.stepCircleCurrent]}>
                            {isCompleted ? <Ionicons name="checkmark" size={14} color="#fff" /> : isCurrent ? <Animated.View style={[styles.stepDot, { transform: [{ scale: pulseAnim }] }]} /> : null}
                          </View>
                          <Text style={[styles.stepLabel, isCurrent && { color: C.amber, fontWeight: '600' }]} numberOfLines={2}>{phase.name}</Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Photos */}
              {photoUrls.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>PHOTOS</Text>
                  <View style={styles.photoGrid}>
                    {photoUrls.map((url, i) => (
                      <TouchableOpacity key={i} onPress={() => { setViewerIndex(i); setShowViewer(true); }} activeOpacity={0.8}>
                        <Image source={{ uri: url }} style={[styles.photo, { width: i === 0 ? gridW * 2 + 4 : gridW, height: i === 0 ? gridW * 1.5 : gridW }]} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Weekly Update — latest only */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>WEEKLY UPDATE</Text>
                {summaries.length > 0 ? (
                  <>
                    <View style={styles.summaryCard}>
                      <View style={styles.summaryHeader}>
                        <View style={styles.sparkleCircle}>
                          <Ionicons name="sparkles" size={14} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.summaryDate}>
                            {summaries[0].week_start && summaries[0].week_end
                              ? `${new Date(summaries[0].week_start + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(summaries[0].week_end + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                              : 'This week'}
                          </Text>
                        </View>
                      </View>
                      {(() => {
                        let highlights = [];
                        try { highlights = typeof summaries[0].highlights === 'string' ? JSON.parse(summaries[0].highlights) : (summaries[0].highlights || []); } catch {}
                        return highlights.slice(0, 4).map((h, i) => (
                          <View key={i} style={[styles.highlightRow, { backgroundColor: h.type === 'completed' ? '#D1FAE5' : h.type === 'milestone' ? C.amberLight : h.type === 'pending' ? '#DBEAFE' : '#F3E8FF' }]}>
                            <Ionicons name={h.icon || 'checkmark-circle'} size={14} color={h.type === 'completed' ? '#065F46' : h.type === 'milestone' ? C.amberText : h.type === 'pending' ? '#3B82F6' : '#8B5CF6'} />
                            <Text style={[styles.highlightText, { color: h.type === 'completed' ? '#065F46' : h.type === 'milestone' ? C.amberText : h.type === 'pending' ? '#3B82F6' : '#8B5CF6' }]} numberOfLines={2}>{h.text}</Text>
                          </View>
                        ));
                      })()}
                      <Text style={styles.summaryText}>
                        {summaries[0].summary_text || summaries[0].summary || summaries[0].content}
                      </Text>
                    </View>
                    {summaries.length > 1 && (
                      <TouchableOpacity style={styles.viewPrevious} onPress={() => navigation.getParent()?.navigate('ClientAISummaries')} activeOpacity={0.7}>
                        <Ionicons name="time-outline" size={16} color={C.amber} />
                        <Text style={styles.viewPreviousText}>View Previous Weeks</Text>
                        <Ionicons name="chevron-forward" size={16} color={C.amber} />
                      </TouchableOpacity>
                    )}
                  </>
                ) : projectDetail?.weekly_summary ? (
                  <View style={styles.summaryCard}>
                    <View style={styles.summaryHeader}>
                      <View style={styles.sparkleCircle}>
                        <Ionicons name="sparkles" size={14} color="#fff" />
                      </View>
                      <Text style={styles.summaryDate}>This week</Text>
                    </View>
                    <Text style={styles.summaryText}>{projectDetail.weekly_summary}</Text>
                  </View>
                ) : (
                  <View style={styles.summaryEmpty}>
                    <Ionicons name="sparkles-outline" size={28} color={C.textMuted} />
                    <Text style={styles.summaryEmptyText}>No updates yet</Text>
                    <Text style={styles.summaryEmptySubtext}>Your contractor will share weekly progress updates here</Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            <>
              {/* ═══ MULTIPLE PROJECTS: CARD LIST ═══ */}
              {projects.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>PROJECTS</Text>
                  {projects.map((project) => (
                    <TouchableOpacity key={project.id} style={styles.projectCard} onPress={() => navigation.getParent()?.navigate('ClientProjectDetail', { projectId: project.id })} activeOpacity={0.7}>
                      <View style={styles.cardAccent} />
                      <View style={styles.cardBody}>
                        <View style={styles.cardTop}>
                          <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                          <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
                        </View>
                        {project.location && <Text style={styles.projectLocation} numberOfLines={1}>{project.location}</Text>}
                        {project.status && (
                          <View style={[styles.statusBadge, { backgroundColor: getStatusBg(project.status) }]}>
                            <Text style={[styles.statusText, { color: getStatusColor(project.status) }]}>{project.status.replace(/-/g, ' ').toUpperCase()}</Text>
                          </View>
                        )}
                        {project.percent_complete > 0 && (
                          <View style={styles.progressRow}>
                            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${project.percent_complete}%` }]} /></View>
                            <Text style={styles.progressLabel}>{project.percent_complete}%</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Service Plans */}
              {servicePlans.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>SERVICE PLANS</Text>
                  {servicePlans.map((plan) => (
                    <TouchableOpacity key={plan.id} style={styles.projectCard} activeOpacity={0.7}>
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
                  ))}
                </View>
              )}

              {/* Empty */}
              {projects.length === 0 && servicePlans.length === 0 && (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}><Ionicons name="folder-open-outline" size={48} color={C.textMuted} /></View>
                  <Text style={styles.emptyTitle}>No projects yet</Text>
                  <Text style={styles.emptySubtext}>Your contractor will share projects with you here</Text>
                </View>
              )}
            </>
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Photo Viewer */}
      <Modal visible={showViewer} transparent={false} animationType="fade" onRequestClose={() => setShowViewer(false)}>
        <View style={styles.viewerBg}>
          <FlatList
            data={photoUrls}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.max(viewerIndex, 0)}
            getItemLayout={(_, index) => ({ length: SW, offset: SW * index, index })}
            onMomentumScrollEnd={(e) => setViewerIndex(Math.round(e.nativeEvent.contentOffset.x / SW))}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <View style={{ width: SW, flex: 1, justifyContent: 'center' }}>
                <Image source={{ uri: item }} style={{ width: SW, height: '100%' }} resizeMode="contain" />
              </View>
            )}
          />
          <View style={styles.viewerOverlay}>
            <SafeAreaView edges={['top']} style={styles.viewerHeader}>
              <TouchableOpacity onPress={() => setShowViewer(false)} style={styles.viewerClose}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.viewerCount}>{viewerIndex + 1} / {photoUrls.length}</Text>
              <View style={{ width: 44 }} />
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStatusBg = (s) => {
  if (s === 'completed') return '#D1FAE5';
  if (s === 'behind' || s === 'over-budget') return '#FEE2E2';
  if (s === 'on-track' || s === 'active') return '#D1FAE5';
  return C.amberLight;
};
const getStatusColor = (s) => {
  if (s === 'completed') return '#065F46';
  if (s === 'behind' || s === 'over-budget') return '#991B1B';
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

  // Banners
  invoiceBanner: { backgroundColor: C.amberLight, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerTitle: { fontSize: 14, fontWeight: '600', color: C.amberText },
  bannerAmount: { fontSize: 12, color: C.amberText, marginTop: 2 },
  bannerPayBtn: { borderWidth: 1.5, borderColor: C.amberDark, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 },
  bannerPayText: { fontSize: 13, fontWeight: '600', color: C.amberDark },

  // Sections
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, color: C.textMuted, marginBottom: 10, paddingLeft: 4 },

  // Info chips (single project)
  infoRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  infoChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: C.border },
  infoChipText: { fontSize: 13, fontWeight: '600', color: C.text },

  // Actions (single project)
  actions: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.amber, paddingVertical: 14, borderRadius: 12 },
  actionPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actionSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.surface, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.border },
  actionSecondaryText: { color: C.text, fontSize: 14, fontWeight: '600' },

  // Phase Stepper
  stepper: { paddingHorizontal: 4, paddingBottom: 8 },
  stepItem: { alignItems: 'center', width: 80, position: 'relative' },
  stepLine: { position: 'absolute', top: 14, right: 54, width: 40, height: 2, backgroundColor: C.border },
  stepLineCompleted: { backgroundColor: C.amber },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  stepCircleCompleted: { backgroundColor: C.amber },
  stepCircleCurrent: { backgroundColor: C.surface, borderWidth: 2.5, borderColor: C.amber },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.amber },
  stepLabel: { fontSize: 10, fontWeight: '500', color: C.textSec, textAlign: 'center', marginTop: 6 },

  // Photos
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  photo: { borderRadius: 8 },

  // Summaries
  summaryCard: { backgroundColor: C.surface, padding: 16, borderRadius: 16, ...shadowSm },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  summaryDate: { fontSize: 12, fontWeight: '600', color: C.amber },
  summaryText: { fontSize: 14, lineHeight: 21, color: C.text },
  summaryEmpty: { alignItems: 'center', paddingVertical: 28, backgroundColor: C.surface, borderRadius: 16, ...shadowSm },
  summaryEmptyText: { fontSize: 15, fontWeight: '600', color: C.textSec, marginTop: 10 },
  summaryEmptySubtext: { fontSize: 13, color: C.textMuted, marginTop: 4, textAlign: 'center', paddingHorizontal: 32 },

  // Project Cards (multi-project)
  projectCard: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 16, marginBottom: 12, ...shadowMd, overflow: 'hidden' },
  cardAccent: { width: 4, backgroundColor: C.amber },
  cardBody: { flex: 1, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  projectName: { flex: 1, fontSize: 17, fontWeight: '600', color: C.text },
  projectLocation: { fontSize: 13, color: C.textSec, marginTop: 4 },
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

  sparkleCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center' },
  highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 8, padding: 10, marginTop: 8 },
  highlightText: { fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18 },
  viewPrevious: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, paddingVertical: 12, backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 1, borderColor: C.amberLight,
  },
  viewPreviousText: { fontSize: 14, fontWeight: '600', color: C.amber },

  // Photo viewer
  viewerBg: { flex: 1, backgroundColor: '#000' },
  viewerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  viewerClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 22 },
  viewerCount: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
