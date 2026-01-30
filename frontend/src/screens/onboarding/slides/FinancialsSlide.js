/**
 * FinancialsSlide
 * Screen 4: Financial Tracking with bar chart
 * Bars bounce dramatically, stats count up, quote types out
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
import { AnimatedBarChart, CountUpNumber, FeatureBullet, TypewriterText } from '../../../components/onboarding';
import {
  ONBOARDING_COLORS,
  ONBOARDING_TYPOGRAPHY,
  ONBOARDING_SPACING,
  ONBOARDING_RADIUS,
} from './constants';
import { useBounceAnimation, useCardAnimation, useEntranceAnimation } from './useEntranceAnimation';

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

// Animated summary row that fades/slides in
const AnimatedSummaryRow = ({ label, value, style, delay, isActive, showCheckmark = false }) => {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-30);

  useEffect(() => {
    if (isActive) {
      opacity.value = withDelay(delay, withSpring(1, { damping: 15 }));
      translateX.value = withDelay(delay, withSpring(0, { damping: 12, stiffness: 100 }));
    } else {
      opacity.value = 0;
      translateX.value = -30;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[styles.summaryRow, animatedStyle]}>
      <Text style={style.label}>{label}</Text>
      <View style={styles.valueRow}>
        <CountUpNumber
          value={value}
          prefix="$"
          style={style.value}
          duration={1000}
          delay={200}
          isActive={isActive}
        />
        {showCheckmark && (
          <Ionicons name="checkmark-circle" size={20} color="#34D399" />
        )}
      </View>
    </Animated.View>
  );
};

export default function FinancialsSlide({ isActive = true }) {
  const [cardReady, setCardReady] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showProfit, setShowProfit] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);

  // Staggered entrance animations
  const titleAnim = useBounceAnimation(isActive, 0);
  const cardAnim = useCardAnimation(isActive, 200, true);

  // Feature animations (triggered after card content)
  const feature1Anim = useEntranceAnimation(showFeatures, 0);
  const feature2Anim = useEntranceAnimation(showFeatures, 100);
  const feature3Anim = useEntranceAnimation(showFeatures, 200);

  // Timeline for card content
  useEffect(() => {
    if (!isActive) {
      setCardReady(false);
      setShowRevenue(false);
      setShowExpenses(false);
      setShowProfit(false);
      setShowFeatures(false);
      return;
    }

    const timers = [];

    // Card ready for chart animation
    timers.push(setTimeout(() => setCardReady(true), 400));

    // Stagger summary rows
    timers.push(setTimeout(() => setShowRevenue(true), 1400));
    timers.push(setTimeout(() => setShowExpenses(true), 1700));
    timers.push(setTimeout(() => setShowProfit(true), 2000));

    // Show features after everything
    timers.push(setTimeout(() => setShowFeatures(true), 2800));

    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [isActive]);

  return (
    <View style={styles.container}>
      {/* Title */}
      <Animated.View style={titleAnim}>
        <Text style={styles.title}>Know Your Numbers.</Text>
        <Text style={styles.titleAccent}>Grow Your Business.</Text>
      </Animated.View>

      {/* Financial card */}
      <Animated.View style={[styles.financialCard, cardAnim]}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <Ionicons name="stats-chart" size={18} color="#60A5FA" />
            <Text style={styles.headerText}>FINANCIALS</Text>
          </View>
          <Text style={styles.period}>November 2024</Text>
        </View>

        {/* Chart with dramatic bounce */}
        <AnimatedBarChart data={CHART_DATA} isActive={cardReady} dramatic={true} />

        {/* Summary with staggered reveals */}
        <View style={styles.summary}>
          {showRevenue && (
            <AnimatedSummaryRow
              label="Revenue"
              value={FINANCIALS.revenue}
              style={{ label: styles.summaryLabel, value: styles.revenueValue }}
              delay={0}
              isActive={showRevenue}
            />
          )}

          {showExpenses && (
            <AnimatedSummaryRow
              label="Expenses"
              value={FINANCIALS.expenses}
              style={{ label: styles.summaryLabel, value: styles.expenseValue }}
              delay={0}
              isActive={showExpenses}
            />
          )}

          {showProfit && (
            <>
              <View style={styles.divider} />
              <AnimatedSummaryRow
                label="PROFIT"
                value={FINANCIALS.profit}
                style={{ label: styles.profitLabel, value: styles.profitValue }}
                delay={0}
                isActive={showProfit}
                showCheckmark={true}
              />
            </>
          )}
        </View>
      </Animated.View>

      {/* Feature bullets */}
      <View style={styles.features}>
        <Animated.View style={feature1Anim}>
          <FeatureBullet
            icon="trending-up"
            title="Real-time profit per project"
            description="See what's making you money"
            iconColor="#34D399"
          />
        </Animated.View>
        <Animated.View style={feature2Anim}>
          <FeatureBullet
            icon="document-text"
            title="Create invoices in 30 seconds"
            description="Professional, branded, done"
            iconColor="#60A5FA"
          />
        </Animated.View>
        <Animated.View style={feature3Anim}>
          <FeatureBullet
            icon="cash"
            title="Track who owes you"
            description="Send reminders automatically"
            iconColor="#F59E0B"
          />
        </Animated.View>
      </View>

      {/* Quote - types out */}
      <TypewriterText
        text='"Finally understand where every dollar goes."'
        style={styles.quote}
        speed={30}
        isActive={showFeatures}
      />
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
    marginBottom: 20,
  },
  financialCard: {
    backgroundColor: ONBOARDING_COLORS.glassBg,
    borderRadius: ONBOARDING_RADIUS.card,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.border,
    padding: ONBOARDING_SPACING.cardPadding,
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
    color: ONBOARDING_COLORS.primaryLight,
    letterSpacing: 0.5,
  },
  period: {
    fontSize: 12,
    color: ONBOARDING_COLORS.textTertiary,
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
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: ONBOARDING_COLORS.textSecondary,
  },
  revenueValue: {
    fontSize: 16,
    fontWeight: '600',
    color: ONBOARDING_COLORS.textPrimary,
  },
  expenseValue: {
    fontSize: 16,
    fontWeight: '600',
    color: ONBOARDING_COLORS.error,
  },
  divider: {
    height: 1,
    backgroundColor: ONBOARDING_COLORS.border,
    marginVertical: 8,
  },
  profitLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: ONBOARDING_COLORS.textPrimary,
  },
  profitValue: {
    fontSize: 20,
    fontWeight: '800',
    color: ONBOARDING_COLORS.success,
  },
  features: {
    marginBottom: 16,
  },
  quote: {
    ...ONBOARDING_TYPOGRAPHY.caption,
  },
});
