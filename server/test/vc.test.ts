import { describe, expect, test } from 'vitest';
import { createDidKeyIdentity } from '../src/services/didKey.js';
import { issueCredentialJwt, verifyCredentialJwt } from '../src/services/vc.js';

describe('VC JWT issuance and verification', () => {
  test('issues and verifies a signed credential', async () => {
    const issuer = createDidKeyIdentity();
    const subject = createDidKeyIdentity();
    const jwt = await issueCredentialJwt({
      issuer,
      subject: subject.did,
      credentialType: 'ExampleCredential',
      credentialSubject: {
        role: 'agent'
      }
    });

    const verification = await verifyCredentialJwt<{ role: string }>(jwt);

    expect(verification.valid).toBe(true);
    expect(verification.payload.iss).toBe(issuer.did);
    expect(verification.payload.sub).toBe(subject.did);
    expect(verification.payload.vc.type).toContain('ExampleCredential');
    expect(verification.payload.vc.credentialSubject.role).toBe('agent');
  });
});
