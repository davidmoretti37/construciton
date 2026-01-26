import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { formatHoursMinutes } from '../../utils/calculations';

export default function WorkerPaymentCard({ data }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = createStyles(Colors);
  const [expandedWorkers, setExpandedWorkers] = useState({});

  const toggleWorkerExpansion = (workerId) => {
    setExpandedWorkers(prev => ({
      ...prev,
      [workerId]: !prev[workerId]
    }));
  };

  if (!data || !data.workers || data.workers.length === 0) {
    return null;
  }

  const { workers, period, totalAmount, totalHours, totalDays } = data;
  const periodLabel = period ? period.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : '';

  // Check if single worker - show their name in title
  const isSingleWorker = workers.length === 1;
  const singleWorkerName = isSingleWorker ? workers[0].workerName : null;

  // Format currency
  const formatCurrency = (amount) => `$${amount.toFixed(2)}`;

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header with overall summary */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Ionicons name="cash-outline" size={24} color={Colors.primaryBlue} />
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
            {singleWorkerName
              ? `${singleWorkerName}'s Payment${periodLabel ? ` - ${periodLabel}` : ''}`
              : `Payment Summary${periodLabel ? ` - ${periodLabel}` : ''}`
            }
          </Text>
        </View>

        <View style={styles.overallSummary}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>
              Total Owed
            </Text>
            <Text style={[styles.summaryValue, styles.totalAmount, { color: Colors.primaryBlue }]}>
              {formatCurrency(totalAmount)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>
                Total Hours
              </Text>
              <Text style={[styles.summaryValue, { color: Colors.primaryText }]}>
                {formatHoursMinutes(totalHours)}
              </Text>
            </View>

            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>
                Days Worked
              </Text>
              <Text style={[styles.summaryValue, { color: Colors.primaryText }]}>
                {totalDays}
              </Text>
            </View>

            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>
                Workers
              </Text>
              <Text style={[styles.summaryValue, { color: Colors.primaryText }]}>
                {workers.length}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Collapsible worker sections */}
      <View style={styles.workersContainer}>
        {workers.map((worker, index) => {
          const isExpanded = expandedWorkers[worker.workerId];

          return (
            <View
              key={worker.workerId || index}
              style={[
                styles.workerSection,
                {
                  backgroundColor: Colors.background,
                  borderColor: Colors.border
                }
              ]}
            >
              {/* Worker header (always visible) */}
              <TouchableOpacity
                style={styles.workerHeader}
                onPress={() => toggleWorkerExpansion(worker.workerId)}
                activeOpacity={0.7}
              >
                <View style={styles.workerHeaderLeft}>
                  <Ionicons
                    name="person-circle-outline"
                    size={20}
                    color={Colors.secondaryText}
                  />
                  <View style={styles.workerInfo}>
                    <Text style={[styles.workerName, { color: Colors.primaryText }]}>
                      {worker.workerName}
                    </Text>
                    <Text style={[styles.workerMeta, { color: Colors.secondaryText }]}>
                      {worker.paymentType === 'hourly' && `$${worker.rate}/hr`}
                      {worker.paymentType === 'daily' && `$${worker.rate}/day`}
                      {worker.paymentType === 'weekly' && `$${worker.rate}/wk`}
                      {worker.paymentType === 'project' && 'Project-based'}
                    </Text>
                  </View>
                </View>

                <View style={styles.workerHeaderRight}>
                  <Text style={[styles.workerAmount, { color: Colors.primaryBlue }]}>
                    {formatCurrency(worker.totalAmount)}
                  </Text>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={Colors.secondaryText}
                  />
                </View>
              </TouchableOpacity>

              {/* Expanded details */}
              {isExpanded && (
                <View style={styles.workerDetails}>
                  {/* Summary stats */}
                  <View style={styles.workerStats}>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>
                        Hours
                      </Text>
                      <Text style={[styles.statValue, { color: Colors.primaryText }]}>
                        {formatHoursMinutes(worker.totalHours)}
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>
                        Days
                      </Text>
                      <Text style={[styles.statValue, { color: Colors.primaryText }]}>
                        {worker.totalDays}
                      </Text>
                    </View>
                  </View>

                  {/* Daily breakdown */}
                  {worker.byDate && worker.byDate.length > 0 && (
                    <View style={styles.breakdownSection}>
                      <Text style={[styles.breakdownTitle, { color: Colors.primaryText }]}>
                        Daily Breakdown
                      </Text>
                      {worker.byDate
                        .sort((a, b) => new Date(a.date) - new Date(b.date))
                        .map((day, dayIndex) => (
                          <View
                            key={dayIndex}
                            style={[styles.dayItem, { borderBottomColor: Colors.border }]}
                          >
                            <View style={styles.dayHeader}>
                              <Text style={[styles.dayDate, { color: Colors.primaryText }]}>
                                {formatDate(day.date)}
                              </Text>
                              <View style={styles.dayStats}>
                                <Text style={[styles.dayHours, { color: Colors.secondaryText }]}>
                                  {formatHoursMinutes(day.hours)}
                                </Text>
                                <Text style={[styles.dayAmount, { color: Colors.primaryText }]}>
                                  {formatCurrency(day.amount)}
                                </Text>
                              </View>
                            </View>

                            {/* Projects worked that day */}
                            {day.projects && day.projects.length > 0 && (
                              <View style={styles.projectsList}>
                                {day.projects.map((project, projectIndex) => (
                                  <View key={projectIndex} style={styles.projectItem}>
                                    <View style={[styles.projectDot, { backgroundColor: Colors.primaryBlue }]} />
                                    <Text style={[styles.projectText, { color: Colors.secondaryText }]}>
                                      {project.projectName}: {formatHoursMinutes(project.hours)}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        ))}
                    </View>
                  )}

                  {/* Project breakdown (if multiple projects) */}
                  {worker.byProject && worker.byProject.length > 1 && (
                    <View style={styles.breakdownSection}>
                      <Text style={[styles.breakdownTitle, { color: Colors.primaryText }]}>
                        By Project
                      </Text>
                      {worker.byProject.map((project, projectIndex) => (
                        <View
                          key={projectIndex}
                          style={[styles.projectSummaryItem, { borderBottomColor: Colors.border }]}
                        >
                          <View style={styles.projectSummaryLeft}>
                            <Text style={[styles.projectSummaryName, { color: Colors.primaryText }]}>
                              {project.projectName}
                            </Text>
                            <Text style={[styles.projectSummaryHours, { color: Colors.secondaryText }]}>
                              {formatHoursMinutes(project.hours)}
                            </Text>
                          </View>
                          <Text style={[styles.projectSummaryAmount, { color: Colors.primaryText }]}>
                            {formatCurrency(project.amount)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (Colors) => StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: Spacing.sm,
  },
  header: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
  },
  overallSummary: {
    gap: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: FontSizes.sm,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
  },
  workersContainer: {
    gap: Spacing.xs,
    padding: Spacing.sm,
  },
  workerSection: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  workerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  workerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  workerInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    marginBottom: 2,
  },
  workerMeta: {
    fontSize: FontSizes.sm,
  },
  workerHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  workerAmount: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
  },
  workerDetails: {
    padding: Spacing.md,
    paddingTop: 0,
  },
  workerStats: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: FontSizes.sm,
    marginBottom: 4,
  },
  statValue: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  breakdownSection: {
    marginTop: Spacing.sm,
  },
  breakdownTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  dayItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  dayDate: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  dayStats: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  dayHours: {
    fontSize: FontSizes.sm,
  },
  dayAmount: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  projectsList: {
    marginTop: Spacing.xs,
    gap: 4,
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  projectDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  projectText: {
    fontSize: FontSizes.sm,
  },
  projectSummaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  projectSummaryLeft: {
    flex: 1,
  },
  projectSummaryName: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    marginBottom: 2,
  },
  projectSummaryHours: {
    fontSize: FontSizes.xs,
  },
  projectSummaryAmount: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
});
