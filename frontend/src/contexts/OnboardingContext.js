/**
 * OnboardingContext
 * Provides onComplete callback to onboarding screens without passing through navigation params
 * This avoids React Navigation's non-serializable values warning
 */

import React, { createContext, useContext } from 'react';

const OnboardingContext = createContext(null);

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) {
    console.warn('useOnboarding called outside OnboardingProvider');
    return { onComplete: () => {} };
  }
  return context;
};

export const OnboardingProvider = ({ onComplete, onGoBack, children }) => {
  return (
    <OnboardingContext.Provider value={{ onComplete, onGoBack }}>
      {children}
    </OnboardingContext.Provider>
  );
};

export default OnboardingContext;
