/**
 * PricingSlide
 * Screen 7: Plan selection with glowing cards
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { PricingCard, ShimmerButton } from '../../../components/onboarding';

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

const BenefitItem = ({ icon, text, delay, isActive }) => {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-20);

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
    <Animated.View style={[styles.benefitItem, style]}>
      <Ionicons name="checkmark-circle" size={18} color="#34D399" />
      <Text style={styles.benefitText}>{text}</Text>
    </Animated.View>
  );
};

export default function PricingSlide({ isActive, selectedPlan, onSelectPlan, onStartTrial }) {
  const headerOpacity = useSharedValue(0);
  const cardsOpacity = useSharedValue(0);
  const footerOpacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      headerOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));
      cardsOpacity.value = withDelay(400, withTiming(1, { duration: 400 }));
      footerOpacity.value = withDelay(1200, withTiming(1, { duration: 400 }));
    }
  }, [isActive]);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const cardsStyle = useAnimatedStyle(() => ({
    opacity: cardsOpacity.value,
  }));

  const footerStyle = useAnimatedStyle(() => ({
    opacity: footerOpacity.value,
  }));

  const currentBenefits = BENEFITS[selectedPlan] || BENEFITS.pro;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View style={[styles.header, headerStyle]}>
        <Text style={styles.title}>Choose Your Plan</Text>
        <Text style={styles.subtitle}>Start with 7 days free. Cancel anytime.</Text>
      </Animated.View>

      {/* Plan cards */}
      <Animated.View style={[styles.cardsContainer, cardsStyle]}>
        {PLANS.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan.name}
            price={plan.price}
            projects={plan.projects}
            isSelected={selectedPlan === plan.id}
            isBest={plan.isBest}
            onSelect={() => onSelectPlan(plan.id)}
          />
        ))}
      </Animated.View>

      {/* Benefits list */}
      <View style={styles.benefitsContainer}>
        <Text style={styles.benefitsTitle}>
          What you get with {PLANS.find(p => p.id === selectedPlan)?.name || 'Pro'}:
        </Text>
        {currentBenefits.map((benefit, index) => (
          <BenefitItem
            key={`${selectedPlan}-${benefit.text}`}
            icon={benefit.icon}
            text={benefit.text}
            delay={100 + index * 80}
            isActive={true}
          />
        ))}
        {/* Trial benefit */}
        <BenefitItem
          key={`${selectedPlan}-trial`}
          icon="gift"
          text="7-day free trial included"
          delay={100 + currentBenefits.length * 80}
          isActive={true}
        />
      </View>

      {/* CTA */}
      <View style={styles.ctaContainer}>
        <ShimmerButton
          title="Start Free Trial"
          onPress={onStartTrial}
          gradientColors={['#3B82F6', '#06B6D4']}
        />
      </View>

      {/* Trust footer */}
      <Animated.View style={[styles.trustFooter, footerStyle]}>
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
