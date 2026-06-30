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
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';
import * as api from '../services/subsService';

export default function AddSubcontractorScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);

  const { t } = useTranslation('common');

  const [form, setForm] = useState({
    legal_name: '', primary_email: '', primary_phone: '',
    tax_id: '', tax_id_type: 'ein', trades: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async () => {
    if (!form.legal_name || !form.primary_email) {
      Alert.alert(t('addSubcontractor.missingRequiredTitle'), t('addSubcontractor.missingRequiredMessage'));
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
        trades: form.trades.split(',').map((s) => s.trim()).filter(Boolean),
      });
      if (result.was_existing) {
        Alert.alert(
          t('addSubcontractor.foundExistingTitle'),
          t('addSubcontractor.foundExistingMessage'),
          [{ text: t('addSubcontractor.okButton'), onPress: () => navigation.replace('SubcontractorDetail', { sub_organization_id: result.sub_organization.id }) }]
        );
      } else {
        Alert.alert(
          t('addSubcontractor.invitationSentTitle'),
          t('addSubcontractor.invitationSentMessage', { email: form.primary_email }),
          [{ text: t('addSubcontractor.okButton'), onPress: () => navigation.replace('SubcontractorDetail', { sub_organization_id: result.sub_organization.id }) }]
        );
      }
    } catch (e) {
      Alert.alert(t('addSubcontractor.failedTitle'), e.message);
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
        <Text style={styles.heading}>{t('addSubcontractor.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>{t('addSubcontractor.legalNameLabel')}</Text>
        <TextInput style={styles.input} value={form.legal_name} onChangeText={(v) => update('legal_name', v)} placeholder={t('addSubcontractor.legalNamePlaceholder')} />

        <Text style={styles.label}>{t('addSubcontractor.emailLabel')}</Text>
        <TextInput style={styles.input} value={form.primary_email} onChangeText={(v) => update('primary_email', v)} placeholder={t('addSubcontractor.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none" />

        <Text style={styles.label}>{t('addSubcontractor.phoneLabel')}</Text>
        <TextInput style={styles.input} value={form.primary_phone} onChangeText={(v) => update('primary_phone', v)} placeholder={t('addSubcontractor.phonePlaceholder')} keyboardType="phone-pad" />

        <Text style={styles.label}>{t('addSubcontractor.taxIdLabel')}</Text>
        <TextInput style={styles.input} value={form.tax_id} onChangeText={(v) => update('tax_id', v)} placeholder={t('addSubcontractor.taxIdPlaceholder')} />

        <Text style={styles.label}>{t('addSubcontractor.tradesLabel')}</Text>
        <TextInput style={styles.input} value={form.trades} onChangeText={(v) => update('trades', v)} placeholder={t('addSubcontractor.tradesPlaceholder')} autoCapitalize="none" />

        <TouchableOpacity
          style={[styles.submit, submitting && { opacity: 0.5 }]}
          onPress={onSubmit}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('addSubcontractor.sendInvitation')}</Text>}
        </TouchableOpacity>

        <Text style={styles.hint}>
          {t('addSubcontractor.hint')}
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
