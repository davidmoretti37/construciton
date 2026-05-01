/**
 * Plan-level constitutional rule tests. Pure logic, no LLM calls.
 *
 * These rules are the structural safety net for the bug class that
 * motivated the PEV rebuild — the LLM picking the wrong tools to
 * satisfy a CO request and decomposing it into expense + phase.
 */

const { evaluatePlan } = require('../services/constitution');

describe('Plan-level constitutional rules', () => {
  describe('no_change_order_decomposition', () => {
    test('blocks plan that uses create_project_phase for a CO request', () => {
      const r = evaluatePlan({
        userMessage: 'add a change order to John for 200sf bath tile at $8/sf for two more days',
        plan: {
          goal: 'create CO',
          steps: [
            { id: 's1', tool: 'search_projects', args: { q: 'John' }, depends_on: [] },
            { id: 's2', tool: 'create_project_phase', args: { project_id: '...', phase_name: 'Bath tile' }, depends_on: ['s1'] },
            { id: 's3', tool: 'record_expense', args: { amount: 1600 }, depends_on: ['s1'] },
          ],
        },
      });
      expect(r.blocked).toBeTruthy();
      expect(r.blocked.rule).toBe('no_change_order_decomposition');
      expect(r.blocked.reason).toMatch(/create_project_phase|record_expense/);
    });

    test('allows plan that uses create_change_order (correct tool)', () => {
      const r = evaluatePlan({
        userMessage: 'add a change order to John for 200sf bath tile',
        plan: {
          goal: 'create CO',
          steps: [
            { id: 's1', tool: 'search_projects', args: {}, depends_on: [] },
            { id: 's2', tool: 'create_change_order', args: {}, depends_on: ['s1'] },
          ],
        },
      });
      expect(r.ok).toBe(true);
    });

    test('does not fire when message has no CO keywords', () => {
      const r = evaluatePlan({
        userMessage: 'add a phase to the Smith project',
        plan: {
          goal: 'add phase',
          steps: [{ id: 's1', tool: 'create_project_phase', args: {}, depends_on: [] }],
        },
      });
      expect(r.ok).toBe(true);
    });

    test('catches "extra work" / "scope change" trigger phrases', () => {
      const r = evaluatePlan({
        userMessage: 'log this extra work as $1500 for the kitchen project',
        plan: {
          goal: 'log expense',
          steps: [{ id: 's1', tool: 'record_expense', args: { amount: 1500 }, depends_on: [] }],
        },
      });
      expect(r.blocked).toBeTruthy();
      expect(r.blocked.rule).toBe('no_change_order_decomposition');
    });
  });

  describe('no_raw_contract_mutation', () => {
    test('blocks update_project that mutates contract_amount', () => {
      const r = evaluatePlan({
        userMessage: 'bump the contract by $5k on Smith',
        plan: {
          goal: 'increase contract',
          steps: [
            { id: 's1', tool: 'update_project', args: { project_id: 'p1', contract_amount: 35000 }, depends_on: [] },
          ],
        },
      });
      expect(r.blocked).toBeTruthy();
      expect(r.blocked.rule).toBe('no_raw_contract_mutation');
    });

    test('allows update_project for non-contract fields', () => {
      const r = evaluatePlan({
        userMessage: 'change Smith status to in-progress',
        plan: {
          goal: 'update status',
          steps: [
            { id: 's1', tool: 'update_project', args: { project_id: 'p1', status: 'in_progress' }, depends_on: [] },
          ],
        },
      });
      expect(r.ok).toBe(true);
    });
  });
});
