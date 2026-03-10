import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function AlertsWidget({ alerts, size, editMode, onNavigate }) {
  if (alerts.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.allClear}>✓ All clear</Text>
      </View>
    );
  }

  const first = alerts[0];
  const moreCount = alerts.length - 1;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => !editMode && first.onPress && first.onPress()}
      activeOpacity={editMode ? 1 : 0.7}
    >
      <View style={styles.accentBar} />
      <Ionicons name="warning-outline" size={18} color="#F59E0B" style={styles.icon} />
      <Text style={styles.text} numberOfLines={1}>{first.text}</Text>
      {moreCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>+{moreCount}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color="#D97706" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    overflow: 'hidden',
  },
  allClear: {
    fontSize: 13,
    color: '#10B981',
    textAlign: 'center',
    flex: 1,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#F59E0B',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  icon: {
    marginLeft: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
    marginLeft: 8,
  },
  badge: {
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
