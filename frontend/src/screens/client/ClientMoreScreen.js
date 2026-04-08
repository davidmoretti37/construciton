import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const C = {
  amber: '#F59E0B',
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  surface: '#FFFFFF', bg: '#F9FAFB', border: '#E5E7EB',
};

const MENU_SECTIONS = [
  {
    label: 'YOUR PROJECT',
    items: [
      { key: 'Documents', icon: 'document-text', iconBg: '#EFF6FF', iconColor: '#3B82F6', screen: 'ClientDocuments' },
      { key: 'Selections', icon: 'color-palette', iconBg: '#FDF2F8', iconColor: '#EC4899', screen: 'ClientSelections' },
      { key: 'Photos', icon: 'images', iconBg: '#F5F3FF', iconColor: '#8B5CF6', screen: 'ClientProjectDetail', params: { scrollToPhotos: true } },
      { key: 'AI Summaries', icon: 'sparkles', iconBg: '#FFFBEB', iconColor: '#F59E0B', screen: 'ClientProjectDetail', params: { scrollToSummaries: true } },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { key: 'Contact Info', icon: 'call', iconBg: '#F0FDF4', iconColor: '#10B981', screen: 'ContactInfo' },
      { key: 'Settings', icon: 'settings', iconBg: '#F9FAFB', iconColor: '#6B7280', screen: 'Settings' },
    ],
  },
];

export default function ClientMoreScreen({ navigation }) {
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
      }},
    ]);
  };

  const handlePress = (item) => {
    if (item.screen) {
      navigation.getParent()?.navigate(item.screen, item.params || {});
    }
  };

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
  group: {
    backgroundColor: C.surface, borderRadius: 10, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 16,
  },
  rowFirst: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  rowLast: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  iconBox: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text, marginLeft: 12 },
  signOutBtn: {
    marginTop: 32, alignItems: 'center', paddingVertical: 14,
    backgroundColor: C.surface, borderRadius: 10,
  },
  signOutText: { fontSize: 15, fontWeight: '500', color: '#EF4444' },
});
