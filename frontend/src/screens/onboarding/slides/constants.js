/**
 * Onboarding Shared Constants
 * Extracted from PricingSlide.js - the gold standard
 */

// Colors matching PricingSlide exactly
export const ONBOARDING_COLORS = {
  // Backgrounds
  glassBg: 'rgba(255, 255, 255, 0.05)',
  glassBgSubtle: 'rgba(255, 255, 255, 0.03)',

  // Borders
  border: 'rgba(255, 255, 255, 0.1)',
  borderSubtle: 'rgba(255, 255, 255, 0.05)',
  borderSelected: 'rgba(59, 130, 246, 1)',
  divider: 'rgba(255, 255, 255, 0.2)',

  // Text
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#CBD5E1',
  textTertiary: '#64748B',

  // Accents
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  primaryLight: '#60A5FA',
  cyan: '#06B6D4',
  success: '#34D399',
  warning: '#FBBF24',
  error: '#EF4444',
  purple: '#A78BFA',

  // Background gradient
  bgGradient: ['#0A0F1A', '#0F172A', '#1A1F3A'],
};

// Typography matching PricingSlide exactly
export const ONBOARDING_TYPOGRAPHY = {
  // Screen title (fontSize: 28 from pricing)
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
  },

  // Subtitle
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
  },

  // Section title (benefits header)
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F8FAFC',
  },

  // Body text
  body: {
    fontSize: 15,
    color: '#94A3B8',
  },

  bodySmall: {
    fontSize: 14,
    color: '#CBD5E1',
  },

  // Caption / quote style (matching pricing trust footer)
  caption: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },

  // Button text
  button: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
};

// Spacing matching PricingSlide exactly
export const ONBOARDING_SPACING = {
  screenPaddingHorizontal: 24,
  screenPaddingTop: 20,
  screenPaddingBottom: 40,
  headerMarginBottom: 20,
  sectionGap: 24,
  cardPadding: 20,
  itemGap: 10,
};

// Border radius matching PricingSlide exactly
export const ONBOARDING_RADIUS = {
  card: 16,
  button: 14,
  badge: 8,
  input: 12,
};

// Shadows matching PricingSlide exactly
export const ONBOARDING_SHADOWS = {
  // Button shadow (from ShimmerButton)
  button: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  // Glow effect (from PricingCard selected state)
  glow: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 20,
  },

  // Phone mockup shadow
  phoneMockup: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 15,
  },
};

// Animation config matching PricingSlide exactly
export const ONBOARDING_ANIMATIONS = {
  // Spring config
  spring: { damping: 15 },
  springBouncy: { damping: 10 },

  // Entrance timing
  entranceDelay: 200,
  entranceDuration: 400,

  // Stagger delay for lists
  stagger: 80,
  staggerBase: 100,
};

// Gradient presets for consistent styling
export const ONBOARDING_GRADIENTS = {
  // Primary CTA button gradient (blue to cyan)
  button: ['#3B82F6', '#06B6D4'],
  // Headline gradient text
  headline: ['#3B82F6', '#06B6D4', '#60A5FA'],
  // Background gradient
  background: ['#0A0F1A', '#0F172A', '#1A1F3A'],
};
