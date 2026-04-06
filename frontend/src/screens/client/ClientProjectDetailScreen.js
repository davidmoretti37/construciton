import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fetchProject, fetchProjectPhotos } from '../../services/clientPortalApi';

const { width: SW } = Dimensions.get('window');
const C = {
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
};

export default function ClientProjectDetailScreen({ route, navigation }) {
  const { projectId } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [project, setProject] = useState(null);
  const [photos, setPhotos] = useState([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const loadData = useCallback(async () => {
    try {
      const [proj, photoData] = await Promise.all([
        fetchProject(projectId),
        fetchProjectPhotos(projectId).catch(() => []),
      ]);
      setProject(proj);
      setPhotos(photoData || []);
    } catch (e) {
      console.error('Project detail load error:', e);
    } finally { setLoading(false); setRefreshing(false); }
  }, [projectId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Pulse animation for current phase dot
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  if (loading && !project) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={C.amber} /></View>;
  }

  if (!project) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: C.textSec }}>Project not found</Text>
      </View>
    );
  }

  const phases = project.phases || [];
  const currentPhaseIdx = phases.findIndex(p => p.status !== 'completed');

  const photoList = photos.flat ? photos.flat().filter(p => p.url || typeof p === 'string') : [];
  const photoUrls = photoList.map(p => p.url || p).slice(0, 9);
  const gridW = (SW - 48) / 3;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.amber} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with gradient (or photo if available) */}
        <View style={styles.heroContainer}>
          <LinearGradient colors={[C.amber, C.amberDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={styles.heroOverlay}>
              <SafeAreaView edges={['top']} style={styles.heroInner}>
                <TouchableOpacity
                  onPress={() => navigation.goBack()}
                  style={styles.backBtn}
                >
                  <Ionicons name="chevron-back" size={22} color={C.text} />
                </TouchableOpacity>
              </SafeAreaView>
              <View style={styles.heroBottom}>
                <Text style={styles.heroTitle} numberOfLines={2}>{project.name}</Text>
                {project.location && (
                  <View style={styles.heroLocationRow}>
                    <Ionicons name="location" size={13} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.heroLocation}>{project.location}</Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </LinearGradient>
        </View>

        <View style={styles.body}>
          {/* Info Cards */}
          <View style={styles.infoRow}>
            {project.status && (
              <View style={styles.infoChip}>
                <Ionicons name="flag" size={14} color={C.amber} />
                <Text style={styles.infoChipText}>
                  {project.status.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </Text>
              </View>
            )}
            {project.contract_amount > 0 && (
              <View style={styles.infoChip}>
                <Ionicons name="wallet" size={14} color={C.amber} />
                <Text style={styles.infoChipText}>${parseFloat(project.contract_amount).toLocaleString()}</Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionPrimary}
              onPress={() => navigation.navigate('ClientInvoices', { projectId })}
              activeOpacity={0.8}
            >
              <Ionicons name="receipt-outline" size={18} color="#fff" />
              <Text style={styles.actionPrimaryText}>Invoices</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionSecondary}
              onPress={() => navigation.navigate('ClientMessages', { projectId, projectName: project.name })}
              activeOpacity={0.8}
            >
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
                      {/* Connecting line */}
                      {i > 0 && <View style={[styles.stepLine, isCompleted && styles.stepLineCompleted]} />}
                      {/* Circle */}
                      <View style={[
                        styles.stepCircle,
                        isCompleted && styles.stepCircleCompleted,
                        isCurrent && styles.stepCircleCurrent,
                      ]}>
                        {isCompleted ? (
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        ) : isCurrent ? (
                          <Animated.View style={[styles.stepDot, { transform: [{ scale: pulseAnim }] }]} />
                        ) : null}
                      </View>
                      {/* Label */}
                      <Text style={[
                        styles.stepLabel,
                        isCurrent && { color: C.amber, fontWeight: '600' },
                      ]} numberOfLines={2}>{phase.name}</Text>
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
                  <Image
                    key={i}
                    source={{ uri: url }}
                    style={[
                      styles.photo,
                      i === 0 && styles.photoFeatured,
                      { width: i === 0 ? gridW * 2 + 4 : gridW, height: i === 0 ? gridW * 1.5 : gridW },
                    ]}
                    resizeMode="cover"
                  />
                ))}
              </View>
            </View>
          )}

          {/* Weekly Summary */}
          {project.weekly_summary && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>WEEKLY UPDATE</Text>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryText}>{project.weekly_summary}</Text>
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loadingContainer: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { flexGrow: 1 },

  // Hero
  heroContainer: { height: 220 },
  hero: { flex: 1 },
  heroOverlay: { flex: 1, justifyContent: 'space-between' },
  heroInner: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  heroBottom: { padding: 16 },
  heroTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  heroLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  heroLocation: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },

  body: { padding: 16, marginTop: -12, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: C.bg },

  // Info chips
  infoRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  infoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
    borderWidth: 1, borderColor: C.border,
  },
  infoChipText: { fontSize: 13, fontWeight: '600', color: C.text },

  // Actions
  actions: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.amber, paddingVertical: 14, borderRadius: 12,
  },
  actionPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actionSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.surface, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
  },
  actionSecondaryText: { color: C.text, fontSize: 14, fontWeight: '600' },

  // Section
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, color: C.textMuted, marginBottom: 12, paddingLeft: 4 },

  // Phase Stepper
  stepper: { paddingHorizontal: 4, paddingBottom: 8 },
  stepItem: { alignItems: 'center', width: 80, position: 'relative' },
  stepLine: { position: 'absolute', top: 14, right: 54, width: 40, height: 2, backgroundColor: C.border, borderStyle: 'dashed' },
  stepLineCompleted: { backgroundColor: C.amber, borderStyle: 'solid' },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  stepCircleCompleted: { backgroundColor: C.amber },
  stepCircleCurrent: { backgroundColor: C.surface, borderWidth: 2.5, borderColor: C.amber },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.amber },
  stepLabel: { fontSize: 10, fontWeight: '500', color: C.textSec, textAlign: 'center', marginTop: 6 },

  // Photos
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  photo: { borderRadius: 8 },
  photoFeatured: {},

  // Summary
  summaryCard: {
    backgroundColor: C.surface, padding: 16, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  summaryText: { fontSize: 14, lineHeight: 21, color: C.text },
});
