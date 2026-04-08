import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { fetchDashboard, fetchProjectSummaries } from '../../services/clientPortalApi';

const C = {
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7', amberText: '#92400E',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
  green: '#10B981', greenBg: '#D1FAE5', greenText: '#065F46',
  red: '#EF4444', redBg: '#FEE2E2',
  blue: '#3B82F6', blueBg: '#DBEAFE',
  purple: '#8B5CF6', purpleBg: '#F3E8FF',
};

const HIGHLIGHT_STYLES = {
  completed: { bg: C.greenBg, color: C.greenText, icon: 'checkmark-circle' },
  milestone: { bg: C.amberLight, color: C.amberText, icon: 'star' },
  pending: { bg: C.blueBg, color: C.blue, icon: 'time' },
  upcoming: { bg: C.purpleBg, color: C.purple, icon: 'arrow-forward' },
};

export default function ClientAISummariesScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summaries, setSummaries] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const dashboard = await fetchDashboard();
      const projects = dashboard?.projects || [];
      if (projects.length > 0) {
        const data = await fetchProjectSummaries(projects[0].id);
        setSummaries(data || []);
        // Auto-expand the latest one
        if (data?.length > 0 && !expandedId) setExpandedId(data[0].id);
      }
    } catch (e) {
      console.error('Summaries load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const formatWeekLabel = (start, end) => {
    const s = new Date(start + 'T12:00:00');
    const e = new Date(end + 'T12:00:00');
    const sMonth = s.toLocaleDateString('en-US', { month: 'short' });
    const eMonth = e.toLocaleDateString('en-US', { month: 'short' });
    const sDay = s.getDate();
    const eDay = e.getDate();
    if (sMonth === eMonth) return `${sMonth} ${sDay} – ${eDay}`;
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}`;
  };

  const getWeeksAgo = (end) => {
    const diff = Math.floor((new Date() - new Date(end + 'T12:00:00')) / (1000 * 60 * 60 * 24));
    if (diff < 7) return 'This week';
    if (diff < 14) return 'Last week';
    return `${Math.floor(diff / 7)} weeks ago`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator size="large" color={C.amber} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.surface }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Weekly Updates</Text>
          <View style={{ width: 26 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.amber} />}
      >
        {/* AI Badge */}
        <View style={styles.aiBadge}>
          <Ionicons name="sparkles" size={16} color={C.amber} />
          <Text style={styles.aiBadgeText}>AI-generated summaries from your project activity</Text>
        </View>

        {summaries.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="sparkles-outline" size={40} color={C.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No updates yet</Text>
            <Text style={styles.emptySub}>Your contractor will share weekly progress updates here. Each summary is automatically generated from project activity.</Text>
          </View>
        ) : (
          summaries.map((summary, idx) => {
            const isExpanded = expandedId === summary.id;
            const isLatest = idx === 0;
            let highlights = [];
            try {
              highlights = typeof summary.highlights === 'string' ? JSON.parse(summary.highlights) : (summary.highlights || []);
            } catch { highlights = []; }

            return (
              <TouchableOpacity
                key={summary.id}
                style={[styles.summaryCard, isLatest && styles.summaryCardLatest]}
                onPress={() => setExpandedId(isExpanded ? null : summary.id)}
                activeOpacity={0.7}
              >
                {/* Header */}
                <View style={styles.summaryHeader}>
                  <View style={styles.summaryHeaderLeft}>
                    <View style={[styles.sparkleCircle, isLatest && styles.sparkleCircleLatest]}>
                      <Ionicons name="sparkles" size={16} color={isLatest ? '#fff' : C.amber} />
                    </View>
                    <View>
                      <Text style={styles.summaryWeek}>{formatWeekLabel(summary.week_start, summary.week_end)}</Text>
                      <Text style={styles.summaryAgo}>{getWeeksAgo(summary.week_end)}</Text>
                    </View>
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={C.textMuted} />
                </View>

                {/* Highlights (always visible) */}
                {highlights.length > 0 && (
                  <View style={styles.highlightsRow}>
                    {highlights.slice(0, isExpanded ? highlights.length : 3).map((h, i) => {
                      const style = HIGHLIGHT_STYLES[h.type] || HIGHLIGHT_STYLES.completed;
                      return (
                        <View key={i} style={[styles.highlight, { backgroundColor: style.bg }]}>
                          <Ionicons name={h.icon || style.icon} size={14} color={style.color} />
                          <Text style={[styles.highlightText, { color: style.color }]} numberOfLines={isExpanded ? 3 : 1}>{h.text}</Text>
                        </View>
                      );
                    })}
                    {!isExpanded && highlights.length > 3 && (
                      <Text style={styles.moreHighlights}>+{highlights.length - 3} more</Text>
                    )}
                  </View>
                )}

                {/* Full Summary Text (expanded only) */}
                {isExpanded && summary.summary_text && (
                  <View style={styles.summaryBody}>
                    <View style={styles.divider} />
                    {summary.summary_text.split('\n\n').map((paragraph, i) => (
                      <Text key={i} style={styles.summaryParagraph}>{paragraph}</Text>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  scrollContent: { padding: 16 },

  // AI Badge
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.amberLight, borderRadius: 10, padding: 12, marginBottom: 16,
  },
  aiBadgeText: { fontSize: 13, color: C.amberText, flex: 1 },

  // Summary Card
  summaryCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  summaryCardLatest: {
    borderWidth: 1.5, borderColor: C.amberLight,
    shadowColor: C.amber, shadowOpacity: 0.1, shadowRadius: 20, elevation: 4,
  },

  // Header
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sparkleCircle: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: C.amberLight,
    alignItems: 'center', justifyContent: 'center',
  },
  sparkleCircleLatest: { backgroundColor: C.amber },
  summaryWeek: { fontSize: 15, fontWeight: '700', color: C.text },
  summaryAgo: { fontSize: 12, color: C.textMuted, marginTop: 1 },

  // Highlights
  highlightsRow: { marginTop: 12, gap: 6 },
  highlight: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: 8, padding: 10,
  },
  highlightText: { fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18 },
  moreHighlights: { fontSize: 12, color: C.amber, fontWeight: '600', paddingLeft: 4, marginTop: 2 },

  // Body
  summaryBody: { marginTop: 4 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  summaryParagraph: { fontSize: 14, lineHeight: 22, color: C.textSec, marginBottom: 12 },

  // Empty
  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 32 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: C.amberLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  emptySub: { fontSize: 14, color: C.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 },
});
