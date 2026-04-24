import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getProjectColor } from '../../utils/calendarUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CELL_WIDTH = Math.floor((SCREEN_WIDTH - 2) / 7);
const MAX_DOTS = 4;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// A date is non-working if every active project for that day says so.
// When no project context is present, fall back to weekend = non-working.
const isNonWorkingDay = (dateStr, dayProjects) => {
  if (!dayProjects || dayProjects.length === 0) {
    const d = new Date(dateStr + 'T12:00:00');
    const jsDay = d.getDay();
    return jsDay === 0 || jsDay === 6;
  }
  return dayProjects.every((p) => {
    const workingDays = p.working_days || [1, 2, 3, 4, 5];
    const nonWorking = p.non_working_dates || [];
    if (nonWorking.includes(dateStr)) return true;
    const d = new Date(dateStr + 'T12:00:00');
    const jsDay = d.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    return !workingDays.includes(isoDay);
  });
};

const isWeekend = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00');
  const jsDay = d.getDay();
  return jsDay === 0 || jsDay === 6;
};

export default function MonthGridView({
  currentMonth,
  tasks,
  theme,
  onDayPress,
  selectedDate,
  onMonthChange,
  onResetToToday,
}) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const today = todayStr();

  // Build the weeks grid
  const weeks = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();

    const w = [];
    let dayCounter = 1 - startOffset;
    for (let row = 0; row < 6; row++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(year, month, dayCounter);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        week.push({
          date,
          dateStr,
          day: date.getDate(),
          inMonth: date.getMonth() === month,
          colIndex: d,
        });
        dayCounter++;
      }
      if (week.some((d) => d.inMonth)) w.push(week);
    }
    return w;
  }, [year, month]);

  // Aggregate tasks per day → up to MAX_DOTS unique project-colored dots + overflow count
  const dayInfo = useMemo(() => {
    const map = new Map(); // dateStr -> { dots: Color[], overflow: number, projects: Project[] }
    weeks.forEach((week) => week.forEach((d) => {
      if (!d.inMonth) { map.set(d.dateStr, { dots: [], overflow: 0, projects: [] }); return; }
      map.set(d.dateStr, { dots: [], overflow: 0, projects: [] });
    }));

    (tasks || []).forEach((t) => {
      if (!t.start_date) return;
      const start = t.start_date;
      const end = t.end_date || t.start_date;
      const sd = new Date(start + 'T12:00:00');
      const ed = new Date(end + 'T12:00:00');
      const cursor = new Date(sd);
      while (cursor <= ed) {
        const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        const slot = map.get(dateStr);
        if (slot) {
          // Track project for non-working calc
          if (t.projects && !slot.projects.find((p) => p.id === t.projects.id)) {
            slot.projects.push(t.projects);
          }
          // Honor working days within the project context
          let include = true;
          if (t.projects) {
            const wd = t.projects.working_days || [1, 2, 3, 4, 5];
            const nw = t.projects.non_working_dates || [];
            if (nw.includes(dateStr)) include = false;
            else {
              const jsDay = cursor.getDay();
              const isoDay = jsDay === 0 ? 7 : jsDay;
              if (!wd.includes(isoDay)) include = false;
            }
          }
          if (include) {
            const color = t.project_id ? getProjectColor(t.project_id) : (t.color || theme.primaryBlue);
            if (!slot.dots.includes(color)) {
              if (slot.dots.length < MAX_DOTS) slot.dots.push(color);
              else slot.overflow += 1;
            }
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    return map;
  }, [weeks, tasks, theme.primaryBlue]);

  const handleHeaderPress = useCallback(() => {
    onResetToToday?.();
  }, [onResetToToday]);

  return (
    <View style={styles.container}>
      {/* Month nav header — integrated into the grid for compactness */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => onMonthChange?.(-1)} style={styles.monthNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={20} color={theme.primaryText} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleHeaderPress} activeOpacity={0.7}>
          <Text style={[styles.monthTitle, { color: theme.primaryText }]}>
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onMonthChange?.(1)} style={styles.monthNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={20} color={theme.primaryText} />
        </TouchableOpacity>
      </View>

      {/* Weekday headers */}
      <View style={[styles.weekdayRow, { borderBottomColor: theme.border }]}>
        {WEEKDAY_LABELS.map((label, i) => (
          <View key={label} style={styles.weekdayCell}>
            <Text style={[
              styles.weekdayText,
              { color: i === 0 || i === 6 ? theme.secondaryText : theme.primaryText },
            ]}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* Week rows */}
      {weeks.map((week, weekIdx) => (
        <View key={weekIdx} style={[styles.weekRow, { borderBottomColor: theme.border }]}>
          {week.map((day) => {
            const info = dayInfo.get(day.dateStr) || { dots: [], overflow: 0, projects: [] };
            const isToday = day.dateStr === today;
            const isSelected = day.dateStr === selectedDate;
            const isWknd = isWeekend(day.dateStr);
            const nonWorking = isNonWorkingDay(day.dateStr, info.projects);

            return (
              <TouchableOpacity
                key={day.dateStr}
                style={[
                  styles.dayCell,
                  isWknd && day.inMonth && { backgroundColor: theme.lightGray + '60' },
                  nonWorking && !isWknd && day.inMonth && { backgroundColor: theme.lightGray + '40' },
                ]}
                onPress={() => onDayPress?.(day.dateStr)}
                activeOpacity={0.6}
                disabled={!day.inMonth}
              >
                <View style={[
                  styles.dayNumber,
                  isToday && {
                    borderWidth: 1.5,
                    borderColor: theme.primaryBlue,
                    backgroundColor: 'transparent',
                  },
                  isSelected && !isToday && {
                    backgroundColor: theme.primaryBlue + '20',
                  },
                ]}>
                  <Text style={[
                    styles.dayText,
                    {
                      color: !day.inMonth
                        ? (theme.placeholderText || theme.secondaryText) + '70'
                        : isToday
                          ? theme.primaryBlue
                          : theme.primaryText,
                      fontWeight: isToday ? '700' : '500',
                    },
                  ]}>
                    {day.day}
                  </Text>
                </View>

                {/* Project-colored dots */}
                {day.inMonth && info.dots.length > 0 && (
                  <View style={styles.dotRow}>
                    {info.dots.map((c, i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: c }]} />
                    ))}
                  </View>
                )}

                {/* Overflow indicator (corner) */}
                {day.inMonth && info.overflow > 0 && (
                  <Text style={[styles.overflowText, { color: theme.secondaryText }]}>
                    +{info.overflow}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  monthNavBtn: {
    padding: 4,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  weekdayRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekdayCell: {
    width: CELL_WIDTH,
    alignItems: 'center',
    paddingVertical: 6,
  },
  weekdayText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weekRow: {
    flex: 1,
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayCell: {
    width: CELL_WIDTH,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 4,
    position: 'relative',
  },
  dayNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 12,
  },
  dotRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 3,
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: CELL_WIDTH - 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  overflowText: {
    position: 'absolute',
    bottom: 3,
    right: 4,
    fontSize: 9,
    fontWeight: '600',
  },
});
