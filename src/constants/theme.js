// Light theme colors
export const LightColors = {
  // Primary Colors
  primaryBlue: '#2563EB',
  darkGray: '#1F2937',
  lightGray: '#F3F4F6',
  white: '#FFFFFF',

  // Status Colors
  successGreen: '#10B981',
  warningOrange: '#F59E0B',
  errorRed: '#EF4444',
  infoBlue: '#3B82F6',

  // Text Colors
  primaryText: '#1F2937',
  secondaryText: '#6B7280',
  placeholderText: '#9CA3AF',

  // Background Colors
  background: '#F9FAFB',
  cardBackground: '#FFFFFF',

  // Border Colors
  border: '#E5E7EB',
};

// Dark theme colors
export const DarkColors = {
  // Primary Colors
  primaryBlue: '#3B82F6',
  darkGray: '#E5E7EB',
  lightGray: '#1F2937',
  white: '#111827',

  // Status Colors
  successGreen: '#10B981',
  warningOrange: '#F59E0B',
  errorRed: '#EF4444',
  infoBlue: '#60A5FA',

  // Text Colors
  primaryText: '#F9FAFB',
  secondaryText: '#D1D5DB',
  placeholderText: '#6B7280',

  // Background Colors
  background: '#111827',
  cardBackground: '#1F2937',

  // Border Colors
  border: '#374151',
};

// Function to get colors based on theme
export const getColors = (isDark) => {
  try {
    if (isDark === true) {
      return DarkColors || LightColors;
    }
    return LightColors || DarkColors;
  } catch (error) {
    // Fallback to light colors if anything goes wrong
    return {
      primaryBlue: '#2563EB',
      darkGray: '#1F2937',
      lightGray: '#F3F4F6',
      white: '#FFFFFF',
      successGreen: '#10B981',
      warningOrange: '#F59E0B',
      errorRed: '#EF4444',
      infoBlue: '#3B82F6',
      primaryText: '#1F2937',
      secondaryText: '#6B7280',
      placeholderText: '#9CA3AF',
      background: '#F9FAFB',
      cardBackground: '#FFFFFF',
      border: '#E5E7EB',
    };
  }
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const FontSizes = {
  tiny: 12,
  small: 14,
  body: 16,
  subheader: 18,
  header: 24,
  large: 32,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 22,
};
