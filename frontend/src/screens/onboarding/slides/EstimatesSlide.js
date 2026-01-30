/**
 * EstimatesSlide
 * Screen 2: AI Estimates with phone mockup
 * Phone swoops in, content types out sequentially inside
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { PhoneMockup, FeatureBullet, CountUpNumber, TypewriterText } from '../../../components/onboarding';
import {
  ONBOARDING_COLORS,
  ONBOARDING_TYPOGRAPHY,
  ONBOARDING_SPACING,
} from './constants';
import { useBounceAnimation, usePhoneAnimation, useEntranceAnimation } from './useEntranceAnimation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Mock estimate data
const ESTIMATE_ITEMS = [
  { name: 'Kitchen Cabinets', price: 4200 },
  { name: 'Countertops', price: 2800 },
  { name: 'Flooring', price: 1500 },
  { name: 'Labor', price: 3200 },
  { name: 'Permits', price: 800 },
];

// Animated line item that pops in
// NO SCALE - prevents iOS rasterization blur
const AnimatedLineItem = ({ name, price, delay, isActive }) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (isActive) {
      opacity.value = withDelay(delay, withSpring(1, { damping: 15 }));
      translateY.value = withDelay(delay, withSpring(0, { damping: 12, stiffness: 100 }));
    } else {
      opacity.value = 0;
      translateY.value = 20;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[estimateStyles.lineItem, animatedStyle]}>
      <Text style={estimateStyles.itemName}>{name}</Text>
      <Text style={estimateStyles.itemPrice}>${price.toLocaleString()}</Text>
    </Animated.View>
  );
};

// Animated badge that pops in
// NO SCALE - prevents iOS rasterization blur
const AnimatedBadge = ({ delay, isActive }) => {
  const translateY = useSharedValue(15);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      translateY.value = withDelay(delay, withSpring(0, { damping: 8, stiffness: 150 }));
      opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
    } else {
      translateY.value = 15;
      opacity.value = 0;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[estimateStyles.badge, animatedStyle]}>
      <Text style={estimateStyles.badgeText}>ESTIMATE</Text>
    </Animated.View>
  );
};

const EstimateMockup = ({ isActive }) => {
  const total = ESTIMATE_ITEMS.reduce((sum, item) => sum + item.price, 0);
  const [showTotal, setShowTotal] = useState(false);

  useEffect(() => {
    if (isActive) {
      // Show total after line items animate in
      const timer = setTimeout(() => setShowTotal(true), 1800);
      return () => clearTimeout(timer);
    } else {
      setShowTotal(false);
    }
  }, [isActive]);

  return (
    <View style={estimateStyles.container}>
      {/* Header with sequential reveals */}
      <View style={estimateStyles.header}>
        <AnimatedBadge delay={300} isActive={isActive} />

        <View style={estimateStyles.typewriterRow}>
          <TypewriterText
            text="#EST-2024-001"
            style={estimateStyles.estimateNumber}
            speed={40}
            delay={500}
            isActive={isActive}
          />
        </View>

        <TypewriterText
          text="Kitchen Remodel"
          style={estimateStyles.projectName}
          speed={50}
          delay={800}
          isActive={isActive}
        />

        <TypewriterText
          text="Client: Johnson"
          style={estimateStyles.clientName}
          speed={40}
          delay={1100}
          isActive={isActive}
        />
      </View>

      {/* Divider */}
      <View style={estimateStyles.divider} />

      {/* Line items pop in one by one */}
      <View style={estimateStyles.itemsContainer}>
        {ESTIMATE_ITEMS.map((item, index) => (
          <AnimatedLineItem
            key={item.name}
            name={item.name}
            price={item.price}
            delay={1300 + index * 200}
            isActive={isActive}
          />
        ))}
      </View>

      {/* Divider */}
      <View style={estimateStyles.divider} />

      {/* Total with count up */}
      <View style={estimateStyles.totalRow}>
        <Text style={estimateStyles.totalLabel}>TOTAL</Text>
        <View style={estimateStyles.totalValue}>
          <CountUpNumber
            value={total}
            prefix="$"
            style={estimateStyles.totalPrice}
            duration={1200}
            delay={100}
            isActive={showTotal}
          />
          {showTotal && (
            <Ionicons name="checkmark-circle" size={20} color="#34D399" />
          )}
        </View>
      </View>
    </View>
  );
};

export default function EstimatesSlide({ isActive = true }) {
  const [phoneReady, setPhoneReady] = useState(false);

  // Staggered entrance animations
  const titleAnim = useBounceAnimation(isActive, 0);
  const phoneAnim = usePhoneAnimation(isActive, 200);
  const feature1Anim = useEntranceAnimation(isActive, 2200);
  const feature2Anim = useEntranceAnimation(isActive, 2350);
  const feature3Anim = useEntranceAnimation(isActive, 2500);
  const quoteAnim = useEntranceAnimation(isActive, 2700);

  // Start phone content animation after phone entrance
  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => setPhoneReady(true), 400);
      return () => clearTimeout(timer);
    } else {
      setPhoneReady(false);
    }
  }, [isActive]);

  return (
    <View style={styles.container}>
      {/* Title */}
      <Animated.View style={titleAnim}>
        <Text style={styles.title}>Create Estimates in</Text>
        <Text style={styles.titleAccent}>60 Seconds</Text>
      </Animated.View>

      {/* Phone mockup with animated content */}
      <Animated.View style={[styles.phone, phoneAnim]}>
        <PhoneMockup tilt={0}>
          <EstimateMockup isActive={phoneReady} />
        </PhoneMockup>
      </Animated.View>

      {/* Feature bullets */}
      <View style={styles.features}>
        <Animated.View style={feature1Anim}>
          <FeatureBullet
            icon="camera"
            title="Snap a photo of any job"
            description="AI calculates everything automatically"
            iconColor="#60A5FA"
          />
        </Animated.View>
        <Animated.View style={feature2Anim}>
          <FeatureBullet
            icon="cash"
            title="Accurate pricing"
            description="Based on real-time market data"
            iconColor="#34D399"
          />
        </Animated.View>
        <Animated.View style={feature3Anim}>
          <FeatureBullet
            icon="send"
            title="Send professional PDFs"
            description="Win more jobs with polished estimates"
            iconColor="#A78BFA"
          />
        </Animated.View>
      </View>

      {/* Quote */}
      <Animated.View style={quoteAnim}>
        <Text style={styles.quote}>
          "No more guessing. No more spreadsheets."
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: ONBOARDING_SPACING.screenPaddingHorizontal,
    paddingTop: ONBOARDING_SPACING.screenPaddingTop,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: ONBOARDING_COLORS.textSecondary,
    textAlign: 'center',
  },
  titleAccent: {
    fontSize: 32,
    fontWeight: '800',
    color: ONBOARDING_COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  phone: {
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  features: {
    marginBottom: 16,
  },
  quote: {
    ...ONBOARDING_TYPOGRAPHY.caption,
  },
});

const estimateStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 12,
  },
  badge: {
    backgroundColor: ONBOARDING_COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  typewriterRow: {
    minHeight: 16,
    marginBottom: 4,
  },
  estimateNumber: {
    fontSize: 11,
    color: ONBOARDING_COLORS.textTertiary,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '700',
    color: ONBOARDING_COLORS.textPrimary,
    marginBottom: 2,
  },
  clientName: {
    fontSize: 12,
    color: ONBOARDING_COLORS.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: ONBOARDING_COLORS.border,
    marginVertical: 10,
  },
  itemsContainer: {
    gap: 10,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 13,
    color: ONBOARDING_COLORS.textMuted,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: ONBOARDING_COLORS.textPrimary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: ONBOARDING_COLORS.textSecondary,
  },
  totalValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: ONBOARDING_COLORS.success,
  },
});
