import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Calculate card width: screen width - padding (24*2) - gap (12) divided by 2
const CARD_WIDTH = (SCREEN_WIDTH - (Spacing.lg * 2) - Spacing.md) / 2;

export default function SimpleProjectCard({ project, onPress }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = createStyles(Colors);

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#10B981';
      case 'active':
      case 'on-track':
        return '#3B82F6';
      case 'behind':
        return '#F59E0B';
      case 'over-budget':
        return '#EF4444';
      case 'archived':
        return '#6B7280';
      default:
        return '#3B82F6';
    }
  };

  const getProjectIcon = () => {
    const name = project.name?.toLowerCase() || '';
    if (name.includes('bathroom')) return 'water';
    if (name.includes('kitchen')) return 'restaurant';
    if (name.includes('garage')) return 'car-sport';
    if (name.includes('paint')) return 'color-palette';
    if (name.includes('roof')) return 'home';
    if (name.includes('floor')) return 'layers';
    if (name.includes('cabinet')) return 'cube';
    if (name.includes('remodel')) return 'hammer';
    if (name.includes('install')) return 'build';
    return 'construct';
  };

  const statusColor = getStatusColor(project.status);
  const projectIcon = getProjectIcon();

  const isDemo = project.isDemo;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: Colors.navBarBackground },
        isDemo && styles.demoCard
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Demo Badge */}
      {isDemo && (
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>DEMO</Text>
        </View>
      )}

      {/* Top Section */}
      <View style={styles.topSection}>
        <View style={[styles.iconContainer, { backgroundColor: statusColor + '12' }]}>
          <Ionicons name={projectIcon} size={22} color={statusColor} />
        </View>
      </View>

      {/* Project Info */}
      <View style={styles.infoSection}>
        <Text style={[styles.projectName, { color: Colors.primaryText }]} numberOfLines={2}>
          {project.name}
        </Text>

        {project.client && (
          <View style={styles.clientRow}>
            <Ionicons name="person" size={12} color={Colors.secondaryText} />
            <Text style={[styles.clientName, { color: Colors.secondaryText }]} numberOfLines={1}>
              {project.client}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (Colors) => StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 20,
    padding: 16,
    minHeight: 130,
    marginBottom: 14,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
    overflow: 'hidden',
  },
  demoCard: {
    borderColor: '#8B5CF6',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  demoBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 1,
  },
  demoBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  topSection: {
    marginBottom: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoSection: {
    flex: 1,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  clientName: {
    fontSize: 13,
    fontWeight: '500',
  },
});
