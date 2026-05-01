/**
 * Memory extractor tests — deterministic logic (path building, fact
 * validation). Live LLM extraction is exercised end-to-end in chat;
 * here we just verify the structural pieces.
 */

const { isValidFact, pathForFact } = require('../services/agent/memoryExtractor');

describe('PEV memory extractor — deterministic logic', () => {
  describe('isValidFact', () => {
    test('accepts well-formed fact', () => {
      expect(isValidFact({ kind: 'team', subject: 'lana', fact: 'Lana is supervisor' })).toBe(true);
      expect(isValidFact({ kind: 'pricing', subject: 'tax_rate', fact: 'User charges 8.75%' })).toBe(true);
    });
    test('rejects unknown kind', () => {
      expect(isValidFact({ kind: 'gossip', subject: 'x', fact: 'y' })).toBe(false);
    });
    test('rejects empty fields', () => {
      expect(isValidFact({ kind: 'team', subject: '', fact: 'x' })).toBe(false);
      expect(isValidFact({ kind: 'team', subject: 'x', fact: '' })).toBe(false);
    });
    test('rejects null / non-object', () => {
      expect(isValidFact(null)).toBe(false);
      expect(isValidFact('string')).toBe(false);
      expect(isValidFact(undefined)).toBe(false);
    });
  });

  describe('pathForFact', () => {
    test('builds filesystem-like path from kind + subject', () => {
      expect(pathForFact({ kind: 'team', subject: 'lana' })).toBe('/team/lana.md');
      expect(pathForFact({ kind: 'pricing', subject: 'tax_rate' })).toBe('/pricing/tax_rate.md');
    });
    test('sanitizes special characters in subject', () => {
      expect(pathForFact({ kind: 'team', subject: 'Lana Moretti!' })).toBe('/team/lana_moretti_.md');
      expect(pathForFact({ kind: 'workflow', subject: 'invoice/SMS' })).toBe('/workflow/invoice_sms.md');
    });
    test('truncates long subjects', () => {
      const long = 'a'.repeat(100);
      const p = pathForFact({ kind: 'team', subject: long });
      expect(p.length).toBeLessThanOrEqual('/team/.md'.length + 40);
    });
  });
});
