/**
 * SubPortalScreen — Sub Free portal.
 *
 * Mobile-first 3-tab layout (Home / Documents / Work) for users with
 * profiles.role='sub' OR profiles.subscription_tier='free' AND a linked
 * sub_organizations row.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';

import SubHomeTab from './SubPortal/SubHomeTab';
import SubDocumentsTab from './SubPortal/SubDocumentsTab';
import SubWorkTab from './SubPortal/SubWorkTab';

const TABS = [
  { key: 'home',      label: 'Home',      icon: 'home-outline',     active: 'home' },
  { key: 'documents', label: 'Documents', icon: 'folder-outline',   active: 'folder' },
  { key: 'work',      label: 'Work',      icon: 'briefcase-outline', active: 'briefcase' },
];

export default function SubPortalScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const [active, setActive] = useState('home');

  const renderActive = useCallback(() => {
    if (active === 'home') return <SubHomeTab navigation={navigation} />;
    if (active === 'documents') return <SubDocumentsTab navigation={navigation} />;
    if (active === 'work') return <SubWorkTab navigation={navigation} />;
    return null;
  }, [active, navigation]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      <View style={styles.body}>{renderActive()}</View>
      <View style={[styles.tabBar, { borderTopColor: Colors.border, backgroundColor: Colors.cardBackground }]}>
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={styles.tabItem}
              onPress={() => setActive(t.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive ? t.active : t.icon}
                size={26}
                color={isActive ? Colors.primaryBlue : Colors.secondaryText}
              />
              <Text style={[
                styles.tabLabel,
                { color: isActive ? Colors.primaryBlue : Colors.secondaryText, fontWeight: isActive ? '700' : '500' },
              ]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    paddingBottom: 16,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 11, marginTop: 2 },
});
