/**
 * EstimatesSlide
 * Screen 2: AI Estimates with phone mockup showing real estimate UI
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { PhoneMockup, FeatureBullet, CountUpNumber } from '../../../components/onboarding';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Mock estimate data
const ESTIMATE_ITEMS = [
  { name: 'Kitchen Cabinets', price: 4200 },
  { name: 'Countertops', price: 2800 },
  { name: 'Flooring', price: 1500 },
];

const EstimateLineItem = ({ name, price, delay, isActive }) => {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(20);

  useEffect(() => {
    if (isActive) {
      opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
      translateX.value = withDelay(delay, withSpring(0, { damping: 15 }));
    }
  }, [isActive, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[estimateStyles.lineItem, style]}>
      <Text style={estimateStyles.itemName}>{name}</Text>
      <Text style={estimateStyles.itemPrice}>${price.toLocaleString()}</Text>
    </Animated.View>
  );
};

const EstimateMockup = ({ isActive }) => {
  const headerOpacity = useSharedValue(0);
  const totalOpacity = useSharedValue(0);
  const checkOpacity = useSharedValue(0);
  const [showTotal, setShowTotal] = useState(false);

  useEffect(() => {
    if (isActive) {
      headerOpacity.value = withDelay(600, withTiming(1, { duration: 300 }));

      // Show total after items fade in
      const timer = setTimeout(() => setShowTotal(true), 1800);
      totalOpacity.value = withDelay(1800, withTiming(1, { duration: 300 }));
      checkOpacity.value = withDelay(2800, withSpring(1, { damping: 10 }));

      return () => clearTimeout(timer);
    }
  }, [isActive]);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const totalStyle = useAnimatedStyle(() => ({
    opacity: totalOpacity.value,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: [{ scale: checkOpacity.value }],
  }));

  const total = ESTIMATE_ITEMS.reduce((sum, item) => sum + item.price, 0);

  return (
    <View style={estimateStyles.container}>
      {/* Header */}
      <Animated.View style={[estimateStyles.header, headerStyle]}>
        <View style={estimateStyles.badge}>
          <Text style={estimateStyles.badgeText}>ESTIMATE</Text>
        </View>
        <Text style={estimateStyles.estimateNumber}>#EST-2024-001</Text>
        <Text style={estimateStyles.projectName}>Kitchen Remodel</Text>
        <Text style={estimateStyles.clientName}>Client: Johnson</Text>
      </Animated.View>

      {/* Divider */}
      <View style={estimateStyles.divider} />

      {/* Line items */}
      <View style={estimateStyles.itemsContainer}>
        {ESTIMATE_ITEMS.map((item, index) => (
          <EstimateLineItem
            key={item.name}
            name={item.name}
            price={item.price}
            delay={1000 + index * 200}
            isActive={isActive}
          />
        ))}
      </View>

      {/* Divider */}
      <View style={estimateStyles.divider} />

      {/* Total */}
      <Animated.View style={[estimateStyles.totalRow, totalStyle]}>
        <Text style={estimateStyles.totalLabel}>TOTAL</Text>
        <View style={estimateStyles.totalValue}>
          {showTotal ? (
            <CountUpNumber
              value={total}
              prefix="$"
              duration={1000}
              delay={0}
              style={estimateStyles.totalPrice}
            />
          ) : (
            <Text style={estimateStyles.totalPrice}>$0</Text>
          )}
          <Animated.View style={checkStyle}>
            <Ionicons name="checkmark-circle" size={20} color="#34D399" />
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
};

export default function EstimatesSlide({ isActive }) {
  return (
    <View style={styles.container}>
      {/* Title */}
      <Text style={styles.title}>Create Estimates in</Text>
      <Text style={styles.titleAccent}>60 Seconds</Text>

      {/* Phone mockup */}
      <PhoneMockup
        tilt={8}
        slideInFrom="right"
        delay={200}
        isActive={isActive}
        style={styles.phone}
      >
        <EstimateMockup isActive={isActive} />
      </PhoneMockup>

      {/* Feature bullets */}
      <View style={styles.features}>
        <FeatureBullet
          icon="camera"
          title="Snap a photo of any job"
          description="AI calculates everything automatically"
          delay={2000}
          isActive={isActive}
          iconColor="#60A5FA"
        />
        <FeatureBullet
          icon="cash"
          title="Accurate pricing"
          description="Based on real-time market data"
          delay={2200}
          isActive={isActive}
          iconColor="#34D399"
        />
        <FeatureBullet
          icon="send"
          title="Send professional PDFs"
          description="Win more jobs with polished estimates"
          delay={2400}
          isActive={isActive}
          iconColor="#A78BFA"
        />
      </View>

      {/* Quote */}
      <Text style={styles.quote}>
        "No more guessing. No more spreadsheets."
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  titleAccent: {
    fontSize: 32,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 16,
  },
  phone: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  features: {
    marginBottom: 16,
  },
  quote: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});

const estimateStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
  },
  header: {
    marginBottom: 12,
  },
  badge: {
    backgroundColor: '#3B82F6',
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
  estimateNumber: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  clientName: {
    fontSize: 12,
    color: '#94A3B8',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 10,
  },
  itemsContainer: {
    gap: 8,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 13,
    color: '#CBD5E1',
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },
  totalValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: '#34D399',
  },
});
