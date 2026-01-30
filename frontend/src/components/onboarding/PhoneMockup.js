/**
 * PhoneMockup
 * Reusable 3D phone frame (no animation)
 */

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { ONBOARDING_SHADOWS } from '../../screens/onboarding/slides/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PhoneMockup({
  children,
  tilt = 0,
  style,
}) {
  return (
    <View style={[styles.container, { transform: [{ perspective: 1000 }, { rotateY: `${tilt}deg` }] }, style]}>
      {/* Phone frame - disable rasterization for high quality during animations */}
      <View
        style={styles.phone}
        shouldRasterizeIOS={false}
        renderToHardwareTextureAndroid={false}
      >
        {/* Notch */}
        <View style={styles.notch} />
        {/* Screen content */}
        <View style={styles.screen}>
          {children}
        </View>
        {/* Home indicator */}
        <View style={styles.homeIndicator} />
      </View>
    </View>
  );
}

const PHONE_WIDTH = SCREEN_WIDTH * 0.7;
const PHONE_HEIGHT = PHONE_WIDTH * 2;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  phone: {
    width: PHONE_WIDTH,
    height: PHONE_HEIGHT,
    backgroundColor: '#1A1A2E',
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#2A2A4A',
    overflow: 'hidden',
    ...ONBOARDING_SHADOWS.phoneMockup,
  },
  notch: {
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -40,
    width: 80,
    height: 24,
    backgroundColor: '#0A0A1A',
    borderRadius: 12,
    zIndex: 10,
  },
  screen: {
    flex: 1,
    marginTop: 40,
    marginBottom: 20,
    marginHorizontal: 4,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    overflow: 'hidden',
  },
  homeIndicator: {
    position: 'absolute',
    bottom: 8,
    left: '50%',
    marginLeft: -40,
    width: 80,
    height: 4,
    backgroundColor: '#4A4A6A',
    borderRadius: 2,
  },
});
