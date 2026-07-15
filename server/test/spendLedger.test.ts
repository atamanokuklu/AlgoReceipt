import { describe, expect, test } from 'vitest';
import { SpendLedger } from '../src/services/spendLedger.js';

describe('SpendLedger', () => {
  test('tracks usage and enforces daily caps', () => {
    const ledger = new SpendLedger();
    const did = 'did:key:zExample';
    ledger.assertCanSpend(did, 0.05, 0.1);
    expect(ledger.recordSpend(did, 0.05)).toBe(0.05);
    expect(ledger.getUsedToday(did)).toBe(0.05);
    expect(() => ledger.assertCanSpend(did, 0.06, 0.1)).toThrow(/Daily cap exceeded/);
  });
});
