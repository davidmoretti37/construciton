import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { WebView } from 'react-native-webview';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { generateInvoiceHTML } from '../../utils/pdfGenerator';
import { getUserProfile } from '../../utils/storage';

export default function InvoicePreview({ data, onAction }) {
  const { t } = useTranslation('chat');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [showPreview, setShowPreview] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');

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

  const handleSaveInvoice = () => {
    if (onAction) {
      onAction({ type: 'save-invoice', data });
    }
  };

  const handlePreviewPDF = useCallback(async () => {
    try {
      const userProfile = await getUserProfile();
      const html = generateInvoiceHTML(data, userProfile?.businessInfo || {});
      setPreviewHTML(html);
      setShowPreview(true);
    } catch (error) {
      console.error('Error previewing invoice:', error);
      Alert.alert('Error', 'Failed to preview invoice. Please try again.');
    }
  }, [data]);

  const handleShareInvoice = () => {
    if (onAction) {
      onAction({ label: 'Share Invoice', type: 'share-invoice-pdf', data: { ...data, pdfUrl } });
    }
  };

  const handleSendToClient = () => {
    if (onAction) {
      onAction({ label: 'Send to Client', type: 'send-invoice-to-client', data: { ...data, pdfUrl } });
    }
  };

  const isUnsaved = !data.id;

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <View style={styles.headerLeft}>
          {businessLogo ? (
            <Image source={{ uri: businessLogo }} style={styles.businessLogo} resizeMode="contain" />
          ) : (
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              {t('invoice.title')}
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
          <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('invoice.billTo')}</Text>
          <Text style={[styles.value, { color: Colors.primaryText }]}>{clientName || client}</Text>
        </View>
        {projectName && (
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('invoice.project')}</Text>
            <Text style={[styles.value, { color: Colors.primaryText }]}>{projectName}</Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>{t('invoice.dueDate')}</Text>
          <Text style={[styles.value, { color: status === 'overdue' ? '#EF4444' : Colors.primaryText }]}>
            {formatDate(dueDate)}
            {status === 'overdue' && ` ${t('invoice.overdue')}`}
          </Text>
        </View>
      </View>

      {/* Line Items */}
      <View style={[styles.section, { borderBottomColor: Colors.border }]}>
        <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('invoice.items')}</Text>
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
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('invoice.contractTotal')}</Text>
            <Text style={[styles.summaryValue, { color: Colors.primaryText }]}>
              ${displayContractTotal.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Show previous payments if any */}
        {previousPayments > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: '#22C55E' }]}>
              {t('invoice.previousPayments')}
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
              {t('invoice.thisInvoice', {
                percentage: paymentPercentage,
                type: paymentType === 'down_payment' ? t('invoice.downPayment') : paymentType === 'progress' ? t('invoice.progressPayment') : t('invoice.payment')
              })}
            </Text>
            <Text style={[styles.summaryValue, { color: Colors.primaryText, fontWeight: '600' }]}>
              ${actualAmountDue.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Amount Due - highlighted */}
        <View style={[styles.totalRow, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue }]}>
          <Text style={[styles.totalLabel, { color: Colors.primaryText }]}>{t('invoice.amountDue')}</Text>
          <Text style={[styles.totalAmount, { color: Colors.primaryBlue }]}>
            ${actualAmountDue.toFixed(2)}
          </Text>
        </View>

        {/* Show remaining balance for partial payments */}
        {isPartialPayment && remainingBalance > 0 && (
          <View style={[styles.summaryRow, { marginTop: Spacing.sm }]}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>
              {t('invoice.remainingBalance')}
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
                {t('invoice.paid')}
              </Text>
              <Text style={[styles.summaryValue, { color: '#22C55E' }]}>
                -${amountPaid.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.dueRow]}>
              <Text style={[styles.summaryLabel, { color: status === 'overdue' ? '#EF4444' : Colors.primaryText, fontWeight: '700' }]}>
                {t('invoice.balanceDue')}
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
        {isUnsaved ? (
          <>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: '#22C55E' }]}
              onPress={handleSaveInvoice}
              activeOpacity={0.7}
            >
              <Ionicons name="save-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={handlePreviewPDF}
              activeOpacity={0.7}
            >
              <Ionicons name="eye-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: '#8B5CF6' }]}
              onPress={handleShareInvoice}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={handlePreviewPDF}
            >
              <Ionicons name="eye-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>{t('invoice.previewPdf')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#1E40AF' }]}
              onPress={handleSendToClient}
            >
              <Ionicons name="send-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>Send to Client</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.successButton, { backgroundColor: '#22C55E' }]}
              onPress={handleShareInvoice}
            >
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>{t('invoice.sendInvoice')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* PDF Preview Modal */}
      <Modal
        visible={showPreview}
        animationType="slide"
        onRequestClose={() => setShowPreview(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top', 'bottom']}>
          <View style={[styles.previewHeader, { borderBottomColor: Colors.border, backgroundColor: Colors.background }]}>
            <TouchableOpacity
              onPress={() => setShowPreview(false)}
              style={styles.closeButton}
              activeOpacity={0.6}
            >
              <Ionicons name="close-circle" size={32} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.previewTitle, { color: Colors.primaryText }]}>Invoice Preview</Text>
            <View style={{ width: 48 }} />
          </View>
          <WebView
            originWhitelist={['*']}
            source={{ html: previewHTML }}
            style={{ flex: 1 }}
          />
        </SafeAreaView>
      </Modal>
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
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
});
