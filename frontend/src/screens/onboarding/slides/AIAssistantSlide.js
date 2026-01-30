/**
 * AIAssistantSlide
 * Screen 5: AI Chat demo with choreographed chat simulation
 * User sends message → typing indicator → AI types response
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ChatBubble, TypingIndicator, TypewriterText, FeatureBullet } from '../../../components/onboarding';
import {
  ONBOARDING_COLORS,
  ONBOARDING_TYPOGRAPHY,
  ONBOARDING_SPACING,
  ONBOARDING_RADIUS,
} from './constants';
import { useBounceAnimation, useCardAnimation, useEntranceAnimation } from './useEntranceAnimation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Chat simulation states
const CHAT_STATES = {
  EMPTY: 'empty',
  USER_SENT: 'user_sent',
  AI_TYPING: 'ai_typing',
  AI_RESPONDED: 'ai_responded',
};

const USER_MESSAGE = "Create an estimate for John's kitchen remodel job";
const AI_RESPONSE = "Done! I've created estimate #EST-2024-042 for John's kitchen remodel. Total: $12,450. Would you like me to send it to him?";

export default function AIAssistantSlide({ isActive = true }) {
  const [chatState, setChatState] = useState(CHAT_STATES.EMPTY);
  const [showFeatures, setShowFeatures] = useState(false);

  // Entrance animations
  const titleAnim = useBounceAnimation(isActive, 0);
  const chatAnim = useCardAnimation(isActive, 200, true);

  // Feature animations (triggered after AI responds)
  const feature1Anim = useEntranceAnimation(showFeatures, 0);
  const feature2Anim = useEntranceAnimation(showFeatures, 100);
  const feature3Anim = useEntranceAnimation(showFeatures, 200);
  const quoteAnim = useEntranceAnimation(showFeatures, 350);

  // Chat simulation timeline
  useEffect(() => {
    if (!isActive) {
      setChatState(CHAT_STATES.EMPTY);
      setShowFeatures(false);
      return;
    }

    // Timeline:
    // 600ms - User message slides in
    // 1400ms - Typing indicator appears
    // 2800ms - AI starts typing response
    // ~5500ms - AI finishes, show features

    const timers = [];

    timers.push(setTimeout(() => {
      setChatState(CHAT_STATES.USER_SENT);
    }, 600));

    timers.push(setTimeout(() => {
      setChatState(CHAT_STATES.AI_TYPING);
    }, 1400));

    timers.push(setTimeout(() => {
      setChatState(CHAT_STATES.AI_RESPONDED);
    }, 2800));

    timers.push(setTimeout(() => {
      setShowFeatures(true);
    }, 5500));

    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [isActive]);

  return (
    <View style={styles.container}>
      {/* Title */}
      <Animated.View style={titleAnim}>
        <Text style={styles.title}>Your Business.</Text>
        <Text style={styles.titleAccent}>Voice Activated.</Text>
      </Animated.View>

      {/* Chat mockup */}
      <Animated.View style={[styles.chatContainer, chatAnim]}>
        {/* Chat header */}
        <View style={styles.chatHeader}>
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={20} color="#3B82F6" />
          </View>
          <View>
            <Text style={styles.aiName}>AI Assistant</Text>
            <Text style={styles.aiStatus}>Always available</Text>
          </View>
        </View>

        {/* Chat area with simulation */}
        <View style={styles.chatArea}>
          {/* User message - slides in from right */}
          {(chatState === CHAT_STATES.USER_SENT ||
            chatState === CHAT_STATES.AI_TYPING ||
            chatState === CHAT_STATES.AI_RESPONDED) && (
            <ChatBubble
              message={USER_MESSAGE}
              isUser={true}
              animated={true}
              delay={0}
            />
          )}

          {/* Typing indicator - bouncing dots */}
          {chatState === CHAT_STATES.AI_TYPING && (
            <View style={styles.typingContainer}>
              <View style={styles.aiIconSmall}>
                <Ionicons name="sparkles" size={12} color="#3B82F6" />
              </View>
              <TypingIndicator />
            </View>
          )}

          {/* AI response - types out character by character */}
          {chatState === CHAT_STATES.AI_RESPONDED && (
            <View style={styles.aiResponseContainer}>
              <View style={styles.aiIconSmall}>
                <Ionicons name="sparkles" size={12} color="#3B82F6" />
              </View>
              <View style={styles.aiBubble}>
                <TypewriterText
                  text={AI_RESPONSE}
                  style={styles.aiText}
                  speed={25}
                  delay={0}
                  isActive={chatState === CHAT_STATES.AI_RESPONDED}
                />
              </View>
            </View>
          )}
        </View>

        {/* Input hint */}
        <View style={styles.inputHint}>
          <Ionicons name="mic" size={18} color="#64748B" />
          <Text style={styles.inputText}>Type or speak your request...</Text>
        </View>
      </Animated.View>

      {/* Feature bullets - appear after AI responds */}
      <View style={styles.features}>
        <Animated.View style={feature1Anim}>
          <FeatureBullet
            icon="chatbubbles"
            title="Just say what you need"
            description="Natural language commands"
            iconColor="#60A5FA"
          />
        </Animated.View>
        <Animated.View style={feature2Anim}>
          <FeatureBullet
            icon="bulb"
            title="AI that knows your business"
            description="Your clients, your prices, your style"
            iconColor="#FBBF24"
          />
        </Animated.View>
        <Animated.View style={feature3Anim}>
          <FeatureBullet
            icon="flash"
            title="Actions, not just answers"
            description="It actually does the work for you"
            iconColor="#A78BFA"
          />
        </Animated.View>
      </View>

      {/* Quote - types out */}
      <Animated.View style={quoteAnim}>
        <TypewriterText
          text='"Like having a $100K assistant for the price of a coffee."'
          style={styles.quote}
          speed={30}
          isActive={showFeatures}
        />
      </Animated.View>
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
  chatContainer: {
    backgroundColor: ONBOARDING_COLORS.glassBg,
    borderRadius: ONBOARDING_RADIUS.card,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.border,
    padding: ONBOARDING_SPACING.cardPadding,
    marginBottom: 20,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: ONBOARDING_COLORS.border,
    marginBottom: 12,
  },
  aiAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${ONBOARDING_COLORS.primary}33`,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: ONBOARDING_COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  aiName: {
    ...ONBOARDING_TYPOGRAPHY.sectionTitle,
  },
  aiStatus: {
    fontSize: 12,
    color: ONBOARDING_COLORS.success,
  },
  chatArea: {
    minHeight: 140,
    gap: 12,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  aiIconSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `${ONBOARDING_COLORS.primary}33`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiResponseContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingRight: 20,
  },
  aiBubble: {
    flex: 1,
    backgroundColor: ONBOARDING_COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  aiText: {
    fontSize: 15,
    color: ONBOARDING_COLORS.textPrimary,
    lineHeight: 20,
  },
  inputHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ONBOARDING_COLORS.glassBg,
    borderRadius: ONBOARDING_RADIUS.input,
    padding: 12,
    marginTop: 12,
  },
  inputText: {
    fontSize: 14,
    color: ONBOARDING_COLORS.textTertiary,
  },
  features: {
    marginBottom: 16,
  },
  quote: {
    ...ONBOARDING_TYPOGRAPHY.caption,
  },
});
