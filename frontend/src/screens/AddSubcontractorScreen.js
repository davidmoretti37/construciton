/**
 * AddSubcontractorScreen — minimal 5-field form to invite a sub.
 *
 * On submit, calls POST /api/subs which dedups by EIN and (if new) issues
 * a first_claim magic-link token to email the sub.
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';
import * as api from '../services/subsService';

export default function AddSubcontractorScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const [form, setForm] = useState({
    legal_name: '', primary_email: '', primary_phone: '',
    tax_id: '', tax_id_type: 'ein', trades: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async () => {
    if (!form.legal_name || !form.primary_email) {
      Alert.alert('Missing required', 'Legal name and email are required.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.addSub({
        legal_name: form.legal_name,
        primary_email: form.primary_email,
        primary_phone: form.primary_phone || null,
        tax_id: form.tax_id || null,
        tax_id_type: form.tax_id_type,
        trades: form.trades.split(',').map((t) => t.trim()).filter(Boolean),
      });
      if (result.was_existing) {
        Alert.alert(
          'Found existing sub',
          'This sub is already on Sylk. We linked them to your account.',
          [{ text: 'OK', onPress: () => navigation.replace('SubcontractorDetail', { sub_organization_id: result.sub_organization.id }) }]
        );
      } else {
        Alert.alert(
          'Invitation sent',
          `Sent to ${form.primary_email}. They'll install Sylk and sign up with this email — their account will be linked automatically.`,
          [{ text: 'OK', onPress: () => navigation.replace('SubcontractorDetail', { sub_organization_id: result.sub_organization.id }) }]
        );
      }
    } catch (e) {
      Alert.alert('Failed', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.heading}>Add subcontractor</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>Legal business name *</Text>
        <TextInput style={styles.input} value={form.legal_name} onChangeText={(v) => update('legal_name', v)} placeholder="e.g. Mike's Plumbing LLC" />

        <Text style={styles.label}>Email *</Text>
        <TextInput style={styles.input} value={form.primary_email} onChangeText={(v) => update('primary_email', v)} placeholder="mike@plumb.com" keyboardType="email-address" autoCapitalize="none" />

        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={form.primary_phone} onChangeText={(v) => update('primary_phone', v)} placeholder="(555) 123-4567" keyboardType="phone-pad" />

        <Text style={styles.label}>Tax ID (EIN)</Text>
        <TextInput style={styles.input} value={form.tax_id} onChangeText={(v) => update('tax_id', v)} placeholder="12-3456789" />

        <Text style={styles.label}>Trades (comma-separated)</Text>
        <TextInput style={styles.input} value={form.trades} onChangeText={(v) => update('trades', v)} placeholder="plumbing, hvac" autoCapitalize="none" />

        <TouchableOpacity
          style={[styles.submit, submitting && { opacity: 0.5 }]}
          onPress={onSubmit}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Send invitation</Text>}
        </TouchableOpacity>

        <Text style={styles.hint}>
          We'll email them an invitation. They install Sylk, sign up with this email, and their account links automatically — no separate magic link.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (Colors) => StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 8,
  },
  backBtn: { padding: 8 },
  heading: { fontSize: 22, fontWeight: '700', color: Colors.primaryText, marginLeft: 6 },
  scroll: { padding: 16 },
  label: { fontSize: 13, color: Colors.secondaryText, marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 14, fontSize: 15,
    backgroundColor: Colors.cardBackground, color: Colors.primaryText,
  },
  submit: {
    backgroundColor: Colors.primaryBlue, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 28,
  },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  hint: { fontSize: 12, color: Colors.secondaryText, marginTop: 14, textAlign: 'center' },
});
