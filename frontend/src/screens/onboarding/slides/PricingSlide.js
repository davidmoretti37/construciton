/**
 * PricingSlide
 * Screen 7: Plan selection with entrance animations
 * Benefits re-animate when switching plans
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { PricingCard, ShimmerButton } from '../../../components/onboarding';
import { useBounceAnimation, useScaleAnimation, useEntranceAnimation } from './useEntranceAnimation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Plan configurations
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    projects: 3,
    description: 'Solo contractors',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 79,
    projects: 10,
    description: 'Growing teams',
    isBest: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: 149,
    projects: 'Unlimited',
    description: 'Large companies',
  },
];

// Benefits by plan
const BENEFITS = {
  starter: [
    { icon: 'folder', text: '3 active projects' },
    { icon: 'sparkles', text: 'AI estimates (20/mo)' },
    { icon: 'document-text', text: 'Invoice creation' },
    { icon: 'headset', text: 'Email support' },
  ],
  pro: [
    { icon: 'folder', text: '10 active projects' },
    { icon: 'sparkles', text: 'Unlimited AI estimates' },
    { icon: 'people', text: 'Team management' },
    { icon: 'stats-chart', text: 'Financial tracking' },
    { icon: 'headset', text: 'Priority support' },
  ],
  business: [
    { icon: 'infinite', text: 'Unlimited projects' },
    { icon: 'sparkles', text: 'Unlimited AI estimates' },
    { icon: 'people', text: 'Unlimited team members' },
    { icon: 'analytics', text: 'Advanced analytics' },
    { icon: 'call', text: 'Phone support' },
    { icon: 'business', text: 'Custom integrations' },
  ],
};

// Animated benefit item that pops in with stagger
// NO SCALE - prevents iOS rasterization blur
const AnimatedBenefitItem = ({ text, index, animationKey }) => {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-30);

  useEffect(() => {
    // Reset and animate on key change
    opacity.value = 0;
    translateX.value = -30;

    opacity.value = withDelay(index * 80, withSpring(1, { damping: 15 }));
    translateX.value = withDelay(index * 80, withSpring(0, { damping: 12, stiffness: 100 }));
  }, [animationKey, index]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[styles.benefitItem, animatedStyle]}>
      <Ionicons name="checkmark-circle" size={18} color="#34D399" />
      <Text style={styles.benefitText}>{text}</Text>
    </Animated.View>
  );
};

// Animated title that pulses on change
// NO SCALE - prevents iOS rasterization blur, using opacity pulse instead
const AnimatedBenefitsTitle = ({ planName, animationKey }) => {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    // Subtle bounce effect on change
    translateY.value = -5;
    opacity.value = 0.5;
    translateY.value = withSpring(0, { damping: 10, stiffness: 150 });
    opacity.value = withTiming(1, { duration: 200 });
  }, [animationKey]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.Text style={[styles.benefitsTitle, animatedStyle]}>
      What you get with {planName}:
    </Animated.Text>
  );
};

export default function PricingSlide({ isActive = true, selectedPlan, onSelectPlan, onStartTrial }) {
  const currentBenefits = BENEFITS[selectedPlan] || BENEFITS.pro;
  const currentPlanName = PLANS.find(p => p.id === selectedPlan)?.name || 'Pro';

  // Track plan changes for re-animation
  const [animationKey, setAnimationKey] = useState(0);
  const prevPlanRef = useRef(selectedPlan);

  useEffect(() => {
    if (prevPlanRef.current !== selectedPlan) {
      setAnimationKey(k => k + 1);
      prevPlanRef.current = selectedPlan;
    }
  }, [selectedPlan]);

  // Staggered entrance animations - bouncy pricing cards!
  const headerAnim = useBounceAnimation(isActive, 0);
  const card1Anim = useScaleAnimation(isActive, 150);
  const card2Anim = useScaleAnimation(isActive, 250);
  const card3Anim = useScaleAnimation(isActive, 350);
  const benefitsAnim = useEntranceAnimation(isActive, 500);
  const ctaAnim = useBounceAnimation(isActive, 650);
  const footerAnim = useEntranceAnimation(isActive, 800);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View style={[styles.header, headerAnim]}>
        <Text style={styles.title}>Choose Your Plan</Text>
        <Text style={styles.subtitle}>Start with 7 days free. Cancel anytime.</Text>
      </Animated.View>

      {/* Plan cards */}
      <View style={styles.cardsContainer}>
        {PLANS.map((plan, index) => {
          const cardAnim = index === 0 ? card1Anim : index === 1 ? card2Anim : card3Anim;
          return (
            <Animated.View key={plan.id} style={[{ flex: 1 }, cardAnim]}>
              <PricingCard
                plan={plan.name}
                price={plan.price}
                projects={plan.projects}
                isSelected={selectedPlan === plan.id}
                isBest={plan.isBest}
                onSelect={() => onSelectPlan(plan.id)}
              />
            </Animated.View>
          );
        })}
      </View>

      {/* Benefits list - re-animates on plan change */}
      <Animated.View style={[styles.benefitsContainer, benefitsAnim]}>
        <AnimatedBenefitsTitle planName={currentPlanName} animationKey={animationKey} />

        {currentBenefits.map((benefit, index) => (
          <AnimatedBenefitItem
            key={`${selectedPlan}-${benefit.text}`}
            text={benefit.text}
            index={index}
            animationKey={animationKey}
          />
        ))}

        {/* Trial benefit - always last */}
        <AnimatedBenefitItem
          key={`${selectedPlan}-trial`}
          text="7-day free trial included"
          index={currentBenefits.length}
          animationKey={animationKey}
        />
      </Animated.View>

      {/* CTA */}
      <Animated.View style={[styles.ctaContainer, ctaAnim]}>
        <ShimmerButton
          title="Start Free Trial"
          onPress={onStartTrial}
          gradientColors={['#3B82F6', '#06B6D4']}
        />
      </Animated.View>

      {/* Trust footer */}
      <Animated.View style={[styles.trustFooter, footerAnim]}>
        <View style={styles.trustItem}>
          <Ionicons name="shield-checkmark" size={14} color="#64748B" />
          <Text style={styles.trustText}>Secure</Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustItem}>
          <Ionicons name="refresh" size={14} color="#64748B" />
          <Text style={styles.trustText}>Cancel anytime</Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustItem}>
          <Ionicons name="card" size={14} color="#64748B" />
          <Text style={styles.trustText}>Stripe</Text>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    width: SCREEN_WIDTH,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
  },
  cardsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  benefitsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  benefitsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  benefitText: {
    fontSize: 14,
    color: '#CBD5E1',
  },
  ctaContainer: {
    marginBottom: 24,
  },
  trustFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trustText: {
    fontSize: 12,
    color: '#64748B',
  },
  trustDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
});
