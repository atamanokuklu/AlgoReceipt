import { randomUUID } from 'node:crypto';
import {
  SignJWT,
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  type JWTPayload,
  type ProtectedHeaderParameters
} from 'jose';
import { resolveDidKey, type DemoIdentity } from './didKey.js';

export interface CredentialEnvelope<TSubject extends object> {
  '@context': string[];
  type: string[];
  credentialSubject: { id: string } & TSubject;
}

export interface CredentialJwtPayload<TSubject extends object> extends JWTPayload {
  vc: CredentialEnvelope<TSubject>;
}

export interface VerifiedCredential<TSubject extends object> {
  valid: boolean;
  payload: CredentialJwtPayload<TSubject>;
  protectedHeader: ProtectedHeaderParameters;
  issuerDocument: ReturnType<typeof resolveDidKey>['didDocument'];
}

export async function issueCredentialJwt<TSubject extends object>(input: {
  issuer: DemoIdentity;
  subject: string;
  credentialType: string;
  credentialSubject: TSubject;
  expiresInSeconds?: number;
}): Promise<string> {
  const key = await importJWK(input.issuer.privateJwk, 'EdDSA');
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    vc: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', input.credentialType],
      credentialSubject: {
        id: input.subject,
        ...input.credentialSubject
      }
    }
  } satisfies CredentialJwtPayload<TSubject>)
    .setProtectedHeader({
      alg: 'EdDSA',
      typ: 'JWT',
      kid: input.issuer.kid
    })
    .setIssuer(input.issuer.did)
    .setSubject(input.subject)
    .setJti(`urn:uuid:${randomUUID()}`)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + (input.expiresInSeconds ?? 60 * 60))
    .sign(key);
}

export async function verifyCredentialJwt<TSubject extends object>(
  jwt: string
): Promise<VerifiedCredential<TSubject>> {
  const header = decodeProtectedHeader(jwt);
  const decoded = decodeJwt(jwt);

  if (typeof decoded.iss !== 'string') {
    throw new Error('Credential is missing an issuer DID');
  }

  const issuer = resolveDidKey(decoded.iss);
  const key = await importJWK(issuer.publicJwk, 'EdDSA');
  const verification = await jwtVerify(jwt, key, { issuer: issuer.did });

  return {
    valid: true,
    protectedHeader: header,
    payload: verification.payload as CredentialJwtPayload<TSubject>,
    issuerDocument: issuer.didDocument
  };
}
