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
import { fetchDashboard, fetchProject, fetchProjectCalendar } from '../../services/clientPortalApi';
import AppleCalendarMonth from '../../components/AppleCalendarMonth';
import ClientHeader from '../../components/ClientHeader';

const C = {
  amber: '#F59E0B', amberDark: '#D97706', amberLight: '#FEF3C7',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
  green: '#10B981', red: '#EF4444', blue: '#3B82F6',
};

const PHASE_COLORS = ['#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#EF4444', '#EC4899', '#14B8A6', '#F97316'];

const formatDateString = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const getMonthRange = (date) => {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
};

export default function ClientTimelineScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projectId, setProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [phases, setPhases] = useState([]);
  const [events, setEvents] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return formatDateString(now.getFullYear(), now.getMonth(), now.getDate());
  });

  const loadData = useCallback(async (month) => {
    try {
      const dashboard = await fetchDashboard();
      const projects = dashboard?.projects || [];
      if (projects.length > 0) {
        const pid = projects[0].id;
        setProjectId(pid);
        setProjectName(projects[0].name);

        const { start, end } = getMonthRange(month || currentMonth);
        try {
          const calendar = await fetchProjectCalendar(pid, start, end);
          setPhases(calendar?.phases || []);
          setEvents([...(calendar?.tasks || []), ...(calendar?.events || [])]);
        } catch (calErr) {
          const proj = await fetchProject(pid).catch(() => null);
          setPhases(proj?.phases || []);
          setEvents([]);
        }
      }
    } catch (e) {
      console.error('Timeline load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentMonth]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleMonthChange = useCallback((newMonth) => {
    setCurrentMonth(newMonth);
    loadData(newMonth);
  }, [loadData]);

  // Convert events to calendar task format for AppleCalendarMonth
  const calendarTasks = useMemo(() => {
    const tasks = [];

    // Add tasks/events from backend — these are the main calendar items
    events
      .filter(e => e.start_date)
      .forEach((event) => {
        tasks.push({
          id: event.id,
          title: event.title,
          start_date: event.start_date,
          end_date: event.end_date || event.start_date,
          color: event.color || (event.type === 'visit' ? C.green : event.type === 'schedule' ? C.blue : C.amber),
          project_id: projectId,
          projects: {
            name: projectName,
            working_days: event.working_days || [1, 2, 3, 4, 5],
            non_working_dates: event.non_working_dates || [],
          },
        });
      });

    // Add phases as background spans (if they have dates)
    phases
      .filter(p => p.start_date && p.end_date)
      .forEach((phase, i) => {
        tasks.push({
          id: `phase-${phase.id}`,
          title: phase.name,
          start_date: phase.start_date,
          end_date: phase.end_date,
          color: PHASE_COLORS[i % PHASE_COLORS.length],
          project_id: projectId,
          projects: { name: projectName, working_days: [1, 2, 3, 4, 5] },
        });
      });

    return tasks;
  }, [phases, events, projectId, projectName]);

  // Get items for selected day
  const selectedDayItems = useMemo(() => {
    if (!selectedDate) return { dayPhases: [], dayEvents: [] };

    const dayPhases = phases.filter(p =>
      p.start_date && p.end_date && selectedDate >= p.start_date && selectedDate <= p.end_date
    );

    const dayEvents = events.filter(e =>
      e.start_date && selectedDate >= e.start_date && selectedDate <= (e.end_date || e.start_date)
    );

    return { dayPhases, dayEvents };
  }, [phases, events, selectedDate]);

  const currentPhase = phases.find(p => p.status === 'in_progress' || p.status === 'active');

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.background }]}>
        <ClientHeader title="Timeline" subtitle={projectName} navigation={navigation} />
        <ActivityIndicator size="large" color={C.amber} style={{ marginTop: 100 }} />
      </View>
    );
  }

  const selectedDateObj = new Date(selectedDate + 'T12:00:00');
  const { dayPhases, dayEvents } = selectedDayItems;
  const hasAnything = dayPhases.length > 0 || dayEvents.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <ClientHeader title="Timeline" subtitle={projectName} navigation={navigation} />
      <View style={styles.header}>
        {/* Empty - title moved to ClientHeader, but keep wrapper for spacing */}
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
            onMonthChange={handleMonthChange}
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

          {!hasAnything ? (
            <View style={styles.dayEmpty}>
              <Text style={[styles.dayEmptyText, { color: Colors.secondaryText }]}>Nothing scheduled</Text>
            </View>
          ) : (
            <>
              {/* Work events (crew on site, visits) */}
              {dayEvents.map((event) => (
                <View key={event.id} style={styles.eventCard}>
                  <View style={[styles.eventAccent, { backgroundColor: event.type === 'visit' ? C.green : C.blue }]} />
                  <View style={styles.eventContent}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <View style={styles.eventRow}>
                      {event.start_time && (
                        <Text style={styles.eventTime}>
                          <Ionicons name="time-outline" size={12} color={C.textMuted} />{' '}
                          {event.start_time}{event.end_time ? ` – ${event.end_time}` : ''}
                        </Text>
                      )}
                      {event.phase && <Text style={styles.eventPhase}>{event.phase}</Text>}
                    </View>
                    {event.notes ? <Text style={styles.eventNotes} numberOfLines={2}>{event.notes}</Text> : null}
                  </View>
                </View>
              ))}

              {/* Phases active on this day */}
              {dayPhases.map((phase) => (
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
                    {(phase.completion_percentage || 0) > 0 && (
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${phase.completion_percentage}%`, backgroundColor: PHASE_COLORS[phases.indexOf(phase) % PHASE_COLORS.length] }]} />
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </>
          )}
        </View>

        {/* All Phases List */}
        {phases.length > 0 && (
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
                    {(() => {
                      // Prefer real dates; otherwise fall back to status + task progress
                      if (phase.start_date) {
                        return (
                          <Text style={styles.phaseListDate}>
                            {new Date(phase.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {phase.end_date && ` – ${new Date(phase.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                          </Text>
                        );
                      }
                      const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
                      const total = tasks.length;
                      const done = tasks.filter(t => t?.completed === true || t?.status === 'done').length;
                      const statusLabel = isComplete
                        ? 'Completed'
                        : isActive
                        ? `In progress${total ? ` · ${done}/${total} tasks` : ''}`
                        : total > 0
                        ? `Upcoming · ${total} task${total !== 1 ? 's' : ''}`
                        : 'Upcoming';
                      return (
                        <Text style={[
                          styles.phaseListDate,
                          isComplete && { color: C.green, fontWeight: '600' },
                          isActive && { color: C.amber, fontWeight: '600' },
                        ]}>
                          {statusLabel}
                        </Text>
                      );
                    })()}
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
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSub: { fontSize: 13, marginTop: 2 },
  scrollContent: { paddingBottom: 20 },

  currentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 12, marginBottom: 8,
    backgroundColor: C.amberLight, borderRadius: 12, padding: 14,
  },
  currentDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.amber },
  currentLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, color: C.amberDark },
  currentName: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 2 },
  currentPercent: { fontSize: 18, fontWeight: '800', color: C.amber },

  calendarContainer: { marginHorizontal: 16, marginTop: 8, borderRadius: 12, overflow: 'hidden' },

  daySection: { marginHorizontal: 16, marginTop: 20 },
  dayDate: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  dayEmpty: { paddingVertical: 20, alignItems: 'center' },
  dayEmptyText: { fontSize: 14 },

  // Event cards (work/visits)
  eventCard: {
    flexDirection: 'row', backgroundColor: C.surface, borderRadius: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
    overflow: 'hidden',
  },
  eventAccent: { width: 4 },
  eventContent: { flex: 1, padding: 14 },
  eventTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  eventTime: { fontSize: 12, color: C.textSec },
  eventPhase: { fontSize: 12, color: C.textMuted, fontStyle: 'italic' },
  eventNotes: { fontSize: 12, color: C.textMuted, marginTop: 4 },

  // Phase cards
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

  allPhasesSection: { marginHorizontal: 16, marginTop: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: C.textMuted, marginBottom: 16 },
  phaseListItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, position: 'relative' },
  phaseListDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  phaseListLine: { position: 'absolute', left: 10, top: 22, width: 2, height: 30, backgroundColor: C.border },
  phaseListContent: { flex: 1, marginLeft: 12 },
  phaseListName: { fontSize: 15, fontWeight: '500', color: C.text },
  phaseListDate: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  phaseListPercent: { fontSize: 14, fontWeight: '700', color: C.textMuted },
});
