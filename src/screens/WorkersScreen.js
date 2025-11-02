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
import { Colors, Spacing, FontSizes, BorderRadius } from '../constants/theme';

export default function WorkersScreen() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Workers</Text>
        <TouchableOpacity style={styles.addWorkerButton}>
          <Text style={styles.addWorkerText}>+ Add Worker</Text>
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
    backgroundColor: Colors.background,
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  addWorkerButton: {
    padding: Spacing.sm,
  },
  addWorkerText: {
    fontSize: FontSizes.body,
    color: Colors.primaryBlue,
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
    backgroundColor: Colors.white,
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
    borderColor: Colors.successGreen,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.successGreen,
    marginRight: Spacing.md,
  },
  offStatus: {
    backgroundColor: Colors.secondaryText,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  inactiveAvatar: {
    backgroundColor: Colors.secondaryText,
  },
  avatarText: {
    fontSize: FontSizes.body,
    color: Colors.white,
    fontWeight: '600',
  },
  workerInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: Colors.primaryText,
    marginBottom: 2,
  },
  workerProject: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
    marginBottom: 2,
  },
  workerTime: {
    fontSize: FontSizes.tiny,
    color: Colors.placeholderText,
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
    color: Colors.primaryText,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyStateSubtext: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
});
