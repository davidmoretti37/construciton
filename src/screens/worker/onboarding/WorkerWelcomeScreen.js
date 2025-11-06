import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';

export default function WorkerWelcomeScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const handleContinue = () => {
    navigation.navigate('WorkerInfo');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={styles.content}>
        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: '#059669' + '20' }]}>
          <Ionicons name="hammer" size={80} color="#059669" />
        </View>

        {/* Welcome Text */}
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            Welcome, Worker!
          </Text>
          <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
            Let's set up your profile so you can start tracking your work
          </Text>
        </View>

        {/* Features */}
        <View style={styles.featuresContainer}>
          <View style={styles.feature}>
            <Ionicons name="time-outline" size={24} color="#059669" />
            <Text style={[styles.featureText, { color: Colors.primaryText }]}>
              Clock in/out with location tracking
            </Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="briefcase-outline" size={24} color="#059669" />
            <Text style={[styles.featureText, { color: Colors.primaryText }]}>
              View your project assignments
            </Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="calendar-outline" size={24} color="#059669" />
            <Text style={[styles.featureText, { color: Colors.primaryText }]}>
              Track your hours and timesheet
            </Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="chatbubble-outline" size={24} color="#059669" />
            <Text style={[styles.featureText, { color: Colors.primaryText }]}>
              Message your contractor
            </Text>
          </View>
        </View>

        {/* Continue Button */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#059669' }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          <View style={styles.progressDots}>
            <View style={[styles.dot, styles.activeDot, { backgroundColor: '#059669' }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
          </View>
          <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
            Step 1 of 3
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
    width: 160,
    height: 160,
    borderRadius: 80,
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
  featureText: {
    fontSize: FontSizes.body,
    marginLeft: Spacing.md,
    flex: 1,
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
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  progressContainer: {
    marginTop: Spacing.xxl,
    alignItems: 'center',
  },
  progressDots: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 24,
  },
  progressText: {
    fontSize: FontSizes.small,
  },
});
