import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const CustomCalendar = ({ onDateSelect, selectedStart, selectedEnd, theme }) => {
  const { t } = useTranslation('common');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const isDateInRange = (dateString) => {
    if (!selectedStart || !selectedEnd) return false;
    const date = new Date(dateString);
    const start = new Date(selectedStart);
    const end = new Date(selectedEnd);
    return date >= start && date <= end;
  };

  const isDateSelected = (dateString) => {
    return dateString === selectedStart || dateString === selectedEnd;
  };

  const isToday = (dateString) => {
    const today = new Date();
    const todayString = formatDateString(today.getFullYear(), today.getMonth(), today.getDate());
    return dateString === todayString;
  };

  const isPastDate = (dateString) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);
    return date < today;
  };

  const formatDateString = (year, month, day) => {
    // Format without timezone conversion to avoid off-by-one errors
    const yyyy = year;
    const mm = String(month + 1).padStart(2, '0'); // month is 0-indexed
    const dd = String(day).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const renderDays = () => {
    const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);
    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateString = formatDateString(year, month, day);
      const inRange = isDateInRange(dateString);
      const selected = isDateSelected(dateString);
      const today = isToday(dateString);
      const past = isPastDate(dateString);
      const isStart = dateString === selectedStart;
      const isEnd = dateString === selectedEnd;

      days.push(
        <TouchableOpacity
          key={day}
          style={[
            styles.dayCell,
            selected && { backgroundColor: theme.primaryBlue },
            inRange && !selected && { backgroundColor: theme.primaryBlue + '30' },
            isStart && styles.rangeStart,
            isEnd && styles.rangeEnd,
            isStart && isEnd && styles.singleDay,
          ]}
          onPress={() => onDateSelect(dateString)}
        >
          <Text
            style={[
              styles.dayText,
              { color: theme.primaryText },
              selected && { color: theme.white, fontWeight: 'bold' },
              inRange && !selected && { color: theme.primaryBlue, fontWeight: '600' },
              past && !selected && { color: theme.secondaryText, opacity: 0.6 },
              today && !selected && { color: theme.primaryBlue, fontWeight: 'bold' },
            ]}
          >
            {day}
          </Text>
        </TouchableOpacity>
      );
    }

    return days;
  };

  const changeMonth = (offset) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + offset);
    setCurrentMonth(newMonth);
  };

  const monthNames = [
    t('calendar.months.january'), t('calendar.months.february'), t('calendar.months.march'),
    t('calendar.months.april'), t('calendar.months.may'), t('calendar.months.june'),
    t('calendar.months.july'), t('calendar.months.august'), t('calendar.months.september'),
    t('calendar.months.october'), t('calendar.months.november'), t('calendar.months.december')
  ];

  const dayNames = [
    t('calendar.daysShort.sun'), t('calendar.daysShort.mon'), t('calendar.daysShort.tue'),
    t('calendar.daysShort.wed'), t('calendar.daysShort.thu'), t('calendar.daysShort.fri'),
    t('calendar.daysShort.sat')
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={theme.primaryBlue} />
        </TouchableOpacity>
        <Text style={[styles.monthText, { color: theme.primaryText }]}>
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color={theme.primaryBlue} />
        </TouchableOpacity>
      </View>

      {/* Day names */}
      <View style={styles.dayNamesRow}>
        {dayNames.map((name) => (
          <View key={name} style={styles.dayNameCell}>
            <Text style={[styles.dayNameText, { color: theme.primaryText || '#FFFFFF' }]}>{name}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={styles.daysGrid}>{renderDays()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  navButton: {
    padding: 5,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
  },
  dayNamesRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  dayNameCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%', // 100% / 7 days
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginVertical: 2,
  },
  dayText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 36,
  },
  rangeStart: {
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  rangeEnd: {
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
  },
  singleDay: {
    borderRadius: 18,
  },
});

export default CustomCalendar;
