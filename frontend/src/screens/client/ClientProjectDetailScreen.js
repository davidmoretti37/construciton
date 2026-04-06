import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchProject, fetchProjectPhotos } from '../../services/clientPortalApi';

export default function ClientProjectDetailScreen({ route, navigation }) {
  const { projectId } = route.params;
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [project, setProject] = useState(null);
  const [photos, setPhotos] = useState([]);

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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  if (loading && !project) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
        <Text style={{ color: Colors.secondaryText, textAlign: 'center', marginTop: 100 }}>Project not found</Text>
      </SafeAreaView>
    );
  }

  const phases = project.phases || [];
  const completedPhases = phases.filter(p => p.status === 'completed').length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={28} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]} numberOfLines={1}>
          {project.name}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.primaryBlue} />}
      >
        {/* Status & Location */}
        <View style={[styles.infoCard, { backgroundColor: Colors.cardBackground }]}>
          {project.status && (
            <View style={styles.infoRow}>
              <Ionicons name="flag" size={16} color={Colors.secondaryText} />
              <Text style={[styles.infoText, { color: Colors.primaryText }]}>
                {project.status.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </Text>
            </View>
          )}
          {project.location && (
            <View style={styles.infoRow}>
              <Ionicons name="location" size={16} color={Colors.secondaryText} />
              <Text style={[styles.infoText, { color: Colors.secondaryText }]}>{project.location}</Text>
            </View>
          )}
          {project.budget && (
            <View style={styles.infoRow}>
              <Ionicons name="wallet" size={16} color={Colors.secondaryText} />
              <Text style={[styles.infoText, { color: Colors.primaryText }]}>${parseFloat(project.budget).toLocaleString()}</Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#1E40AF' }]}
            onPress={() => navigation.navigate('ClientInvoices', { projectId })}
          >
            <Ionicons name="receipt-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Invoices</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#059669' }]}
            onPress={() => navigation.navigate('ClientMessages', { projectId, projectName: project.name })}
          >
            <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Messages</Text>
          </TouchableOpacity>
        </View>

        {/* Phases */}
        {phases.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              Phases ({completedPhases}/{phases.length})
            </Text>
            {phases.map((phase) => (
              <View key={phase.id} style={[styles.phaseRow, { backgroundColor: Colors.cardBackground }]}>
                <Ionicons
                  name={phase.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={phase.status === 'completed' ? '#059669' : Colors.secondaryText}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.phaseName, { color: Colors.primaryText }]}>{phase.name}</Text>
                  {phase.completion_percentage > 0 && phase.status !== 'completed' && (
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${phase.completion_percentage}%` }]} />
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {photos.slice(0, 10).map((photo, i) => (
                <Image
                  key={i}
                  source={{ uri: photo.url || photo }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Weekly Summary */}
        {project.weekly_summary && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Weekly Update</Text>
            <View style={[styles.summaryCard, { backgroundColor: Colors.cardBackground }]}>
              <Text style={[styles.summaryText, { color: Colors.primaryText }]}>{project.weekly_summary}</Text>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  scrollContent: { padding: Spacing.md },
  infoCard: { padding: 16, borderRadius: BorderRadius.lg, gap: 10, marginBottom: Spacing.md },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 14, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 12, marginBottom: Spacing.lg },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: BorderRadius.lg },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.sm },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: BorderRadius.md, marginBottom: 6 },
  phaseName: { fontSize: 14, fontWeight: '600' },
  progressBar: { height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, marginTop: 6 },
  progressFill: { height: 4, backgroundColor: '#3B82F6', borderRadius: 2 },
  photoScroll: { marginTop: 4 },
  photo: { width: 120, height: 120, borderRadius: 12, marginRight: 8 },
  summaryCard: { padding: 14, borderRadius: BorderRadius.lg },
  summaryText: { fontSize: 14, lineHeight: 20 },
});
