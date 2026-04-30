/**
 * SubPortalScreen — Sub Free portal.
 *
 * 4-tab layout (Home / Documents / Work / Settings). Uses SubLumaBar for
 * floating-pill nav consistent with worker/owner portals.
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, DarkColors } from '../constants/theme';
import SubLumaBar from '../components/SubLumaBar';

import SubHomeTab from './SubPortal/SubHomeTab';
import SubDocumentsTab from './SubPortal/SubDocumentsTab';
import SubWorkTab from './SubPortal/SubWorkTab';
import SubSettingsTab from './SubPortal/SubSettingsTab';

export default function SubPortalScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = isDark ? DarkColors : LightColors;
  const [active, setActive] = useState('home');

  const renderActive = useCallback(() => {
    if (active === 'home')      return <SubHomeTab navigation={navigation} onNavigateTab={setActive} />;
    if (active === 'documents') return <SubDocumentsTab navigation={navigation} />;
    if (active === 'work')      return <SubWorkTab navigation={navigation} />;
    if (active === 'settings')  return <SubSettingsTab navigation={navigation} />;
    return null;
  }, [active, navigation]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: Colors.background }]}>
      <View style={styles.body}>{renderActive()}</View>
      <SubLumaBar active={active} onChange={setActive} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
});
