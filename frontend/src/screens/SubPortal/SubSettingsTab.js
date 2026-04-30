/**
 * SubSettingsTab — settings for the sub portal.
 *
 * Sections:
 *   - Profile card (legal name, trades)
 *   - Business info (editable: legal_name, dba, phone, website)
 *   - Theme toggle (light / dark)
 *   - Language picker (en / es / pt-BR)
 *   - Log out
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { LightColors, DarkColors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import * as api from '../../services/subPortalService';
import { changeLanguage } from '../../i18n';

const SUB_VIOLET = '#8B5CF6';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt-BR', label: 'Português' },
];

export default function SubSettingsTab() {
  const { isDark = false, toggleTheme } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const styles = makeStyles(Colors);
  const { user, profile } = useAuth();
  const { i18n } = useTranslation();

  const [subOrg, setSubOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [legalName, setLegalName] = useState('');
  const [dba, setDba] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');

  const load = useCallback(async () => {
    try {
      const me = await api.getMe();
      setSubOrg(me.sub_organization);
      setLegalName(me.sub_organization?.legal_name || '');
      setDba(me.sub_organization?.dba || '');
      setPhone(me.sub_organization?.primary_phone || '');
      setWebsite(me.sub_organization?.website || '');
    } catch (e) {
      console.warn('[SubSettings] load:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateMe({
        legal_name: legalName.trim() || subOrg.legal_name,
        dba: dba.trim() || null,
        primary_phone: phone.trim() || null,
        website: website.trim() || null,
      });
      await load();
      setEditing(false);
    } catch (e) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeLanguage = async (code) => {
    try {
      await changeLanguage(code);
    } catch (e) {
      console.warn('Language change failed:', e.message);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            try {
              const hasSeenOnboarding = await AsyncStorage.getItem('@hasSeenOnboarding');
              await AsyncStorage.clear();
              if (hasSeenOnboarding) await AsyncStorage.setItem('@hasSeenOnboarding', hasSeenOnboarding);
              await supabase.auth.signOut();
            } catch (e) {
              console.error('Logout error:', e);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={SUB_VIOLET} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.headerTitle}>Settings</Text>

      {/* Profile card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(subOrg?.legal_name || 'S').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.profileName} numberOfLines={1}>
            {subOrg?.legal_name || 'My business'}
          </Text>
          <Text style={styles.profileMeta} numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
      </View>

      {/* Business info */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Business info</Text>
        {!editing ? (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity onPress={() => { setEditing(false); load(); }}>
              <Text style={[styles.editLink, { color: Colors.secondaryText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={SUB_VIOLET} />
              ) : (
                <Text style={[styles.editLink, { color: SUB_VIOLET }]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Field label="Legal name" value={legalName} onChangeText={setLegalName} editing={editing} Colors={Colors} />
        <Field label="DBA" value={dba} onChangeText={setDba} editing={editing} placeholder="Doing-business-as" Colors={Colors} />
        <Field label="Phone" value={phone} onChangeText={setPhone} editing={editing} keyboardType="phone-pad" placeholder="(555) 555-5555" Colors={Colors} />
        <Field label="Website" value={website} onChangeText={setWebsite} editing={editing} keyboardType="url" placeholder="https://..." Colors={Colors} last />
      </View>

      {/* Appearance */}
      <Text style={styles.sectionTitle}>Appearance</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLabelWrap}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={SUB_VIOLET} />
            <Text style={styles.rowLabel}>Dark mode</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: '#D1D5DB', true: SUB_VIOLET }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Language */}
      <Text style={styles.sectionTitle}>Language</Text>
      <View style={styles.card}>
        {LANGUAGES.map((lang, idx) => {
          const active = i18n.language === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[styles.row, idx < LANGUAGES.length - 1 && styles.rowDivider]}
              onPress={() => handleChangeLanguage(lang.code)}
              activeOpacity={0.7}
            >
              <Text style={[styles.rowLabel, { marginLeft: 0 }]}>{lang.label}</Text>
              {active && <Ionicons name="checkmark" size={20} color={SUB_VIOLET} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Account */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <View style={[styles.row, styles.rowDivider]}>
          <Text style={[styles.rowLabel, { marginLeft: 0 }]}>Email</Text>
          <Text style={styles.rowValue} numberOfLines={1}>{user?.email}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { marginLeft: 0 }]}>Plan</Text>
          <Text style={styles.rowValue}>
            {profile?.subscription_tier === 'free' ? 'Free' : (profile?.subscription_tier || 'Free')}
          </Text>
        </View>
      </View>

      {/* Log out */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={20} color="#DC2626" />
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>

      <Text style={styles.footnote}>Sylk Sub Portal · v1</Text>
    </ScrollView>
  );
}

function Field({ label, value, onChangeText, editing, placeholder, keyboardType, Colors, last }) {
  return (
    <View style={[
      { paddingVertical: 12 },
      !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
    ]}>
      <Text style={{ fontSize: 12, color: Colors.secondaryText, fontWeight: '600', marginBottom: 4 }}>
        {label}
      </Text>
      {editing ? (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.placeholder || '#9CA3AF'}
          keyboardType={keyboardType}
          style={{
            fontSize: 15, color: Colors.primaryText,
            paddingVertical: 6,
          }}
          autoCapitalize="words"
        />
      ) : (
        <Text style={{ fontSize: 15, color: Colors.primaryText, paddingVertical: 6 }}>
          {value || <Text style={{ color: Colors.secondaryText }}>—</Text>}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (Colors) => StyleSheet.create({
  scroll: { padding: 18, paddingBottom: 120 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 26, fontWeight: '700', color: Colors.primaryText, marginBottom: 18 },
  profileCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: SUB_VIOLET,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  profileName: { fontSize: 17, fontWeight: '700', color: Colors.primaryText },
  profileMeta: { fontSize: 13, color: Colors.secondaryText, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 8,
  },
  editLink: { fontSize: 14, fontWeight: '600', color: SUB_VIOLET },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    paddingHorizontal: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rowLabel: { fontSize: 15, color: Colors.primaryText, marginLeft: 0 },
  rowValue: { fontSize: 14, color: Colors.secondaryText, maxWidth: 200 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 22,
  },
  logoutText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },
  footnote: {
    textAlign: 'center',
    color: Colors.secondaryText,
    fontSize: 12,
    marginTop: 24,
  },
});
