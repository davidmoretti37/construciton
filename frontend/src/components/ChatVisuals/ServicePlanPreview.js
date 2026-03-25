/**
 * ServicePlanPreview — Chat visual card for creating service plans
 * Same save-button pattern as ProjectPreview
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

const SERVICE_TYPE_CONFIG = {
  pest_control: { label: 'Pest Control', icon: 'bug-outline', color: '#EF4444' },
  cleaning: { label: 'Cleaning', icon: 'sparkles-outline', color: '#8B5CF6' },
  landscaping: { label: 'Landscaping', icon: 'leaf-outline', color: '#10B981' },
  pool_service: { label: 'Pool', icon: 'water-outline', color: '#3B82F6' },
  lawn_care: { label: 'Lawn Care', icon: 'flower-outline', color: '#22C55E' },
  hvac: { label: 'HVAC', icon: 'thermometer-outline', color: '#F59E0B' },
  other: { label: 'Service', icon: 'construct-outline', color: '#6B7280' },
};

const BILLING_LABELS = {
  per_visit: 'Per Visit',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

export default function ServicePlanPreview({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [isSaving, setIsSaving] = useState(false);
  const [savedPlanId, setSavedPlanId] = useState(null);

  const serviceType = data?.serviceType || data?.service_type || 'other';
  const typeConfig = SERVICE_TYPE_CONFIG[serviceType] || SERVICE_TYPE_CONFIG.other;
  const billingCycle = data?.billingCycle || data?.billing_cycle || 'monthly';
  const price = billingCycle === 'per_visit'
    ? (data?.pricePerVisit || data?.price_per_visit || 0)
    : (data?.monthlyRate || data?.monthly_rate || 0);

  const handleSave = async () => {
    if (!onAction || isSaving) return;
    setIsSaving(true);
    try {
      const result = await onAction({
        type: 'save-service-plan',
        data: {
          name: data?.name || 'Untitled Plan',
          service_type: serviceType,
          billing_cycle: billingCycle,
          price_per_visit: billingCycle === 'per_visit' ? price : null,
          monthly_rate: billingCycle !== 'per_visit' ? price : null,
          client_name: data?.clientName || data?.client_name || null,
          description: data?.description || null,
          notes: data?.notes || null,
        },
      });
      if (result?.servicePlanId) {
        setSavedPlanId(result.servicePlanId);
      }
    } catch (e) {
      console.error('Error saving service plan:', e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.cardBackground }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.typeIcon, { backgroundColor: typeConfig.color + '15' }]}>
          <Ionicons name={typeConfig.icon} size={22} color={typeConfig.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.planName, { color: Colors.primaryText }]}>
            {data?.name || 'New Service Plan'}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '18' }]}>
            <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
              {typeConfig.label}
            </Text>
          </View>
        </View>
      </View>

      {/* Details */}
      <View style={styles.details}>
        {data?.clientName || data?.client_name ? (
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={16} color={Colors.secondaryText} />
            <Text style={[styles.detailText, { color: Colors.primaryText }]}>
              {data.clientName || data.client_name}
            </Text>
          </View>
        ) : null}

        <View style={styles.detailRow}>
          <Ionicons name="card-outline" size={16} color={Colors.secondaryText} />
          <Text style={[styles.detailText, { color: Colors.primaryText }]}>
            {BILLING_LABELS[billingCycle] || billingCycle} — ${Number(price).toFixed(2)}
          </Text>
        </View>

        {data?.description ? (
          <View style={styles.detailRow}>
            <Ionicons name="document-text-outline" size={16} color={Colors.secondaryText} />
            <Text style={[styles.detailText, { color: Colors.secondaryText }]} numberOfLines={2}>
              {data.description}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Save / View button */}
      {!savedPlanId ? (
        <TouchableOpacity
          style={[styles.saveButton, isSaving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.saveButtonText}>Save Plan</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.savedRow}
          onPress={() => {
            if (onAction && savedPlanId) {
              onAction({ type: 'view-service-plan', data: { servicePlanId: savedPlanId } });
            }
          }}
        >
          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
          <Text style={styles.savedText}>Plan saved</Text>
          <Ionicons name="open-outline" size={16} color="#10B981" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginVertical: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.md,
  },
  typeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planName: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: 4,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  details: {
    gap: 8,
    marginBottom: Spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: FontSizes.small,
    flex: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1E40AF',
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '700',
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  savedText: {
    color: '#10B981',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
});
