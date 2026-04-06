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
import { getColors, LightColors, Spacing, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchDashboard } from '../../services/clientPortalApi';

export default function ClientMessagesListScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchDashboard();
      setProjects([...(data?.projects || []), ...(data?.service_plans || []).map(p => ({ ...p, isServicePlan: true }))]);
    } catch (e) {
      console.error('Messages list load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Messages</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.primaryBlue} />}
      >
        {projects.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={64} color={Colors.secondaryText} />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>No conversations</Text>
            <Text style={[styles.emptySubtext, { color: Colors.secondaryText }]}>Messages will appear when you have active projects</Text>
          </View>
        ) : (
          projects.map((project) => (
            <TouchableOpacity
              key={project.id}
              style={[styles.conversationCard, { backgroundColor: Colors.cardBackground }]}
              onPress={() => navigation.getParent()?.navigate('ClientMessages', { projectId: project.id, projectName: project.name })}
              activeOpacity={0.7}
            >
              <View style={[styles.avatar, { backgroundColor: project.isServicePlan ? '#D1FAE5' : '#DBEAFE' }]}>
                <Ionicons name={project.isServicePlan ? 'leaf' : 'briefcase'} size={20} color={project.isServicePlan ? '#059669' : '#2563EB'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.projectName, { color: Colors.primaryText }]} numberOfLines={1}>{project.name}</Text>
                <Text style={[styles.tapToChat, { color: Colors.secondaryText }]}>Tap to message your contractor</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.md, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  scrollContent: { padding: Spacing.md },
  conversationCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: BorderRadius.lg, marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  projectName: { fontSize: 16, fontWeight: '600' },
  tapToChat: { fontSize: 13, marginTop: 2 },
  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySubtext: { fontSize: 13, marginTop: 6, textAlign: 'center' },
});
