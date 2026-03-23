/**
 * ProgressStepBar
 * Segmented progress bar for onboarding screens
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ProgressStepBar({ currentStep, totalSteps }) {
  return (
    <View style={styles.container}>
      <View style={styles.barRow}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepIndex = i + 1;
          const isCompleted = stepIndex < currentStep;
          const isCurrent = stepIndex === currentStep;

          return (
            <View
              key={i}
              style={[
                styles.segment,
                isCompleted && styles.completedSegment,
                isCurrent && styles.currentSegment,
                !isCompleted && !isCurrent && styles.upcomingSegment,
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.stepText}>Step {currentStep} of {totalSteps}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    marginBottom: 24,
  },
  barRow: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  completedSegment: {
    backgroundColor: '#2563EB',
  },
  currentSegment: {
    backgroundColor: '#2563EB',
    opacity: 0.4,
  },
  upcomingSegment: {
    backgroundColor: '#E2E8F0',
  },
  stepText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
    textAlign: 'right',
  },
});
