import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import AnimatedText from '../../components/AnimatedText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

export default function WelcomeScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const handleContinue = () => {
    navigation.navigate('TradeSelection');
  };

  const handleDevLogout = async () => {
    Alert.alert(
      'Dev Logout',
      'This will log you out and clear all data so you can test the sign-in flow. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.auth.signOut();
              await AsyncStorage.clear();
              console.log('Dev logout complete - reloading...');
            } catch (error) {
              console.error('Dev logout error:', error);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* DEV: Logout button in top-right corner */}
      <TouchableOpacity
        style={styles.devLogoutButton}
        onPress={handleDevLogout}
      >
        <Ionicons name="log-out-outline" size={24} color={Colors.error} />
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '20' }]}>
          <Ionicons name="construct" size={80} color={Colors.primaryBlue} />
        </View>

        {/* Welcome Text */}
        <View style={styles.textContainer}>
          <AnimatedText
            text="Welcome to Construction Manager"
            delay={40}
            style={[styles.title, { color: Colors.primaryText }]}
          />
          <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
            Let's set up your business so you can start sending estimates instantly
          </Text>
        </View>

        {/* Features */}
        <View style={styles.featuresContainer}>
          <View style={styles.feature}>
            <Ionicons name="flash-outline" size={24} color={Colors.success} />
            <Text style={[styles.featureText, { color: Colors.primaryText }]}>
              Instant AI-powered estimates
            </Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="calculator-outline" size={24} color={Colors.success} />
            <Text style={[styles.featureText, { color: Colors.primaryText }]}>
              Automatic pricing calculations
            </Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="send-outline" size={24} color={Colors.success} />
            <Text style={[styles.featureText, { color: Colors.primaryText }]}>
              Send via SMS or WhatsApp
            </Text>
          </View>

          <View style={styles.feature}>
            <Ionicons name="time-outline" size={24} color={Colors.success} />
            <Text style={[styles.featureText, { color: Colors.primaryText }]}>
              5-minute setup
            </Text>
          </View>
        </View>

        {/* Continue Button */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          <View style={styles.progressDots}>
            <View style={[styles.dot, styles.activeDot, { backgroundColor: Colors.primaryBlue }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
          </View>
          <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
            Step 1 of 4
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
  devLogoutButton: {
    position: 'absolute',
    top: Spacing.xl,
    right: Spacing.xl,
    zIndex: 999,
    padding: Spacing.sm,
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
