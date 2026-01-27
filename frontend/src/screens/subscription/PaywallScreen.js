/**
 * PaywallScreen
 * Dark mode pricing screen that blocks features until subscription
 * Matches the premium onboarding styling
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import subscriptionService from '../../services/subscriptionService';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { AnimatedBackground, PricingCard, ShimmerButton } from '../../components/onboarding';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Plan configurations (prices hidden for App Store compliance - shown on web)
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: null, // Hidden for App Store
    projects: 3,
    description: 'Solo contractors',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: null, // Hidden for App Store
    projects: 10,
    description: 'Growing teams',
    isBest: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: null, // Hidden for App Store
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

// Animated benefit item
const AnimatedBenefitItem = ({ text, index, animationKey }) => {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-30);

  useEffect(() => {
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

export default function PaywallScreen({ navigation, onSubscribed, onClose, route }) {
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [loading, setLoading] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const { justSubscribed, clearJustSubscribed, planTier, refreshSubscription, hasActiveSubscription, isLoading: subLoading } = useSubscription();

  // Handle close - either use onClose prop or navigation
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (navigation?.goBack) {
      navigation.goBack();
    }
  };

  // Load pre-selected plan from onboarding (if any)
  useEffect(() => {
    const loadSavedPlan = async () => {
      try {
        const savedPlan = await AsyncStorage.getItem('@selectedPlan');
        if (savedPlan && ['starter', 'pro', 'business'].includes(savedPlan)) {
          setSelectedPlan(savedPlan);
        }
      } catch (error) {
        console.log('No saved plan found');
      }
    };
    loadSavedPlan();
  }, []);

  // Re-animate benefits when plan changes
  useEffect(() => {
    setAnimationKey(k => k + 1);
  }, [selectedPlan]);

  // Auto-close when subscription becomes active
  useEffect(() => {
    if (hasActiveSubscription && !subLoading) {
      console.log('Subscription is active, closing paywall');
      if (onSubscribed) onSubscribed();
      handleClose();
    }
  }, [hasActiveSubscription, subLoading]);

  // Show success message when returning from Stripe checkout
  useEffect(() => {
    if (justSubscribed) {
      const planName = planTier.charAt(0).toUpperCase() + planTier.slice(1);
      Alert.alert(
        'Welcome!',
        `Your ${planName} trial is now active. Enjoy 7 days free!`,
        [{
          text: 'Get Started',
          onPress: () => {
            clearJustSubscribed();
            if (onSubscribed) onSubscribed();
            handleClose();
          }
        }]
      );
    }
  }, [justSubscribed, planTier, clearJustSubscribed, onSubscribed]);

  const handleStartTrial = async () => {
    try {
      setLoading(true);
      // Open pricing page in browser (App Store compliant)
      await subscriptionService.openPricingPage();

      // User returned from browser - refresh subscription in case they subscribed
      console.log('Returned from pricing page, refreshing subscription...');
      await refreshSubscription();

    } catch (error) {
      Alert.alert('Error', 'Failed to open pricing page. Please try again.');
      console.error('Pricing page error:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentBenefits = BENEFITS[selectedPlan] || BENEFITS.pro;
  const currentPlanName = PLANS.find(p => p.id === selectedPlan)?.name || 'Pro';

  return (
    <AnimatedBackground>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Close button */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={24} color="#94A3B8" />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={['#3B82F6', '#8B5CF6']}
                style={styles.iconGradient}
              >
                <Ionicons name="diamond" size={32} color="#FFF" />
              </LinearGradient>
            </View>
            <Text style={styles.title}>Unlock Full Access</Text>
            <Text style={styles.subtitle}>Manage your projects like a pro</Text>
          </View>

          {/* Plan cards */}
          <View style={styles.cardsContainer}>
            {PLANS.map((plan) => (
              <View key={plan.id} style={{ flex: 1 }}>
                <PricingCard
                  plan={plan.name}
                  price={plan.price}
                  projects={plan.projects}
                  isSelected={selectedPlan === plan.id}
                  isBest={plan.isBest}
                  onSelect={() => setSelectedPlan(plan.id)}
                />
              </View>
            ))}
          </View>

          {/* Benefits list */}
          <View style={styles.benefitsContainer}>
            <Text style={styles.benefitsTitle}>
              What you get with {currentPlanName}:
            </Text>
            {currentBenefits.map((benefit, index) => (
              <AnimatedBenefitItem
                key={`${selectedPlan}-${benefit.text}`}
                text={benefit.text}
                index={index}
                animationKey={animationKey}
              />
            ))}
            {/* Trial info moved to pricing website for App Store compliance */}
          </View>

          {/* CTA */}
          <View style={styles.ctaContainer}>
            {loading ? (
              <View style={styles.loadingButton}>
                <ActivityIndicator color="#FFF" />
              </View>
            ) : (
              <ShimmerButton
                title="Get Started"
                onPress={handleStartTrial}
                gradientColors={['#3B82F6', '#06B6D4']}
              />
            )}
          </View>

          {/* Trust footer */}
          <View style={styles.trustFooter}>
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
          </View>
        </ScrollView>
      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    marginBottom: 16,
  },
  iconGradient: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
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
  loadingButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
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
