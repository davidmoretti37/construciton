/**
 * FinancialsSlide
 * Screen 4: Financial Tracking with animated bar chart
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { AnimatedBarChart, CountUpNumber, FeatureBullet } from '../../../components/onboarding';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Financial data
const CHART_DATA = [
  { label: 'Jan', value: 8500, color: '#3B82F6' },
  { label: 'Feb', value: 12300, color: '#3B82F6' },
  { label: 'Mar', value: 9800, color: '#3B82F6' },
  { label: 'Apr', value: 15200, color: '#3B82F6' },
  { label: 'May', value: 11400, color: '#3B82F6' },
];

const FINANCIALS = {
  revenue: 45200,
  expenses: 28300,
  profit: 16900,
};

export default function FinancialsSlide({ isActive }) {
  const [showNumbers, setShowNumbers] = useState(false);
  const containerOpacity = useSharedValue(0);
  const profitGlow = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      containerOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));

      // Show numbers after chart animates
      const timer = setTimeout(() => setShowNumbers(true), 1200);

      // Profit pulse animation
      profitGlow.value = withDelay(
        2500,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 600 }),
            withTiming(0.4, { duration: 600 })
          ),
          3
        )
      );

      return () => clearTimeout(timer);
    }
  }, [isActive]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const profitStyle = useAnimatedStyle(() => ({
    opacity: profitGlow.value || 1,
  }));

  return (
    <View style={styles.container}>
      {/* Title */}
      <Text style={styles.title}>Know Your Numbers.</Text>
      <Text style={styles.titleAccent}>Grow Your Business.</Text>

      {/* Financial card */}
      <Animated.View style={[styles.financialCard, containerStyle]}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <Ionicons name="stats-chart" size={18} color="#60A5FA" />
            <Text style={styles.headerText}>FINANCIALS</Text>
          </View>
          <Text style={styles.period}>November 2024</Text>
        </View>

        {/* Chart */}
        <AnimatedBarChart
          data={CHART_DATA}
          delay={400}
          isActive={isActive}
        />

        {/* Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Revenue</Text>
            {showNumbers ? (
              <CountUpNumber
                value={FINANCIALS.revenue}
                prefix="$"
                duration={1000}
                delay={0}
                style={styles.revenueValue}
              />
            ) : (
              <Text style={styles.revenueValue}>$0</Text>
            )}
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Expenses</Text>
            {showNumbers ? (
              <CountUpNumber
                value={FINANCIALS.expenses}
                prefix="$"
                duration={1000}
                delay={300}
                style={styles.expenseValue}
              />
            ) : (
              <Text style={styles.expenseValue}>$0</Text>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.profitLabel}>PROFIT</Text>
            <View style={styles.profitRow}>
              {showNumbers ? (
                <CountUpNumber
                  value={FINANCIALS.profit}
                  prefix="$"
                  duration={1000}
                  delay={600}
                  style={styles.profitValue}
                />
              ) : (
                <Text style={styles.profitValue}>$0</Text>
              )}
              <Animated.View style={profitStyle}>
                <Ionicons name="checkmark-circle" size={20} color="#34D399" />
              </Animated.View>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Feature bullets */}
      <View style={styles.features}>
        <FeatureBullet
          icon="trending-up"
          title="Real-time profit per project"
          description="See what's making you money"
          delay={1800}
          isActive={isActive}
          iconColor="#34D399"
        />
        <FeatureBullet
          icon="document-text"
          title="Create invoices in 30 seconds"
          description="Professional, branded, done"
          delay={2000}
          isActive={isActive}
          iconColor="#60A5FA"
        />
        <FeatureBullet
          icon="cash"
          title="Track who owes you"
          description="Send reminders automatically"
          delay={2200}
          isActive={isActive}
          iconColor="#F59E0B"
        />
      </View>

      {/* Quote */}
      <Text style={styles.quote}>
        "Finally understand where every dollar goes."
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
    marginBottom: 20,
  },
  financialCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#60A5FA',
    letterSpacing: 0.5,
  },
  period: {
    fontSize: 12,
    color: '#64748B',
  },
  summary: {
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#94A3B8',
  },
  revenueValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  expenseValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 8,
  },
  profitLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  profitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profitValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#34D399',
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
