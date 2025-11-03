import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function WorkerList({ data }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const { workers = [] } = data;

  const getStatusColor = (status) => {
    switch (status) {
      case 'working':
        return Colors.success;
      case 'break':
        return Colors.warning;
      case 'off-duty':
        return Colors.secondaryText;
      default:
        return Colors.primaryText;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'working':
        return 'hammer-outline';
      case 'break':
        return 'cafe-outline';
      case 'off-duty':
        return 'home-outline';
      default:
        return 'person-outline';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {workers.map((worker, index) => (
        <View
          key={index}
          style={[
            styles.workerRow,
            index < workers.length - 1 && styles.borderBottom,
            { borderBottomColor: Colors.border }
          ]}
        >
          {/* Left: Avatar and Name */}
          <View style={styles.leftSection}>
            <View style={[styles.avatar, { backgroundColor: getStatusColor(worker.status) + '20' }]}>
              <Ionicons name={getStatusIcon(worker.status)} size={20} color={getStatusColor(worker.status)} />
            </View>
            <View style={styles.nameSection}>
              <Text style={[styles.workerName, { color: Colors.primaryText }]}>{worker.name}</Text>
              {worker.currentProject && (
                <Text style={[styles.projectName, { color: Colors.secondaryText }]}>
                  {worker.currentProject}
                </Text>
              )}
            </View>
          </View>

          {/* Right: Hours and Status */}
          <View style={styles.rightSection}>
            {worker.clockInTime && (
              <Text style={[styles.clockTime, { color: Colors.secondaryText }]}>
                ⏰ {worker.clockInTime}
              </Text>
            )}
            {worker.hoursToday !== undefined && (
              <Text style={[styles.hours, { color: Colors.primaryText }]}>
                {worker.hoursToday}h today
              </Text>
            )}
            {worker.hoursThisWeek !== undefined && (
              <Text style={[styles.weekHours, { color: Colors.secondaryText }]}>
                {worker.hoursThisWeek}h this week
              </Text>
            )}
          </View>
        </View>
      ))}

      {workers.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={32} color={Colors.secondaryText} />
          <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
            No workers to display
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginVertical: Spacing.sm,
  },
  workerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  borderBottom: {
    borderBottomWidth: 1,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  nameSection: {
    flex: 1,
  },
  workerName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  projectName: {
    fontSize: FontSizes.small,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  clockTime: {
    fontSize: FontSizes.tiny,
    marginBottom: 2,
  },
  hours: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: 2,
  },
  weekHours: {
    fontSize: FontSizes.tiny,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.small,
  },
});
