import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

const CATEGORY_CONFIG = {
  materials: { label: 'Materials', icon: 'cube', color: '#3B82F6' },
  equipment: { label: 'Equipment', icon: 'construct', color: '#8B5CF6' },
  permits: { label: 'Permits', icon: 'document', color: '#F59E0B' },
  subcontractor: { label: 'Subcontractor', icon: 'people', color: '#10B981' },
  misc: { label: 'Miscellaneous', icon: 'ellipsis-horizontal', color: '#6B7280' },
};

export default function ExpenseDetailScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { expense } = route.params;

  const categoryConfig = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.misc;

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

  const lineItems = expense.line_items || [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Expense Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Amount Card */}
        <View style={[styles.amountCard, { backgroundColor: '#DC2626' }]}>
          <Text style={styles.amountLabel}>Total Amount</Text>
          <Text style={styles.amountValue}>{formatCurrency(expense.amount)}</Text>
          <Text style={styles.amountDate}>{formatDate(expense.date)}</Text>
        </View>

        {/* Receipt Image */}
        {expense.receipt_url && (
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              Receipt
            </Text>
            <Image
              source={{ uri: expense.receipt_url }}
              style={styles.receiptImage}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Description */}
        <View style={[styles.section, { backgroundColor: Colors.white }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
            Description
          </Text>
          <Text style={[styles.descriptionText, { color: Colors.primaryText }]}>
            {expense.description || 'No description'}
          </Text>
        </View>

        {/* Category & Project */}
        <View style={[styles.section, { backgroundColor: Colors.white }]}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Category</Text>
            <View style={[styles.categoryBadge, { backgroundColor: categoryConfig.color + '20' }]}>
              <Ionicons name={categoryConfig.icon} size={16} color={categoryConfig.color} />
              <Text style={[styles.categoryText, { color: categoryConfig.color }]}>
                {categoryConfig.label}
              </Text>
            </View>
          </View>

          <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md }]}>
            <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Project</Text>
            <View style={styles.projectBadge}>
              <Ionicons name="briefcase" size={16} color={Colors.primaryBlue} />
              <Text style={[styles.projectText, { color: Colors.primaryText }]}>
                {expense.projects?.name || expense.service_plans?.name || 'Unknown Project'}
              </Text>
            </View>
          </View>

          {expense.payment_method && (
            <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md }]}>
              <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Payment Method</Text>
              <Text style={[styles.detailValue, { color: Colors.primaryText }]}>
                {expense.payment_method.charAt(0).toUpperCase() + expense.payment_method.slice(1)}
              </Text>
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
        {expense.notes && (
          <View style={[styles.section, { backgroundColor: Colors.white }]}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              Notes
            </Text>
            <Text style={[styles.notesText, { color: Colors.secondaryText }]}>
              {expense.notes}
            </Text>
          </View>
        )}

        {/* Metadata */}
        <View style={[styles.metadataSection, { backgroundColor: Colors.lightBackground }]}>
          <Text style={[styles.metadataText, { color: Colors.secondaryText }]}>
            Submitted on {new Date(expense.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </Text>
        </View>
      </ScrollView>
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
  projectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectText: {
    fontSize: FontSizes.body,
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
