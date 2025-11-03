import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function EstimatePreview({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const {
    client,
    projectName,
    date,
    items = [],
    subtotal = 0,
    total = 0,
    businessName,
  } = data;

  const handleSendSMS = () => {
    if (onAction) {
      onAction({ label: 'Send via SMS', type: 'send-estimate-sms', data });
    }
  };

  const handleSendWhatsApp = () => {
    if (onAction) {
      onAction({ label: 'Send via WhatsApp', type: 'send-estimate-whatsapp', data });
    }
  };

  const handleEdit = () => {
    if (onAction) {
      onAction({ label: 'Edit', type: 'edit-estimate', data });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            📋 ESTIMATE
          </Text>
          {businessName && (
            <Text style={[styles.businessName, { color: Colors.secondaryText }]}>
              {businessName}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={handleEdit} style={styles.editButton}>
          <Ionicons name="pencil-outline" size={20} color={Colors.primaryBlue} />
        </TouchableOpacity>
      </View>

      {/* Client Info */}
      <View style={[styles.section, { borderTopColor: Colors.border }]}>
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>Client:</Text>
          <Text style={[styles.value, { color: Colors.primaryText }]}>{client}</Text>
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

      {/* Send Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.sendButton, styles.smsButton, { backgroundColor: Colors.success }]}
          onPress={handleSendSMS}
        >
          <Ionicons name="chatbubble-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>Send via SMS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sendButton, styles.whatsappButton, { backgroundColor: '#25D366' }]}
          onPress={handleSendWhatsApp}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#fff" />
          <Text style={styles.buttonText}>WhatsApp</Text>
        </TouchableOpacity>
      </View>

      {/* Footer Note */}
      <Text style={[styles.footerNote, { color: Colors.secondaryText }]}>
        Valid for 30 days • Tap to send
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
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: 2,
  },
  businessName: {
    fontSize: FontSizes.small,
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
