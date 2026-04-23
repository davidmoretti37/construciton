import React, { useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TASK_STATUSES, getTaskStatus } from '../../constants/theme';

const STATUS_MAP = {
  pending: 'not_started',
  completed: 'done',
  incomplete: 'stuck',
};

const getStatusKey = (task) => {
  if (task.status && TASK_STATUSES[task.status]) return task.status;
  return STATUS_MAP[task.status] || 'not_started';
};

const formatSectionDate = (dateStr) => {
  const date = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === tomorrow.getTime()) return 'Tomorrow';

  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};

export default function AgendaView({ tasks, theme, onTaskPress, onTaskLongPress, scrollToDate, onAddTaskForDate }) {
  const sectionListRef = useRef(null);

  // Build sections: one per day from today through the last scheduled task
  // (plus a small buffer) — not capped at 30 days. Month view shows the
  // whole project window and the agenda should too. Render EVERY day
  // (not just days with tasks) so the owner can tap "+" on any day to add
  // an ad-hoc task. Empty days get a subtle placeholder.
  const sections = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = [];

    // Extend through the furthest task end_date (+7 day buffer) so workers
    // see every scheduled day. Falls back to 60 days when nothing scheduled
    // and is hard-capped at 366 to prevent runaway loops on bad dates.
    let furthestEnd = new Date(today);
    furthestEnd.setDate(furthestEnd.getDate() + 60);
    (tasks || []).forEach((t) => {
      const iso = t.end_date || t.start_date;
      if (!iso) return;
      const [y, m, d] = String(iso).split('-');
      const parsed = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      if (!isNaN(parsed.getTime()) && parsed > furthestEnd) furthestEnd = parsed;
    });
    furthestEnd.setDate(furthestEnd.getDate() + 7);
    const totalDays = Math.min(
      366,
      Math.max(30, Math.floor((furthestEnd - today) / 86400000) + 1),
    );

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      // Find tasks active on this date
      const dayTasks = tasks.filter((t) => {
        if (!t.start_date) return false;
        const start = t.start_date;
        const end = t.end_date || t.start_date;
        if (dateStr < start || dateStr > end) return false;

        // Check working days (skip weekends / non-working dates for tasks
        // that have a project context; ad-hoc owner tasks with no project
        // pass through and show on the day they're pinned to).
        const project = t.projects;
        if (project) {
          const workingDays = project.working_days || [1, 2, 3, 4, 5];
          const nonWorking = project.non_working_dates || [];
          if (nonWorking.includes(dateStr)) return false;
          const jsDay = d.getDay();
          const isoDay = jsDay === 0 ? 7 : jsDay;
          if (!workingDays.includes(isoDay)) return false;
        }
        return true;
      });

      days.push({
        title: dateStr,
        formattedDate: formatSectionDate(dateStr),
        isToday: i === 0,
        isWeekend: (() => { const jd = d.getDay(); return jd === 0 || jd === 6; })(),
        data: dayTasks.length > 0 ? dayTasks : [{ _empty: true, _date: dateStr }],
      });
    }

    return days;
  }, [tasks]);

  const renderSectionHeader = useCallback(({ section }) => (
    <View style={[
      styles.sectionHeader,
      { backgroundColor: theme.background, borderBottomColor: theme.border },
      section.isToday && { borderLeftWidth: 3, borderLeftColor: theme.primaryBlue },
    ]}>
      <View style={{ flex: 1 }}>
        <Text style={[
          styles.sectionDate,
          { color: section.isToday ? theme.primaryBlue : theme.primaryText },
          section.isWeekend && !section.isToday && { color: theme.secondaryText },
        ]}>
          {section.formattedDate}
        </Text>
        {section.data.length === 1 && section.data[0]._empty && (
          <Text style={[styles.noTasks, { color: theme.secondaryText }]}>No tasks</Text>
        )}
      </View>
      {onAddTaskForDate && (
        <TouchableOpacity
          onPress={() => onAddTaskForDate(section.title)}
          style={[styles.addBtn, { borderColor: theme.primaryBlue + '40', backgroundColor: theme.primaryBlue + '10' }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={16} color={theme.primaryBlue} />
          <Text style={[styles.addBtnText, { color: theme.primaryBlue }]}>Add</Text>
        </TouchableOpacity>
      )}
    </View>
  ), [theme, onAddTaskForDate]);

  const renderTask = useCallback(({ item }) => {
    if (item._empty) return null;

    const statusKey = getStatusKey(item);
    const statusDef = TASK_STATUSES[statusKey] || TASK_STATUSES.not_started;
    const isMultiDay = item.start_date !== (item.end_date || item.start_date);

    return (
      <TouchableOpacity
        style={[styles.taskCard, { backgroundColor: theme.white, borderColor: theme.border }]}
        onPress={() => onTaskPress?.(item)}
        onLongPress={() => onTaskLongPress?.(item)}
        activeOpacity={0.7}
        delayLongPress={300}
      >
        {/* Status stripe */}
        <View style={[styles.statusStripe, { backgroundColor: statusDef.color }]} />

        <View style={styles.taskContent}>
          <View style={styles.taskHeader}>
            <Text style={[styles.taskTitle, { color: theme.primaryText }]} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusDef.color + '18' }]}>
              <Text style={[styles.statusText, { color: statusDef.color }]}>{statusDef.label}</Text>
            </View>
          </View>

          <View style={styles.taskMeta}>
            {item.projects?.name && (
              <Text style={[styles.projectName, { color: theme.secondaryText }]} numberOfLines={1}>
                {item.projects.name}
              </Text>
            )}
            {isMultiDay && (
              <>
                <View style={styles.metaDot} />
                <Text style={[styles.dateRange, { color: theme.secondaryText }]}>
                  {new Date(item.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' - '}
                  {new Date((item.end_date || item.start_date) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </>
            )}
          </View>

          {item.description ? (
            <Text style={[styles.taskDescription, { color: theme.secondaryText }]} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }, [theme, onTaskPress, onTaskLongPress]);

  return (
    <SectionList
      ref={sectionListRef}
      sections={sections}
      keyExtractor={(item, index) => item.id || `empty-${index}`}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderTask}
      stickySectionHeadersEnabled
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 100,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginTop: 4,
  },
  sectionDate: {
    fontSize: 15,
    fontWeight: '700',
  },
  noTasks: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '700',
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
    backgroundColor: '#D1D5DB',
    marginHorizontal: 6,
  },
  dateRange: {
    fontSize: 11,
  },
  taskDescription: {
    fontSize: 12,
    marginTop: 4,
  },
});
