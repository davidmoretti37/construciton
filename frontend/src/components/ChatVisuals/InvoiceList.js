import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function InvoiceList({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const { invoices = [], summary = {} } = data;

  const getStatusColor = (status) => {
    switch (status) {
      case 'unpaid':
        return '#F59E0B'; // Orange
      case 'partial':
        return '#3B82F6'; // Blue
      case 'paid':
        return '#22C55E'; // Green
      case 'overdue':
        return '#EF4444'; // Red
      case 'cancelled':
        return '#9CA3AF'; // Gray
      default:
        return Colors.secondaryText;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'unpaid':
        return 'time-outline';
      case 'partial':
        return 'pie-chart-outline';
      case 'paid':
        return 'checkmark-circle';
      case 'overdue':
        return 'alert-circle';
      case 'cancelled':
        return 'close-circle';
      default:
        return 'document-outline';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCurrency = (amount) => {
    return (amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleInvoiceTap = (invoice) => {
    if (onAction) {
      onAction({ label: 'View Invoice', type: 'view-invoice', data: invoice });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: Colors.primaryText }]}>
          📄 Invoices
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
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>
              {summary.unpaid || 0}
            </Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Unpaid</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: Colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.success }]}>
              {summary.paid || 0}
            </Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Paid</Text>
          </View>
          {summary.totalDue !== undefined && (
            <>
              <View style={[styles.statDivider, { backgroundColor: Colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: Colors.primaryBlue }]}>
                  ${(summary.totalDue / 1000).toFixed(1)}K
                </Text>
                <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Total Due</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* Invoices List */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {invoices.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              No invoices yet
            </Text>
          </View>
        ) : (
          invoices.map((invoice, index) => (
            <TouchableOpacity
              key={invoice.id || index}
              style={[styles.invoiceCard, { backgroundColor: Colors.lightGray, borderColor: Colors.border }]}
              onPress={() => handleInvoiceTap(invoice)}
              activeOpacity={0.7}
            >
              {/* Invoice Header */}
              <View style={styles.invoiceHeader}>
                <View style={styles.invoiceInfo}>
                  <Text style={[styles.invoiceNumber, { color: Colors.primaryText }]}>
                    {invoice.invoice_number || invoice.invoiceNumber || `INV-${index + 1}`}
                  </Text>
                  <Text style={[styles.clientName, { color: Colors.primaryText }]} numberOfLines={1}>
                    {invoice.client_name || invoice.client}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(invoice.status) + '20' }]}>
                  <Ionicons name={getStatusIcon(invoice.status)} size={14} color={getStatusColor(invoice.status)} />
                  <Text style={[styles.statusText, { color: getStatusColor(invoice.status) }]}>
                    {invoice.status?.charAt(0).toUpperCase() + invoice.status?.slice(1) || 'Unpaid'}
                  </Text>
                </View>
              </View>

              {/* Project Name */}
              {invoice.project_name && (
                <Text style={[styles.projectName, { color: Colors.secondaryText }]} numberOfLines={1}>
                  {invoice.project_name}
                </Text>
              )}

              {/* Invoice Details */}
              <View style={styles.invoiceDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.secondaryText} />
                  <Text style={[styles.detailText, { color: Colors.secondaryText }]}>
                    Due: {formatDate(invoice.due_date || invoice.dueDate)}
                  </Text>
                </View>
                {invoice.items && (
                  <View style={styles.detailRow}>
                    <Ionicons name="list-outline" size={14} color={Colors.secondaryText} />
                    <Text style={[styles.detailText, { color: Colors.secondaryText }]}>
                      {invoice.items.length} item{invoice.items.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
              </View>

              {/* Amount Section */}
              <View style={styles.amountSection}>
                <View style={styles.amountRow}>
                  <Text style={[styles.amountLabel, { color: Colors.secondaryText }]}>Total:</Text>
                  <Text style={[styles.amount, { color: Colors.primaryText }]}>
                    ${formatCurrency(invoice.total)}
                  </Text>
                </View>
                {(invoice.amount_due !== undefined || invoice.amountDue !== undefined) && (
                  <View style={styles.amountRow}>
                    <Text style={[styles.amountLabel, { color: Colors.secondaryText }]}>Amount Due:</Text>
                    <Text style={[styles.amountDue, { color: getStatusColor(invoice.status) }]}>
                      ${formatCurrency(invoice.amount_due || invoice.amountDue)}
                    </Text>
                  </View>
                )}
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
    flexGrow: 1,
    flexShrink: 1,
  },
  listContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
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
  invoiceCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  invoiceInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  invoiceNumber: {
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
  invoiceDetails: {
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
    marginTop: Spacing.xs,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  amountLabel: {
    fontSize: FontSizes.small,
  },
  amount: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  amountDue: {
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
