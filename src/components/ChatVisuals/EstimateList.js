import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function EstimateList({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const { estimates = [], summary = {} } = data;

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft':
        return '#9CA3AF'; // Gray
      case 'sent':
        return '#3B82F6'; // Blue
      case 'viewed':
        return '#8B5CF6'; // Purple
      case 'accepted':
        return '#22C55E'; // Green
      case 'rejected':
        return '#EF4444'; // Red
      case 'expired':
        return '#F59E0B'; // Orange
      default:
        return Colors.secondaryText;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'draft':
        return 'document-outline';
      case 'sent':
        return 'send-outline';
      case 'viewed':
        return 'eye-outline';
      case 'accepted':
        return 'checkmark-circle';
      case 'rejected':
        return 'close-circle';
      case 'expired':
        return 'time-outline';
      default:
        return 'document-outline';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleEstimateTap = (estimate) => {
    if (onAction) {
      onAction({ label: 'View Estimate', type: 'view-estimate', data: estimate });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: Colors.primaryText }]}>
          📋 Estimates
        </Text>
        {summary.total > 0 && (
          <View style={[styles.badge, { backgroundColor: Colors.primaryBlue }]}>
            <Text style={styles.badgeText}>{summary.total}</Text>
          </View>
        )}
      </View>

      {/* Summary Stats */}
      {summary.total > 0 && (
        <View style={[styles.summarySection, { borderTopColor: Colors.border, borderBottomColor: Colors.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.primaryText }]}>
              {summary.pending || 0}
            </Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Pending</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.success }]}>
              {summary.accepted || 0}
            </Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Accepted</Text>
          </View>
          {summary.totalValue && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: Colors.primaryBlue }]}>
                  ${(summary.totalValue / 1000).toFixed(1)}K
                </Text>
                <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Total Value</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* Estimates List */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {estimates.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              No estimates yet
            </Text>
          </View>
        ) : (
          estimates.map((estimate, index) => (
            <TouchableOpacity
              key={estimate.id || index}
              style={[styles.estimateCard, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}
              onPress={() => handleEstimateTap(estimate)}
              activeOpacity={0.7}
            >
              {/* Estimate Header */}
              <View style={styles.estimateHeader}>
                <View style={styles.estimateInfo}>
                  <Text style={[styles.estimateNumber, { color: Colors.primaryText }]}>
                    {estimate.estimate_number || estimate.estimateNumber || `EST-${index + 1}`}
                  </Text>
                  <Text style={[styles.clientName, { color: Colors.primaryText }]} numberOfLines={1}>
                    {estimate.client_name || estimate.client}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(estimate.status) + '20' }]}>
                  <Ionicons name={getStatusIcon(estimate.status)} size={14} color={getStatusColor(estimate.status)} />
                  <Text style={[styles.statusText, { color: getStatusColor(estimate.status) }]}>
                    {estimate.status?.charAt(0).toUpperCase() + estimate.status?.slice(1) || 'Draft'}
                  </Text>
                </View>
              </View>

              {/* Project Name */}
              {estimate.project_name && (
                <Text style={[styles.projectName, { color: Colors.secondaryText }]} numberOfLines={1}>
                  {estimate.project_name}
                </Text>
              )}

              {/* Estimate Details */}
              <View style={styles.estimateDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.secondaryText} />
                  <Text style={[styles.detailText, { color: Colors.secondaryText }]}>
                    {formatDate(estimate.created_at || estimate.createdDate)}
                  </Text>
                </View>
                {estimate.items && (
                  <View style={styles.detailRow}>
                    <Ionicons name="list-outline" size={14} color={Colors.secondaryText} />
                    <Text style={[styles.detailText, { color: Colors.secondaryText }]}>
                      {estimate.items.length} item{estimate.items.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
              </View>

              {/* Amount */}
              <View style={styles.amountSection}>
                <Text style={[styles.amountLabel, { color: Colors.secondaryText }]}>Total:</Text>
                <Text style={[styles.amount, { color: Colors.primaryBlue }]}>
                  ${(estimate.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>

              {/* Action Indicator */}
              <View style={styles.actionIndicator}>
                <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    maxHeight: 500,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    color: '#fff',
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  summarySection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: FontSizes.tiny,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E5E7EB',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl * 2,
  },
  emptyText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.body,
  },
  estimateCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  estimateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  estimateInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  estimateNumber: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    marginBottom: 2,
  },
  clientName: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  statusText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  projectName: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.sm,
  },
  estimateDetails: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: FontSizes.tiny,
  },
  amountSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  amountLabel: {
    fontSize: FontSizes.small,
  },
  amount: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  actionIndicator: {
    position: 'absolute',
    right: Spacing.md,
    top: '50%',
    marginTop: -8,
  },
});
