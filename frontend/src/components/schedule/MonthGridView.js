import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { TASK_STATUSES } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CELL_WIDTH = Math.floor((SCREEN_WIDTH - 2) / 7);
const MAX_BARS_PER_WEEK = 3;
const BAR_HEIGHT = 18;
const BAR_GAP = 2;
const DAY_HEADER_HEIGHT = 32;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_MAP = {
  pending: 'not_started',
  completed: 'done',
  incomplete: 'stuck',
};

const getColor = (task) => {
  const status = task.status && TASK_STATUSES[task.status]
    ? task.status
    : STATUS_MAP[task.status] || 'not_started';
  return (TASK_STATUSES[status] || TASK_STATUSES.not_started).color;
};

// Check if a date is a working day for its project
const isWorkingDay = (dateStr, project) => {
  if (!project) return true;
  const workingDays = project.working_days || [1, 2, 3, 4, 5];
  const nonWorking = project.non_working_dates || [];
  if (nonWorking.includes(dateStr)) return false;
  const d = new Date(dateStr + 'T12:00:00');
  const jsDay = d.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  return workingDays.includes(isoDay);
};

export default function MonthGridView({ currentMonth, tasks, theme, onDayPress, selectedDate }) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // Build the grid: 6 weeks max, 7 days each
  const { weeks, todayStr } = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const weeks = [];
    let dayCounter = 1 - startOffset;

    for (let w = 0; w < 6; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(year, month, dayCounter);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        week.push({
          date,
          dateStr,
          day: date.getDate(),
          inMonth: date.getMonth() === month,
          isToday: dateStr === todayStr,
          isSelected: dateStr === selectedDate,
          colIndex: d,
        });
        dayCounter++;
      }
      // Only include week if at least one day is in the current month
      if (week.some((d) => d.inMonth)) {
        weeks.push(week);
      }
    }
    return { weeks, todayStr };
  }, [year, month, selectedDate]);

  // Build spanning bars for each week
  const weekBars = useMemo(() => {
    return weeks.map((week) => {
      const weekStart = week[0].dateStr;
      const weekEnd = week[6].dateStr;

      // Find tasks that overlap this week
      const overlapping = tasks.filter((t) => {
        if (!t.start_date) return false;
        const tEnd = t.end_date || t.start_date;
        return t.start_date <= weekEnd && tEnd >= weekStart;
      });

      // Create bar segments
      const bars = overlapping.map((task) => {
        const tStart = task.start_date;
        const tEnd = task.end_date || task.start_date;

        // Find start column: first day in this week that's >= task start
        let startCol = 0;
        for (let i = 0; i < 7; i++) {
          if (week[i].dateStr >= tStart) { startCol = i; break; }
          if (i === 6) startCol = 0; // task started before this week
        }

        // Find end column: last day in this week that's <= task end
        let endCol = startCol;
        for (let i = 6; i >= 0; i--) {
          if (week[i].dateStr <= tEnd) { endCol = i; break; }
        }

        // Ensure endCol >= startCol
        if (endCol < startCol) endCol = startCol;

        return {
          task,
          startCol,
          endCol,
          color: getColor(task),
          title: task.title,
        };
      });

      // Sort by span length (longer first) and limit
      bars.sort((a, b) => (b.endCol - b.startCol) - (a.endCol - a.startCol));
      const visible = bars.slice(0, MAX_BARS_PER_WEEK);
      const overflow = bars.length - MAX_BARS_PER_WEEK;

      return { visible, overflow };
    });
  }, [weeks, tasks]);

  // Non-working day check for display
  const isNonWorkingDay = useCallback((dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    const jsDay = d.getDay();
    return jsDay === 0 || jsDay === 6; // Default: weekends
  }, []);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Weekday headers */}
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <View key={label} style={styles.weekdayCell}>
            <Text style={[styles.weekdayText, { color: i === 0 || i === 6 ? theme.secondaryText : theme.primaryText }]}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* Week rows */}
      {weeks.map((week, weekIdx) => {
        const bars = weekBars[weekIdx];
        const barsHeight = Math.max(bars.visible.length, 1) * (BAR_HEIGHT + BAR_GAP);
        const rowHeight = DAY_HEADER_HEIGHT + barsHeight + (bars.overflow > 0 ? 16 : 4);

        return (
          <View key={weekIdx} style={[styles.weekRow, { height: rowHeight, borderBottomColor: theme.border }]}>
            {/* Day number cells */}
            <View style={styles.dayNumberRow}>
              {week.map((day) => (
                <TouchableOpacity
                  key={day.dateStr}
                  style={styles.dayCell}
                  onPress={() => onDayPress?.(day.dateStr)}
                  activeOpacity={0.6}
                >
                  <View style={[
                    styles.dayNumber,
                    day.isToday && { backgroundColor: theme.errorRed, borderRadius: 12 },
                    day.isSelected && !day.isToday && { backgroundColor: theme.primaryBlue + '20', borderRadius: 12 },
                  ]}>
                    <Text style={[
                      styles.dayText,
                      { color: !day.inMonth ? theme.secondaryText + '50' : day.isToday ? '#fff' : theme.primaryText },
                    ]}>
                      {day.day}
                    </Text>
                  </View>
                  {isNonWorkingDay(day.dateStr) && day.inMonth && (
                    <Text style={[styles.noWorkLabel, { color: theme.secondaryText + '60' }]}>No work</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Task bars */}
            {bars.visible.map((bar, barIdx) => {
              const left = bar.startCol * CELL_WIDTH + 2;
              const width = (bar.endCol - bar.startCol + 1) * CELL_WIDTH - 4;
              const top = DAY_HEADER_HEIGHT + barIdx * (BAR_HEIGHT + BAR_GAP);

              return (
                <TouchableOpacity
                  key={bar.task.id || barIdx}
                  style={[styles.taskBar, { left, width, top, backgroundColor: bar.color }]}
                  onPress={() => onDayPress?.(week[bar.startCol].dateStr)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.taskBarText} numberOfLines={1}>
                    {bar.title}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Overflow indicator */}
            {bars.overflow > 0 && (
              <Text style={[styles.overflowText, {
                top: DAY_HEADER_HEIGHT + MAX_BARS_PER_WEEK * (BAR_HEIGHT + BAR_GAP),
                color: theme.secondaryText,
              }]}>
                +{bars.overflow} more
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  weekdayRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  weekdayCell: {
    width: CELL_WIDTH,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
  },
  weekRow: {
    position: 'relative',
    borderBottomWidth: 1,
  },
  dayNumberRow: {
    flexDirection: 'row',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  dayCell: {
    width: CELL_WIDTH,
    alignItems: 'center',
    paddingTop: 4,
  },
  dayNumber: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 13,
    fontWeight: '500',
  },
  noWorkLabel: {
    fontSize: 7,
    marginTop: 1,
  },
  taskBar: {
    position: 'absolute',
    height: BAR_HEIGHT,
    borderRadius: 4,
    paddingHorizontal: 6,
    justifyContent: 'center',
    zIndex: 1,
  },
  taskBarText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  overflowText: {
    position: 'absolute',
    left: 8,
    fontSize: 10,
    fontWeight: '500',
  },
});
