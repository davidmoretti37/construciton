import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

const CATEGORY_CONFIG = {
  labor: { label: 'Labor', icon: 'people', color: '#3B82F6' },
  materials: { label: 'Materials', icon: 'cube', color: '#10B981' },
  equipment: { label: 'Equipment', icon: 'hammer', color: '#F59E0B' },
  permits: { label: 'Permits', icon: 'document-text', color: '#8B5CF6' },
  subcontractor: { label: 'Subcontractor', icon: 'people', color: '#EC4899' },
  misc: { label: 'Miscellaneous', icon: 'ellipsis-horizontal', color: '#6B7280' },
  other: { label: 'Other', icon: 'ellipsis-horizontal-circle', color: '#6B7280' },
};

export default function TransactionDetailScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
  const { profile } = useAuth();
  const { transaction, projectId, projectName, onRefresh } = route.params;

  const isOwner = profile?.role === 'owner';

  const [showImageModal, setShowImageModal] = useState(false);

  const isExpense = transaction.type === 'expense';
  const categoryConfig = CATEGORY_CONFIG[transaction.category] || CATEGORY_CONFIG.other;

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
  };

  const handleEdit = () => {
    navigation.navigate('TransactionEntry', {
      projectId,
      projectName,
      transaction,
      onSave: onRefresh,
    });
  };

  const lineItems = transaction.line_items || [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
          {isExpense ? 'Expense Details' : 'Income Details'}
        </Text>
        {isOwner ? (
          <TouchableOpacity onPress={handleEdit} style={styles.editButton}>
            <Ionicons name="pencil" size={20} color={Colors.primaryBlue} />
          </TouchableOpacity>
        ) : (
          <View style={styles.editButton} />
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Amount Card */}
        <View style={[styles.amountCard, { backgroundColor: isExpense ? '#DC2626' : '#10B981' }]}>
          <Text style={styles.amountLabel}>
            {isExpense ? 'Expense Amount' : 'Income Amount'}
          </Text>
          <Text style={styles.amountValue}>
            {isExpense ? '-' : '+'}{formatCurrency(transaction.amount)}
          </Text>
          <Text style={styles.amountDate}>{formatDate(transaction.date)}</Text>
        </View>

        {/* Receipt Image */}
        {transaction.receipt_url && (
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              Receipt
            </Text>
            <TouchableOpacity
              onPress={() => setShowImageModal(true)}
              activeOpacity={0.9}
            >
              <Image
                source={{ uri: transaction.receipt_url }}
                style={styles.receiptImage}
                resizeMode="contain"
              />
              <View style={styles.tapToViewOverlay}>
                <Ionicons name="expand" size={16} color="#fff" />
                <Text style={styles.tapToViewText}>Tap to view full size</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Description */}
        <View style={[styles.section, { backgroundColor: Colors.white }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
            Description
          </Text>
          <Text style={[styles.descriptionText, { color: Colors.primaryText }]}>
            {transaction.description || 'No description'}
          </Text>
        </View>

        {/* Details */}
        <View style={[styles.section, { backgroundColor: Colors.white }]}>
          {/* Category */}
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Category</Text>
            <View style={[styles.categoryBadge, { backgroundColor: categoryConfig.color + '20' }]}>
              <Ionicons name={categoryConfig.icon} size={16} color={categoryConfig.color} />
              <Text style={[styles.categoryText, { color: categoryConfig.color }]}>
                {categoryConfig.label}
              </Text>
            </View>
          </View>

          {/* Type */}
          <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md }]}>
            <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Type</Text>
            <View style={[styles.typeBadge, { backgroundColor: isExpense ? '#FEE2E2' : '#D1FAE5' }]}>
              <Text style={[styles.typeText, { color: isExpense ? '#DC2626' : '#10B981' }]}>
                {isExpense ? 'Expense' : 'Income'}
              </Text>
            </View>
          </View>

          {/* Payment Method */}
          {transaction.payment_method && (
            <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md }]}>
              <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Payment Method</Text>
              <Text style={[styles.detailValue, { color: Colors.primaryText }]}>
                {transaction.payment_method.charAt(0).toUpperCase() + transaction.payment_method.slice(1)}
              </Text>
            </View>
          )}

          {/* Worker (if applicable) */}
          {transaction.workers?.full_name && (
            <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md }]}>
              <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Worker</Text>
              <View style={styles.workerBadge}>
                <Ionicons name="person" size={16} color={Colors.primaryBlue} />
                <Text style={[styles.workerText, { color: Colors.primaryText }]}>
                  {transaction.workers.full_name}
                </Text>
              </View>
            </View>
          )}

          {/* Auto-generated indicator */}
          {transaction.is_auto_generated && (
            <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md }]}>
              <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Source</Text>
              <View style={styles.autoBadge}>
                <Ionicons name="flash" size={14} color="#F59E0B" />
                <Text style={[styles.autoText, { color: '#F59E0B' }]}>
                  Auto-generated
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Line Items */}
        {lineItems.length > 0 && (
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              Line Items
            </Text>
            {lineItems.map((item, index) => (
              <View
                key={index}
                style={[
                  styles.lineItem,
                  index < lineItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }
                ]}
              >
                <View style={styles.lineItemLeft}>
                  <Text style={[styles.lineItemDesc, { color: Colors.primaryText }]}>
                    {item.description}
                  </Text>
                  {item.quantity && item.quantity > 1 && (
                    <Text style={[styles.lineItemQty, { color: Colors.secondaryText }]}>
                      Qty: {item.quantity} × ${parseFloat(item.unitPrice || 0).toFixed(2)}
                    </Text>
                  )}
                </View>
                <Text style={[styles.lineItemTotal, { color: Colors.primaryText }]}>
                  {formatCurrency(item.total)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Notes */}
        {transaction.notes && (
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              Notes
            </Text>
            <Text style={[styles.notesText, { color: Colors.secondaryText }]}>
              {transaction.notes}
            </Text>
          </View>
        )}

        {/* Metadata */}
        <View style={[styles.metadataSection, { backgroundColor: Colors.lightBackground }]}>
          <Text style={[styles.metadataText, { color: Colors.secondaryText }]}>
            Created on {new Date(transaction.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </Text>
        </View>

      </ScrollView>

      {/* Full-Screen Image Modal */}
      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalBackground}
            activeOpacity={1}
            onPress={() => setShowImageModal(false)}
          >
            <Image
              source={{ uri: transaction.receipt_url }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowImageModal(false)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl * 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  editButton: {
    padding: Spacing.xs,
  },
  amountCard: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  amountLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  amountValue: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
    marginTop: Spacing.xs,
  },
  amountDate: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FontSizes.small,
    marginTop: Spacing.sm,
  },
  section: {
    marginTop: Spacing.md,
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  receiptImage: {
    width: '100%',
    height: 250,
    borderRadius: BorderRadius.md,
    backgroundColor: '#F3F4F6',
  },
  tapToViewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderBottomLeftRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
  },
  tapToViewText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.8,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionText: {
    fontSize: FontSizes.body,
    lineHeight: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  detailLabel: {
    fontSize: FontSizes.body,
  },
  detailValue: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  categoryText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  typeText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  workerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  workerText: {
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
  autoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  autoText: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
  },
  lineItemLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  lineItemDesc: {
    fontSize: FontSizes.body,
  },
  lineItemQty: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  lineItemTotal: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  notesText: {
    fontSize: FontSizes.body,
    lineHeight: 22,
  },
  metadataSection: {
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  metadataText: {
    fontSize: FontSizes.small,
  },
});
