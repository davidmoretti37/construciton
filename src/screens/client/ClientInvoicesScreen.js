import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function ClientInvoicesScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Ionicons name="document-text-outline" size={80} color="#7C3AED" />
        <Text style={[styles.title, { color: Colors.primaryText }]}>Invoices</Text>
        <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
          Invoices coming soon
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
  },
  settingsButton: {
    padding: Spacing.sm,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: FontSizes.xlarge,
    fontWeight: '700',
    marginTop: Spacing.lg,
  },
  subtitle: {
    fontSize: FontSizes.body,
    marginTop: Spacing.sm,
  },
});
