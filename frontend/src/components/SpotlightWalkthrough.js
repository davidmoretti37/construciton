/**
 * SpotlightWalkthrough - Tooltip/spotlight coach marks for new users
 * Highlights UI elements with a dark overlay and cutout, showing step-by-step guidance
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Modal,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Defs, Rect, Mask, Circle } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STORAGE_KEY = '@sylk_walkthrough_complete';

// Walkthrough steps
const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Sylk',
    description: 'Let\'s walk you through the basics so you can hit the ground running. This will only take a minute.',
    icon: 'rocket-outline',
    type: 'center',
  },
  {
    id: 'fab',
    title: 'Quick Actions',
    description: 'This is your command center. Tap the + button anytime to access quick actions.',
    icon: 'add-circle-outline',
    type: 'fab',
    tooltipPosition: 'above-left',
    fabExpanded: false,
  },
  {
    id: 'create-project',
    title: 'Create a Project',
    description: 'Tap "New Project" here, or go to the Chat tab and describe your job to the AI — it\'ll create the project with phases, tasks, and budget instantly. Chat is the fastest way to get started.',
    icon: 'folder-outline',
    type: 'fab',
    tooltipPosition: 'above-left',
    fabExpanded: true,
    menuItemKey: 'project',
  },
  {
    id: 'overhead',
    title: 'Track Your Overhead',
    description: 'This card shows your overhead costs at a glance. Tap it to add rent, insurance, truck payments, and other recurring expenses.',
    icon: 'trending-up-outline',
    type: 'overhead',
    tooltipPosition: 'below',
    fabExpanded: false,
  },
  {
    id: 'add-worker',
    title: 'Add Your Crew',
    description: 'Tap + and select "Add Worker" to bring your team on board. They\'ll get their own app to clock in, submit daily reports, and view assignments.',
    icon: 'people-outline',
    type: 'fab',
    tooltipPosition: 'above-left',
    fabExpanded: true,
    menuItemKey: 'assign-worker',
  },
  {
    id: 'extras',
    title: 'Reports & Expenses',
    description: 'Use the + menu to log daily reports and track expenses on the go. Snap a receipt and the AI categorizes it for you.',
    icon: 'document-text-outline',
    type: 'fab',
    tooltipPosition: 'above-left',
    fabExpanded: true,
    menuItemKey: 'report',
  },
  {
    id: 'done',
    title: 'You\'re All Set!',
    description: 'Head to the Chat tab anytime to ask the AI assistant for help — estimates, scheduling, financial reports, anything you need.',
    icon: 'checkmark-circle-outline',
    type: 'center',
  },
];

const SpotlightWalkthrough = ({
  fabRef,
  overheadRef,
  fabMenuRefs = {},
  onComplete,
  onExpandFAB,
  onCollapseFAB,
  onNavigateToTab,
}) => {
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetLayout, setTargetLayout] = useState(null);

  const overlayOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);

  const overlayAnimStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));
  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
  }));

  useEffect(() => {
    checkWalkthroughStatus();
  }, []);

  const checkWalkthroughStatus = async () => {
    try {
      const completed = await AsyncStorage.getItem(STORAGE_KEY);
      if (!completed) {
        setTimeout(() => setVisible(true), 1000);
      }
    } catch (e) {}
  };

  const measureRef = useCallback((ref, retries = 0) => {
    if (!ref?.current) {
      if (retries < 5) {
        setTimeout(() => measureRef(ref, retries + 1), 500);
      }
      return;
    }
    ref.current.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setTargetLayout({ x, y, width, height });
        // Smooth fade in after position is set
        requestAnimationFrame(() => {
          overlayOpacity.value = withTiming(1, { duration: 200 });
          cardOpacity.value = withTiming(1, { duration: 300 });
        });
      } else if (retries < 5) {
        setTimeout(() => measureRef(ref, retries + 1), 500);
      }
    });
  }, []);

  // Measure target when step changes
  useEffect(() => {
    if (!visible) return;
    setTargetLayout(null);
    // Instantly hide both layers
    overlayOpacity.value = 0;
    cardOpacity.value = 0;

    const step = STEPS[currentStep];

    const fadeIn = () => {
      overlayOpacity.value = withTiming(1, { duration: 200 });
      cardOpacity.value = withTiming(1, { duration: 300 });
    };

    if (step.type === 'center') {
      onCollapseFAB?.();
      setTimeout(fadeIn, 80);
      return;
    }

    if (step.type === 'fab') {
      if (step.fabExpanded) {
        onExpandFAB?.();
        // Measure the specific menu item if specified
        const menuKey = step.menuItemKey;
        if (menuKey && fabMenuRefs[menuKey]?.current) {
          setTimeout(() => measureRef(fabMenuRefs[menuKey]), 450);
        } else {
          setTimeout(() => measureRef(fabRef), 350);
        }
      } else {
        onCollapseFAB?.();
        setTimeout(() => measureRef(fabRef), 350);
      }
      return;
    }

    if (step.type === 'overhead') {
      onCollapseFAB?.();
      // Navigate to Home tab first so the overhead card is visible
      onNavigateToTab?.('Home');
      setTimeout(() => measureRef(overheadRef), 1200);
      return;
    }
  }, [currentStep, visible]);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeWalkthrough();
    }
  };

  const handleSkip = async () => {
    await completeWalkthrough();
  };

  const completeWalkthrough = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, 'true');
    } catch (e) {}
    onCollapseFAB?.();
    setVisible(false);
    onComplete?.();
  };

  if (!visible) return null;

  const step = STEPS[currentStep];
  const isCentered = step.type === 'center';
  const hasTarget = !isCentered && targetLayout;
  const isLastStep = currentStep === STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  const getTooltipStyle = () => {
    if (isCentered || !targetLayout) {
      return {
        position: 'absolute',
        top: SCREEN_HEIGHT * 0.28,
        left: 28,
        right: 28,
      };
    }

    const { x, y, width, height } = targetLayout;
    const isFabExpanded = step.fabExpanded;

    switch (step.tooltipPosition) {
      case 'above-left':
        if (isFabExpanded) {
          // Position above expanded FAB menu items
          return {
            position: 'absolute',
            top: SCREEN_HEIGHT * 0.06,
            left: 20,
            right: 20,
          };
        }
        return {
          position: 'absolute',
          bottom: SCREEN_HEIGHT - y + 30,
          right: 20,
          left: 20,
        };
      case 'below':
        return {
          position: 'absolute',
          top: y + height + 20,
          left: 20,
          right: 20,
        };
      default:
        return {
          position: 'absolute',
          bottom: SCREEN_HEIGHT - y + 30,
          left: 20,
          right: 20,
        };
    }
  };

  // Calculate spotlight cutout padding
  const PAD = 12;

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
      {/* Layer 1: Dark overlay (behind everything) */}
      <Animated.View style={[StyleSheet.absoluteFill, overlayAnimStyle]} pointerEvents="none">
          {hasTarget ? (
            <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={StyleSheet.absoluteFill}>
              <Defs>
                <Mask id="cutout" x="0" y="0" width="100%" height="100%">
                  <Rect x="0" y="0" width="100%" height="100%" fill="white" />
                  {/* Round cutout for circular targets (FAB), rounded rect for cards */}
                  {targetLayout.width === targetLayout.height ? (
                    <Circle
                      cx={targetLayout.x + targetLayout.width / 2}
                      cy={targetLayout.y + targetLayout.height / 2}
                      r={targetLayout.width / 2 + PAD}
                      fill="black"
                    />
                  ) : (
                    <Rect
                      x={targetLayout.x - PAD}
                      y={targetLayout.y - PAD}
                      width={targetLayout.width + PAD * 2}
                      height={targetLayout.height + PAD * 2}
                      rx={20}
                      ry={20}
                      fill="black"
                    />
                  )}
                </Mask>
              </Defs>
              <Rect
                x="0" y="0" width="100%" height="100%"
                fill="rgba(0,0,0,0.6)"
                mask="url(#cutout)"
              />
            </Svg>
          ) : (
            <View style={[styles.dim, StyleSheet.absoluteFill]} />
          )}
      </Animated.View>

      {/* Layer 2: Interactive content (tooltip only) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Tooltip */}
        <Animated.View
          style={[styles.cardOuter, getTooltipStyle(), cardAnimStyle]}
        >
          {/* White base so blur doesn't pick up the dark overlay */}
          <View style={styles.cardBase} />
          <BlurView intensity={60} tint="light" style={styles.card}>
            {/* Step counter pill */}
            <View style={styles.counterPill}>
              <Text style={styles.counterText}>{currentStep + 1} of {STEPS.length}</Text>
            </View>

            {/* Icon */}
            <View style={styles.iconWrap}>
              <Ionicons name={step.icon} size={28} color="#1E40AF" />
            </View>

            {/* Title */}
            <Text style={styles.title}>{step.title}</Text>

            {/* Description */}
            <Text style={styles.desc}>{step.description}</Text>

            {/* Progress dots */}
            <View style={styles.dots}>
              {STEPS.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === currentStep && styles.dotActive,
                    i < currentStep && styles.dotDone,
                  ]}
                />
              ))}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              {!isFirstStep && (
                <TouchableOpacity onPress={() => setCurrentStep(currentStep - 1)} style={styles.backBtn}>
                  <Ionicons name="chevron-back" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
              {!isLastStep && isFirstStep && (
                <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
                  <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>
              )}
              {!isLastStep && !isFirstStep && <View style={{ flex: 1 }} />}
              <TouchableOpacity onPress={handleNext} style={styles.nextBtn}>
                <Text style={styles.nextText}>
                  {isFirstStep ? "Let's Go" : isLastStep ? 'Get Started' : 'Next'}
                </Text>
                {!isLastStep && <Ionicons name="arrow-forward" size={15} color="#fff" />}
              </TouchableOpacity>
            </View>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>

  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  cardBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 24,
  },
  cardOuter: {
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#1E40AF',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  card: {
    padding: 24,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.95)' : undefined,
  },
  counterPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(30, 64, 175, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 16,
  },
  counterText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E40AF',
    letterSpacing: 0.3,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(30, 64, 175, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  desc: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    marginBottom: 20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
  },
  dotActive: {
    width: 22,
    borderRadius: 4,
    backgroundColor: '#1E40AF',
  },
  dotDone: {
    backgroundColor: '#93C5FD',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
  },
  backBtn: {
    padding: 8,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E40AF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  nextText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export { STORAGE_KEY };
export default SpotlightWalkthrough;
