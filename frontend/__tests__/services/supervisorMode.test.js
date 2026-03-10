/**
 * Supervisor Mode Section Tests
 *
 * Validates that the AI prompt generator correctly restricts
 * supervisor actions and includes proper context.
 */

import { getSupervisorModeSection } from '../../src/services/agents/prompts/supervisorModeSection';

describe('getSupervisorModeSection', () => {
  test('returns empty string for non-supervisor context', () => {
    expect(getSupervisorModeSection({ isSupervisorMode: false })).toBe('');
  });

  test('returns empty string for null context', () => {
    expect(getSupervisorModeSection(null)).toBe('');
    expect(getSupervisorModeSection(undefined)).toBe('');
  });

  test('returns restriction text for supervisor context', () => {
    const result = getSupervisorModeSection({
      isSupervisorMode: true,
      ownerInfo: { business_name: 'Acme Construction' },
    });

    expect(result).toContain('SUPERVISOR MODE');
    expect(result).toContain('Acme Construction');
    expect(result).toContain('CANNOT');
    expect(result).toContain('estimates');
    expect(result).toContain('invoices');
  });

  test('falls back to "Your Owner" when no business_name', () => {
    const result = getSupervisorModeSection({
      isSupervisorMode: true,
      ownerInfo: {},
    });

    expect(result).toContain('Your Owner');
    expect(result).not.toContain('undefined');
  });

  test('includes worker pay rate restrictions', () => {
    const result = getSupervisorModeSection({
      isSupervisorMode: true,
      ownerInfo: { business_name: 'Test Co' },
    });

    expect(result).toContain('hourly_rate');
    expect(result).toContain('NEVER mention');
  });

  test('includes action generation rules', () => {
    const result = getSupervisorModeSection({
      isSupervisorMode: true,
      ownerInfo: { business_name: 'Test Co' },
    });

    expect(result).toContain('NEVER generate');
    expect(result).toContain('create-estimate');
    expect(result).toContain('create-invoice');
    expect(result).toContain('create-project');
  });
});
