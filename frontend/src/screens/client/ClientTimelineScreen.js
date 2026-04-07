import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LightColors, getColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchDashboard, fetchProject } from '../../services/clientPortalApi';
import AppleCalendarMonth from '../../components/AppleCalendarMonth';

const C = {
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
  green: '#10B981', red: '#EF4444',
};

const PHASE_COLORS = ['#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#EF4444', '#EC4899', '#14B8A6', '#F97316'];

const formatDateString = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export default function ClientTimelineScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [project, setProject] = useState(null);
  const [phases, setPhases] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return formatDateString(now.getFullYear(), now.getMonth(), now.getDate());
  });

  const loadData = useCallback(async () => {
    try {
      const dashboard = await fetchDashboard();
      const projects = dashboard?.projects || [];
      if (projects.length > 0) {
        const detail = await fetchProject(projects[0].id);
        setProject(detail);
        setPhases(detail?.phases || []);
      }
    } catch (e) {
      console.error('Timeline load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Convert phases to calendar tasks format
  const calendarTasks = useMemo(() => {
    return phases
      .filter(p => p.start_date && p.end_date)
      .map((phase, i) => ({
        id: phase.id,
        title: phase.name,
        start_date: phase.start_date,
        end_date: phase.end_date,
        color: PHASE_COLORS[i % PHASE_COLORS.length],
        project_id: project?.id,
        projects: { name: project?.name, working_days: [1, 2, 3, 4, 5] },
      }));
  }, [phases, project]);

  // Get phases active on selected date
  const selectedDayPhases = useMemo(() => {
    if (!selectedDate) return [];
    return phases.filter(p => {
      if (!p.start_date || !p.end_date) return false;
      return selectedDate >= p.start_date && selectedDate <= p.end_date;
    });
  }, [phases, selectedDate]);

  // Current phase
  const currentPhase = phases.find(p => p.status === 'in_progress' || p.status === 'active');

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={C.amber} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  if (!project || phases.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Timeline</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color={C.border} />
          <Text style={styles.emptyTitle}>No schedule yet</Text>
          <Text style={styles.emptySub}>Your project timeline will appear here</Text>
        </View>
      </SafeAreaView>
    );
  }

  const selectedDateObj = new Date(selectedDate + 'T12:00:00');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Timeline</Text>
        <Text style={[styles.headerSub, { color: Colors.secondaryText }]}>{project.name}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.amber} />
        }
      >
        {/* Current Phase Banner */}
        {currentPhase && (
          <View style={styles.currentBanner}>
            <View style={styles.currentDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.currentLabel}>CURRENT PHASE</Text>
              <Text style={styles.currentName}>{currentPhase.name}</Text>
            </View>
            <Text style={styles.currentPercent}>{currentPhase.completion_percentage || 0}%</Text>
          </View>
        )}

        {/* Calendar */}
        <View style={[styles.calendarContainer, { backgroundColor: Colors.white }]}>
          <AppleCalendarMonth
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            onMonthChange={setCurrentMonth}
            tasks={calendarTasks}
            events={[]}
            theme={{
              primaryBlue: C.amber,
              primaryText: Colors.primaryText,
              secondaryText: Colors.secondaryText,
              white: Colors.white,
              border: Colors.border,
              lightGray: Colors.lightGray,
              errorRed: Colors.errorRed,
            }}
          />
        </View>

        {/* Selected Day Detail */}
        <View style={styles.daySection}>
          <Text style={[styles.dayDate, { color: Colors.primaryText }]}>
            {selectedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>

          {selectedDayPhases.length === 0 ? (
            <View style={styles.dayEmpty}>
              <Text style={[styles.dayEmptyText, { color: Colors.secondaryText }]}>No phases scheduled</Text>
            </View>
          ) : (
            selectedDayPhases.map((phase, i) => (
              <View key={phase.id} style={styles.phaseCard}>
                <View style={[styles.phaseAccent, { backgroundColor: PHASE_COLORS[phases.indexOf(phase) % PHASE_COLORS.length] }]} />
                <View style={styles.phaseContent}>
                  <Text style={styles.phaseName}>{phase.name}</Text>
                  <View style={styles.phaseRow}>
                    <Text style={styles.phaseStatus}>
                      {phase.status === 'completed' ? 'Completed' : phase.status === 'in_progress' || phase.status === 'active' ? 'In Progress' : 'Upcoming'}
                    </Text>
                    <Text style={styles.phaseDates}>
                      {new Date(phase.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' – '}
                      {new Date(phase.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  {phase.completion_percentage > 0 && (
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${phase.completion_percentage}%`, backgroundColor: PHASE_COLORS[phases.indexOf(phase) % PHASE_COLORS.length] }]} />
                    </View>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        {/* All Phases List */}
        <View style={styles.allPhasesSection}>
          <Text style={styles.sectionLabel}>ALL PHASES</Text>
          {phases.map((phase, i) => {
            const isActive = phase.status === 'in_progress' || phase.status === 'active';
            const isComplete = phase.status === 'completed';
            return (
              <View key={phase.id} style={styles.phaseListItem}>
                <View style={[
                  styles.phaseListDot,
                  isComplete && { backgroundColor: C.green },
                  isActive && { backgroundColor: C.amber },
                  !isComplete && !isActive && { backgroundColor: C.border },
                ]}>
                  {isComplete && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                {i < phases.length - 1 && (
                  <View style={[styles.phaseListLine, isComplete && { backgroundColor: C.green }]} />
                )}
                <View style={styles.phaseListContent}>
                  <Text style={[styles.phaseListName, isActive && { color: C.amber, fontWeight: '700' }]}>{phase.name}</Text>
                  {phase.start_date && (
                    <Text style={styles.phaseListDate}>
                      {new Date(phase.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {phase.end_date && ` – ${new Date(phase.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </Text>
                  )}
                </View>
                <Text style={[
                  styles.phaseListPercent,
                  isComplete && { color: C.green },
                  isActive && { color: C.amber },
                ]}>{phase.completion_percentage || 0}%</Text>
              </View>
            );
          })}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSub: { fontSize: 13, marginTop: 2 },
  scrollContent: { paddingBottom: 20 },

  // Current phase banner
  currentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 12, marginBottom: 8,
    backgroundColor: C.amberLight, borderRadius: 12, padding: 14,
  },
  currentDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.amber },
  currentLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, color: C.amberDark },
  currentName: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 2 },
  currentPercent: { fontSize: 18, fontWeight: '800', color: C.amber },

  // Calendar
  calendarContainer: { marginHorizontal: 16, marginTop: 8, borderRadius: 12, overflow: 'hidden' },

  // Day detail
  daySection: { marginHorizontal: 16, marginTop: 20 },
  dayDate: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  dayEmpty: { paddingVertical: 20, alignItems: 'center' },
  dayEmptyText: { fontSize: 14 },

  // Phase card
  phaseCard: {
    flexDirection: 'row', backgroundColor: C.surface, borderRadius: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
    overflow: 'hidden',
  },
  phaseAccent: { width: 4 },
  phaseContent: { flex: 1, padding: 14 },
  phaseName: { fontSize: 15, fontWeight: '600', color: C.text },
  phaseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  phaseStatus: { fontSize: 12, fontWeight: '500', color: C.textSec },
  phaseDates: { fontSize: 12, color: C.textMuted },
  progressBar: { height: 4, backgroundColor: C.border, borderRadius: 2, marginTop: 8 },
  progressFill: { height: 4, borderRadius: 2 },

  // All phases list
  allPhasesSection: { marginHorizontal: 16, marginTop: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: C.textMuted, marginBottom: 16 },
  phaseListItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, position: 'relative' },
  phaseListDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  phaseListLine: { position: 'absolute', left: 10, top: 22, width: 2, height: 30, backgroundColor: C.border },
  phaseListContent: { flex: 1, marginLeft: 12 },
  phaseListName: { fontSize: 15, fontWeight: '500', color: C.text },
  phaseListDate: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  phaseListPercent: { fontSize: 14, fontWeight: '700', color: C.textMuted },

  // Empty
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginTop: 12 },
  emptySub: { fontSize: 14, color: C.textMuted, marginTop: 4 },
});
