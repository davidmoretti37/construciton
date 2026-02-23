import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getProjectColor, formatDateString } from '../utils/calendarUtils';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MINI_MONTH_WIDTH = (SCREEN_WIDTH - 48) / 3; // 3 columns with padding

const AppleCalendarYear = ({
  currentYear,
  onYearChange,
  onMonthSelect,
  tasks = [],
  events = [],
  theme,
}) => {
  const { t } = useTranslation('common');

  const todayString = useMemo(() => {
    const now = new Date();
    return formatDateString(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  // Build a map of dateString → primary color (first task/event color for that day)
  const dotMap = useMemo(() => {
    const map = {};

    for (const task of tasks) {
      if (!task.start_date || !task.end_date) continue;
      const color = getProjectColor(task.project_id);
      const start = new Date(task.start_date + 'T00:00:00');
      const end = new Date(task.end_date + 'T00:00:00');
      const d = new Date(start);

      let safety = 0;
      while (d <= end && safety < 366) {
        const dateStr = formatDateString(d.getFullYear(), d.getMonth(), d.getDate());

        const project = task.projects;
        let isWorking = true;
        if (project) {
          const workingDays = project.working_days || [1, 2, 3, 4, 5];
          const nonWorkingDates = project.non_working_dates || [];
          if (nonWorkingDates.includes(dateStr)) {
            isWorking = false;
          } else {
            const jsDay = d.getDay();
            const isoDay = jsDay === 0 ? 7 : jsDay;
            isWorking = workingDays.includes(isoDay);
          }
        }

        if (isWorking && !map[dateStr]) {
          map[dateStr] = color;
        }

        d.setDate(d.getDate() + 1);
        safety++;
      }
    }

    for (const event of events) {
      if (!event.start_datetime) continue;
      const color = event.color || '#3B82F6';
      const startDate = new Date(event.start_datetime);
      const dateStr = formatDateString(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      if (!map[dateStr]) {
        map[dateStr] = color;
      }
    }

    return map;
  }, [tasks, events]);

  const goToToday = () => {
    const now = new Date();
    onYearChange(now.getFullYear());
  };

  const monthNamesShort = [
    t('calendar.months.january'), t('calendar.months.february'), t('calendar.months.march'),
    t('calendar.months.april'), t('calendar.months.may'), t('calendar.months.june'),
    t('calendar.months.july'), t('calendar.months.august'), t('calendar.months.september'),
    t('calendar.months.october'), t('calendar.months.november'), t('calendar.months.december'),
  ];

  const dayLetters = [
    t('calendar.daysShort.sun'), t('calendar.daysShort.mon'), t('calendar.daysShort.tue'),
    t('calendar.daysShort.wed'), t('calendar.daysShort.thu'), t('calendar.daysShort.fri'),
    t('calendar.daysShort.sat'),
  ];

  const renderMiniMonth = (monthIdx) => {
    const firstDay = new Date(currentYear, monthIdx, 1);
    const daysInMonth = new Date(currentYear, monthIdx + 1, 0).getDate();
    const startingDay = firstDay.getDay();

    const dayCellSize = Math.floor((MINI_MONTH_WIDTH - 8) / 7);

    const cells = [];

    // Empty leading cells
    for (let i = 0; i < startingDay; i++) {
      cells.push(
        <View key={`empty-${i}`} style={{ width: dayCellSize, height: dayCellSize, alignItems: 'center', justifyContent: 'center' }} />
      );
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateString(currentYear, monthIdx, day);
      const isToday = dateStr === todayString;
      const dotColor = dotMap[dateStr];

      cells.push(
        <View key={day} style={{ width: dayCellSize, height: dayCellSize, alignItems: 'center', justifyContent: 'center' }}>
          <View style={[
            {
              width: dayCellSize - 2,
              height: dayCellSize - 2,
              borderRadius: (dayCellSize - 2) / 2,
              alignItems: 'center',
              justifyContent: 'center',
            },
            isToday && { backgroundColor: theme.errorRed || '#EF4444' },
          ]}>
            <Text style={[
              styles.miniDayNumber,
              { color: theme.primaryText },
              isToday && { color: '#FFFFFF', fontWeight: '700' },
            ]}>
              {day}
            </Text>
          </View>
          {dotColor && !isToday && (
            <View style={[styles.miniDot, { backgroundColor: dotColor }]} />
          )}
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={monthIdx}
        style={[styles.miniMonthContainer, { width: MINI_MONTH_WIDTH }]}
        onPress={() => onMonthSelect(monthIdx)}
        activeOpacity={0.6}
      >
        <Text style={[styles.miniMonthTitle, { color: theme.primaryText }]}>
          {monthNamesShort[monthIdx]}
        </Text>

        {/* Day letter headers */}
        <View style={styles.miniDayLettersRow}>
          {dayLetters.map((letter, idx) => (
            <View key={idx} style={{ width: dayCellSize, alignItems: 'center' }}>
              <Text style={[styles.miniDayLetter, { color: theme.secondaryText }]}>
                {letter.charAt(0)}
              </Text>
            </View>
          ))}
        </View>

        {/* Day grid */}
        <View style={styles.miniDaysGrid}>
          {cells}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onYearChange(currentYear - 1)} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={theme.primaryBlue} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.yearText, { color: theme.primaryText }]}>
            {currentYear}
          </Text>
          <TouchableOpacity onPress={goToToday} style={styles.todayButton}>
            <Text style={[styles.todayButtonText, { color: theme.primaryBlue }]}>
              {t('calendar.today', 'Today')}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => onYearChange(currentYear + 1)} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color={theme.primaryBlue} />
        </TouchableOpacity>
      </View>

      {/* 12 mini months in 3-column grid */}
      <View style={styles.yearGrid}>
        {Array.from({ length: 12 }, (_, i) => renderMiniMonth(i))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navButton: {
    padding: 6,
  },
  yearText: {
    fontSize: 22,
    fontWeight: '700',
  },
  todayButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  miniMonthContainer: {
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  miniMonthTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  miniDayLettersRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  miniDayLetter: {
    fontSize: 8,
    fontWeight: '600',
  },
  miniDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  miniDayNumber: {
    fontSize: 9,
    fontWeight: '400',
    textAlign: 'center',
  },
  miniDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    bottom: 0,
  },
});

export default AppleCalendarYear;
