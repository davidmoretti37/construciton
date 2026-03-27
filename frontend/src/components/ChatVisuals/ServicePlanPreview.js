/**
 * ServicePlanPreview — Chat visual card for creating service plans
 * Full edit mode with inline editing, daily checklist, and labor roles
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  ActionSheetIOS,
  Platform,
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

const BILLING_OPTIONS = ['per_visit', 'monthly', 'quarterly'];

const FREQUENCY_OPTIONS = ['weekly', 'biweekly', 'monthly', 'custom'];

const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'M', tuesday: 'T', wednesday: 'W', thursday: 'T', friday: 'F', saturday: 'S', sunday: 'S' };

// Normalize scheduled_days — handles strings ("monday"), numbers (1), abbreviations ("mon", "Mon")
const normalizeDays = (days) => {
  if (!days || !Array.isArray(days)) return [];
  const NUM_TO_DAY = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
  return days.map(d => {
    if (typeof d === 'number') return NUM_TO_DAY[d] || null;
    const lower = String(d).toLowerCase();
    return ALL_DAYS.find(day => day === lower || day.startsWith(lower)) || lower;
  }).filter(Boolean);
};

export default function ServicePlanPreview({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [isSaving, setIsSaving] = useState(false);
  const [savedPlanId, setSavedPlanId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // editedData holds the current state (original or modified)
  const [editedData, _setEditedData] = useState(() => ({ ...data }));
  const editedDataRef = useRef(editedData);
  const setEditedData = (newData) => {
    const resolved = typeof newData === 'function' ? newData(editedDataRef.current) : newData;
    editedDataRef.current = resolved;
    _setEditedData(resolved);
  };

  const serviceType = editedData?.serviceType || editedData?.service_type || 'other';
  const typeConfig = SERVICE_TYPE_CONFIG[serviceType] || SERVICE_TYPE_CONFIG.other;
  const billingCycle = editedData?.billingCycle || editedData?.billing_cycle || 'monthly';
  const price = billingCycle === 'per_visit'
    ? (editedData?.pricePerVisit || editedData?.price_per_visit || 0)
    : (editedData?.monthlyRate || editedData?.monthly_rate || 0);
  const clientName = editedData?.clientName || editedData?.client_name || '';
  const clientPhone = editedData?.client_phone || editedData?.clientPhone || '';
  const clientEmail = editedData?.client_email || editedData?.clientEmail || '';
  const address = editedData?.address || editedData?.location_address || '';
  const description = editedData?.description || '';
  const scheduleFrequency = editedData?.schedule_frequency || '';
  const scheduledDays = normalizeDays(editedData?.scheduled_days);
  const preferredTime = editedData?.preferred_time || '';
  const checklistItems = editedData?.checklist_items || [];
  const laborRoles = editedData?.labor_roles || [];
  const locationName = editedData?.location_name || '';
  const locationNotes = editedData?.location_notes || '';
  const notes = editedData?.notes || '';

  // Edit handlers
  const updateField = (field, value) => {
    setEditedData(prev => ({ ...prev, [field]: value }));
  };

  const handleStartEdit = () => {
    // Don't reset editedData — keep previous edits
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedData({ ...data });
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
  };

  // Billing cycle picker
  const showBillingPicker = () => {
    const labels = BILLING_OPTIONS.map(o => BILLING_LABELS[o] || o);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, 'Cancel'], cancelButtonIndex: labels.length },
        (index) => {
          if (index < BILLING_OPTIONS.length) {
            updateField('billing_cycle', BILLING_OPTIONS[index]);
            updateField('billingCycle', BILLING_OPTIONS[index]);
          }
        }
      );
    } else {
      Alert.alert('Billing Cycle', 'Select billing cycle', [
        ...BILLING_OPTIONS.map(o => ({
          text: BILLING_LABELS[o] || o,
          onPress: () => { updateField('billing_cycle', o); updateField('billingCycle', o); },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  // Schedule frequency picker
  const showFrequencyPicker = () => {
    const labels = FREQUENCY_OPTIONS.map(o => o.charAt(0).toUpperCase() + o.slice(1));
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, 'Cancel'], cancelButtonIndex: labels.length },
        (index) => {
          if (index < FREQUENCY_OPTIONS.length) {
            updateField('schedule_frequency', FREQUENCY_OPTIONS[index]);
          }
        }
      );
    } else {
      Alert.alert('Frequency', 'Select schedule frequency', [
        ...FREQUENCY_OPTIONS.map(o => ({
          text: o.charAt(0).toUpperCase() + o.slice(1),
          onPress: () => updateField('schedule_frequency', o),
        })),
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  // Scheduled days toggle
  const toggleDay = (day) => {
    const current = editedData?.scheduled_days || [];
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day];
    updateField('scheduled_days', updated);
  };

  // Checklist item handlers
  const handleAddChecklistItem = () => {
    const items = [...checklistItems, { title: '', item_type: 'checkbox', quantity_unit: '', requires_photo: false }];
    updateField('checklist_items', items);
  };

  const handleUpdateChecklistItem = (index, field, value) => {
    const items = [...checklistItems];
    items[index] = { ...items[index], [field]: value };
    updateField('checklist_items', items);
  };

  const handleRemoveChecklistItem = (index) => {
    const items = [...checklistItems];
    items.splice(index, 1);
    updateField('checklist_items', items);
  };

  const handleToggleItemType = (index) => {
    const items = [...checklistItems];
    items[index] = {
      ...items[index],
      item_type: items[index].item_type === 'checkbox' ? 'quantity' : 'checkbox',
    };
    updateField('checklist_items', items);
  };

  // Labor role handlers
  const handleAddLaborRole = () => {
    const roles = [...laborRoles, { role_name: '', default_quantity: 1 }];
    updateField('labor_roles', roles);
  };

  const handleUpdateLaborRole = (index, field, value) => {
    const roles = [...laborRoles];
    roles[index] = { ...roles[index], [field]: value };
    updateField('labor_roles', roles);
  };

  const handleRemoveLaborRole = (index) => {
    const roles = [...laborRoles];
    roles.splice(index, 1);
    updateField('labor_roles', roles);
  };

  // Save handler — sends full editedData to ChatScreen
  const handleSave = async () => {
    if (!onAction || isSaving) return;
    setIsSaving(true);
    try {
      const current = editedDataRef.current;
      const bc = current?.billingCycle || current?.billing_cycle || 'monthly';
      const p = bc === 'per_visit'
        ? (current?.pricePerVisit || current?.price_per_visit || 0)
        : (current?.monthlyRate || current?.monthly_rate || 0);

      const result = await onAction({
        type: 'save-service-plan',
        data: {
          name: current?.name || 'Untitled Plan',
          service_type: current?.serviceType || current?.service_type || 'other',
          billing_cycle: bc,
          price_per_visit: bc === 'per_visit' ? p : null,
          monthly_rate: bc !== 'per_visit' ? p : null,
          client_name: current?.clientName || current?.client_name || null,
          client_phone: current?.client_phone || current?.clientPhone || null,
          client_email: current?.client_email || current?.clientEmail || null,
          address: current?.address || current?.location_address || null,
          location_name: current?.location_name || null,
          location_address: current?.location_address || current?.address || null,
          location_notes: current?.location_notes || null,
          schedule_frequency: current?.schedule_frequency || null,
          scheduled_days: current?.scheduled_days || [],
          preferred_time: current?.preferred_time || null,
          description: current?.description || null,
          notes: current?.notes || null,
          checklist_items: current?.checklist_items || [],
          labor_roles: current?.labor_roles || [],
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

  // Render helper for editable field row
  const renderField = (icon, label, value, field, options = {}) => {
    if (!isEditing && !value) return null;
    return (
      <View style={styles.fieldRow}>
        <Ionicons name={icon} size={16} color={Colors.secondaryText} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>{label}</Text>
          {isEditing ? (
            <TextInput
              style={[styles.fieldInput, { color: Colors.primaryText, borderColor: Colors.border }]}
              value={value}
              onChangeText={(v) => updateField(field, v)}
              placeholder={options.placeholder || label}
              placeholderTextColor={Colors.secondaryText + '80'}
              keyboardType={options.keyboardType || 'default'}
            />
          ) : (
            <Text style={[styles.fieldValue, { color: Colors.primaryText }]}>{value}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <View style={[styles.typeIcon, { backgroundColor: typeConfig.color + '15' }]}>
          <Ionicons name={typeConfig.icon} size={24} color={typeConfig.color} />
        </View>
        <View style={{ flex: 1 }}>
          {isEditing ? (
            <TextInput
              style={[styles.planNameInput, { color: Colors.primaryText, borderColor: Colors.border }]}
              value={editedData?.name || ''}
              onChangeText={(v) => updateField('name', v)}
              placeholder="Plan name"
              placeholderTextColor={Colors.secondaryText + '80'}
            />
          ) : (
            <Text style={[styles.planName, { color: Colors.primaryText }]}>
              {editedData?.name || 'New Service Plan'}
            </Text>
          )}
          <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '18' }]}>
            <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
              {typeConfig.label}
            </Text>
          </View>
        </View>
        {!savedPlanId && (
          <View style={styles.headerRight}>
            {!isEditing ? (
              <TouchableOpacity
                style={[styles.editIconButton, { backgroundColor: Colors.primaryBlue + '15' }]}
                onPress={handleStartEdit}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={20} color={Colors.primaryBlue} />
              </TouchableOpacity>
            ) : (
              <View style={styles.editActions}>
                <TouchableOpacity onPress={handleCancelEdit} style={styles.editActionButton}>
                  <Ionicons name="close" size={20} color="#EF4444" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveEdit} style={styles.editActionButton}>
                  <Ionicons name="checkmark" size={20} color="#10B981" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Client Info Section */}
      <View style={[styles.section, { borderBottomColor: Colors.border }]}>
        <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Client</Text>
        {renderField('person-outline', 'Name', clientName, 'client_name')}
        {renderField('call-outline', 'Phone', clientPhone, 'client_phone', { keyboardType: 'phone-pad' })}
        {renderField('mail-outline', 'Email', clientEmail, 'client_email', { keyboardType: 'email-address' })}
        {renderField('location-outline', 'Address', address, 'address')}
      </View>

      {/* Billing Section */}
      <View style={[styles.section, { borderBottomColor: Colors.border }]}>
        <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Billing</Text>
        <View style={styles.fieldRow}>
          <Ionicons name="card-outline" size={16} color={Colors.secondaryText} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>Billing Cycle</Text>
            {isEditing ? (
              <TouchableOpacity
                style={[styles.cyclePicker, { borderColor: Colors.border, backgroundColor: Colors.inputBackground || Colors.lightGray }]}
                onPress={showBillingPicker}
              >
                <Text style={[styles.fieldValue, { color: Colors.primaryText }]}>
                  {BILLING_LABELS[billingCycle] || billingCycle}
                </Text>
                <Ionicons name="chevron-down" size={14} color={Colors.secondaryText} />
              </TouchableOpacity>
            ) : (
              <Text style={[styles.fieldValue, { color: Colors.primaryText }]}>
                {BILLING_LABELS[billingCycle] || billingCycle}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.fieldRow}>
          <Ionicons name="cash-outline" size={16} color={Colors.secondaryText} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>
              {billingCycle === 'per_visit' ? 'Price Per Visit' : 'Monthly Rate'}
            </Text>
            {isEditing ? (
              <TextInput
                style={[styles.fieldInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                value={String(price)}
                onChangeText={(v) => {
                  const num = parseFloat(v) || 0;
                  if (billingCycle === 'per_visit') {
                    updateField('price_per_visit', num);
                    updateField('pricePerVisit', num);
                  } else {
                    updateField('monthly_rate', num);
                    updateField('monthlyRate', num);
                  }
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={Colors.secondaryText + '80'}
              />
            ) : (
              <Text style={[styles.fieldValue, { color: Colors.primaryText }]}>
                ${Number(price).toFixed(2)}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Location Section */}
      {(locationName || locationNotes || isEditing) && (
        <View style={[styles.section, { borderBottomColor: Colors.border }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Location</Text>
          {renderField('business-outline', 'Location Name', locationName, 'location_name')}
          {renderField('location-outline', 'Address', address, 'location_address')}
          {renderField('key-outline', 'Access Notes', locationNotes, 'location_notes')}
        </View>
      )}

      {/* Schedule Section */}
      {(scheduleFrequency || scheduledDays.length > 0 || isEditing) && (
        <View style={[styles.section, { borderBottomColor: Colors.border }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Schedule</Text>
          <View style={styles.fieldRow}>
            <Ionicons name="repeat-outline" size={16} color={Colors.secondaryText} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: Colors.secondaryText }]}>Frequency</Text>
              {isEditing ? (
                <TouchableOpacity
                  style={[styles.cyclePicker, { borderColor: Colors.border, backgroundColor: Colors.inputBackground || Colors.lightGray }]}
                  onPress={showFrequencyPicker}
                >
                  <Text style={[styles.fieldValue, { color: Colors.primaryText }]}>
                    {scheduleFrequency ? scheduleFrequency.charAt(0).toUpperCase() + scheduleFrequency.slice(1) : 'Select...'}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={Colors.secondaryText} />
                </TouchableOpacity>
              ) : scheduleFrequency ? (
                <Text style={[styles.fieldValue, { color: Colors.primaryText }]}>
                  {scheduleFrequency.charAt(0).toUpperCase() + scheduleFrequency.slice(1)}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Day circles — tappable in edit mode, read-only otherwise */}
          <View style={styles.dayCirclesRow}>
            {ALL_DAYS.map(day => {
              const isActive = scheduledDays.includes(day);
              return (
                <TouchableOpacity
                  key={day}
                  disabled={!isEditing}
                  onPress={() => toggleDay(day)}
                  style={[
                    styles.dayCircle,
                    isActive
                      ? { backgroundColor: typeConfig.color }
                      : { backgroundColor: Colors.background || Colors.lightGray },
                    isEditing && { borderWidth: 1.5, borderColor: isActive ? typeConfig.color : Colors.border },
                  ]}
                  activeOpacity={isEditing ? 0.6 : 1}
                >
                  <Text style={[
                    styles.dayCircleText,
                    { color: isActive ? '#fff' : Colors.secondaryText },
                  ]}>
                    {DAY_LABELS[day]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {renderField('time-outline', 'Preferred Time', preferredTime, 'preferred_time')}
        </View>
      )}

      {/* Description */}
      {(description || isEditing) && (
        <View style={[styles.section, { borderBottomColor: Colors.border }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Description</Text>
          {isEditing ? (
            <TextInput
              style={[styles.descriptionInput, { color: Colors.primaryText, borderColor: Colors.border }]}
              value={description}
              onChangeText={(v) => updateField('description', v)}
              placeholder="Service description..."
              placeholderTextColor={Colors.secondaryText + '80'}
              multiline
              numberOfLines={3}
            />
          ) : (
            <Text style={[styles.fieldValue, { color: Colors.secondaryText }]} numberOfLines={3}>
              {description}
            </Text>
          )}
        </View>
      )}

      {/* Notes */}
      {(notes || isEditing) && (
        <View style={[styles.section, { borderBottomColor: Colors.border }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Notes</Text>
          {isEditing ? (
            <TextInput
              style={[styles.descriptionInput, { color: Colors.primaryText, borderColor: Colors.border }]}
              value={notes}
              onChangeText={(v) => updateField('notes', v)}
              placeholder="Internal notes..."
              placeholderTextColor={Colors.secondaryText + '80'}
              multiline
              numberOfLines={2}
            />
          ) : (
            <Text style={[styles.fieldValue, { color: Colors.secondaryText }]} numberOfLines={3}>
              {notes}
            </Text>
          )}
        </View>
      )}

      {/* Daily Checklist Section */}
      {(checklistItems.length > 0 || isEditing) && (
        <View style={[styles.section, { borderBottomColor: Colors.border }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="checkbox-outline" size={18} color="#8B5CF6" />
            <Text style={[styles.sectionTitle, { color: Colors.primaryText, flex: 1 }]}>Daily Checklist</Text>
            {isEditing && (
              <TouchableOpacity
                onPress={handleAddChecklistItem}
                style={[styles.addButton, { backgroundColor: '#8B5CF615', borderColor: '#8B5CF6' }]}
              >
                <Ionicons name="add" size={14} color="#8B5CF6" />
                <Text style={{ color: '#8B5CF6', fontSize: 12, fontWeight: '600' }}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {checklistItems.map((item, index) => {
            const itemTitle = typeof item === 'string' ? item : item.title;
            const itemType = typeof item === 'string' ? 'checkbox' : (item.item_type || 'checkbox');
            const quantityUnit = typeof item === 'string' ? '' : (item.quantity_unit || '');
            const requiresPhoto = typeof item === 'string' ? false : (item.requires_photo || false);

            return (
              <View key={index} style={[styles.checklistRow, { borderBottomColor: Colors.border }]}>
                {isEditing ? (
                  <>
                    {/* Type toggle */}
                    <TouchableOpacity onPress={() => handleToggleItemType(index)} style={{ paddingRight: 6 }}>
                      <Ionicons
                        name={itemType === 'quantity' ? 'speedometer-outline' : 'checkbox-outline'}
                        size={18}
                        color={itemType === 'quantity' ? '#F59E0B' : '#8B5CF6'}
                      />
                    </TouchableOpacity>
                    {/* Title */}
                    <TextInput
                      style={[styles.checklistInput, { color: Colors.primaryText, borderColor: Colors.border, flex: 1 }]}
                      value={itemTitle}
                      onChangeText={(v) => handleUpdateChecklistItem(index, 'title', v)}
                      placeholder="Item name"
                      placeholderTextColor={Colors.secondaryText + '80'}
                    />
                    {/* Unit (for quantity items) */}
                    {itemType === 'quantity' && (
                      <TextInput
                        style={[styles.checklistInput, styles.unitInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                        value={quantityUnit}
                        onChangeText={(v) => handleUpdateChecklistItem(index, 'quantity_unit', v)}
                        placeholder="unit"
                        placeholderTextColor={Colors.secondaryText + '80'}
                      />
                    )}
                    {/* Photo toggle */}
                    <TouchableOpacity
                      onPress={() => handleUpdateChecklistItem(index, 'requires_photo', !requiresPhoto)}
                      style={{ paddingHorizontal: 4 }}
                    >
                      <Ionicons
                        name={requiresPhoto ? 'camera' : 'camera-outline'}
                        size={16}
                        color={requiresPhoto ? '#3B82F6' : Colors.secondaryText + '60'}
                      />
                    </TouchableOpacity>
                    {/* Remove */}
                    <TouchableOpacity onPress={() => handleRemoveChecklistItem(index)} style={{ paddingLeft: 4 }}>
                      <Ionicons name="close-circle" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name={itemType === 'quantity' ? 'speedometer-outline' : 'ellipse-outline'}
                      size={16}
                      color={itemType === 'quantity' ? '#F59E0B' : Colors.secondaryText}
                    />
                    <Text style={[styles.checklistText, { color: Colors.primaryText }]}>
                      {itemTitle}
                    </Text>
                    {itemType === 'quantity' && quantityUnit ? (
                      <View style={[styles.unitBadge, { backgroundColor: '#F59E0B18' }]}>
                        <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '600' }}>{quantityUnit}</Text>
                      </View>
                    ) : null}
                    {requiresPhoto && (
                      <Ionicons name="camera-outline" size={14} color="#3B82F6" />
                    )}
                  </>
                )}
              </View>
            );
          })}
          {checklistItems.length === 0 && isEditing && (
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              No checklist items yet — tap Add to create one
            </Text>
          )}
        </View>
      )}

      {/* Labor Roles Section */}
      {(laborRoles.length > 0 || isEditing) && (
        <View style={[styles.section, { borderBottomColor: Colors.border }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people-outline" size={18} color="#10B981" />
            <Text style={[styles.sectionTitle, { color: Colors.primaryText, flex: 1 }]}>Crew Roles</Text>
            {isEditing && (
              <TouchableOpacity
                onPress={handleAddLaborRole}
                style={[styles.addButton, { backgroundColor: '#10B98115', borderColor: '#10B981' }]}
              >
                <Ionicons name="add" size={14} color="#10B981" />
                <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '600' }}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {laborRoles.map((role, index) => {
            const roleName = typeof role === 'string' ? role : role.role_name;
            const qty = typeof role === 'string' ? 1 : (role.default_quantity || 1);

            return (
              <View key={index} style={[styles.laborRow, { borderBottomColor: Colors.border }]}>
                {isEditing ? (
                  <>
                    <Ionicons name="person-outline" size={16} color="#10B981" />
                    <TextInput
                      style={[styles.checklistInput, { color: Colors.primaryText, borderColor: Colors.border, flex: 1 }]}
                      value={roleName}
                      onChangeText={(v) => handleUpdateLaborRole(index, 'role_name', v)}
                      placeholder="Role name"
                      placeholderTextColor={Colors.secondaryText + '80'}
                    />
                    <Text style={[styles.fieldLabel, { color: Colors.secondaryText, marginRight: 4 }]}>x</Text>
                    <TextInput
                      style={[styles.checklistInput, styles.qtyInput, { color: Colors.primaryText, borderColor: Colors.border }]}
                      value={String(qty)}
                      onChangeText={(v) => handleUpdateLaborRole(index, 'default_quantity', parseInt(v) || 1)}
                      keyboardType="numeric"
                      selectTextOnFocus
                    />
                    <TouchableOpacity onPress={() => handleRemoveLaborRole(index)} style={{ paddingLeft: 6 }}>
                      <Ionicons name="close-circle" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Ionicons name="person-outline" size={16} color="#10B981" />
                    <Text style={[styles.checklistText, { color: Colors.primaryText }]}>{roleName}</Text>
                    <View style={[styles.qtyBadge, { backgroundColor: '#10B98118' }]}>
                      <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '700' }}>x{qty}</Text>
                    </View>
                  </>
                )}
              </View>
            );
          })}
          {laborRoles.length === 0 && isEditing && (
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              No crew roles yet — tap Add to define one
            </Text>
          )}
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {savedPlanId ? (
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
        ) : isEditing ? (
          <>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: Colors.secondaryText, flex: 1 }]}
              onPress={handleCancelEdit}
              activeOpacity={0.7}
            >
              <Ionicons name="close-outline" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: Colors.primaryBlue, flex: 1 }]}
              onPress={handleSaveEdit}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-outline" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>Done</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#1E40AF', flex: 1 }, isSaving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="save-outline" size={18} color="#fff" />
            )}
            <Text style={styles.actionButtonText}>{isSaving ? 'Saving...' : 'Save Plan'}</Text>
          </TouchableOpacity>
        )}
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
    alignItems: 'center',
    gap: 12,
    padding: Spacing.lg,
    borderBottomWidth: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editActionButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planName: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: 4,
  },
  planNameInput: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: 4,
    borderBottomWidth: 1,
    paddingVertical: 2,
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
  section: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  fieldInput: {
    fontSize: FontSizes.small,
    borderBottomWidth: 1,
    paddingVertical: 4,
    fontWeight: '500',
  },
  cyclePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  descriptionInput: {
    fontSize: FontSizes.small,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  laborRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checklistText: {
    fontSize: FontSizes.small,
    fontWeight: '500',
    flex: 1,
  },
  checklistInput: {
    fontSize: FontSizes.small,
    borderBottomWidth: 1,
    paddingVertical: 4,
    fontWeight: '500',
  },
  unitInput: {
    width: 60,
    textAlign: 'center',
  },
  qtyInput: {
    width: 36,
    textAlign: 'center',
  },
  unitBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  emptyText: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  dayCirclesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    padding: Spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
  },
  actionButtonText: {
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
    flex: 1,
  },
  savedText: {
    color: '#10B981',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
});
