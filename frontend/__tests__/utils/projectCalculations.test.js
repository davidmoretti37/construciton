/**
 * Project Calculation Tests
 * Tests for project completion percentage and DB transformation
 */

// Mock dependencies that projects.js imports
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    })),
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'test-user' } } })),
    },
  },
}));

jest.mock('../../src/utils/storage/auth', () => ({
  getCurrentUserId: jest.fn(() => Promise.resolve('test-user')),
}));

jest.mock('../../src/utils/storage/workerTasks', () => ({
  validateWorkingDays: jest.fn(),
}));

jest.mock('../../src/services/subscriptionService', () => ({
  __esModule: true,
  default: {
    checkFeatureLimit: jest.fn(() => Promise.resolve({ allowed: true })),
  },
}));

import {
  calculateTimeBasedCompletion,
  transformProjectFromDB,
} from '../../src/utils/storage/projects';

describe('Project Calculations', () => {
  // ============================================================
  // calculateTimeBasedCompletion Tests
  // ============================================================
  describe('calculateTimeBasedCompletion', () => {
    // Mock Date for consistent testing
    const RealDate = Date;

    beforeAll(() => {
      // Mock today as 2024-06-15
      global.Date = class extends RealDate {
        constructor(...args) {
          if (args.length === 0) {
            return new RealDate(2024, 5, 15); // June 15, 2024
          }
          return new RealDate(...args);
        }
      };
      global.Date.now = () => new RealDate(2024, 5, 15).getTime();
    });

    afterAll(() => {
      global.Date = RealDate;
    });

    it('returns 0 for null/undefined dates', () => {
      expect(calculateTimeBasedCompletion(null, null)).toBe(0);
      expect(calculateTimeBasedCompletion(undefined, '2024-12-31')).toBe(0);
      expect(calculateTimeBasedCompletion('2024-01-01', null)).toBe(0);
    });

    it('returns 0 for future start date', () => {
      // Start is in the future (July 2024, today is June 15, 2024)
      const result = calculateTimeBasedCompletion('2024-07-01', '2024-12-31');
      expect(result).toBe(0);
    });

    it('returns 100 for past end date', () => {
      // Project ended in the past
      const result = calculateTimeBasedCompletion('2024-01-01', '2024-05-01');
      expect(result).toBe(100);
    });

    it('returns approximately 50% at midpoint', () => {
      // Project: Jan 1 to Dec 31 (365 days)
      // Today: June 15 (approximately midpoint)
      const result = calculateTimeBasedCompletion('2024-01-01', '2024-12-31');
      // June 15 is day ~166 of 365 = ~45%
      expect(result).toBeGreaterThan(40);
      expect(result).toBeLessThan(55);
    });

    it('handles malformed date strings gracefully', () => {
      // Function parses dates and may return NaN or calculated values
      // depending on how the string splits - verify it doesn't crash
      const result1 = calculateTimeBasedCompletion('invalid', '2024-12-31');
      const result2 = calculateTimeBasedCompletion('2024-01-01', 'bad-date');
      // Results should be numbers (may be NaN or 0)
      expect(typeof result1).toBe('number');
      expect(typeof result2).toBe('number');
    });

    it('returns 0 when start equals end (zero duration)', () => {
      const result = calculateTimeBasedCompletion('2024-06-15', '2024-06-15');
      expect(result).toBe(0);
    });

    it('handles reversed dates (end before start)', () => {
      const result = calculateTimeBasedCompletion('2024-12-31', '2024-01-01');
      expect(result).toBe(0);
    });
  });

  // ============================================================
  // transformProjectFromDB Tests
  // ============================================================
  describe('transformProjectFromDB', () => {
    it('calculates profit correctly (income - expenses)', () => {
      const dbProject = {
        id: 'p1',
        name: 'Test Project',
        income_collected: 5000,
        expenses: 3000,
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.profit).toBe(2000);
      expect(result.incomeCollected).toBe(5000);
      expect(result.expenses).toBe(3000);
    });

    it('calculates negative profit when expenses exceed income', () => {
      const dbProject = {
        id: 'p1',
        name: 'Test Project',
        income_collected: 2000,
        expenses: 5000,
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.profit).toBe(-3000);
    });

    it('detects over-budget status when expenses exceed contract', () => {
      const dbProject = {
        id: 'p1',
        name: 'Test Project',
        contract_amount: 10000,
        expenses: 12000,
        status: 'active',
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.status).toBe('over-budget');
    });

    it('detects behind schedule status when days_remaining < 0', () => {
      const dbProject = {
        id: 'p1',
        name: 'Test Project',
        contract_amount: 10000,
        expenses: 5000,
        days_remaining: -5,
        status: 'active',
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.status).toBe('behind');
      expect(result.daysRemaining).toBe(-5);
    });

    it('returns on-track for active project within budget and schedule', () => {
      const dbProject = {
        id: 'p1',
        name: 'Test Project',
        contract_amount: 10000,
        expenses: 5000,
        days_remaining: 30,
        status: 'active',
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.status).toBe('on-track');
    });

    it('preserves draft/completed/archived status without override', () => {
      const completed = transformProjectFromDB({
        id: 'p1',
        name: 'Test',
        status: 'completed',
        expenses: 15000,
        contract_amount: 10000, // would be over-budget if active
      });
      expect(completed.status).toBe('completed');

      const draft = transformProjectFromDB({
        id: 'p2',
        name: 'Test',
        status: 'draft',
      });
      expect(draft.status).toBe('draft');

      const archived = transformProjectFromDB({
        id: 'p3',
        name: 'Test',
        status: 'archived',
      });
      expect(archived.status).toBe('archived');
    });

    it('handles null/undefined financial values', () => {
      const dbProject = {
        id: 'p1',
        name: 'Empty Project',
        // No financial fields
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.profit).toBe(0);
      expect(result.incomeCollected).toBe(0);
      expect(result.expenses).toBe(0);
      expect(result.contractAmount).toBe(0);
    });

    it('uses budget as fallback for contract_amount', () => {
      const dbProject = {
        id: 'p1',
        name: 'Test',
        budget: 15000,
        // No contract_amount
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.contractAmount).toBe(15000);
      expect(result.budget).toBe(15000);
    });

    it('uses spent as fallback for expenses', () => {
      const dbProject = {
        id: 'p1',
        name: 'Test',
        spent: 5000,
        // No expenses
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.expenses).toBe(5000);
      expect(result.spent).toBe(5000);
    });

    it('transforms DB field names to app format', () => {
      const dbProject = {
        id: 'project-123',
        name: 'Kitchen Remodel',
        client: 'John Doe',
        client_phone: '555-1234',
        client_email: 'john@example.com',
        contract_amount: 50000,
        income_collected: 25000,
        expenses: 15000,
        start_date: '2024-01-01',
        end_date: '2024-06-30',
        location: '123 Main St',
        status: 'active',
        days_remaining: 45,
        actual_progress: 60,
        working_days: [1, 2, 3, 4, 5],
        has_phases: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-03-01T00:00:00Z',
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.id).toBe('project-123');
      expect(result.name).toBe('Kitchen Remodel');
      expect(result.client).toBe('John Doe');
      expect(result.clientPhone).toBe('555-1234');
      expect(result.clientEmail).toBe('john@example.com');
      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe('2024-06-30');
      expect(result.percentComplete).toBe(60);
      expect(result.hasPhases).toBe(true);
      expect(result.workingDays).toEqual([1, 2, 3, 4, 5]);
    });

    it('handles invalid days_remaining (non-numeric)', () => {
      const dbProject = {
        id: 'p1',
        name: 'Test',
        days_remaining: 'invalid',
        status: 'active',
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.daysRemaining).toBeNull();
    });

    it('defaults working days to Mon-Fri if not specified', () => {
      const dbProject = {
        id: 'p1',
        name: 'Test',
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.workingDays).toEqual([1, 2, 3, 4, 5]);
    });

    it('uses actual_progress for percentComplete', () => {
      const dbProject = {
        id: 'p1',
        name: 'Test',
        actual_progress: 75,
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.percentComplete).toBe(75);
    });

    it('defaults percentComplete to 0 if actual_progress not set', () => {
      const dbProject = {
        id: 'p1',
        name: 'Test',
      };
      const result = transformProjectFromDB(dbProject);

      expect(result.percentComplete).toBe(0);
    });
  });
});
