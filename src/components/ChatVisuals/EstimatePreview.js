import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function EstimatePreview({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const {
    estimateNumber,
    client,
    clientName,
    clientPhone,
    client_phone,
    projectName,
    date,
    items = [],
    subtotal = 0,
    total = 0,
    businessName,
    status,
  } = data;

  // Get phone number from any possible field
  const phoneNumber = clientPhone || client_phone || data.phone;

  // Format estimate as text for sharing
  const formatEstimateText = () => {
    let text = `📋 ESTIMATE${estimateNumber ? ` ${estimateNumber}` : ''}\n`;
    if (businessName) {
      text += `${businessName}\n`;
    }
    text += `\n`;
    text += `Client: ${clientName || client}\n`;
    if (projectName) {
      text += `Project: ${projectName}\n`;
    }
    text += `Date: ${date}\n\n`;

    text += `SERVICES:\n`;
    items.forEach(item => {
      text += `${item.index}. ${item.description}\n`;
      text += `   ${item.quantity} ${item.unit}${item.quantity > 1 ? 's' : ''} × $${item.price.toFixed(2)} = $${item.total.toFixed(2)}\n`;
    });

    text += `\nTOTAL: $${total.toFixed(2)}\n`;
    text += `\nValid for 30 days`;

    return text;
  };

  const handleShare = async () => {
    try {
      const message = formatEstimateText();
      await Share.share({
        message: message,
      });
    } catch (error) {
      console.error('Error sharing estimate:', error);
    }
  };

  const handleEdit = () => {
    if (onAction) {
      onAction({ label: 'Edit', type: 'edit-estimate', data });
    }
  };

  const handleConvertToInvoice = () => {
    if (onAction) {
      onAction({ label: 'Convert to Invoice', type: 'convert-estimate-to-invoice', data });
    }
  };

  const getStatusColor = () => {
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

  const getStatusIcon = () => {
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

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <View>
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            📋 ESTIMATE
          </Text>
          {estimateNumber && (
            <Text style={[styles.estimateNumber, { color: Colors.primaryBlue }]}>
              {estimateNumber}
            </Text>
          )}
          {businessName && (
            <Text style={[styles.businessName, { color: Colors.secondaryText }]}>
              {businessName}
            </Text>
          )}
        </View>
        {status && (
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '15', borderColor: getStatusColor() }]}>
            <Ionicons name={getStatusIcon()} size={16} color={getStatusColor()} />
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </View>
        )}
      </View>

      {/* Client Info */}
      <View style={[styles.section, { borderTopColor: Colors.border }]}>
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>Client:</Text>
          <Text style={[styles.value, { color: Colors.primaryText }]}>{clientName || client}</Text>
        </View>
        {projectName && (
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: Colors.secondaryText }]}>Project:</Text>
            <Text style={[styles.value, { color: Colors.primaryText }]}>{projectName}</Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>Date:</Text>
          <Text style={[styles.value, { color: Colors.primaryText }]}>{date}</Text>
        </View>
      </View>

      {/* Line Items */}
      <View style={[styles.section, { borderTopColor: Colors.border }]}>
        <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>SERVICES</Text>
        {items.map((item, index) => (
          <View key={index} style={styles.lineItem}>
            <View style={styles.itemHeader}>
              <Text style={[styles.itemNumber, { color: Colors.secondaryText }]}>
                {item.index}.
              </Text>
              <Text style={[styles.itemDescription, { color: Colors.primaryText }]}>
                {item.description}
              </Text>
            </View>
            <View style={styles.itemDetails}>
              <Text style={[styles.itemCalc, { color: Colors.secondaryText }]}>
                {item.quantity} {item.unit || 'unit'}{item.quantity > 1 ? 's' : ''} × ${item.price.toFixed(2)}
              </Text>
              <Text style={[styles.itemTotal, { color: Colors.primaryText }]}>
                ${item.total.toFixed(2)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Total */}
      <View style={[styles.totalSection, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue }]}>
        <Text style={[styles.totalLabel, { color: Colors.primaryText }]}>TOTAL</Text>
        <Text style={[styles.totalAmount, { color: Colors.primaryBlue }]}>
          ${total.toFixed(2)}
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {status === 'accepted' ? (
          <TouchableOpacity
            style={[styles.sendButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleConvertToInvoice}
          >
            <Ionicons name="document-text-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Convert to Invoice</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Share Estimate</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer Note */}
      <Text style={[styles.footerNote, { color: Colors.secondaryText }]}>
        {status === 'accepted' ? 'Accepted - Ready to convert to invoice' : 'Valid for 30 days • Tap to send'}
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
  estimateNumber: {
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
  editButton: {
    padding: Spacing.xs,
  },
  section: {
    padding: Spacing.lg,
    borderTopWidth: 1,
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
    width: 70,
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
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderTopWidth: 2,
  },
  totalLabel: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  totalAmount: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  sendButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  primaryButton: {
    width: '100%',
  },
  smsButton: {
    // Already has backgroundColor from style prop
  },
  whatsappButton: {
    // Already has backgroundColor from style prop
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
