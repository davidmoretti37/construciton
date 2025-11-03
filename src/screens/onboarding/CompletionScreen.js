import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { completeOnboarding } from '../../utils/storage';

export default function CompletionScreen({ navigation, onComplete }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  useEffect(() => {
    // Mark onboarding as complete
    completeOnboarding();
  }, []);

  const handleStart = () => {
    // Call the onComplete callback to switch to main app
    if (onComplete) {
      onComplete();
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={styles.content}>
        {/* Success Animation/Icon */}
        <View style={[styles.iconContainer, { backgroundColor: Colors.success + '20' }]}>
          <Ionicons name="checkmark-circle" size={120} color={Colors.success} />
        </View>

        {/* Success Message */}
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            All Set! 🎉
          </Text>
          <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
            Your business is configured and ready to go. Start creating estimates in seconds with AI assistance.
          </Text>
        </View>

        {/* Features Recap */}
        <View style={styles.featuresContainer}>
          <View style={styles.feature}>
            <View style={[styles.featureIcon, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name="flash" size={20} color={Colors.primaryBlue} />
            </View>
            <Text style={[styles.featureText, { color: Colors.primaryText }]}>
              AI knows your pricing
            </Text>
          </View>

          <View style={styles.feature}>
            <View style={[styles.featureIcon, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name="calculator" size={20} color={Colors.primaryBlue} />
            </View>
            <Text style={[styles.featureText, { color: Colors.primaryText }]}>
              Automatic calculations
            </Text>
          </View>

          <View style={styles.feature}>
            <View style={[styles.featureIcon, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name="send" size={20} color={Colors.primaryBlue} />
            </View>
            <Text style={[styles.featureText, { color: Colors.primaryText }]}>
              One-tap sending
            </Text>
          </View>
        </View>

        {/* Start Button */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleStart}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Start Using the App</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Tips */}
        <View style={[styles.tipBox, { backgroundColor: Colors.lightGray }]}>
          <Ionicons name="bulb-outline" size={16} color={Colors.secondaryText} />
          <Text style={[styles.tipText, { color: Colors.secondaryText }]}>
            Try saying: "Create an estimate for John - 500 sq ft interior painting"
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSizes.large,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    lineHeight: 24,
  },
  featuresContainer: {
    width: '100%',
    marginBottom: Spacing.xxl,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    paddingLeft: Spacing.lg,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: FontSizes.body,
    marginLeft: Spacing.md,
    flex: 1,
    fontWeight: '500',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  tipBox: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  tipText: {
    flex: 1,
    fontSize: FontSizes.tiny,
    lineHeight: 18,
  },
});
