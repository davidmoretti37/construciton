import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function StatWidget({ value, label, icon, accentColor, size, editMode, onPress, breakdowns }) {
  if (size === 'medium') {
    return (
      <TouchableOpacity
        style={styles.containerMedium}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.7}
        disabled={editMode}
      >
        <View style={[styles.iconCircle, { backgroundColor: accentColor + '1A' }]}>
          <Ionicons name={icon} size={16} color={accentColor} />
        </View>
        <View style={styles.mediumMain}>
          <View style={styles.mediumTopRow}>
            <Text style={styles.valueMedium}>{value}</Text>
            <Text style={styles.labelMedium}>{label}</Text>
          </View>
          {breakdowns && breakdowns.length > 0 && (
            <View style={styles.breakdownRow}>
              {breakdowns.map((b, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <Text style={styles.breakdownSep}>·</Text>}
                  <View style={[styles.breakdownDot, { backgroundColor: b.color }]} />
                  <Text style={styles.breakdownText} numberOfLines={1}>{b.text}</Text>
                </React.Fragment>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.containerSmall}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.7}
      disabled={editMode}
    >
      <View style={[styles.iconCircle, { backgroundColor: accentColor + '1A' }]}>
        <Ionicons name={icon} size={16} color={accentColor} />
      </View>
      <Text style={styles.valueSmall} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  containerSmall: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    height: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  containerMedium: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueSmall: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginTop: 8,
  },
  valueMedium: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  mediumMain: {
    marginLeft: 12,
    flex: 1,
  },
  mediumTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  labelMedium: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 4,
  },
  breakdownDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  breakdownText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  breakdownSep: {
    fontSize: 12,
    color: '#CBD5E1',
    marginHorizontal: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
});
