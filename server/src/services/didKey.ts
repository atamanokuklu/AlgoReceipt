import { generateKeyPairSync } from 'node:crypto';
import { base58btc } from 'multiformats/bases/base58';

const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

export interface OkpPublicJwk {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
  alg?: 'EdDSA';
}

export interface OkpPrivateJwk extends OkpPublicJwk {
  d: string;
}

export interface DidVerificationMethod {
  id: string;
  type: 'Ed25519VerificationKey2020';
  controller: string;
  publicKeyMultibase: string;
}

export interface DidDocument {
  '@context': string[];
  id: string;
  verificationMethod: DidVerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
  capabilityInvocation: string[];
  capabilityDelegation: string[];
}

export interface DemoIdentity {
  did: string;
  kid: string;
  publicJwk: OkpPublicJwk;
  privateJwk: OkpPrivateJwk;
  didDocument: DidDocument;
}

export function createDidKeyIdentity(): DemoIdentity {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' }) as OkpPublicJwk;
  const privateJwk = privateKey.export({ format: 'jwk' }) as OkpPrivateJwk;

  const publicKeyBytes = Buffer.from(publicJwk.x, 'base64url');
  const prefixedBytes = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + publicKeyBytes.length);
  prefixedBytes.set(ED25519_MULTICODEC_PREFIX, 0);
  prefixedBytes.set(publicKeyBytes, ED25519_MULTICODEC_PREFIX.length);

  const fingerprint = base58btc.encode(prefixedBytes);
  const did = `did:key:${fingerprint}`;
  const kid = `${did}#${fingerprint}`;
  const didDocument = buildDidDocument(did, fingerprint);

  return {
    did,
    kid,
    publicJwk: { ...publicJwk, alg: 'EdDSA' },
    privateJwk: { ...privateJwk, alg: 'EdDSA' },
    didDocument
  };
}

export function resolveDidKey(did: string): Omit<DemoIdentity, 'privateJwk'> {
  if (!did.startsWith('did:key:z')) {
    throw new Error(`Unsupported DID: ${did}`);
  }

  const fingerprint = did.slice('did:key:'.length);
  const decoded = base58btc.decode(fingerprint);

  if (
    decoded[0] !== ED25519_MULTICODEC_PREFIX[0] ||
    decoded[1] !== ED25519_MULTICODEC_PREFIX[1]
  ) {
    throw new Error(`Unsupported did:key codec for ${did}`);
  }

  const publicKeyBytes = decoded.slice(ED25519_MULTICODEC_PREFIX.length);
  const publicJwk: OkpPublicJwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: Buffer.from(publicKeyBytes).toString('base64url'),
    alg: 'EdDSA'
  };

  return {
    did,
    kid: `${did}#${fingerprint}`,
    publicJwk,
    didDocument: buildDidDocument(did, fingerprint)
  };
}

function buildDidDocument(did: string, fingerprint: string): DidDocument {
  const verificationMethodId = `${did}#${fingerprint}`;

  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: did,
    verificationMethod: [
      {
        id: verificationMethodId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: fingerprint
      }
    ],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId],
    capabilityInvocation: [verificationMethodId],
    capabilityDelegation: [verificationMethodId]
  };
}
