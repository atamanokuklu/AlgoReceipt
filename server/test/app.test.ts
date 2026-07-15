import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { app } from '../src/app.js';

describe('demo API flow', () => {
  test('creates an identity, issues authorization, returns paywall, and simulates a receipt', async () => {
    const identityResponse = await request(app).post('/api/identity/demo').send({});
    expect(identityResponse.status).toBe(200);
    expect(identityResponse.body.agent.did).toMatch(/^did:key:z/);

    const authResponse = await request(app).post('/api/authorizations/issue').send({
      sessionId: identityResponse.body.sessionId,
      dailyCapUsd: 1
    });
    expect(authResponse.status).toBe(200);
    expect(authResponse.body.verification.valid).toBe(true);

    const paywallResponse = await request(app).post('/api/merchant/access').send({
      sessionId: identityResponse.body.sessionId,
      authorizationJwt: authResponse.body.authorizationJwt
    });
    expect(paywallResponse.status).toBe(402);
    expect(paywallResponse.body.x402.x402Version).toBe(1);
    expect(paywallResponse.body.x402.accepts[0].network).toBe('algorand:localnet');
    expect(paywallResponse.body.x402.accepts[0].extra.paymentMethod).toBe('algorand-payment');
    expect(typeof paywallResponse.body.note).toBe('string');

    const simulatedReceiptResponse = await request(app).post('/api/demo/simulate-receipt').send({
      sessionId: identityResponse.body.sessionId,
      authorizationJwt: authResponse.body.authorizationJwt
    });
    expect(simulatedReceiptResponse.status).toBe(200);
    expect(simulatedReceiptResponse.body.mode).toBe('offline-simulation');
    expect(simulatedReceiptResponse.body.verification.valid).toBe(true);
    expect(simulatedReceiptResponse.body.verification.payload.vc.credentialSubject.simulation).toBe(true);
  });
});

describe('GET /v1/market-data/ALGO-USD', () => {
  test('returns a 402 x402 payment challenge without any session', async () => {
    const response = await request(app).get('/v1/market-data/ALGO-USD');
    expect(response.status).toBe(402);
    expect(response.body.error).toBe('payment_required');
    expect(response.body.x402.x402Version).toBe(1);
    expect(response.body.x402.accepts[0].extra.paymentMethod).toBe('algorand-payment');
    expect(response.body.x402.accepts[0].network).toBe('algorand:localnet');
    expect(typeof response.body.note).toBe('string');
  });
});
