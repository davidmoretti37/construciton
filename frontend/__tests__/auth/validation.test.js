/**
 * Auth Validation Tests
 * Tests for password complexity and email validation
 */

// Password validation function (extracted from SignupScreen)
const validatePassword = (password) => {
  const checks = {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return { valid: passed >= 4, checks, score: passed };
};

// Email validation function
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

describe('Password Validation', () => {
  describe('validatePassword', () => {
    it('should reject passwords shorter than 12 characters', () => {
      const result = validatePassword('Short1!');
      expect(result.checks.length).toBe(false);
    });

    it('should accept passwords with 12+ characters', () => {
      const result = validatePassword('LongPassword1!');
      expect(result.checks.length).toBe(true);
    });

    it('should detect uppercase letters', () => {
      const withUpper = validatePassword('HasUppercase');
      const withoutUpper = validatePassword('nouppercase');
      expect(withUpper.checks.uppercase).toBe(true);
      expect(withoutUpper.checks.uppercase).toBe(false);
    });

    it('should detect lowercase letters', () => {
      const withLower = validatePassword('haslowercase');
      const withoutLower = validatePassword('NOLOWERCASE');
      expect(withLower.checks.lowercase).toBe(true);
      expect(withoutLower.checks.lowercase).toBe(false);
    });

    it('should detect numbers', () => {
      const withNumber = validatePassword('has123numbers');
      const withoutNumber = validatePassword('nonumbers');
      expect(withNumber.checks.number).toBe(true);
      expect(withoutNumber.checks.number).toBe(false);
    });

    it('should detect special characters', () => {
      const withSpecial = validatePassword('has!special');
      const withoutSpecial = validatePassword('nospecial');
      expect(withSpecial.checks.special).toBe(true);
      expect(withoutSpecial.checks.special).toBe(false);
    });

    it('should require at least 4 of 5 checks to pass', () => {
      // Only 3 checks: length, lowercase, number
      const weak = validatePassword('weakpassword1');
      expect(weak.valid).toBe(false);
      expect(weak.score).toBe(3);

      // 4 checks: length, uppercase, lowercase, number
      const strong = validatePassword('StrongPass123');
      expect(strong.valid).toBe(true);
      expect(strong.score).toBe(4);

      // 5 checks: all
      const veryStrong = validatePassword('VeryStrong123!');
      expect(veryStrong.valid).toBe(true);
      expect(veryStrong.score).toBe(5);
    });

    it('should handle empty password', () => {
      const result = validatePassword('');
      expect(result.valid).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should handle password with only special characters', () => {
      const result = validatePassword('!@#$%^&*()');
      expect(result.checks.special).toBe(true);
      expect(result.checks.uppercase).toBe(false);
      expect(result.checks.lowercase).toBe(false);
      expect(result.checks.number).toBe(false);
    });
  });
});

describe('Email Validation', () => {
  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.uk')).toBe(true);
      expect(validateEmail('user+tag@example.org')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('notanemail')).toBe(false);
      expect(validateEmail('missing@domain')).toBe(false);
      expect(validateEmail('@nodomain.com')).toBe(false);
      expect(validateEmail('spaces in@email.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });

    it('should reject emails with multiple @ symbols', () => {
      expect(validateEmail('test@@example.com')).toBe(false);
      expect(validateEmail('test@exam@ple.com')).toBe(false);
    });
  });
});
