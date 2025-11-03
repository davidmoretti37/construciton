import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const CustomCalendar = ({ onDateSelect, selectedStart, selectedEnd, theme }) => {
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
    const date = new Date(dateString);
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isPastDate = (dateString) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);
    return date < today;
  };

  const formatDateString = (year, month, day) => {
    const date = new Date(year, month, day);
    return date.toISOString().split('T')[0];
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
          onPress={() => !past && onDateSelect(dateString)}
          disabled={past}
        >
          <Text
            style={[
              styles.dayText,
              { color: theme.primaryText },
              selected && { color: theme.white, fontWeight: 'bold' },
              inRange && !selected && { color: theme.primaryBlue, fontWeight: '600' },
              past && { color: theme.border },
              today && !selected && { color: theme.primaryBlue, fontWeight: 'bold' },
            ]}
          >
            {day}
          </Text>
          {today && !selected && <View style={[styles.todayDot, { backgroundColor: theme.primaryBlue }]} />}
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
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
            <Text style={[styles.dayNameText, { color: theme.secondaryText }]}>{name}</Text>
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
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  dayText: {
    fontSize: 14,
  },
  rangeStart: {
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  rangeEnd: {
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  singleDay: {
    borderRadius: 20,
  },
  todayDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

export default CustomCalendar;
