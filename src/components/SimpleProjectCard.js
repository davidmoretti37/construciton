import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function SimpleProjectCard({ project, onPress }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  // Status color mapping
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#10B981'; // Green
      case 'active':
      case 'on-track':
        return '#3B82F6'; // Blue
      case 'behind':
        return '#F59E0B'; // Orange
      case 'over-budget':
        return '#EF4444'; // Red
      case 'archived':
        return '#6B7280'; // Gray
      default:
        return Colors.primaryBlue;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return 'checkmark-circle';
      case 'active':
      case 'on-track':
        return 'play-circle';
      case 'behind':
        return 'warning';
      case 'over-budget':
        return 'alert-circle';
      case 'archived':
        return 'archive';
      default:
        return 'ellipse';
    }
  };

  const statusColor = getStatusColor(project.status);
  const statusIcon = getStatusIcon(project.status);

  // Calculate progress percentage
  const progressPercent = project.percentComplete || 0;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: Colors.white }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Status Bar */}
      <View style={[styles.statusBar, { backgroundColor: statusColor }]} />

      {/* Content */}
      <View style={styles.content}>
        {/* Header Row - Name and Progress */}
        <View style={styles.header}>
          <Text style={[styles.projectName, { color: Colors.primaryText }]} numberOfLines={1}>
            {project.name}
          </Text>
          <View style={[styles.progressBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.progressBadgeText, { color: statusColor }]}>
              {progressPercent}%
            </Text>
          </View>
        </View>

        {/* Client Name */}
        {project.client && (
          <Text style={[styles.clientName, { color: Colors.secondaryText }]} numberOfLines={1}>
            {project.client}
          </Text>
        )}

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Progress Bar */}
        <View style={[styles.progressTrack, { backgroundColor: Colors.lightGray }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: statusColor,
                width: `${progressPercent}%`
              }
            ]}
          />
        </View>

        {/* Footer - Status */}
        <View style={styles.footer}>
          <View style={styles.statusRow}>
            <Ionicons name={statusIcon} size={14} color={statusColor} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {project.status === 'on-track' ? 'Active' : project.status}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    minHeight: 140,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.12)',
  },
  statusBar: {
    height: 4,
    width: '100%',
  },
  content: {
    flex: 1,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  projectName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    marginRight: 8,
  },
  progressBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  progressBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  clientName: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  spacer: {
    flex: 1,
  },
  progressTrack: {
    height: 5,
    borderRadius: 2.5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
