import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TASK_STATUSES } from '../../constants/theme';
import { getProjectColor } from '../../utils/calendarUtils';

const STATUS_MAP = {
  pending: 'not_started',
  completed: 'done',
  incomplete: 'stuck',
};

const getStatusKey = (task) => {
  if (task.status && TASK_STATUSES[task.status]) return task.status;
  return STATUS_MAP[task.status] || 'not_started';
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatSectionDate = (dateStr) => {
  const date = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) return { primary: 'Today', meta: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
  if (target.getTime() === tomorrow.getTime()) return { primary: 'Tomorrow', meta: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };

  return {
    primary: date.toLocaleDateString('en-US', { weekday: 'long' }),
    meta: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
};

const formatDivider = (startStr, endStr) => {
  const s = new Date(startStr + 'T12:00:00');
  const e = new Date(endStr + 'T12:00:00');
  if (startStr === endStr) {
    return s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const sameMonth = s.getMonth() === e.getMonth();
  const left = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const right = sameMonth
    ? e.toLocaleDateString('en-US', { day: 'numeric' })
    : e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${left} – ${right}`;
};

export default function AgendaView({ tasks, theme, onTaskPress, scrollToDate, onAddTaskForDate }) {
  const sectionListRef = useRef(null);
  const fabScale = useRef(new Animated.Value(0)).current;

  // Build sections: only days that have tasks, plus today as anchor.
  // Empty runs between task-days collapse into a single subtle divider.
  const sections = useMemo(() => {
    const today = todayStr();

    // Group tasks by date string (within their working window)
    const dayMap = new Map(); // dateStr -> task[]
    (tasks || []).forEach((t) => {
      if (!t.start_date) return;
      const start = t.start_date;
      const end = t.end_date || t.start_date;
      const sd = new Date(start + 'T12:00:00');
      const ed = new Date(end + 'T12:00:00');
      const cursor = new Date(sd);
      while (cursor <= ed) {
        const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;

        // Honor working days when project context is present
        const project = t.projects;
        let include = true;
        if (project) {
          const workingDays = project.working_days || [1, 2, 3, 4, 5];
          const nonWorking = project.non_working_dates || [];
          if (nonWorking.includes(dateStr)) include = false;
          else {
            const jsDay = cursor.getDay();
            const isoDay = jsDay === 0 ? 7 : jsDay;
            if (!workingDays.includes(isoDay)) include = false;
          }
        }
        if (include) {
          if (!dayMap.has(dateStr)) dayMap.set(dateStr, []);
          dayMap.get(dateStr).push(t);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    // Always include today even if empty (anchor)
    if (!dayMap.has(today)) dayMap.set(today, []);

    // Sort dates ascending
    const dates = Array.from(dayMap.keys()).sort();

    // Build sections, inserting empty-run dividers between non-adjacent days
    const out = [];
    for (let i = 0; i < dates.length; i++) {
      const dateStr = dates[i];
      const dayTasks = dayMap.get(dateStr);

      // Empty run before this date (relative to today or previous task-day)
      const prevStr = i === 0 ? today : dates[i - 1];
      if (i > 0) {
        const gap = daysBetween(prevStr, dateStr);
        if (gap > 1) {
          // Days in (prev, date) exclusive
          const startGap = addDays(prevStr, 1);
          const endGap = addDays(dateStr, -1);
          if (startGap <= endGap) {
            out.push({
              kind: 'gap',
              key: `gap-${prevStr}-${dateStr}`,
              startStr: startGap,
              endStr: endGap,
              data: [{ _gap: true, _key: `gap-${prevStr}-${dateStr}` }],
            });
          }
        }
      }

      const labels = formatSectionDate(dateStr);
      out.push({
        kind: 'day',
        key: dateStr,
        title: dateStr,
        primary: labels.primary,
        meta: labels.meta,
        isToday: dateStr === today,
        data: dayTasks.length > 0 ? dayTasks : [{ _empty: true, _date: dateStr }],
        count: dayTasks.length,
      });
    }

    return out;
  }, [tasks]);

  // Scroll to a specific date when requested by parent (e.g. from month tap)
  useEffect(() => {
    if (!scrollToDate || !sectionListRef.current) return;
    const idx = sections.findIndex((s) => s.kind === 'day' && s.title === scrollToDate);
    if (idx < 0) return;
    // Defer to next frame so layout is ready
    const t = setTimeout(() => {
      try {
        sectionListRef.current.scrollToLocation({
          sectionIndex: idx,
          itemIndex: 0,
          viewPosition: 0,
          animated: true,
        });
      } catch (_) { /* SectionList may not be ready yet — safe to ignore */ }
    }, 50);
    return () => clearTimeout(t);
  }, [scrollToDate, sections]);

  // FAB entrance animation (owner only)
  useEffect(() => {
    if (!onAddTaskForDate) return;
    Animated.spring(fabScale, {
      toValue: 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [onAddTaskForDate, fabScale]);

  const renderSectionHeader = useCallback(({ section }) => {
    if (section.kind === 'gap') return null;

    return (
      <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
        <View style={styles.sectionHeaderLeft}>
          <Text style={[
            styles.sectionPrimary,
            { color: section.isToday ? theme.primaryBlue : theme.primaryText },
          ]}>
            {section.primary}
          </Text>
          <Text style={[styles.sectionMeta, { color: theme.secondaryText }]}>
            · {section.meta}
          </Text>
        </View>
        {section.count > 0 && (
          <Text style={[styles.sectionCount, { color: theme.secondaryText }]}>
            {section.count} {section.count === 1 ? 'task' : 'tasks'}
          </Text>
        )}
      </View>
    );
  }, [theme]);

  const renderItem = useCallback(({ item, section }) => {
    if (item._gap) {
      return (
        <View style={styles.gapRow}>
          <View style={[styles.gapLine, { backgroundColor: theme.border }]} />
          <Text style={[styles.gapText, { color: theme.secondaryText }]}>
            No tasks · {formatDivider(section.startStr, section.endStr)}
          </Text>
          <View style={[styles.gapLine, { backgroundColor: theme.border }]} />
        </View>
      );
    }

    if (item._empty) {
      return (
        <Text style={[styles.emptyDay, { color: theme.placeholderText || theme.secondaryText }]}>
          Nothing scheduled
        </Text>
      );
    }

    const statusKey = getStatusKey(item);
    const statusDef = TASK_STATUSES[statusKey] || TASK_STATUSES.not_started;
    const isMultiDay = item.start_date !== (item.end_date || item.start_date);
    const projectColor = item.project_id ? getProjectColor(item.project_id) : statusDef.color;

    return (
      <TouchableOpacity
        style={[styles.taskCard, { backgroundColor: theme.cardBackground || theme.white, borderColor: theme.border }]}
        onPress={() => onTaskPress?.(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.statusStripe, { backgroundColor: projectColor }]} />

        <View style={styles.taskContent}>
          <View style={styles.taskHeader}>
            <Text style={[styles.taskTitle, { color: theme.primaryText }]} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusDef.color + '18' }]}>
              <Text style={[styles.statusText, { color: statusDef.color }]}>{statusDef.label}</Text>
            </View>
          </View>

          {(item.projects?.name || isMultiDay) && (
            <View style={styles.taskMeta}>
              {item.projects?.name && (
                <Text style={[styles.projectName, { color: theme.secondaryText }]} numberOfLines={1}>
                  {item.projects.name}
                </Text>
              )}
              {isMultiDay && (
                <>
                  {item.projects?.name && <View style={[styles.metaDot, { backgroundColor: theme.border }]} />}
                  <Text style={[styles.dateRange, { color: theme.secondaryText }]}>
                    {new Date(item.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' – '}
                    {new Date((item.end_date || item.start_date) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                </>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [theme, onTaskPress]);

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        ref={sectionListRef}
        sections={sections}
        keyExtractor={(item, index) => item.id || item._key || `row-${index}`}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        windowSize={10}
        onScrollToIndexFailed={() => { /* swallow — sections may not be measured yet */ }}
      />

      {onAddTaskForDate && (
        <Animated.View
          style={[
            styles.fabWrap,
            { transform: [{ scale: fabScale }] },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: theme.primaryBlue, shadowColor: theme.shadow || '#000' }]}
            onPress={() => onAddTaskForDate(todayStr())}
            activeOpacity={0.85}
            accessibilityLabel="Add task"
          >
            <Ionicons name="add" size={26} color={theme.white === '#FFFFFF' ? '#FFFFFF' : '#FFFFFF'} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

// --- date helpers (local, no Date timezone math) ---
function addDays(dateStr, delta) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(a, b) {
  const da = new Date(a + 'T12:00:00');
  const db = new Date(b + 'T12:00:00');
  return Math.round((db - da) / 86400000);
}

const styles = StyleSheet.create({
  listContent: {
    paddingTop: 4,
    paddingBottom: 120,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flex: 1,
  },
  sectionPrimary: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 6,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  emptyDay: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  gapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 10,
  },
  gapLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  gapText: {
    fontSize: 11,
    fontWeight: '500',
  },
  taskCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statusStripe: {
    width: 4,
  },
  taskContent: {
    flex: 1,
    padding: 12,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  projectName: {
    fontSize: 12,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 6,
  },
  dateRange: {
    fontSize: 11,
  },
  fabWrap: {
    position: 'absolute',
    right: 20,
    bottom: 110,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
});
