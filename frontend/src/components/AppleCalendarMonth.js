import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getProjectColor, formatDateString } from '../utils/calendarUtils';

const MAX_EVENTS_PER_CELL = 2;

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

  // Build cell data: Map<dateString, Array<{title, color}>>
  const cellDataMap = useMemo(() => {
    const map = {};

    const addItem = (dateStr, item) => {
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(item);
    };

    for (const task of tasks) {
      if (!task.start_date || !task.end_date) continue;
      const color = getProjectColor(task.project_id);
      const title = task.title || task.projects?.name || '';
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

        if (isWorking) addItem(dateStr, { title, color });

        d.setDate(d.getDate() + 1);
        safety++;
      }
    }

    for (const event of events) {
      if (!event.start_datetime) continue;
      const color = event.color || '#3B82F6';
      const title = event.title || '';
      const startDate = new Date(event.start_datetime);
      const dateStr = formatDateString(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      addItem(dateStr, { title, color });
    }

    return map;
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

  const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const renderDayCell = (dayNum, dateString, isCurrentMonth, colIdx) => {
    const isSelected = dateString === selectedDate;
    const isToday = dateString === todayString;
    const isPast = dateString < todayString;
    const cellItems = cellDataMap[dateString] || [];
    const visibleItems = cellItems.slice(0, MAX_EVENTS_PER_CELL);
    const overflowCount = cellItems.length - MAX_EVENTS_PER_CELL;

    return (
      <TouchableOpacity
        key={dateString}
        style={[
          styles.dayCell,
          !isCurrentMonth && { opacity: 0.3 },
          isCurrentMonth && isPast && !isSelected && !isToday && { opacity: 0.6 },
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
        {/* Day number */}
        <View style={styles.dayNumberRow}>
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

        {/* Event blocks */}
        <View style={styles.eventBlocksContainer}>
          {visibleItems.map((item, idx) => (
            <View key={idx} style={[styles.eventBlock, { backgroundColor: item.color }]}>
              <Text style={styles.eventBlockText} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          ))}
          {overflowCount > 0 && (
            <Text style={[styles.overflowText, { color: theme.secondaryText }]}>
              +{overflowCount}
            </Text>
          )}
        </View>
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
        <View key={`row-${r}`} style={styles.weekRow}>
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
      {/* Header — Apple style */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onTitlePress} activeOpacity={onTitlePress ? 0.6 : 1} style={styles.yearButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={18} color={theme.primaryBlue} />
          <Text style={[styles.yearText, { color: theme.primaryBlue }]}>{year}</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={goToToday} style={[styles.todayButton, { borderColor: theme.primaryBlue }]}>
            <Text style={[styles.todayButtonText, { color: theme.primaryBlue }]}>
              {t('calendar.today', 'Today')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={22} color={theme.primaryBlue} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-forward" size={22} color={theme.primaryBlue} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Large month name */}
      <Text style={[styles.monthTitle, { color: theme.primaryText }]}>
        {monthNames[month]}
      </Text>

      {/* Single-letter day names */}
      <View style={styles.dayNamesRow}>
        {dayLetters.map((letter, idx) => (
          <View key={idx} style={styles.dayNameCell}>
            <Text style={[
              styles.dayNameText,
              { color: theme.secondaryText },
              (idx === 0 || idx === 6) && { color: (theme.secondaryText || '#9CA3AF') + '80' },
            ]}>
              {letter}
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
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  yearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  yearText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navButton: {
    padding: 6,
  },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 4,
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Month title
  monthTitle: {
    fontSize: 28,
    fontWeight: '800',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  // Day names
  dayNamesRow: {
    flexDirection: 'row',
    paddingBottom: 6,
    marginBottom: 2,
  },
  dayNameCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayNameText: {
    fontSize: 11,
    fontWeight: '500',
  },
  // Grid
  gridContainer: {
    overflow: 'hidden',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  // Day cell
  dayCell: {
    flex: 1,
    minHeight: 76,
    paddingTop: 4,
    paddingHorizontal: 1,
    alignItems: 'stretch',
  },
  dayNumberRow: {
    alignItems: 'flex-start',
    paddingLeft: 2,
    marginBottom: 2,
  },
  dayNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNumber: {
    fontSize: 17,
    fontWeight: '400',
    textAlign: 'center',
  },
  // Event blocks
  eventBlocksContainer: {
    flex: 1,
    gap: 1,
  },
  eventBlock: {
    height: 15,
    borderRadius: 3,
    paddingHorizontal: 3,
    justifyContent: 'center',
  },
  eventBlockText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  overflowText: {
    fontSize: 9,
    fontWeight: '500',
    paddingLeft: 3,
    marginTop: 1,
  },
});

export default AppleCalendarMonth;
