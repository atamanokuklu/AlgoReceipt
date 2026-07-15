import { describe, expect, test } from 'vitest';
import { createDidKeyIdentity, resolveDidKey } from '../src/services/didKey.js';

describe('did:key identities', () => {
  test('creates and resolves an Ed25519 did:key document', () => {
    const identity = createDidKeyIdentity();
    const resolved = resolveDidKey(identity.did);

    expect(identity.did.startsWith('did:key:z')).toBe(true);
    expect(resolved.didDocument.id).toBe(identity.did);
    expect(resolved.publicJwk.x).toBe(identity.publicJwk.x);
    expect(resolved.didDocument.authentication[0]).toContain(identity.did);
  });
});
