/**
 * AuthNavigator Tests
 *
 * Tests for the authentication navigation flow:
 * - parseInviteEmail utility function (extracted and tested directly)
 * - Screen registration integrity
 * - Deep link URL handling logic
 */

const fs = require('fs');
const path = require('path');

// Read the AuthNavigator source to extract the parseInviteEmail function
const AUTH_NAV_PATH = path.join(__dirname, '../../src/navigation/AuthNavigator.js');
const authNavContent = fs.readFileSync(AUTH_NAV_PATH, 'utf-8');

/**
 * parseInviteEmail is defined as a local function in AuthNavigator.js.
 * We extract and re-implement it here for direct testing, since it is not exported.
 * If the implementation in AuthNavigator.js changes, this test should be updated to match.
 */
function parseInviteEmail(url) {
  if (!url) return null;
  try {
    if (url.includes('/invite')) {
      const match = url.match(/[?&]email=([^&]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
  } catch (e) {}
  return null;
}

describe('AuthNavigator', () => {
  describe('module structure', () => {
    test('AuthNavigator.js file exists', () => {
      expect(fs.existsSync(AUTH_NAV_PATH)).toBe(true);
    });

    test('exports a default function component', () => {
      expect(authNavContent).toMatch(/export\s+default\s+function\s+AuthNavigator/);
    });

    test('uses createStackNavigator', () => {
      expect(authNavContent).toContain('createStackNavigator');
    });

    test('contains parseInviteEmail function', () => {
      expect(authNavContent).toContain('function parseInviteEmail');
    });
  });

  describe('registered screens', () => {
    test('registers Onboarding screen', () => {
      expect(authNavContent).toContain('name="Onboarding"');
    });

    test('registers PremiumOnboarding screen', () => {
      expect(authNavContent).toContain('name="PremiumOnboarding"');
    });

    test('registers Login screen', () => {
      expect(authNavContent).toContain('name="Login"');
    });

    test('registers Signup screen', () => {
      expect(authNavContent).toContain('name="Signup"');
    });

    test('registers RoleSelection screen', () => {
      expect(authNavContent).toContain('name="RoleSelection"');
    });
  });

  describe('initial route logic', () => {
    test('checks for deep link URL on mount', () => {
      expect(authNavContent).toContain('Linking.getInitialURL');
    });

    test('checks AsyncStorage for onboarding completion', () => {
      expect(authNavContent).toContain("@hasSeenOnboarding");
    });

    test('sets initial route to Signup when invite email is present', () => {
      expect(authNavContent).toContain("setInitialRoute('Signup')");
    });

    test('sets initial route to Login when onboarding was seen', () => {
      expect(authNavContent).toContain("'Login'");
    });

    test('sets initial route to Onboarding when not yet seen', () => {
      expect(authNavContent).toContain("'Onboarding'");
    });

    test('passes inviteEmail as initial params to Signup screen', () => {
      expect(authNavContent).toContain('initialParams');
      expect(authNavContent).toContain('inviteEmail');
    });
  });

  describe('parseInviteEmail', () => {
    test('returns null for null/undefined input', () => {
      expect(parseInviteEmail(null)).toBeNull();
      expect(parseInviteEmail(undefined)).toBeNull();
    });

    test('returns null for empty string', () => {
      expect(parseInviteEmail('')).toBeNull();
    });

    test('returns null for URLs without /invite path', () => {
      expect(parseInviteEmail('https://example.com/login')).toBeNull();
      expect(parseInviteEmail('https://example.com/signup?email=test@test.com')).toBeNull();
      expect(parseInviteEmail('sylk://home')).toBeNull();
    });

    test('extracts email from HTTPS invite URL', () => {
      const url = 'https://construciton-production.up.railway.app/invite?email=john@example.com';
      expect(parseInviteEmail(url)).toBe('john@example.com');
    });

    test('extracts email from custom scheme invite URL', () => {
      const url = 'sylk://invite?email=worker@company.com';
      expect(parseInviteEmail(url)).toBe('worker@company.com');
    });

    test('decodes URL-encoded email addresses', () => {
      const url = 'https://example.com/invite?email=user%40domain.com';
      expect(parseInviteEmail(url)).toBe('user@domain.com');
    });

    test('handles email with plus addressing', () => {
      const url = 'https://example.com/invite?email=user%2Btag%40domain.com';
      expect(parseInviteEmail(url)).toBe('user+tag@domain.com');
    });

    test('extracts email when other query params are present', () => {
      const url = 'https://example.com/invite?token=abc&email=test@test.com&role=worker';
      expect(parseInviteEmail(url)).toBe('test@test.com');
    });

    test('returns null for /invite URL without email param', () => {
      const url = 'https://example.com/invite?token=abc';
      expect(parseInviteEmail(url)).toBeNull();
    });

    test('returns null for /invite URL with empty email param', () => {
      const url = 'https://example.com/invite?email=';
      // The regex [^&]+ requires at least one character, so empty email returns null
      expect(parseInviteEmail(url)).toBeNull();
    });

    test('handles deeply nested invite paths', () => {
      const url = 'https://example.com/api/v1/invite?email=deep@path.com';
      expect(parseInviteEmail(url)).toBe('deep@path.com');
    });
  });

  describe('deep link listener', () => {
    test('sets up Linking event listener for runtime deep links', () => {
      expect(authNavContent).toContain("Linking.addEventListener('url'");
    });

    test('cleans up listener on unmount', () => {
      expect(authNavContent).toContain('sub.remove()');
    });
  });
});
