import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

export default function PendingInvitesWidget({ pendingInvites, totalSupervisors, size, editMode, onPress }) {
  const rock = useSharedValue(0);

  useEffect(() => {
    if (pendingInvites > 0 && !editMode) {
      rock.value = withRepeat(
        withSequence(
          withTiming(-8, { duration: 300 }),
          withTiming(8, { duration: 300 }),
          withTiming(-4, { duration: 200 }),
          withTiming(0, { duration: 200 })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(rock);
      rock.value = 0;
    }
  }, [pendingInvites, editMode]);

  const rockStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rock.value}deg` }],
  }));

  if (pendingInvites === 0) {
    return (
      <TouchableOpacity
        style={size === 'medium' ? styles.containerMedium : styles.containerSmall}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#059669', '#10B981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={size === 'medium' ? styles.gradientMedium : styles.gradientSmall}
        >
          <Ionicons name="checkmark-circle" size={24} color="rgba(255,255,255,0.6)" />
          <Text style={styles.allAccepted}>All accepted</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (size === 'medium') {
    return (
      <TouchableOpacity
        style={styles.containerMedium}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#0369A1', '#0EA5E9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientMedium}
        >
          <Animated.View style={rockStyle}>
            <Ionicons name="mail-unread" size={24} color="#BAE6FD" />
          </Animated.View>
          <View style={styles.mediumContent}>
            <Text style={styles.valueMedium}>{pendingInvites}</Text>
            <Text style={styles.labelMedium}>PENDING INVITES</Text>
          </View>
          <Text style={styles.ofTotal}>of {totalSupervisors}</Text>
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
        colors={['#0369A1', '#0EA5E9']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientSmall}
      >
        <Animated.View style={[styles.envelopeWrap, rockStyle]}>
          <Ionicons name="mail-unread" size={22} color="#BAE6FD" />
        </Animated.View>
        <Text style={styles.valueSmall}>{pendingInvites}</Text>
        <Text style={styles.label}>INVITES</Text>
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
  gradientMedium: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  envelopeWrap: {
    marginBottom: 4,
  },
  valueSmall: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  valueMedium: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
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
  ofTotal: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  allAccepted: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
});
