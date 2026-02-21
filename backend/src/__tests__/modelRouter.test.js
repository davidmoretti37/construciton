const { selectModel, getModelStats, trackUsage, getUsageStats, TOOL_THRESHOLD, ERROR_THRESHOLD } = require('../services/modelRouter');

describe('selectModel', () => {
  test('selects haiku for low tool count', () => {
    const result = selectModel(5);
    expect(result.model).toBe('claude-haiku-4.5');
    expect(result.toolCount).toBe(5);
  });

  test('selects sonnet at threshold (>= 10)', () => {
    expect(TOOL_THRESHOLD).toBe(10);
    const result = selectModel(10, []);
    expect(result.model).toBe('claude-sonnet-4.5');
  });

  test('selects sonnet above threshold', () => {
    const result = selectModel(12, []);
    expect(result.model).toBe('claude-sonnet-4.5');
    expect(result.toolCount).toBe(12);
  });

  test('falls back to sonnet after repeated errors', () => {
    expect(ERROR_THRESHOLD).toBe(2);
    const errorHistory = [
      { role: 'user', content: 'do something' },
      { role: 'assistant', content: 'I apologize for the error' },
      { role: 'user', content: 'try again' },
      { role: 'assistant', content: 'I was unable to process that' },
    ];
    const result = selectModel(3, errorHistory);
    expect(result.model).toBe('claude-sonnet-4.5');
    expect(result.reason).toContain('error');
  });

  test('stays on haiku if errors are below threshold', () => {
    const history = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'I apologize for the confusion' },
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'Here are your invoices' },
    ];
    // Only 1 error message in last 4, below ERROR_THRESHOLD of 2
    const result = selectModel(5, history);
    expect(result.model).toBe('claude-haiku-4.5');
  });

  test('stays on haiku with no error history', () => {
    const history = [
      { role: 'assistant', content: 'Here are your projects' },
      { role: 'user', content: 'Thanks' },
    ];
    const result = selectModel(5, history);
    expect(result.model).toBe('claude-haiku-4.5');
  });

  test('works with no conversation history argument', () => {
    const result = selectModel(3);
    expect(result.model).toBe('claude-haiku-4.5');
  });
});

describe('trackUsage and getUsageStats', () => {
  test('getUsageStats returns expected shape', () => {
    const stats = getUsageStats();
    expect(stats).toHaveProperty('totalRequests');
    expect(stats).toHaveProperty('haikuRequests');
    expect(stats).toHaveProperty('sonnetRequests');
    expect(stats).toHaveProperty('estimatedInputTokens');
    expect(stats).toHaveProperty('estimatedOutputTokens');
    expect(stats).toHaveProperty('estimatedCost');
    expect(typeof stats.totalRequests).toBe('number');
  });

  test('trackUsage increments counters', () => {
    const before = getUsageStats();
    trackUsage('claude-haiku-4.5', 100, 50);
    const after = getUsageStats();
    expect(after.totalRequests).toBe(before.totalRequests + 1);
    expect(after.haikuRequests).toBe(before.haikuRequests + 1);
    expect(after.estimatedInputTokens).toBe(before.estimatedInputTokens + 100);
  });

  test('trackUsage tracks sonnet separately', () => {
    const before = getUsageStats();
    trackUsage('claude-sonnet-4.5', 200, 100);
    const after = getUsageStats();
    expect(after.sonnetRequests).toBe(before.sonnetRequests + 1);
  });
});

describe('getModelStats', () => {
  test('returns zeros for empty history', () => {
    const stats = getModelStats([]);
    expect(stats.haikuCount).toBe(0);
    expect(stats.sonnetCount).toBe(0);
    expect(stats.haikuPercentage).toBe(0);
    expect(stats.sonnetPercentage).toBe(0);
    expect(stats.avgToolCount).toBe(0);
  });

  test('returns zeros for null/undefined history', () => {
    const stats = getModelStats(null);
    expect(stats.haikuCount).toBe(0);
  });

  test('calculates percentages correctly', () => {
    const history = [
      { model: 'claude-haiku-4.5', toolCount: 5 },
      { model: 'claude-haiku-4.5', toolCount: 3 },
      { model: 'claude-sonnet-4.5', toolCount: 12 },
    ];
    const stats = getModelStats(history);
    expect(stats.haikuCount).toBe(2);
    expect(stats.sonnetCount).toBe(1);
    expect(stats.haikuPercentage).toBe(67);
  });

  test('correctly calculates stats from 4-entry history', () => {
    const history = [
      { model: 'claude-haiku-4.5', toolCount: 5 },
      { model: 'claude-haiku-4.5', toolCount: 3 },
      { model: 'claude-sonnet-4.5', toolCount: 15 },
      { model: 'claude-haiku-4.5', toolCount: 4 },
    ];
    const stats = getModelStats(history);
    expect(stats.haikuCount).toBe(3);
    expect(stats.sonnetCount).toBe(1);
    expect(stats.haikuPercentage).toBe(75);
    expect(stats.sonnetPercentage).toBe(25);
    expect(stats.avgToolCount).toBe(6.8); // (5+3+15+4)/4 = 6.75 rounded to 6.8
  });
});

describe('getUsageStats additional checks', () => {
  test('getUsageStats returns a copy (not a reference)', () => {
    const stats1 = getUsageStats();
    const stats2 = getUsageStats();
    expect(stats1).not.toBe(stats2);
    expect(stats1).toEqual(stats2);
  });
});
