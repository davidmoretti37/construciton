import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getProjectColor, formatDateString } from '../utils/calendarUtils';

const MAX_CELL_HEIGHT = 58;

const AppleCalendarMonth = ({
  currentMonth,
  selectedDate,
  onDateSelect,
  onMonthChange,
  onTitlePress,
  tasks = [],
  events = [],
  theme,
}) => {
  const { t } = useTranslation('common');

  const todayString = useMemo(() => {
    const now = new Date();
    return formatDateString(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  // Build dot lookup: Map<dateString, [color, color, ...]> (unique colors only)
  const dotMap = useMemo(() => {
    const map = {};

    const addColor = (dateStr, color) => {
      if (!map[dateStr]) map[dateStr] = new Set();
      map[dateStr].add(color);
    };

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

        if (isWorking) addColor(dateStr, color);

        d.setDate(d.getDate() + 1);
        safety++;
      }
    }

    for (const event of events) {
      if (!event.start_datetime) continue;
      const color = event.color || '#3B82F6';
      const startDate = new Date(event.start_datetime);
      const dateStr = formatDateString(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      addColor(dateStr, color);
    }

    // Convert Sets to arrays
    const result = {};
    for (const key in map) {
      result[key] = Array.from(map[key]).slice(0, 3);
    }
    return result;
  }, [tasks, events]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startingDayOfWeek = new Date(year, month, 1).getDay();
  const prevMonthLastDay = new Date(year, month, 0).getDate();

  const changeMonth = (offset) => {
    onMonthChange(new Date(year, month + offset, 1));
  };

  const goToToday = () => {
    const now = new Date();
    onMonthChange(new Date(now.getFullYear(), now.getMonth(), 1));
    onDateSelect(formatDateString(now.getFullYear(), now.getMonth(), now.getDate()));
  };

  const monthNames = [
    t('calendar.months.january'), t('calendar.months.february'), t('calendar.months.march'),
    t('calendar.months.april'), t('calendar.months.may'), t('calendar.months.june'),
    t('calendar.months.july'), t('calendar.months.august'), t('calendar.months.september'),
    t('calendar.months.october'), t('calendar.months.november'), t('calendar.months.december'),
  ];

  const dayNames = [
    t('calendar.daysShort.sun'), t('calendar.daysShort.mon'), t('calendar.daysShort.tue'),
    t('calendar.daysShort.wed'), t('calendar.daysShort.thu'), t('calendar.daysShort.fri'),
    t('calendar.daysShort.sat'),
  ];

  const renderDayCell = (dayNum, dateString, isCurrentMonth, colIdx) => {
    const isSelected = dateString === selectedDate;
    const isToday = dateString === todayString;
    const isPast = dateString < todayString;
    const dots = dotMap[dateString] || [];
    const isLastCol = colIdx === 6;

    return (
      <TouchableOpacity
        key={dateString}
        style={[
          styles.dayCell,
          !isLastCol && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: theme.border || '#E5E7EB' },
          !isCurrentMonth && { opacity: 0.3 },
          isCurrentMonth && isPast && !isSelected && !isToday && { opacity: 0.5 },
          isSelected && !isToday && { backgroundColor: (theme.primaryBlue || '#3B82F6') + '0A' },
        ]}
        onPress={() => {
          onDateSelect(dateString);
          if (!isCurrentMonth) {
            const [y, m] = dateString.split('-').map(Number);
            onMonthChange(new Date(y, m - 1, 1));
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.dayNumberContainer}>
          <View style={[
            styles.dayNumberCircle,
            isToday && { backgroundColor: theme.errorRed || '#EF4444' },
            isSelected && !isToday && { backgroundColor: theme.primaryBlue },
          ]}>
            <Text style={[
              styles.dayNumber,
              { color: theme.primaryText },
              (isToday || isSelected) && { color: '#FFFFFF', fontWeight: '700' },
            ]}>
              {dayNum}
            </Text>
          </View>
        </View>

        {dots.length > 0 && (
          <View style={styles.dotRow}>
            {dots.map((color, idx) => (
              <View key={idx} style={[styles.dot, { backgroundColor: color }]} />
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderGrid = () => {
    const rows = [];
    const allCells = [];

    for (let i = 0; i < startingDayOfWeek; i++) {
      const day = prevMonthLastDay - startingDayOfWeek + 1 + i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      allCells.push({ day, dateString: formatDateString(prevYear, prevMonth, day), isCurrentMonth: false });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      allCells.push({ day, dateString: formatDateString(year, month, day), isCurrentMonth: true });
    }

    const totalRows = Math.ceil(allCells.length / 7);
    const neededCells = totalRows * 7;
    const trailingCount = neededCells - allCells.length;
    for (let day = 1; day <= trailingCount; day++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      allCells.push({ day, dateString: formatDateString(nextYear, nextMonth, day), isCurrentMonth: false });
    }

    for (let r = 0; r < totalRows; r++) {
      const rowCells = allCells.slice(r * 7, (r + 1) * 7);
      rows.push(
        <View key={`row-${r}`} style={[
          styles.weekRow,
          r < totalRows - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border || '#E5E7EB' },
        ]}>
          {rowCells.map((cell, colIdx) =>
            renderDayCell(cell.day, cell.dateString, cell.isCurrentMonth, colIdx)
          )}
        </View>
      );
    }

    return rows;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={theme.primaryBlue} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onTitlePress} activeOpacity={onTitlePress ? 0.6 : 1} style={styles.headerCenter}>
          <Text style={[styles.monthText, { color: theme.primaryText }]}>
            {monthNames[month]} {year}
          </Text>
          {onTitlePress && <Ionicons name="chevron-down" size={14} color={theme.secondaryText} style={{ marginLeft: 4 }} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={goToToday} style={[styles.todayButton, { borderColor: theme.primaryBlue }]}>
          <Text style={[styles.todayButtonText, { color: theme.primaryBlue }]}>
            {t('calendar.today', 'Today')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={22} color={theme.primaryBlue} />
        </TouchableOpacity>
      </View>

      {/* Day name headers */}
      <View style={[styles.dayNamesRow, { borderBottomColor: theme.border || '#E5E7EB' }]}>
        {dayNames.map((name, idx) => (
          <View key={idx} style={styles.dayNameCell}>
            <Text style={[
              styles.dayNameText,
              { color: theme.secondaryText },
              (idx === 0 || idx === 6) && { color: (theme.secondaryText || '#9CA3AF') + '99' },
            ]}>
              {name}
            </Text>
          </View>
        ))}
      </View>

      {/* Grid */}
      <View style={styles.gridContainer}>
        {renderGrid()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButton: {
    padding: 8,
  },
  monthText: {
    fontSize: 17,
    fontWeight: '700',
  },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dayNamesRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
  },
  dayNameCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayNameText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gridContainer: {
    overflow: 'hidden',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    height: MAX_CELL_HEIGHT,
    paddingTop: 6,
    alignItems: 'center',
    overflow: 'hidden',
  },
  dayNumberContainer: {
    marginBottom: 4,
  },
  dayNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNumber: {
    fontSize: 15,
    fontWeight: '400',
    textAlign: 'center',
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});

export default AppleCalendarMonth;
