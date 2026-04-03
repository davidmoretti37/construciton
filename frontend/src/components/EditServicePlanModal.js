/**
 * EditServicePlanModal — Edit service plan details after creation
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { clearCache } from '../services/offlineCache';

const BILLING_OPTIONS = [
  { value: 'per_visit', label: 'Per Visit' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: '#10B981' },
  { value: 'paused', label: 'Paused', color: '#F59E0B' },
  { value: 'cancelled', label: 'Cancelled', color: '#EF4444' },
];

export default function EditServicePlanModal({ visible, onClose, plan, onSave }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [pricePerVisit, setPricePerVisit] = useState('');
  const [monthlyRate, setMonthlyRate] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('active');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (plan) {
      setName(plan.name || '');
      setClientName(plan.client_name || '');
      setClientPhone(plan.client_phone || '');
      setClientEmail(plan.client_email || '');
      setBillingCycle(plan.billing_cycle || 'monthly');
      setPricePerVisit(plan.price_per_visit ? String(plan.price_per_visit) : '');
      setMonthlyRate(plan.monthly_rate ? String(plan.monthly_rate) : '');
      setDescription(plan.description || '');
      setNotes(plan.notes || '');
      setStatus(plan.status || 'active');
    }
  }, [plan]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Plan name is required.');
      return;
    }

    const priceVal = parseFloat(pricePerVisit) || null;
    const monthVal = parseFloat(monthlyRate) || null;

    if (billingCycle === 'per_visit' && (!priceVal || priceVal <= 0)) {
      Alert.alert('Required', 'Price per visit must be greater than 0.');
      return;
    }
    if ((billingCycle === 'monthly' || billingCycle === 'quarterly') && (!monthVal || monthVal <= 0)) {
      Alert.alert('Required', 'Monthly rate must be greater than 0.');
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('service_plans')
        .update({
          name: name.trim(),
          client_name: clientName.trim() || null,
          client_phone: clientPhone.trim() || null,
          client_email: clientEmail.trim() || null,
          billing_cycle: billingCycle,
          price_per_visit: priceVal,
          monthly_rate: monthVal,
          description: description.trim() || null,
          notes: notes.trim() || null,
          status,
        })
        .eq('id', plan.id);

      if (error) throw error;

      clearCache('service_plans');
      onSave && onSave();
      onClose();
    } catch (e) {
      console.error('Error updating service plan:', e);
      Alert.alert('Error', 'Failed to update service plan.');
    } finally {
      setSaving(false);
    }
  };

  const numericOnly = (text) => text.replace(/[^0-9.]/g, '');

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.container, { backgroundColor: Colors.cardBackground }]}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: Colors.primaryText }]}>Edit Service Plan</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
              {/* Name */}
              <Text style={[styles.label, { color: Colors.secondaryText }]}>Plan Name *</Text>
              <TextInput
                style={[styles.input, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.inputBackground }]}
                value={name}
                onChangeText={setName}
                placeholder="Plan name"
                placeholderTextColor={Colors.placeholderText}
              />

              {/* Client */}
              <Text style={[styles.label, { color: Colors.secondaryText }]}>Client Name</Text>
              <TextInput
                style={[styles.input, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.inputBackground }]}
                value={clientName}
                onChangeText={setClientName}
                placeholder="Client name"
                placeholderTextColor={Colors.placeholderText}
              />

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.label, { color: Colors.secondaryText }]}>Phone</Text>
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.inputBackground }]}
                    value={clientPhone}
                    onChangeText={setClientPhone}
                    placeholder="Phone"
                    placeholderTextColor={Colors.placeholderText}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.label, { color: Colors.secondaryText }]}>Email</Text>
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.inputBackground }]}
                    value={clientEmail}
                    onChangeText={setClientEmail}
                    placeholder="Email"
                    placeholderTextColor={Colors.placeholderText}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* Billing */}
              <Text style={[styles.label, { color: Colors.secondaryText }]}>Billing Cycle</Text>
              <View style={styles.optionRow}>
                {BILLING_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.optionBtn,
                      { borderColor: Colors.border },
                      billingCycle === opt.value && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
                    ]}
                    onPress={() => setBillingCycle(opt.value)}
                  >
                    <Text style={[
                      styles.optionText,
                      { color: Colors.secondaryText },
                      billingCycle === opt.value && { color: '#fff' },
                    ]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {billingCycle === 'per_visit' ? (
                <>
                  <Text style={[styles.label, { color: Colors.secondaryText }]}>Price per Visit ($)</Text>
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.inputBackground }]}
                    value={pricePerVisit}
                    onChangeText={(t) => setPricePerVisit(numericOnly(t))}
                    placeholder="0.00"
                    placeholderTextColor={Colors.placeholderText}
                    keyboardType="decimal-pad"
                  />
                </>
              ) : (
                <>
                  <Text style={[styles.label, { color: Colors.secondaryText }]}>Monthly Rate ($)</Text>
                  <TextInput
                    style={[styles.input, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.inputBackground }]}
                    value={monthlyRate}
                    onChangeText={(t) => setMonthlyRate(numericOnly(t))}
                    placeholder="0.00"
                    placeholderTextColor={Colors.placeholderText}
                    keyboardType="decimal-pad"
                  />
                </>
              )}

              {/* Status */}
              <Text style={[styles.label, { color: Colors.secondaryText }]}>Status</Text>
              <View style={styles.optionRow}>
                {STATUS_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.optionBtn,
                      { borderColor: Colors.border },
                      status === opt.value && { backgroundColor: opt.color, borderColor: opt.color },
                    ]}
                    onPress={() => setStatus(opt.value)}
                  >
                    <Text style={[
                      styles.optionText,
                      { color: Colors.secondaryText },
                      status === opt.value && { color: '#fff' },
                    ]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Description */}
              <Text style={[styles.label, { color: Colors.secondaryText }]}>Description</Text>
              <TextInput
                style={[styles.input, styles.multiline, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.inputBackground }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Service description"
                placeholderTextColor={Colors.placeholderText}
                multiline
                numberOfLines={3}
              />

              {/* Notes */}
              <Text style={[styles.label, { color: Colors.secondaryText }]}>Notes</Text>
              <TextInput
                style={[styles.input, styles.multiline, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.inputBackground }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Internal notes"
                placeholderTextColor={Colors.placeholderText}
                multiline
                numberOfLines={3}
              />

              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Save button */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  form: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#3B82F6',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
