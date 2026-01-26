import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function InvoicePreview({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const {
    invoiceNumber,
    client,
    clientName,
    projectName,
    dueDate,
    items = [],
    subtotal = 0,
    total = 0,
    amountPaid = 0,
    amountDue,
    status = 'unpaid',
    businessName,
    businessLogo,
    pdfUrl,
    // New fields for partial payment invoices
    contractTotal,
    paymentType,
    paymentPercentage,
    previousPayments = 0,
    remainingBalance,
  } = data;

  // For partial payment invoices, use amountDue; otherwise calculate from total - paid
  const actualAmountDue = amountDue !== undefined ? amountDue : (total - amountPaid);

  // Check if this is a partial payment invoice
  const isPartialPayment = paymentType && paymentType !== 'final' && paymentPercentage && paymentPercentage < 100;
  const displayContractTotal = contractTotal || total;

  const getStatusColor = () => {
    switch (status) {
      case 'paid':
        return '#22C55E'; // Green
      case 'partial':
        return '#F59E0B'; // Orange
      case 'unpaid':
        return '#EF4444'; // Red
      case 'overdue':
        return '#DC2626'; // Dark Red
      case 'cancelled':
        return '#9CA3AF'; // Gray
      default:
        return Colors.secondaryText;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'paid':
        return 'checkmark-circle';
      case 'partial':
        return 'time-outline';
      case 'unpaid':
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

  const handlePreviewPDF = () => {
    if (onAction) {
      onAction({ label: 'Preview PDF', type: 'preview-invoice-pdf', data });
    }
  };

  const handleShareInvoice = () => {
    if (onAction) {
      onAction({ label: 'Share Invoice', type: 'share-invoice-pdf', data: { ...data, pdfUrl } });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <View style={styles.headerLeft}>
          {businessLogo ? (
            <Image source={{ uri: businessLogo }} style={styles.businessLogo} resizeMode="contain" />
          ) : (
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              🧾 INVOICE
            </Text>
          )}
          <Text style={[styles.invoiceNumber, { color: Colors.primaryBlue }]}>
            {invoiceNumber || 'INV-XXXX'}
          </Text>
          {businessName && (
            <Text style={[styles.businessName, { color: Colors.secondaryText }]}>
              {businessName}
            </Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '15', borderColor: getStatusColor() }]}>
          <Ionicons name={getStatusIcon()} size={16} color={getStatusColor()} />
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {status?.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Client & Due Date Info */}
      <View style={[styles.section, { borderBottomColor: Colors.border }]}>
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>Bill To:</Text>
          <Text style={[styles.value, { color: Colors.primaryText }]}>{clientName || client}</Text>
        </View>
        {projectName && (
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: Colors.secondaryText }]}>Project:</Text>
            <Text style={[styles.value, { color: Colors.primaryText }]}>{projectName}</Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>Due Date:</Text>
          <Text style={[styles.value, { color: status === 'overdue' ? '#EF4444' : Colors.primaryText }]}>
            {formatDate(dueDate)}
            {status === 'overdue' && ' (OVERDUE)'}
          </Text>
        </View>
      </View>

      {/* Line Items */}
      <View style={[styles.section, { borderBottomColor: Colors.border }]}>
        <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>ITEMS</Text>
        {items.map((item, index) => (
          <View key={index} style={styles.lineItem}>
            <View style={styles.itemHeader}>
              <Text style={[styles.itemNumber, { color: Colors.secondaryText }]}>
                {item.index || index + 1}.
              </Text>
              <Text style={[styles.itemDescription, { color: Colors.primaryText }]}>
                {item.description}
              </Text>
            </View>
            <View style={styles.itemDetails}>
              <Text style={[styles.itemCalc, { color: Colors.secondaryText }]}>
                {item.quantity} {item.unit || 'unit'}{item.quantity > 1 ? 's' : ''} × ${item.price?.toFixed(2)}
              </Text>
              <Text style={[styles.itemTotal, { color: Colors.primaryText }]}>
                ${item.total?.toFixed(2)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Payment Summary */}
      <View style={styles.paymentSummary}>
        {/* Show contract total for partial payments */}
        {isPartialPayment && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>Contract Total:</Text>
            <Text style={[styles.summaryValue, { color: Colors.primaryText }]}>
              ${displayContractTotal.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Show previous payments if any */}
        {previousPayments > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: '#22C55E' }]}>
              Previous Payments:
            </Text>
            <Text style={[styles.summaryValue, { color: '#22C55E' }]}>
              -${previousPayments.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Show this invoice amount for partial payments */}
        {isPartialPayment && (
          <View style={[styles.summaryRow, { marginTop: Spacing.sm }]}>
            <Text style={[styles.summaryLabel, { color: Colors.primaryText, fontWeight: '600' }]}>
              This Invoice ({paymentPercentage}% {paymentType === 'down_payment' ? 'Down Payment' : paymentType === 'progress' ? 'Progress Payment' : 'Payment'}):
            </Text>
            <Text style={[styles.summaryValue, { color: Colors.primaryText, fontWeight: '600' }]}>
              ${actualAmountDue.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Amount Due - highlighted */}
        <View style={[styles.totalRow, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue }]}>
          <Text style={[styles.totalLabel, { color: Colors.primaryText }]}>AMOUNT DUE:</Text>
          <Text style={[styles.totalAmount, { color: Colors.primaryBlue }]}>
            ${actualAmountDue.toFixed(2)}
          </Text>
        </View>

        {/* Show remaining balance for partial payments */}
        {isPartialPayment && remainingBalance > 0 && (
          <View style={[styles.summaryRow, { marginTop: Spacing.sm }]}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>
              Remaining Balance:
            </Text>
            <Text style={[styles.summaryValue, { color: Colors.secondaryText }]}>
              ${remainingBalance.toFixed(2)}
            </Text>
          </View>
        )}

        {/* For non-partial payment invoices, show the old format */}
        {!isPartialPayment && amountPaid > 0 && (
          <>
            <View style={[styles.summaryRow, styles.paidRow]}>
              <Text style={[styles.summaryLabel, { color: '#22C55E' }]}>
                Paid:
              </Text>
              <Text style={[styles.summaryValue, { color: '#22C55E' }]}>
                -${amountPaid.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.dueRow]}>
              <Text style={[styles.summaryLabel, { color: status === 'overdue' ? '#EF4444' : Colors.primaryText, fontWeight: '700' }]}>
                Balance Due:
              </Text>
              <Text style={[styles.summaryValue, { color: status === 'overdue' ? '#EF4444' : Colors.primaryText, fontWeight: '700' }]}>
                ${(total - amountPaid).toFixed(2)}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.actionButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={handlePreviewPDF}
        >
          <Ionicons name="eye-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>Preview PDF</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.successButton, { backgroundColor: '#22C55E' }]}
          onPress={handleShareInvoice}
        >
          <Ionicons name="share-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>Send Invoice</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing.lg,
    borderBottomWidth: 2,
  },
  headerLeft: {
    flex: 1,
  },
  businessLogo: {
    width: 50,
    height: 50,
    marginBottom: 8,
  },
  title: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: 2,
  },
  invoiceNumber: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginTop: 2,
  },
  businessName: {
    fontSize: FontSizes.small,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    gap: 4,
  },
  statusText: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
  },
  section: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  label: {
    fontSize: FontSizes.small,
    width: 80,
  },
  value: {
    fontSize: FontSizes.small,
    fontWeight: '500',
    flex: 1,
  },
  lineItem: {
    marginBottom: Spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  itemNumber: {
    fontSize: FontSizes.small,
    width: 20,
  },
  itemDescription: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    flex: 1,
  },
  itemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 20,
  },
  itemCalc: {
    fontSize: FontSizes.tiny,
  },
  itemTotal: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  paymentSummary: {
    padding: Spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  summaryLabel: {
    fontSize: FontSizes.small,
  },
  summaryValue: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    marginVertical: Spacing.sm,
  },
  totalLabel: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  totalAmount: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  paidRow: {
    marginTop: Spacing.md,
  },
  dueRow: {
    marginTop: Spacing.xs,
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: Spacing.lg,
    paddingTop: 0,
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  actionButton: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  primaryButton: {
    // backgroundColor set via prop
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  successButton: {
    // backgroundColor set via prop
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  footerNote: {
    fontSize: FontSizes.tiny,
    textAlign: 'center',
    paddingBottom: Spacing.md,
  },
});
