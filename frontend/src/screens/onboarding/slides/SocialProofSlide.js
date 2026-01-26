/**
 * SocialProofSlide
 * Screen 6: Testimonials and stats
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { TestimonialCard, CountUpNumber } from '../../../components/onboarding';

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

const StatCard = ({ stat, delay, isActive }) => {
  const [showNumber, setShowNumber] = useState(false);
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      scale.value = withDelay(delay, withSpring(1, { damping: 12 }));
      opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
      const timer = setTimeout(() => setShowNumber(true), delay);
      return () => clearTimeout(timer);
    }
  }, [isActive, delay]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.statCard, style]}>
      <Ionicons name={stat.icon} size={20} color="#60A5FA" />
      {showNumber ? (
        <CountUpNumber
          value={stat.value}
          prefix={stat.prefix || ''}
          suffix={stat.suffix}
          decimals={stat.decimals || 0}
          duration={1000}
          delay={0}
          style={styles.statValue}
        />
      ) : (
        <Text style={styles.statValue}>0</Text>
      )}
      <Text style={styles.statLabel}>{stat.label}</Text>
    </Animated.View>
  );
};

export default function SocialProofSlide({ isActive }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const starsScale = useSharedValue(0);
  const headerOpacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      starsScale.value = withDelay(200, withSpring(1, { damping: 10 }));
      headerOpacity.value = withDelay(400, withTiming(1, { duration: 400 }));
    }
  }, [isActive]);

  const starsStyle = useAnimatedStyle(() => ({
    transform: [{ scale: starsScale.value }],
  }));

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const handleScroll = (e) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 80));
    setActiveIndex(index);
  };

  return (
    <View style={styles.container}>
      {/* Title with stars */}
      <Animated.View style={[styles.starsContainer, starsStyle]}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Ionicons key={i} name="star" size={24} color="#FBBF24" />
        ))}
      </Animated.View>

      <Animated.View style={headerStyle}>
        <Text style={styles.title}>Trusted by Contractors</Text>
        <Text style={styles.subtitle}>See what others are saying</Text>
      </Animated.View>

      {/* Testimonials carousel */}
      <FlatList
        data={TESTIMONIALS}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.carouselContent}
        snapToInterval={SCREEN_WIDTH - 80}
        decelerationRate="fast"
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <TestimonialCard
            quote={item.quote}
            author={item.author}
            role={item.role}
            rating={item.rating}
            delay={600 + index * 100}
            isActive={isActive}
          />
        )}
      />

      {/* Carousel dots */}
      <View style={styles.dotsContainer}>
        {TESTIMONIALS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              activeIndex === i && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        {STATS.map((stat, index) => (
          <StatCard
            key={stat.label}
            stat={stat}
            delay={1200 + index * 150}
            isActive={isActive}
          />
        ))}
      </View>

      {/* Trust badges */}
      <View style={styles.trustBadges}>
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={14} color="#34D399" />
          <Text style={styles.badgeText}>Verified Reviews</Text>
        </View>
        <View style={styles.badgeDivider} />
        <View style={styles.badge}>
          <Ionicons name="lock-closed" size={14} color="#60A5FA" />
          <Text style={styles.badgeText}>Bank-Level Security</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingTop: 20,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20,
  },
  carouselContent: {
    paddingHorizontal: 40,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#3B82F6',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    marginVertical: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  trustBadges: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: 12,
    color: '#64748B',
  },
  badgeDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
});
