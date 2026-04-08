import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { fetchDashboard } from '../../services/clientPortalApi';

const C = {
  amber: '#F59E0B',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
};

export default function ClientMoreScreen({ navigation }) {
  const [projectId, setProjectId] = useState(null);
  const [branding, setBranding] = useState(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const data = await fetchDashboard();
        const projects = data?.projects || [];
        if (projects.length > 0) setProjectId(projects[0].id);
        setBranding(data?.branding || null);
      } catch {}
    })();
  }, []));

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
      }},
    ]);
  };

  const handleContactInfo = () => {
    const name = branding?.business_name || 'Your Contractor';
    const phone = branding?.phone || null;
    const email = branding?.email || null;

    const buttons = [];
    if (phone) buttons.push({ text: `Call ${phone}`, onPress: () => Linking.openURL(`tel:${phone}`) });
    if (email) buttons.push({ text: `Email ${email}`, onPress: () => Linking.openURL(`mailto:${email}`) });
    buttons.push({ text: 'Close', style: 'cancel' });

    if (!phone && !email) {
      Alert.alert(name, 'Contact information not available. Use the Messages tab to reach your contractor.');
    } else {
      Alert.alert(name, 'How would you like to get in touch?', buttons);
    }
  };

  const handlePress = (item) => {
    if (item.action) {
      item.action();
      return;
    }
    if (item.screen && item.needsProjectId) {
      if (projectId) {
        navigation.getParent()?.navigate(item.screen, { projectId, ...(item.params || {}) });
      }
      return;
    }
    if (item.screen) {
      navigation.getParent()?.navigate(item.screen, item.params || {});
    }
  };

  const MENU_SECTIONS = [
    {
      label: 'YOUR PROJECT',
      items: [
        { key: 'Documents', icon: 'document-text', iconBg: '#EFF6FF', iconColor: '#3B82F6', screen: 'ClientDocuments' },
        { key: 'Selections', icon: 'color-palette', iconBg: '#FDF2F8', iconColor: '#EC4899', screen: 'ClientSelections' },
        { key: 'Photos', icon: 'images', iconBg: '#F5F3FF', iconColor: '#8B5CF6', screen: 'ClientProjectDetail', needsProjectId: true, params: { scrollToPhotos: true } },
        { key: 'AI Summaries', icon: 'sparkles', iconBg: '#FFFBEB', iconColor: '#F59E0B', screen: 'ClientProjectDetail', needsProjectId: true, params: { scrollToSummaries: true } },
      ],
    },
    {
      label: 'ACCOUNT',
      items: [
        { key: 'Contact Info', icon: 'call', iconBg: '#F0FDF4', iconColor: '#10B981', action: handleContactInfo },
        { key: 'Settings', icon: 'settings', iconBg: '#F9FAFB', iconColor: '#6B7280', screen: 'Settings' },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
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
                  <Text style={styles.rowLabel}>{item.key}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <Text style={styles.signOutText}>Sign Out</Text>
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
