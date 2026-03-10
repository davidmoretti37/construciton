import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import CircularProgress from './svg/CircularProgress';

export default function ActiveProjectsWidget({ activeProjects, totalProjects, size, editMode, onPress }) {
  const progress = totalProjects > 0 ? activeProjects / totalProjects : 0;

  if (size === 'medium') {
    return (
      <TouchableOpacity
        style={styles.containerMedium}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#1E40AF', '#3B82F6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientMedium}
        >
          <CircularProgress
            progress={progress}
            size={50}
            strokeWidth={5}
            color="#93C5FD"
            trackColor="rgba(255,255,255,0.15)"
          >
            <Text style={styles.ringValue}>{activeProjects}</Text>
          </CircularProgress>
          <View style={styles.mediumContent}>
            <Text style={styles.labelMedium}>ACTIVE PROJECTS</Text>
            <Text style={styles.breakdown}>{activeProjects} active · {totalProjects} total</Text>
          </View>
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
        colors={['#1E40AF', '#3B82F6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientSmall}
      >
        <CircularProgress
          progress={progress}
          size={56}
          strokeWidth={5}
          color="#93C5FD"
          trackColor="rgba(255,255,255,0.15)"
        >
          <Text style={styles.ringValueSmall}>{activeProjects}</Text>
        </CircularProgress>
        <Text style={styles.subtext}>{activeProjects} of {totalProjects}</Text>
        <Text style={styles.label}>PROJECTS</Text>
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
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientMedium: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  ringValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ringValueSmall: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtext: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    marginTop: 4,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  mediumContent: {
    flex: 1,
  },
  labelMedium: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  breakdown: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
});
