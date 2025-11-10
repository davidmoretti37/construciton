import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function InvoicePreview({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

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
    pdfUrl,
  } = data;

  const actualAmountDue = amountDue !== undefined ? amountDue : (total - amountPaid);

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

  const handleGeneratePDF = () => {
    if (onAction) {
      onAction({ label: 'Generate PDF', type: 'generate-invoice-pdf', data });
    }
  };

  const handleDownloadPDF = () => {
    if (onAction) {
      onAction({ label: 'Download PDF', type: 'download-invoice-pdf', data: { ...data, pdfUrl } });
    }
  };

  const handleSendEmail = () => {
    if (onAction) {
      onAction({ label: 'Send Email', type: 'send-invoice-email', data });
    }
  };

  const handleMarkPaid = () => {
    if (onAction) {
      onAction({ label: 'Mark as Paid', type: 'mark-invoice-paid', data });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <View>
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            🧾 INVOICE
          </Text>
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
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>Subtotal:</Text>
          <Text style={[styles.summaryValue, { color: Colors.primaryText }]}>
            ${subtotal.toFixed(2)}
          </Text>
        </View>
        <View style={[styles.totalRow, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue }]}>
          <Text style={[styles.totalLabel, { color: Colors.primaryText }]}>TOTAL:</Text>
          <Text style={[styles.totalAmount, { color: Colors.primaryBlue }]}>
            ${total.toFixed(2)}
          </Text>
        </View>
        {amountPaid > 0 && (
          <>
            <View style={[styles.summaryRow, styles.paidRow]}>
              <Text style={[styles.summaryLabel, { color: '#22C55E' }]}>
                <Ionicons name="checkmark-circle" size={14} color="#22C55E" /> Paid:
              </Text>
              <Text style={[styles.summaryValue, { color: '#22C55E' }]}>
                -${amountPaid.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.dueRow]}>
              <Text style={[styles.summaryLabel, { color: status === 'overdue' ? '#EF4444' : Colors.primaryText, fontWeight: '700' }]}>
                Amount Due:
              </Text>
              <Text style={[styles.summaryValue, { color: status === 'overdue' ? '#EF4444' : Colors.primaryText, fontWeight: '700' }]}>
                ${actualAmountDue.toFixed(2)}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {pdfUrl ? (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={handleDownloadPDF}
            >
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>Download PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton, { borderColor: Colors.primaryBlue }]}
              onPress={handleSendEmail}
            >
              <Ionicons name="mail-outline" size={18} color={Colors.primaryBlue} />
              <Text style={[styles.buttonText, { color: Colors.primaryBlue }]}>Email</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleGeneratePDF}
          >
            <Ionicons name="document-text-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Generate PDF</Text>
          </TouchableOpacity>
        )}
        {status !== 'paid' && status !== 'cancelled' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.successButton, { backgroundColor: '#22C55E' }]}
            onPress={handleMarkPaid}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Mark Paid</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer */}
      <Text style={[styles.footerNote, { color: Colors.secondaryText }]}>
        {pdfUrl ? 'PDF ready to download' : 'Generate PDF to send to client'}
      </Text>
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
