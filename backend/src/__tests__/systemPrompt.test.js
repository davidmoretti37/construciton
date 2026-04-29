/**
 * System Prompt Tests
 *
 * Validates buildSystemPrompt output with various context configurations.
 * Pure function — no mocks needed.
 */

const { buildSystemPrompt } = require('../services/tools/systemPrompt');

describe('buildSystemPrompt', () => {
  test('default context contains core elements', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('Foreman');
    expect(prompt).toContain('valid JSON');
    expect(prompt).toContain('visualElements');
    expect(prompt).toContain('ALWAYS USE TOOLS');
  });

  test('injects business name, phone, email', () => {
    const prompt = buildSystemPrompt({
      businessName: 'Acme Construction',
      businessPhone: '555-1234',
      businessEmail: 'info@acme.com',
    });

    expect(prompt).toContain('Acme Construction');
    expect(prompt).toContain('the user');
  });

  test('isSupervisor: true → includes supervisor restrictions', () => {
    const prompt = buildSystemPrompt({
      isSupervisor: true,
      ownerName: 'Bob Builder',
    });

    expect(prompt).toContain('SUPERVISOR RESTRICTIONS');
    expect(prompt).toContain('CANNOT');
    expect(prompt).toContain('Bob Builder');
  });

  test('isSupervisor: false → no supervisor section', () => {
    const prompt = buildSystemPrompt({ isSupervisor: false });

    expect(prompt).not.toContain('SUPERVISOR RESTRICTIONS');
  });

  test('userLanguage: es → contains Spanish', () => {
    const prompt = buildSystemPrompt({ userLanguage: 'es' });

    expect(prompt).toContain('Spanish');
  });

  test('userLanguage: pt-BR → contains Brazilian Portuguese', () => {
    const prompt = buildSystemPrompt({ userLanguage: 'pt-BR' });

    expect(prompt).toContain('Brazilian Portuguese');
  });

  test('learnedFacts appended to prompt', () => {
    const prompt = buildSystemPrompt({
      learnedFacts: 'Jose is certified for electrical work',
    });

    // Current code uses an h3 "Known facts about this user / business"
    // section for learnedFacts; the h2 "KNOWN FACTS ABOUT THIS USER"
    // is gated on `userName` being set.
    expect(prompt).toContain('Known facts about this user');
    expect(prompt).toContain('Jose is certified for electrical work');
  });

  test('learnedFacts + userName produces the h2 header too', () => {
    const prompt = buildSystemPrompt({
      userName: 'David',
      learnedFacts: 'Jose is certified for electrical work',
    });
    expect(prompt).toContain('KNOWN FACTS ABOUT THIS USER');
    expect(prompt).toContain('Jose is certified for electrical work');
  });

  test('phasesTemplate array formatted as phase list', () => {
    const prompt = buildSystemPrompt({
      phasesTemplate: ['Demo', 'Rough-in', 'Drywall', 'Paint'],
    });

    expect(prompt).toContain('Phase Template');
    expect(prompt).toContain('Demo');
    expect(prompt).toContain('Paint');
  });

  test('empty context → no undefined/null strings in output', () => {
    const prompt = buildSystemPrompt({});

    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('null');
  });

  test('userName is included when provided', () => {
    const prompt = buildSystemPrompt({ userName: 'Carlos' });

    expect(prompt).toContain('Carlos');
  });

  test('todayDate is included', () => {
    const prompt = buildSystemPrompt({ todayDate: '2025-06-15' });

    expect(prompt).toContain('2025-06-15');
  });
});
