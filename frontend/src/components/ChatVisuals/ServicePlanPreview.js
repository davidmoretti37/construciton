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

      {/* Mode badge */}
      {data?.plan_mode && (
        <View style={[styles.modeBadge, { backgroundColor: data.plan_mode === 'project' ? '#F59E0B18' : '#10B98118' }]}>
          <Ionicons name={data.plan_mode === 'project' ? 'flag-outline' : 'repeat-outline'} size={12} color={data.plan_mode === 'project' ? '#F59E0B' : '#10B981'} />
          <Text style={[styles.modeBadgeText, { color: data.plan_mode === 'project' ? '#F59E0B' : '#10B981' }]}>
            {data.plan_mode === 'project' ? 'Project with end date' : 'Recurring service'}
          </Text>
        </View>
      )}

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

        {(data?.address || data?.location_address) ? (
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={16} color={Colors.secondaryText} />
            <Text style={[styles.detailText, { color: Colors.primaryText }]}>
              {data.address || data.location_address}
            </Text>
          </View>
        ) : null}

        {(data?.client_phone) ? (
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={16} color={Colors.secondaryText} />
            <Text style={[styles.detailText, { color: Colors.primaryText }]}>{data.client_phone}</Text>
          </View>
        ) : null}

        <View style={styles.detailRow}>
          <Ionicons name="card-outline" size={16} color={Colors.secondaryText} />
          <Text style={[styles.detailText, { color: Colors.primaryText }]}>
            {BILLING_LABELS[billingCycle] || billingCycle} — ${Number(price).toFixed(2)}
          </Text>
        </View>

        {data?.schedule_frequency && (
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={16} color={Colors.secondaryText} />
            <Text style={[styles.detailText, { color: Colors.primaryText }]}>
              {(data.scheduled_days || []).map(d => typeof d === 'string' ? d.charAt(0).toUpperCase() + d.slice(0, 2) : String(d)).join(', ')} {data.schedule_frequency}
              {data.preferred_time ? ` at ${data.preferred_time}` : ''}
            </Text>
          </View>
        )}

        {data?.checklist_items?.length > 0 && (
          <View style={styles.detailRow}>
            <Ionicons name="checkbox-outline" size={16} color={Colors.secondaryText} />
            <Text style={[styles.detailText, { color: Colors.primaryText }]}>
              {data.checklist_items.length} checklist items
            </Text>
          </View>
        )}

        {data?.plan_mode === 'project' && data?.start_date && (
          <View style={styles.detailRow}>
            <Ionicons name="play-outline" size={16} color="#10B981" />
            <Text style={[styles.detailText, { color: Colors.primaryText }]}>
              {data.start_date}{data.end_date ? ` → ${data.end_date}` : ''}
            </Text>
          </View>
        )}

        {data?.plan_mode === 'project' && data?.contract_amount > 0 && (
          <View style={styles.detailRow}>
            <Ionicons name="document-text-outline" size={16} color="#3B82F6" />
            <Text style={[styles.detailText, { color: Colors.primaryText }]}>
              Contract: ${Number(data.contract_amount).toLocaleString()}
            </Text>
          </View>
        )}

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
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: Spacing.sm,
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
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
