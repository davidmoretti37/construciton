import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

function ShieldIcon({ size = 40, color = 'rgba(255,255,255,0.15)' }) {
  const w = size;
  const h = size * 1.15;
  // Shield path
  const d = `M ${w / 2} 0 L ${w} ${h * 0.3} L ${w} ${h * 0.65} C ${w} ${h * 0.85} ${w * 0.75} ${h} ${w / 2} ${h} C ${w * 0.25} ${h} 0 ${h * 0.85} 0 ${h * 0.65} L 0 ${h * 0.3} Z`;
  return (
    <Svg width={w} height={h}>
      <Path d={d} fill={color} />
    </Svg>
  );
}

export default function SupervisorsWidget({ totalSupervisors, totalWorkers, totalProjects, size, editMode, onPress }) {
  if (size === 'medium') {
    return (
      <TouchableOpacity
        style={styles.containerMedium}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#7C3AED', '#8B5CF6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientMedium}
        >
          <View style={styles.shieldWrap}>
            <ShieldIcon size={30} color="rgba(255,255,255,0.15)" />
            <Text style={styles.shieldCount}>{totalSupervisors}</Text>
          </View>
          <View style={styles.mediumContent}>
            <Text style={styles.labelMedium}>SUPERVISORS</Text>
            <Text style={styles.breakdown}>{totalWorkers} workers · {totalProjects} projects</Text>
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
        colors={['#7C3AED', '#8B5CF6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientSmall}
      >
        <Text style={styles.titleSmall}>Supervisors</Text>
        <View style={styles.shieldWrapSmall}>
          <ShieldIcon size={44} color="rgba(255,255,255,0.12)" />
          <Text style={styles.shieldCountSmall}>{totalSupervisors}</Text>
        </View>
        <Text style={styles.label}>{totalSupervisors === 1 ? 'on the team' : 'on the team'}</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 14,
  },
  shieldWrap: {
    width: 40,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldWrapSmall: {
    width: 50,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldCount: {
    position: 'absolute',
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  shieldCountSmall: {
    position: 'absolute',
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
    marginTop: 4,
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
