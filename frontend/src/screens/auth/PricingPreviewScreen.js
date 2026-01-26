/**
 * PricingPreviewScreen
 * Shows pricing before login so users know the cost upfront
 * Always uses light mode
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTranslation } from 'react-i18next';

// Plan configurations (same as PaywallScreen)
const PLANS = [
  {
    tier: 'starter',
    name: 'Starter',
    price: 49,
    projects: 3,
    description: 'Perfect for solo contractors',
    popular: false,
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: 79,
    projects: 10,
    description: 'For growing businesses',
    popular: true,
  },
  {
    tier: 'business',
    name: 'Business',
    price: 149,
    projects: 'Unlimited',
    description: 'For established companies',
    popular: false,
  },
];

// Features included in all plans
const FEATURES = [
  { icon: 'chatbubble-outline', text: 'AI-powered assistant' },
  { icon: 'document-text-outline', text: 'Estimates & invoices' },
  { icon: 'people-outline', text: 'Worker management' },
  { icon: 'calendar-outline', text: 'Scheduling & time tracking' },
  { icon: 'camera-outline', text: 'Photo documentation' },
  { icon: 'cash-outline', text: 'Financial tracking' },
  { icon: 'globe-outline', text: '11 languages supported' },
];

export default function PricingPreviewScreen({ navigation }) {
  // Always use light colors for auth screens
  const Colors = LightColors;
  const { t } = useTranslation();

  // Pricing card component
  const PricingCard = ({ plan }) => (
    <View
      style={[
        styles.card,
        { backgroundColor: Colors.cardBackground },
        plan.popular && { borderColor: Colors.primaryBlue, borderWidth: 2 },
      ]}
    >
      {plan.popular && (
        <View style={[styles.popularBadge, { backgroundColor: Colors.primaryBlue }]}>
          <Text style={styles.popularText}>
            {t('subscription.mostPopular', 'Most Popular')}
          </Text>
        </View>
      )}

      <Text style={[styles.planName, { color: Colors.primaryText }]}>{plan.name}</Text>
      <Text style={[styles.description, { color: Colors.secondaryText }]}>
        {plan.description}
      </Text>

      <View style={styles.priceRow}>
        <Text style={[styles.currency, { color: Colors.primaryText }]}>$</Text>
        <Text style={[styles.price, { color: Colors.primaryText }]}>{plan.price}</Text>
        <Text style={[styles.period, { color: Colors.secondaryText }]}>/month</Text>
      </View>

      <View style={[styles.projectLimit, { backgroundColor: Colors.background }]}>
        <Ionicons name="folder-outline" size={20} color={Colors.primaryBlue} />
        <Text style={[styles.projectText, { color: Colors.primaryText }]}>
          {plan.projects === 'Unlimited' ? 'Unlimited' : plan.projects} active projects
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.primaryBlue + '15' }]}>
            <Ionicons name="diamond-outline" size={40} color={Colors.primaryBlue} />
          </View>
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            {t('subscription.chooseYourPlan', 'Choose Your Plan')}
          </Text>
          <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
            {t(
              'subscription.trialDescription',
              'Start with a 7-day free trial. Cancel anytime.'
            )}
          </Text>
        </View>

        {/* Pricing Cards */}
        <View style={styles.cardsContainer}>
          {PLANS.map((plan) => (
            <PricingCard key={plan.tier} plan={plan} />
          ))}
        </View>

        {/* Features Section */}
        <View style={styles.featuresSection}>
          <Text style={[styles.featuresTitle, { color: Colors.primaryText }]}>
            {t('subscription.allPlansInclude', 'All plans include:')}
          </Text>
          <View style={styles.featuresGrid}>
            {FEATURES.map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <Ionicons name={feature.icon} size={20} color={Colors.success} />
                <Text style={[styles.featureText, { color: Colors.primaryText }]}>
                  {feature.text}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Get Started Button */}
        <TouchableOpacity
          style={[styles.getStartedButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={() => navigation.navigate('Signup')}
          activeOpacity={0.8}
        >
          <Text style={styles.getStartedText}>
            {t('subscription.getStarted', 'Get Started')}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#FFF" />
        </TouchableOpacity>

        {/* Already have account */}
        <View style={styles.loginSection}>
          <Text style={[styles.loginText, { color: Colors.secondaryText }]}>
            {t('pricing.alreadyHaveAccount', 'Already have an account?')}{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={[styles.loginLink, { color: Colors.primaryBlue }]}>
              {t('pricing.signIn', 'Sign In')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Trust badges */}
        <View style={styles.trustSection}>
          <View style={styles.trustBadge}>
            <Ionicons name="shield-checkmark-outline" size={16} color={Colors.secondaryText} />
            <Text style={[styles.trustText, { color: Colors.secondaryText }]}>
              Secure payment via Stripe
            </Text>
          </View>
          <View style={styles.trustBadge}>
            <Ionicons name="refresh-outline" size={16} color={Colors.secondaryText} />
            <Text style={[styles.trustText, { color: Colors.secondaryText }]}>
              Cancel anytime
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  cardsContainer: {
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    right: 16,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
  },
  popularText: {
    color: '#FFF',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  planName: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  description: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.md,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: Spacing.md,
  },
  currency: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
  },
  price: {
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 52,
  },
  period: {
    fontSize: FontSizes.body,
    marginLeft: Spacing.xs,
  },
  projectLimit: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  projectText: {
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
  featuresSection: {
    marginBottom: Spacing.xl,
  },
  featuresTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  featuresGrid: {
    gap: Spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  featureText: {
    fontSize: FontSizes.body,
  },
  getStartedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  getStartedText: {
    color: '#FFF',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  loginSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  loginText: {
    fontSize: FontSizes.body,
  },
  loginLink: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  trustSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.lg,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  trustText: {
    fontSize: FontSizes.small,
  },
});
