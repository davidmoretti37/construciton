import React, { useState } from 'react';
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

export default function StatsScreen() {
  const [selectedRange, setSelectedRange] = useState('monthly');

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Statistics</Text>
        <TouchableOpacity style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={24} color={Colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Toggle Buttons */}
      <View style={styles.toggleSection}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            selectedRange === 'monthly' && styles.activeToggle,
          ]}
          onPress={() => setSelectedRange('monthly')}
        >
          <Text
            style={[
              styles.toggleText,
              selectedRange === 'monthly' && styles.activeToggleText,
            ]}
          >
            Monthly
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toggleButton,
            selectedRange === 'weekly' && styles.activeToggle,
          ]}
          onPress={() => setSelectedRange('weekly')}
        >
          <Text
            style={[
              styles.toggleText,
              selectedRange === 'weekly' && styles.activeToggleText,
            ]}
          >
            Weekly
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toggleButton,
            selectedRange === 'all' && styles.activeToggle,
          ]}
          onPress={() => setSelectedRange('all')}
        >
          <Text
            style={[
              styles.toggleText,
              selectedRange === 'all' && styles.activeToggleText,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Income Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            💰 Income - {selectedRange === 'monthly' ? 'This Month' : selectedRange === 'weekly' ? 'This Week' : 'All Time'}
          </Text>
          <View style={styles.card}>
            <Text style={styles.incomeAmount}>$0 earned</Text>
            <Text style={styles.budgetText}>$0 budgeted</Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: '0%' }]} />
            </View>
            <Text style={styles.percentageText}>0%</Text>

            <View style={styles.breakdown}>
              <View style={styles.breakdownItem}>
                <View style={[styles.dot, { backgroundColor: Colors.successGreen }]} />
                <Text style={styles.breakdownLabel}>Collected:</Text>
                <Text style={styles.breakdownValue}>$0</Text>
              </View>
              <View style={styles.breakdownItem}>
                <View style={[styles.dot, { backgroundColor: Colors.warningOrange }]} />
                <Text style={styles.breakdownLabel}>Pending:</Text>
                <Text style={styles.breakdownValue}>$0</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Projects Progress */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📈 Projects Progress</Text>
          <View style={styles.card}>
            <View style={styles.statsRow}>
              <Text style={styles.statItem}>Active: 0</Text>
              <Text style={styles.statItem}>Completed: 0</Text>
              <Text style={styles.statItem}>Total: 0</Text>
            </View>
            <Text style={styles.emptyText}>No project data available</Text>
          </View>
        </View>

        {/* Hours Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            ⏰ Hours {selectedRange === 'monthly' ? 'This Month' : selectedRange === 'weekly' ? 'This Week' : 'All Time'}
          </Text>
          <View style={styles.card}>
            <Text style={styles.totalHours}>0 hours</Text>
            <Text style={styles.totalLabel}>Total worked</Text>
            <Text style={styles.emptyText}>No hours tracked</Text>
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
  toggleSection: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.lightGray,
    alignItems: 'center',
  },
  activeToggle: {
    backgroundColor: Colors.primaryBlue,
  },
  toggleText: {
    fontSize: FontSizes.body,
    color: Colors.primaryText,
    fontWeight: '500',
  },
  activeToggleText: {
    color: Colors.white,
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
    fontSize: FontSizes.large,
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
    marginBottom: Spacing.lg,
  },
  breakdown: {
    gap: Spacing.sm,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  breakdownLabel: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    marginRight: Spacing.sm,
  },
  breakdownValue: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.lg,
  },
  statItem: {
    fontSize: FontSizes.body,
    color: Colors.primaryText,
  },
  projectProgressItem: {
    marginBottom: Spacing.lg,
  },
  projectProgressName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: Colors.primaryText,
    marginBottom: Spacing.xs,
  },
  projectProgressValue: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
    textAlign: 'right',
  },
  totalHours: {
    fontSize: FontSizes.header,
    fontWeight: 'bold',
    color: Colors.primaryText,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  totalLabel: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  hoursBreakdown: {
    gap: Spacing.md,
  },
  hoursItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hoursWorker: {
    fontSize: FontSizes.body,
    color: Colors.primaryText,
  },
  hoursValue: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  emptyText: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
});
