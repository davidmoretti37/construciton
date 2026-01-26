/**
 * AIAssistantSlide
 * Screen 5: AI Chat demo with typing animation
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { ChatBubble, TypingIndicator, FeatureBullet } from '../../../components/onboarding';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function AIAssistantSlide({ isActive }) {
  const [showTyping, setShowTyping] = useState(false);
  const [showAIResponse, setShowAIResponse] = useState(false);
  const containerOpacity = useSharedValue(0);
  const typingOpacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      containerOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));

      // Show typing indicator after user message
      const typingTimer = setTimeout(() => {
        setShowTyping(true);
        typingOpacity.value = withTiming(1, { duration: 300 });
      }, 1200);

      // Hide typing, show AI response
      const responseTimer = setTimeout(() => {
        setShowTyping(false);
        typingOpacity.value = withTiming(0, { duration: 200 });
        setShowAIResponse(true);
      }, 2200);

      return () => {
        clearTimeout(typingTimer);
        clearTimeout(responseTimer);
      };
    }
  }, [isActive]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const typingStyle = useAnimatedStyle(() => ({
    opacity: typingOpacity.value,
  }));

  return (
    <View style={styles.container}>
      {/* Title */}
      <Text style={styles.title}>Your Business.</Text>
      <Text style={styles.titleAccent}>Voice Activated.</Text>

      {/* Chat mockup */}
      <Animated.View style={[styles.chatContainer, containerStyle]}>
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

        {/* Chat area */}
        <View style={styles.chatArea}>
          {/* User message */}
          <ChatBubble
            message="Create an estimate for John's kitchen remodel job"
            isUser={true}
            delay={400}
            isActive={isActive}
          />

          {/* Typing indicator */}
          {showTyping && (
            <Animated.View style={[styles.typingContainer, typingStyle]}>
              <TypingIndicator />
            </Animated.View>
          )}

          {/* AI response */}
          {showAIResponse && (
            <ChatBubble
              message="Done! I've created estimate #EST-2024-042 for John's kitchen remodel. Total: $12,450. Would you like me to send it to him?"
              isUser={false}
              typewriter={true}
              typewriterDelay={0}
              delay={0}
              isActive={true}
            />
          )}
        </View>

        {/* Input hint */}
        <View style={styles.inputHint}>
          <Ionicons name="mic" size={18} color="#64748B" />
          <Text style={styles.inputText}>Type or speak your request...</Text>
        </View>
      </Animated.View>

      {/* Feature bullets */}
      <View style={styles.features}>
        <FeatureBullet
          icon="chatbubbles"
          title="Just say what you need"
          description="Natural language commands"
          delay={2800}
          isActive={isActive}
          iconColor="#60A5FA"
        />
        <FeatureBullet
          icon="bulb"
          title="AI that knows your business"
          description="Your clients, your prices, your style"
          delay={3000}
          isActive={isActive}
          iconColor="#FBBF24"
        />
        <FeatureBullet
          icon="flash"
          title="Actions, not just answers"
          description="It actually does the work for you"
          delay={3200}
          isActive={isActive}
          iconColor="#A78BFA"
        />
      </View>

      {/* Quote */}
      <Text style={styles.quote}>
        "Like having a $100K assistant for the price of a coffee."
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  titleAccent: {
    fontSize: 32,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 20,
  },
  chatContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    marginBottom: 20,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 12,
  },
  aiAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  aiName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  aiStatus: {
    fontSize: 12,
    color: '#34D399',
  },
  chatArea: {
    minHeight: 140,
    gap: 12,
  },
  typingContainer: {
    alignSelf: 'flex-start',
  },
  inputHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  inputText: {
    fontSize: 14,
    color: '#64748B',
  },
  features: {
    marginBottom: 16,
  },
  quote: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});
