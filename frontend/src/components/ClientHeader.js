// ClientHeader — gradient header with notification bell + settings.
// Drop in at the top of every client tab screen so the bell is always reachable.
//
// Usage:
//   <ClientHeader title="Money" subtitle="John Smith Bath Remodel" navigation={navigation} />

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../contexts/NotificationContext';

const C = {
  amber: '#F59E0B',
  amberDark: '#D97706',
  red: '#EF4444',
};

export default function ClientHeader({ title, subtitle, navigation, gradient = true }) {
  const { unreadCount } = useNotifications?.() || { unreadCount: 0 };
  const Body = (
    <SafeAreaView edges={['top']} style={styles.inner}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => navigation?.getParent?.()?.navigate?.('Notifications') || navigation?.navigate?.('Notifications')}
            style={styles.btn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="notifications-outline" size={20} color="#fff" />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? '9+' : String(unreadCount)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation?.getParent?.()?.navigate?.('Settings') || navigation?.navigate?.('Settings')}
            style={styles.btn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );

  if (!gradient) {
    return <View style={styles.solid}>{Body}</View>;
  }
  return (
    <LinearGradient
      colors={[C.amber, C.amberDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      {Body}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { paddingBottom: 18 },
  solid: { backgroundColor: C.amber, paddingBottom: 18 },
  inner: { paddingHorizontal: 20, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: C.red, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
