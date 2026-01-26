import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function SubcontractorQuoteCard({ quote, onPress, onTogglePreferred, onDelete }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const formatPricing = () => {
    if (!quote.services || quote.services.length === 0) {
      return 'No pricing data';
    }

    // Show first service as preview
    const firstService = quote.services[0];
    const price = firstService.pricePerUnit || firstService.price_per_unit || 0;
    const unit = firstService.unit || 'unit';

    if (quote.services.length === 1) {
      return `$${price.toFixed(2)}/${unit}`;
    }

    return `$${price.toFixed(2)}/${unit} +${quote.services.length - 1} more`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleTogglePreferred = (e) => {
    e.stopPropagation(); // Prevent card onPress
    if (onTogglePreferred) {
      onTogglePreferred(quote.id, !quote.is_preferred);
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation(); // Prevent card onPress
    if (onDelete) {
      onDelete(quote.id);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: Colors.white,
          borderColor: quote.is_preferred ? Colors.primaryBlue : 'rgba(0, 0, 0, 0.12)',
          borderWidth: quote.is_preferred ? 2 : 1.5,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Preferred Badge */}
      {quote.is_preferred && (
        <View style={[styles.preferredBar, { backgroundColor: Colors.primaryBlue }]}>
          <Ionicons name="star" size={12} color="#FFF" />
          <Text style={styles.preferredText}>PREFERRED</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {/* Header with Avatar and Actions */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.avatar, { backgroundColor: quote.is_preferred ? Colors.primaryBlue : Colors.lightGray }]}>
              <Text style={[styles.avatarText, { color: quote.is_preferred ? '#FFF' : Colors.primaryText }]}>
                {getInitials(quote.subcontractor_name)}
              </Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={[styles.contractorName, { color: Colors.primaryText }]} numberOfLines={1}>
                {quote.subcontractor_name}
              </Text>
              {quote.contact_phone && (
                <View style={styles.contactRow}>
                  <Ionicons name="call-outline" size={10} color={Colors.secondaryText} />
                  <Text style={[styles.contactText, { color: Colors.secondaryText }]} numberOfLines={1}>
                    {quote.contact_phone}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleTogglePreferred}
              activeOpacity={0.6}
            >
              <Ionicons
                name={quote.is_preferred ? 'star' : 'star-outline'}
                size={20}
                color={quote.is_preferred ? '#F59E0B' : Colors.secondaryText}
              />
            </TouchableOpacity>
            {onDelete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleDelete}
                activeOpacity={0.6}
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Pricing Preview */}
        <View style={[styles.pricingSection, { backgroundColor: Colors.background }]}>
          <View style={styles.pricingRow}>
            <Ionicons name="pricetag-outline" size={14} color={Colors.primaryBlue} />
            <Text style={[styles.pricingText, { color: Colors.primaryText }]}>
              {formatPricing()}
            </Text>
          </View>
          {quote.services && quote.services.length > 0 && (
            <Text style={[styles.servicesCount, { color: Colors.secondaryText }]}>
              {quote.services.length} service{quote.services.length > 1 ? 's' : ''}
            </Text>
          )}
        </View>

        {/* Footer - Upload Date and Document */}
        <View style={styles.footer}>
          {quote.uploaded_at && (
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={10} color={Colors.secondaryText} />
              <Text style={[styles.dateText, { color: Colors.secondaryText }]}>
                {formatDate(quote.uploaded_at)}
              </Text>
            </View>
          )}
          {quote.document_url && (
            <View style={styles.documentBadge}>
              <Ionicons name="document-attach-outline" size={10} color={Colors.primaryBlue} />
              <Text style={[styles.documentText, { color: Colors.primaryBlue }]}>
                Doc
              </Text>
            </View>
          )}
        </View>

        {/* Notes Preview */}
        {quote.notes && (
          <View style={[styles.notesSection, { backgroundColor: Colors.background }]}>
            <Text style={[styles.notesText, { color: Colors.secondaryText }]} numberOfLines={2}>
              {quote.notes}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  preferredBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  preferredText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  content: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  avatarText: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  contractorName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  contactText: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  actionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pricingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pricingText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  servicesCount: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
  },
  documentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  documentText: {
    fontSize: 9,
    fontWeight: '600',
  },
  notesSection: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  notesText: {
    fontSize: FontSizes.tiny,
    lineHeight: 16,
  },
});
