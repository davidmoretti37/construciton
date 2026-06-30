import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { fetchDashboard } from '../../services/clientPortalApi';
import { useClientProject } from '../../contexts/ClientProjectContext';

const C = {
  amber: '#F59E0B',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
};

export default function ClientMoreScreen({ navigation }) {
  const { t } = useTranslation('common');
  const { setProjects } = useClientProject();
  const [branding, setBranding] = useState(null);
  const [brandingLoading, setBrandingLoading] = useState(true);
  const [brandingFailed, setBrandingFailed] = useState(false);

  const loadBranding = useCallback(async () => {
    setBrandingLoading(true);
    setBrandingFailed(false);
    try {
      const data = await fetchDashboard();
      const projects = data?.projects || [];
      if (projects.length > 0) {
        setProjects(projects);
      }
      setBranding(data?.branding || null);
    } catch {
      setBrandingFailed(true);
    } finally {
      setBrandingLoading(false);
    }
  }, [setProjects]);

  useFocusEffect(useCallback(() => {
    loadBranding();
  }, [loadBranding]));

  const handleSignOut = () => {
    Alert.alert(t('clientMore.signOut.label'), t('clientMore.signOut.confirm'), [
      { text: t('common:buttons.cancel'), style: 'cancel' },
      { text: t('clientMore.signOut.label'), style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
        } catch {
          Alert.alert(t('clientMore.signOut.label'), t('clientMore.signOut.errorMessage'));
        }
      }},
    ]);
  };

  const handleContactInfo = () => {
    const name = branding?.business_name || t('clientMore.defaultContractor');
    const phone = branding?.phone || null;
    const email = branding?.email || null;

    if (phone || email) {
      const buttons = [];
      if (phone) buttons.push({ text: t('clientMore.contactInfo.callLabel', { phone }), onPress: () => Linking.openURL(`tel:${phone}`) });
      if (email) buttons.push({ text: t('clientMore.contactInfo.emailLabel', { email }), onPress: () => Linking.openURL(`mailto:${email}`) });
      buttons.push({ text: t('common:buttons.close'), style: 'cancel' });
      Alert.alert(name, t('clientMore.contactInfo.howToGetInTouch'), buttons);
      return;
    }

    if (brandingLoading) {
      Alert.alert(t('clientMore.contactInfo.title'), t('clientMore.contactInfo.loadingMessage'));
      return;
    }

    if (brandingFailed) {
      Alert.alert(t('clientMore.contactInfo.title'), t('clientMore.contactInfo.failedMessage'), [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        { text: t('common:buttons.retry'), onPress: () => loadBranding() },
      ]);
      return;
    }

    Alert.alert(name, t('clientMore.contactInfo.unavailableMessage'));
  };

  const handlePress = (item) => {
    if (item.action) {
      item.action();
      return;
    }
    if (item.screen) {
      navigation.getParent()?.navigate(item.screen, item.params || {});
    }
  };

  const MENU_SECTIONS = [
    {
      label: t('clientMore.sections.yourProject'),
      items: [
        { key: 'Documents', label: t('clientMore.items.documents'), icon: 'document-text', iconBg: '#EFF6FF', iconColor: '#3B82F6', screen: 'ClientDocuments' },
        { key: 'Selections', label: t('clientMore.items.selections'), icon: 'color-palette', iconBg: '#FDF2F8', iconColor: '#EC4899', screen: 'ClientSelections' },
        { key: 'Photos', label: t('clientMore.items.photos'), icon: 'images', iconBg: '#F5F3FF', iconColor: '#8B5CF6', screen: 'ClientPhotos' },
        { key: 'AI Summaries', label: t('clientMore.items.aiSummaries'), icon: 'sparkles', iconBg: '#FFFBEB', iconColor: '#F59E0B', screen: 'ClientAISummaries' },
      ],
    },
    {
      label: t('clientMore.sections.account'),
      items: [
        { key: 'Contact Info', label: t('clientMore.items.contactInfo'), icon: 'call', iconBg: '#F0FDF4', iconColor: '#10B981', action: handleContactInfo },
        { key: 'Settings', label: t('clientMore.items.settings'), icon: 'settings', iconBg: '#F9FAFB', iconColor: '#6B7280', screen: 'Settings' },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('clientMore.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {MENU_SECTIONS.map((section) => (
          <View key={section.label}>
            <Text style={styles.sectionLabel}>{section.label}</Text>
            <View style={styles.group}>
              {section.items.map((item, i) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.row,
                    i === 0 && styles.rowFirst,
                    i === section.items.length - 1 && styles.rowLast,
                    i < section.items.length - 1 && styles.rowDivider,
                  ]}
                  onPress={() => handlePress(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, { backgroundColor: item.iconBg }]}>
                    <Ionicons name={item.icon} size={18} color={item.iconColor} />
                  </View>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <Text style={styles.signOutText}>{t('clientMore.signOut.label')}</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: C.text },
  scrollContent: { paddingHorizontal: 16 },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: C.textMuted,
    marginTop: 24, marginBottom: 12, paddingLeft: 4,
  },
  group: { backgroundColor: C.surface, borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 16 },
  rowFirst: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  rowLast: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  iconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text, marginLeft: 12 },
  signOutBtn: {
    marginTop: 32, alignItems: 'center', paddingVertical: 14,
    backgroundColor: C.surface, borderRadius: 10,
  },
  signOutText: { fontSize: 15, fontWeight: '500', color: '#EF4444' },
});
