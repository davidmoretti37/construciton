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

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Dashboard</Text>
        <TouchableOpacity style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={24} color={Colors.secondaryText} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Welcome Header */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Welcome! 👋</Text>
          <Text style={styles.dateText}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
        </View>

        {/* Quick Stats Cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: Colors.primaryBlue }]}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Active Projects</Text>
          </View>

          <View style={[styles.statCard, { borderLeftColor: Colors.successGreen }]}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>On-Site</Text>
          </View>

          <View style={[styles.statCard, { borderLeftColor: Colors.warningOrange }]}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Need Attention</Text>
          </View>
        </View>

        {/* Income This Month */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 This Month</Text>
          <View style={styles.card}>
            <Text style={styles.incomeAmount}>$0 earned</Text>
            <Text style={styles.budgetText}>$0 budgeted</Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: '0%' }]} />
            </View>
            <Text style={styles.percentageText}>0%</Text>
          </View>
        </View>

        {/* Quick Stats List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Quick Stats</Text>
          <View style={styles.card}>
            <Text style={styles.emptyText}>No data available</Text>
          </View>
        </View>

        {/* Today's Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔔 Today's Activity</Text>
          <View style={styles.card}>
            <Text style={styles.emptyText}>No activity today</Text>
          </View>
        </View>

        {/* Active Projects */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏗️ Active Projects</Text>
          <View style={styles.card}>
            <Text style={styles.emptyText}>No active projects</Text>
          </View>
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
  settingsButton: {
    padding: Spacing.sm,
  },
  content: {
    flex: 1,
  },
  welcomeSection: {
    padding: Spacing.xl,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  welcomeText: {
    fontSize: FontSizes.header,
    fontWeight: '600',
    color: Colors.primaryText,
    marginBottom: Spacing.xs,
  },
  dateText: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
  },
  statsRow: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: Colors.primaryText,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    fontSize: FontSizes.tiny,
    color: Colors.secondaryText,
    textAlign: 'center',
  },
  section: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    color: Colors.primaryText,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  incomeAmount: {
    fontSize: FontSizes.header,
    fontWeight: 'bold',
    color: Colors.primaryText,
    marginBottom: Spacing.xs,
  },
  budgetText: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    marginBottom: Spacing.md,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: Colors.lightGray,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primaryBlue,
  },
  percentageText: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
    textAlign: 'right',
  },
  statItem: {
    fontSize: FontSizes.body,
    color: Colors.primaryText,
    marginBottom: Spacing.sm,
  },
  activityItem: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: Colors.primaryText,
    marginBottom: 2,
  },
  activityProject: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
    marginBottom: 2,
  },
  activityTime: {
    fontSize: FontSizes.tiny,
    color: Colors.placeholderText,
  },
  viewAllButton: {
    marginTop: Spacing.md,
  },
  viewAllText: {
    fontSize: FontSizes.small,
    color: Colors.primaryBlue,
    fontWeight: '500',
  },
  projectCard: {
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
  projectName: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    color: Colors.primaryText,
    marginBottom: Spacing.xs,
  },
  projectBudget: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    marginBottom: Spacing.md,
  },
  projectFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  projectWorkers: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
  },
  projectStatus: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
});
