import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function WorkersScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={styles.spacer} />
        <TouchableOpacity style={styles.addWorkerButton}>
          <Text style={[styles.addWorkerText, { color: Colors.primaryBlue }]}>+ Add Worker</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color={Colors.secondaryText} />
          <Text style={styles.emptyStateText}>No workers yet</Text>
          <Text style={styles.emptyStateSubtext}>Add workers to track their schedules and assignments</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LightColors.background,
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    backgroundColor: LightColors.white,
    borderBottomWidth: 1,
    borderBottomColor: LightColors.border,
  },
  settingsButton: {
    padding: Spacing.sm,
  },
  spacer: {
    flex: 1,
  },
  emptySpace: {
    flex: 1,
  },
  addWorkerButton: {
    padding: Spacing.sm,
  },
  addWorkerText: {
    fontSize: FontSizes.body,
    color: LightColors.primaryBlue,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  workerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LightColors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  activeWorker: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: LightColors.successGreen,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: LightColors.successGreen,
    marginRight: Spacing.md,
  },
  offStatus: {
    backgroundColor: LightColors.secondaryText,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: LightColors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  inactiveAvatar: {
    backgroundColor: LightColors.secondaryText,
  },
  avatarText: {
    fontSize: FontSizes.body,
    color: LightColors.white,
    fontWeight: '600',
  },
  workerInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: LightColors.primaryText,
    marginBottom: 2,
  },
  workerProject: {
    fontSize: FontSizes.small,
    color: LightColors.secondaryText,
    marginBottom: 2,
  },
  workerTime: {
    fontSize: FontSizes.tiny,
    color: LightColors.placeholderText,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateText: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    color: LightColors.primaryText,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyStateSubtext: {
    fontSize: FontSizes.body,
    color: LightColors.secondaryText,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
});
