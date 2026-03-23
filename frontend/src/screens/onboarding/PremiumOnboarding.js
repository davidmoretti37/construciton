/**
 * PremiumOnboarding
 * World-class 6-screen onboarding experience (no pricing - that comes later)
 */

import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Dimensions, FlatList, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AnimatedBackground, PaginationDots } from '../../components/onboarding';
import {
  WelcomeSlide,
  EstimatesSlide,
  ProjectsSlide,
  FinancialsSlide,
  AIAssistantSlide,
  SocialProofSlide,
} from './slides';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDE_COUNT = 6;

// Slide configuration (no pricing - users see that when they try to use features)
const SLIDES = [
  { id: 'welcome', component: WelcomeSlide },
  { id: 'estimates', component: EstimatesSlide },
  { id: 'projects', component: ProjectsSlide },
  { id: 'financials', component: FinancialsSlide },
  { id: 'assistant', component: AIAssistantSlide },
  { id: 'social', component: SocialProofSlide },
];

export default function PremiumOnboarding({ navigation }) {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Track which index changed
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }, []);

  // Navigation handlers
  const handleNext = useCallback(() => {
    if (currentIndex < SLIDE_COUNT - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    }
  }, [currentIndex]);

  const handleSkip = useCallback(async () => {
    // Skip directly to signup
    await AsyncStorage.setItem('@hasSeenOnboarding', 'true');
    navigation.navigate('Signup');
  }, [navigation]);

  const handleGetStarted = useCallback(() => {
    handleNext();
  }, [handleNext]);

  // Called from last slide (SocialProofSlide) - go to signup
  const handleFinalGetStarted = useCallback(async () => {
    await AsyncStorage.setItem('@hasSeenOnboarding', 'true');
    navigation.navigate('Signup');
  }, [navigation]);

  // Render individual slide
  const renderSlide = useCallback(({ item, index }) => {
    const SlideComponent = item.component;
    const isActive = currentIndex === index;

    // Special props for specific slides
    if (item.id === 'welcome') {
      return (
        <SlideComponent
          isActive={isActive}
          onGetStarted={handleGetStarted}
        />
      );
    }

    // Last slide (social proof) has Get Started button
    if (item.id === 'social') {
      return (
        <SlideComponent
          isActive={isActive}
          onGetStarted={handleFinalGetStarted}
        />
      );
    }

    return <SlideComponent isActive={isActive} />;
  }, [currentIndex, handleGetStarted, handleFinalGetStarted]);

  // Get item layout for performance
  const getItemLayout = useCallback((_, index) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  }), []);

  const showSkip = currentIndex > 0 && currentIndex < SLIDE_COUNT - 1;
  const showNext = currentIndex > 0 && currentIndex < SLIDE_COUNT - 1;

  return (
    <AnimatedBackground>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Skip button */}
        {showSkip && (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}

        {/* Slides */}
        <FlatList
          ref={flatListRef}
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          keyExtractor={(item) => item.id}
          renderItem={renderSlide}
          getItemLayout={getItemLayout}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          removeClippedSubviews={true}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
        />

        {/* Bottom section */}
        <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}>
          {/* Pagination dots */}
          <PaginationDots count={SLIDE_COUNT} activeIndex={currentIndex} />

          {/* Next button (for slides 2-6) */}
          {showNext && (
            <TouchableOpacity
              style={styles.nextButton}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <Text style={styles.nextText}>Next</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </AnimatedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '500',
  },
  bottomSection: {
    paddingHorizontal: 24,
  },
  nextButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: 'rgba(255,255,255,0.1)',
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  nextText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F8FAFC',
  },
});
