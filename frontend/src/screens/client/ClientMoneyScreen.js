import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const C = {
  text: '#111827', textSec: '#6B7280', textMuted: '#9CA3AF',
  bg: '#F9FAFB', border: '#E5E7EB',
};

export default function ClientMoneyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Money</Text>
      </View>
      <View style={styles.placeholder}>
        <Ionicons name="card-outline" size={48} color={C.border} />
        <Text style={styles.placeholderTitle}>Money</Text>
        <Text style={styles.placeholderSub}>Invoices, budget and payments</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: C.text },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -60 },
  placeholderTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginTop: 12 },
  placeholderSub: { fontSize: 14, color: C.textMuted, marginTop: 4 },
});
