/**
 * Time Tracking Payment Calculation Tests
 * Tests for worker payment calculations by payment type
 */

// Mock supabase and related dependencies
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    })),
  },
}));

jest.mock('../../src/utils/storage/auth', () => ({
  getCurrentUserId: jest.fn(() => Promise.resolve('test-user')),
}));

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/services/agents/core/CacheService', () => ({
  responseCache: {
    invalidateAll: jest.fn(),
  },
}));

import {
  calculateHourlyPayment,
  calculateDailyPayment,
  calculateWeeklyPayment,
  calculateProjectBasedPayment,
} from '../../src/utils/storage/timeTracking';

describe('Worker Payment Calculations', () => {
  // ============================================================
  // Hourly Payment Tests
  // ============================================================
  describe('calculateHourlyPayment', () => {
    it('should calculate correct amount for single entry', () => {
      const entries = [{
        hours: 8,
        project_id: 'p1',
        projects: { name: 'Project A' },
        date: '2024-01-15'
      }];
      const result = calculateHourlyPayment(entries, 25);

      expect(result.totalAmount).toBe(200); // 8 * 25
      expect(result.totalDays).toBe(1);
      expect(result.byProject).toHaveLength(1);
      expect(result.byProject[0].hours).toBe(8);
      expect(result.byProject[0].amount).toBe(200);
    });

    it('should handle multiple entries across projects', () => {
      const entries = [
        { hours: 4, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' },
        { hours: 4, project_id: 'p2', projects: { name: 'Project B' }, date: '2024-01-15' }
      ];
      const result = calculateHourlyPayment(entries, 25);

      expect(result.totalAmount).toBe(200); // (4 + 4) * 25
      expect(result.byProject).toHaveLength(2);
      expect(result.byProject[0].amount).toBe(100);
      expect(result.byProject[1].amount).toBe(100);
    });

    it('should handle multiple days', () => {
      const entries = [
        { hours: 8, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' },
        { hours: 8, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-16' }
      ];
      const result = calculateHourlyPayment(entries, 25);

      expect(result.totalAmount).toBe(400); // 16 * 25
      expect(result.totalDays).toBe(2);
      expect(result.byDate).toHaveLength(2);
    });

    it('should return 0 for empty entries', () => {
      const result = calculateHourlyPayment([], 25);

      expect(result.totalAmount).toBe(0);
      expect(result.totalDays).toBe(0);
      expect(result.byProject).toHaveLength(0);
    });

    it('should handle null hourly rate', () => {
      const entries = [{ hours: 8, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' }];
      const result = calculateHourlyPayment(entries, null);

      expect(result.totalAmount).toBe(0);
    });

    it('should handle decimal hours', () => {
      const entries = [{
        hours: 8.5,
        project_id: 'p1',
        projects: { name: 'Project A' },
        date: '2024-01-15'
      }];
      const result = calculateHourlyPayment(entries, 20);

      expect(result.totalAmount).toBe(170); // 8.5 * 20
    });

    it('should aggregate same project across multiple entries', () => {
      const entries = [
        { hours: 4, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' },
        { hours: 4, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' }
      ];
      const result = calculateHourlyPayment(entries, 25);

      expect(result.byProject).toHaveLength(1);
      expect(result.byProject[0].hours).toBe(8);
      expect(result.byProject[0].amount).toBe(200);
      expect(result.byProject[0].sessions).toHaveLength(2);
    });
  });

  // ============================================================
  // Daily Payment Tests
  // ============================================================
  describe('calculateDailyPayment', () => {
    it('should pay full day rate for 5+ hours', () => {
      const entries = [{ hours: 6, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' }];
      const result = calculateDailyPayment(entries, 200);

      expect(result.totalAmount).toBe(200);
      expect(result.byDate[0].dayType).toBe('full');
    });

    it('should pay half day rate for under 5 hours', () => {
      const entries = [{ hours: 3, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' }];
      const result = calculateDailyPayment(entries, 200);

      expect(result.totalAmount).toBe(100); // 200 * 0.5
      expect(result.byDate[0].dayType).toBe('half');
    });

    it('should pay exactly at 5 hour threshold as full day', () => {
      const entries = [{ hours: 5, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' }];
      const result = calculateDailyPayment(entries, 200);

      expect(result.totalAmount).toBe(200);
      expect(result.byDate[0].dayType).toBe('full');
    });

    it('should pay for each unique day worked', () => {
      const entries = [
        { hours: 8, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' },
        { hours: 8, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-16' }
      ];
      const result = calculateDailyPayment(entries, 200);

      expect(result.totalAmount).toBe(400); // 2 full days
      expect(result.totalDays).toBe(2);
    });

    it('should sum hours across same day for threshold calculation', () => {
      // Two 3-hour sessions on same day = 6 hours = full day
      const entries = [
        { hours: 3, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' },
        { hours: 3, project_id: 'p2', projects: { name: 'Project B' }, date: '2024-01-15' }
      ];
      const result = calculateDailyPayment(entries, 200);

      expect(result.totalAmount).toBe(200); // Full day (6 hours total)
      expect(result.totalDays).toBe(1);
      expect(result.byDate[0].dayType).toBe('full');
    });

    it('should distribute day amount proportionally across projects', () => {
      const entries = [
        { hours: 4, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' },
        { hours: 4, project_id: 'p2', projects: { name: 'Project B' }, date: '2024-01-15' }
      ];
      const result = calculateDailyPayment(entries, 200);

      // 8 hours total = full day ($200)
      // Each project gets 50% = $100
      expect(result.byProject).toHaveLength(2);
      expect(result.byProject[0].amount).toBe(100);
      expect(result.byProject[1].amount).toBe(100);
    });

    it('should return 0 for empty entries', () => {
      const result = calculateDailyPayment([], 200);

      expect(result.totalAmount).toBe(0);
      expect(result.totalDays).toBe(0);
    });

    it('should handle null daily rate', () => {
      const entries = [{ hours: 8, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' }];
      const result = calculateDailyPayment(entries, null);

      expect(result.totalAmount).toBe(0);
    });
  });

  // ============================================================
  // Weekly Payment Tests
  // ============================================================
  describe('calculateWeeklyPayment', () => {
    it('should calculate payment for full week', () => {
      const entries = [
        { hours: 8, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' }
      ];
      const result = calculateWeeklyPayment(entries, 1000, '2024-01-15', '2024-01-21');

      expect(result.totalAmount).toBe(1000); // 7 days = 1 week
      expect(result.weeksWorked).toBe(1);
    });

    it('should round up partial weeks', () => {
      const entries = [];
      const result = calculateWeeklyPayment(entries, 1000, '2024-01-15', '2024-01-25');

      // 10 days = ceil(10/7) = 2 weeks
      expect(result.totalAmount).toBe(2000);
      expect(result.weeksWorked).toBe(2);
    });

    it('should calculate for exactly 2 weeks', () => {
      const entries = [];
      const result = calculateWeeklyPayment(entries, 1000, '2024-01-01', '2024-01-14');

      // 14 days = 2 weeks
      expect(result.totalAmount).toBe(2000);
      expect(result.weeksWorked).toBe(2);
    });

    it('should handle null weekly salary', () => {
      const entries = [];
      const result = calculateWeeklyPayment(entries, null, '2024-01-15', '2024-01-21');

      expect(result.totalAmount).toBe(0);
    });

    it('should track hours by project even for weekly workers', () => {
      const entries = [
        { hours: 20, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' },
        { hours: 20, project_id: 'p2', projects: { name: 'Project B' }, date: '2024-01-16' }
      ];
      const result = calculateWeeklyPayment(entries, 1000, '2024-01-15', '2024-01-21');

      expect(result.byProject).toHaveLength(2);
      expect(result.byProject[0].hours).toBe(20);
      expect(result.byProject[1].hours).toBe(20);
    });
  });

  // ============================================================
  // Project-Based Payment Tests
  // ============================================================
  describe('calculateProjectBasedPayment', () => {
    it('should return 0 for automatic calculation (manual milestone tracking)', () => {
      const entries = [
        { hours: 40, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' }
      ];
      const result = calculateProjectBasedPayment(entries, 5000);

      // Project-based workers are paid per milestone, not automatically
      expect(result.totalAmount).toBe(0);
      expect(result.note).toContain('milestone');
    });

    it('should track hours by project', () => {
      const entries = [
        { hours: 20, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' },
        { hours: 20, project_id: 'p2', projects: { name: 'Project B' }, date: '2024-01-16' }
      ];
      const result = calculateProjectBasedPayment(entries, 5000);

      expect(result.byProject).toHaveLength(2);
      expect(result.byProject[0].hours).toBe(20);
      expect(result.byProject[1].hours).toBe(20);
    });

    it('should count unique days worked', () => {
      const entries = [
        { hours: 8, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' },
        { hours: 8, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-16' },
        { hours: 8, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-17' }
      ];
      const result = calculateProjectBasedPayment(entries, 5000);

      expect(result.totalDays).toBe(3);
    });
  });

  // ============================================================
  // Edge Cases
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle missing project name gracefully', () => {
      const entries = [{ hours: 8, project_id: 'p1', projects: null, date: '2024-01-15' }];
      const result = calculateHourlyPayment(entries, 25);

      expect(result.byProject[0].projectName).toBe('Unknown Project');
    });

    it('should handle zero hours', () => {
      const entries = [{ hours: 0, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' }];
      const result = calculateHourlyPayment(entries, 25);

      expect(result.totalAmount).toBe(0);
    });

    it('should handle very large hour values', () => {
      const entries = [{ hours: 1000, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' }];
      const result = calculateHourlyPayment(entries, 25);

      expect(result.totalAmount).toBe(25000);
    });

    it('should handle very small hour values', () => {
      const entries = [{ hours: 0.25, project_id: 'p1', projects: { name: 'Project A' }, date: '2024-01-15' }];
      const result = calculateHourlyPayment(entries, 100);

      expect(result.totalAmount).toBe(25); // 0.25 * 100
    });
  });
});
