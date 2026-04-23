import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export default function WorkersWidget({ totalWorkers, totalSupervisors, totalProjects, size, editMode, onPress }) {
  if (size === 'medium') {
    return (
      <TouchableOpacity
        style={styles.containerMedium}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#EA580C', '#F97316']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientMedium}
        >
          <Text style={styles.valueMedium}>{totalWorkers}</Text>
          <View style={styles.mediumDetails}>
            <Text style={styles.labelMedium}>WORKERS</Text>
            <View style={styles.barsRow}>
              <View style={styles.barItem}>
                <View style={[styles.miniBar, { backgroundColor: '#FED7AA', flex: totalSupervisors || 1 }]} />
                <Text style={styles.barText}>{totalSupervisors} sups</Text>
              </View>
              <View style={styles.barItem}>
                <View style={[styles.miniBar, { backgroundColor: 'rgba(255,255,255,0.3)', flex: totalProjects || 1 }]} />
                <Text style={styles.barText}>{totalProjects} proj</Text>
              </View>
            </View>
          </View>
          <Ionicons name="people" size={24} color="rgba(255,255,255,0.12)" />
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.containerSmall}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.85}
      disabled={editMode}
    >
      <LinearGradient
        colors={['#EA580C', '#F97316']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientSmall}
      >
        <Text style={styles.titleSmall}>Workers</Text>
        <Ionicons name="people" size={16} color="rgba(255,255,255,0.35)" style={styles.bgIcon} />
        <Text style={styles.valueSmall}>{totalWorkers}</Text>
        <View style={styles.smallBars}>
          <View style={[styles.tinyBar, { backgroundColor: '#FED7AA', width: '60%' }]} />
          <View style={[styles.tinyBar, { backgroundColor: 'rgba(255,255,255,0.3)', width: '40%' }]} />
        </View>
        <Text style={styles.label}>{totalWorkers === 1 ? 'on the team' : 'on the team'}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  containerSmall: {
    width: '100%',
    height: 130,
    borderRadius: 16,
    overflow: 'hidden',
  },
  containerMedium: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradientSmall: {
    flex: 1,
    padding: 14,
    justifyContent: 'flex-end',
  },
  titleSmall: {
    position: 'absolute',
    top: 12,
    left: 14,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  gradientMedium: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bgIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  valueSmall: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  valueMedium: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  smallBars: {
    gap: 3,
    marginTop: 6,
  },
  tinyBar: {
    height: 3,
    borderRadius: 2,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  mediumDetails: {
    flex: 1,
  },
  labelMedium: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  barsRow: {
    marginTop: 6,
    gap: 3,
  },
  barItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniBar: {
    height: 3,
    borderRadius: 2,
    maxWidth: 50,
  },
  barText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
});
