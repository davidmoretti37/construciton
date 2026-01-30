/**
 * SocialProofSlide
 * Screen 6: Testimonials and stats with entrance animations
 */

import React from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView, TouchableOpacity } from 'react-native';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { TestimonialCard, CountUpNumber } from '../../../components/onboarding';
import {
  ONBOARDING_COLORS,
  ONBOARDING_TYPOGRAPHY,
  ONBOARDING_SPACING,
  ONBOARDING_RADIUS,
} from './constants';
import { useBounceAnimation, useScaleAnimation, useStatsAnimation, useEntranceAnimation } from './useEntranceAnimation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Testimonial data
const TESTIMONIALS = [
  {
    id: '1',
    quote: "This app saved me 10+ hours every week on estimates alone! I used to spend 3 hours on each quote - now it's 5 minutes.",
    author: 'Mike Rodriguez',
    role: 'General Contractor, Austin TX',
    rating: 5,
  },
  {
    id: '2',
    quote: "Finally, an app that understands construction workflows. My team actually uses it!",
    author: 'Sarah Thompson',
    role: 'Remodeling Specialist, Denver',
    rating: 5,
  },
  {
    id: '3',
    quote: "The AI estimates are surprisingly accurate. It's like having a senior estimator on staff 24/7.",
    author: 'Carlos Martinez',
    role: 'Roofing Contractor, Miami',
    rating: 5,
  },
];

// Stats data
const STATS = [
  { label: 'Users', value: 500, suffix: '+', icon: 'people' },
  { label: 'Jobs Managed', value: 10, suffix: 'K+', icon: 'construct' },
  { label: 'App Rating', value: 4.9, suffix: '', decimals: 1, icon: 'star' },
  { label: 'Tracked', value: 2, prefix: '$', suffix: 'M+', icon: 'cash' },
];

const StatCard = ({ stat }) => {
  return (
    <View style={styles.statCard}>
      <Ionicons name={stat.icon} size={20} color="#60A5FA" />
      <CountUpNumber
        value={stat.value}
        prefix={stat.prefix || ''}
        suffix={stat.suffix}
        decimals={stat.decimals || 0}
        style={styles.statValue}
      />
      <Text style={styles.statLabel}>{stat.label}</Text>
    </View>
  );
};

export default function SocialProofSlide({ isActive = true, onGetStarted }) {
  // Staggered entrance animations
  const starsAnim = useScaleAnimation(isActive, 0);
  const titleAnim = useBounceAnimation(isActive, 150);
  const testimonialsAnim = useEntranceAnimation(isActive, 300);
  const statsAnim = useStatsAnimation(isActive, 450);
  const badgesAnim = useEntranceAnimation(isActive, 650);
  const buttonAnim = useEntranceAnimation(isActive, 800);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Title with stars */}
      <Animated.View style={[styles.starsContainer, starsAnim]}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Ionicons key={i} name="star" size={24} color="#FBBF24" />
        ))}
      </Animated.View>

      <Animated.View style={titleAnim}>
        <Text style={styles.title}>Trusted by Contractors</Text>
        <Text style={styles.subtitle}>See what others are saying</Text>
      </Animated.View>

      {/* Testimonials - vertical stack */}
      <Animated.View style={[styles.testimonialsContainer, testimonialsAnim]}>
        {TESTIMONIALS.map((item) => (
          <TestimonialCard
            key={item.id}
            quote={item.quote}
            author={item.author}
            role={item.role}
            rating={item.rating}
          />
        ))}
      </Animated.View>

      {/* Stats grid */}
      <Animated.View style={[styles.statsGrid, statsAnim]}>
        {STATS.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </Animated.View>

      {/* Trust badges */}
      <Animated.View style={[styles.trustBadges, badgesAnim]}>
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={14} color="#34D399" />
          <Text style={styles.badgeText}>Verified Reviews</Text>
        </View>
        <View style={styles.badgeDivider} />
        <View style={styles.badge}>
          <Ionicons name="lock-closed" size={14} color="#60A5FA" />
          <Text style={styles.badgeText}>Bank-Level Security</Text>
        </View>
      </Animated.View>

      {/* Get Started Button */}
      {onGetStarted && (
        <Animated.View style={[styles.buttonContainer, buttonAnim]}>
          <TouchableOpacity
            style={styles.getStartedButton}
            onPress={onGetStarted}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#3B82F6', '#2563EB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  scrollContent: {
    paddingTop: ONBOARDING_SPACING.screenPaddingTop,
    paddingBottom: 20,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 12,
  },
  title: {
    ...ONBOARDING_TYPOGRAPHY.screenTitle,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: ONBOARDING_COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  testimonialsContainer: {
    paddingHorizontal: ONBOARDING_SPACING.screenPaddingHorizontal,
    gap: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: ONBOARDING_SPACING.screenPaddingHorizontal,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: ONBOARDING_COLORS.glassBg,
    borderRadius: ONBOARDING_RADIUS.card,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: ONBOARDING_COLORS.textPrimary,
    marginVertical: 4,
  },
  statLabel: {
    fontSize: 12,
    color: ONBOARDING_COLORS.textTertiary,
  },
  trustBadges: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: ONBOARDING_SPACING.screenPaddingHorizontal,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: 12,
    color: ONBOARDING_COLORS.textTertiary,
  },
  badgeDivider: {
    width: 1,
    height: 12,
    backgroundColor: ONBOARDING_COLORS.divider,
  },
  buttonContainer: {
    paddingHorizontal: ONBOARDING_SPACING.screenPaddingHorizontal,
    marginTop: 24,
    marginBottom: 20,
  },
  getStartedButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
});
