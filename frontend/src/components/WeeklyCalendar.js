import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const WeeklyCalendar = ({ selectedDate, onDateSelect, theme, eventDates = [] }) => {
  const { t } = useTranslation('common');
  const [weekStart, setWeekStart] = useState(() => getWeekStart(selectedDate || new Date()));

  // Update week when selectedDate changes externally
  useEffect(() => {
    if (selectedDate) {
      const newWeekStart = getWeekStart(selectedDate);
      if (newWeekStart.getTime() !== weekStart.getTime()) {
        setWeekStart(newWeekStart);
      }
    }
  }, [selectedDate]);

  // Get Sunday of the week containing the given date
  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Get array of 7 dates for the current week
  const getWeekDates = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  // Navigate to previous/next week
  const changeWeek = (offset) => {
    const newWeekStart = new Date(weekStart);
    newWeekStart.setDate(weekStart.getDate() + (offset * 7));
    setWeekStart(newWeekStart);
  };

  // Format date string for comparison (YYYY-MM-DD)
  const formatDateString = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Get translated month abbreviation
  const getMonthShort = (monthIndex) => {
    const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return t(`calendar.monthsShort.${monthKeys[monthIndex]}`);
  };

  // Format week range for header (e.g., "Jan 19 - 25, 2026")
  const formatWeekRange = () => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const startMonth = getMonthShort(weekStart.getMonth());
    const endMonth = getMonthShort(weekEnd.getMonth());
    const startDay = weekStart.getDate();
    const endDay = weekEnd.getDate();
    const year = weekEnd.getFullYear();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}, ${year}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  };

  // Check if date is today
  const isToday = (date) => {
    const today = new Date();
    return formatDateString(date) === formatDateString(today);
  };

  // Check if date is selected
  const isSelected = (date) => {
    if (!selectedDate) return false;
    return formatDateString(date) === formatDateString(new Date(selectedDate));
  };

  // Check if date has events
  const hasEvents = (date) => {
    const dateStr = formatDateString(date);
    return eventDates.includes(dateStr);
  };

  const dayNames = [
    t('calendar.daysShort.sun'), t('calendar.daysShort.mon'), t('calendar.daysShort.tue'),
    t('calendar.daysShort.wed'), t('calendar.daysShort.thu'), t('calendar.daysShort.fri'),
    t('calendar.daysShort.sat')
  ];
  const weekDates = getWeekDates();

  return (
    <View style={[styles.container, { backgroundColor: theme.white }]}>
      {/* Header with navigation and week range */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => changeWeek(-1)} style={styles.navButton}>
          <Ionicons name="chevron-back" size={22} color={theme.primaryBlue} />
        </TouchableOpacity>

        <Text style={[styles.weekRangeText, { color: theme.primaryText }]}>
          {formatWeekRange()}
        </Text>

        <TouchableOpacity onPress={() => changeWeek(1)} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={22} color={theme.primaryBlue} />
        </TouchableOpacity>
      </View>

      {/* Week strip */}
      <View style={styles.weekStrip}>
        {weekDates.map((date, index) => {
          const selected = isSelected(date);
          const today = isToday(date);
          const hasEvent = hasEvents(date);
          const dateString = formatDateString(date);

          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.dayCell,
                selected && [styles.selectedDay, { backgroundColor: theme.primaryBlue }],
                today && !selected && [styles.todayDay, { borderColor: theme.primaryBlue }],
              ]}
              onPress={() => onDateSelect(dateString)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayName,
                  { color: theme.secondaryText },
                  selected && { color: theme.white },
                  today && !selected && { color: theme.primaryBlue },
                ]}
              >
                {dayNames[index]}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  { color: theme.primaryText },
                  selected && { color: theme.white },
                  today && !selected && { color: theme.primaryBlue, fontWeight: '800' },
                ]}
              >
                {date.getDate()}
              </Text>
              {/* Event indicator dot */}
              <View style={styles.dotContainer}>
                {hasEvent && (
                  <View
                    style={[
                      styles.eventDot,
                      { backgroundColor: selected ? theme.white : theme.primaryBlue },
                    ]}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  navButton: {
    padding: 8,
  },
  weekRangeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    marginHorizontal: 2,
  },
  selectedDay: {
    borderRadius: 12,
  },
  todayDay: {
    borderWidth: 2,
    borderRadius: 12,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  dotContainer: {
    height: 8,
    marginTop: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

export default WeeklyCalendar;
