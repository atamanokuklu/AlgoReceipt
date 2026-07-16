import { randomUUID } from 'node:crypto';
import type { PaymentRequiredV1 } from '@x402/core/types';
import algosdk from 'algosdk';
import { algodBaseUrl, settings } from '../config.js';
import { ApiError } from '../errors.js';
import { type DemoSession } from './demoSessions.js';
import { createDidKeyIdentity, type DemoIdentity } from './didKey.js';
import { getDispenserAccount } from './kmdService.js';
import { SpendLedger } from './spendLedger.js';
import {
  issueCredentialJwt,
  verifyCredentialJwt,
  type VerifiedCredential
} from './vc.js';

const DEMO_RESOURCE = {
  resourceId: 'market-data-algo-usd',
  path: '/v1/market-data/ALGO-USD',
  description: 'ALGO/USD paid market snapshot',
  requestAmountUsd: 0.05,
  amountMicroAlgos: 100000,
  asset: 'ALGO',
  network: 'algorand:localnet'
} as const;

export interface SpendAuthorizationClaims {
  controllerDid: string;
  merchantDid: string;
  merchantPaymentAddress: string;
  resourcePath: string;
  description: string;
  dailyCapUsd: number;
  requestAmountUsd: number;
  usedTodayUsd: number;
  remainingDailyCapUsd: number;
  currency: 'USD';
  network: string;
  validOn: string;
}

export interface ReceiptClaims {
  controllerDid: string;
  merchantDid: string;
  merchantPaymentAddress: string;
  resourcePath: string;
  description: string;
  amountUsd: number;
  amountMicroAlgos: number;
  asset: string;
  network: string;
  paymentTxId: string;
  settlementMode: 'live-algod-verified' | 'offline-simulation';
  simulation: boolean;
  proof: {
    confirmedRound?: number;
    roundTime?: number;
    senderAddress?: string;
    receiverAddress: string;
    feeMicroAlgos?: number;
    note?: string;
    verifier: 'algod' | 'demo-simulation';
    message: string;
  };
}

export interface PaymentProof {
  txId: string;
  amountMicroAlgos: number;
  confirmedRound: number;
  roundTime?: number;
  senderAddress?: string;
  receiverAddress: string;
  feeMicroAlgos?: number;
  note?: string;
}

export class MerchantService {
  private readonly merchantIdentity: DemoIdentity = createDidKeyIdentity();
  private readonly treasuryAddress = algosdk.generateAccount().addr.toString();
  private readonly ledger = new SpendLedger();
  private readonly settledPaymentTxIds = new Set<string>();
  private readonly algod = new algosdk.Algodv2(
    settings.ALGOD_TOKEN,
    settings.ALGOD_SERVER,
    settings.ALGOD_PORT
  );

  getOffer() {
    return {
      ...DEMO_RESOURCE,
      merchantDid: this.merchantIdentity.did,
      merchantPaymentAddress: this.treasuryAddress
    };
  }

  getUsedToday(subjectDid: string): number {
    return this.ledger.getUsedToday(subjectDid);
  }

  async getStatus() {
    try {
      const status = await this.algod.status().do();
      return {
        merchantDid: this.merchantIdentity.did,
        merchantPaymentAddress: this.treasuryAddress,
        offer: this.getOffer(),
        algod: {
          reachable: true,
          mode: 'live',
          url: algodBaseUrl,
          tokenConfigured: settings.ALGOD_TOKEN.length > 0,
          lastRound: Number(status.lastRound ?? 0)
        }
      };
    } catch (error) {
      return {
        merchantDid: this.merchantIdentity.did,
        merchantPaymentAddress: this.treasuryAddress,
        offer: this.getOffer(),
        algod: {
          reachable: false,
          mode: 'offline',
          url: algodBaseUrl,
          tokenConfigured: settings.ALGOD_TOKEN.length > 0,
          message: error instanceof Error ? error.message : 'Unable to reach algod'
        }
      };
    }
  }

  async issueAuthorization(session: DemoSession, dailyCapUsd: number) {
    const usedTodayUsd = this.ledger.getUsedToday(session.agent.did);
    this.ledger.assertCanSpend(session.agent.did, DEMO_RESOURCE.requestAmountUsd, dailyCapUsd);

    const remainingDailyCapUsd = roundCurrency(dailyCapUsd - usedTodayUsd);
    const claims: SpendAuthorizationClaims = {
      controllerDid: session.controller.did,
      merchantDid: this.merchantIdentity.did,
      merchantPaymentAddress: this.treasuryAddress,
      resourcePath: DEMO_RESOURCE.path,
      description: DEMO_RESOURCE.description,
      dailyCapUsd: roundCurrency(dailyCapUsd),
      requestAmountUsd: DEMO_RESOURCE.requestAmountUsd,
      usedTodayUsd,
      remainingDailyCapUsd,
      currency: 'USD',
      network: DEMO_RESOURCE.network,
      validOn: todayString()
    };

    const jwt = await issueCredentialJwt({
      issuer: session.controller,
      subject: session.agent.did,
      credentialType: 'SpendAuthorizationCredential',
      credentialSubject: claims
    });

    const verification = await verifyCredentialJwt<SpendAuthorizationClaims>(jwt);

    return {
      authorizationJwt: jwt,
      verification,
      capStatus: {
        usedTodayUsd,
        requestAmountUsd: DEMO_RESOURCE.requestAmountUsd,
        dailyCapUsd,
        remainingAfterRequestUsd: roundCurrency(
          dailyCapUsd - usedTodayUsd - DEMO_RESOURCE.requestAmountUsd
        )
      }
    };
  }

  async createPaymentRequired(session: DemoSession, authorizationJwt: string) {
    const authorization = await this.validateAuthorization(session, authorizationJwt);

    return {
      error: 'payment_required',
      message: 'Submit a valid Algorand payment transaction id to unlock the resource.',
      requestId: randomUUID(),
      note: 'Send a confirmed Algorand payment of the required microAlgo amount to the merchant address, then POST back with paymentTxId set to the confirmed transaction id.',
      x402: this.buildX402Offer(authorization)
    };
  }

  private buildX402Offer(authorization: ValidatedAuthorization): PaymentRequiredV1 {
    return {
      x402Version: 1,
      accepts: [
        {
          scheme: 'exact',
          network: DEMO_RESOURCE.network,
          maxAmountRequired: String(DEMO_RESOURCE.amountMicroAlgos),
          resource: DEMO_RESOURCE.path,
          description: DEMO_RESOURCE.description,
          mimeType: 'application/json',
          outputSchema: {},
          payTo: this.treasuryAddress,
          maxTimeoutSeconds: 300,
          asset: DEMO_RESOURCE.asset,
          extra: {
            paymentMethod: 'algorand-payment',
            receiptFormat: 'vc-jwt',
            settleEndpoint: '/api/merchant/access',
            merchantDid: this.merchantIdentity.did,
            authorization: {
              type: 'SpendAuthorizationCredential',
              verified: authorization.verification.valid,
              issuer: authorization.verification.payload.iss,
              remainingDailyCapUsd: authorization.remainingDailyCapUsd
            }
          }
        }
      ]
    };
  }

  async settleLive(session: DemoSession, authorizationJwt: string, paymentTxId: string) {
    const status = await this.getStatus();
    if (!status.algod.reachable) {
      throw new ApiError(
        503,
        'Live settlement is unavailable because algod is unreachable. Use the clearly labeled offline simulation instead.'
      );
    }

    const normalizedTxId = paymentTxId.trim().toUpperCase();
    const authorization = await this.validateAuthorization(session, authorizationJwt);
    const pendingTransaction = await this.awaitConfirmedTransaction(normalizedTxId);
    const proof = this.extractLivePaymentProof(normalizedTxId, pendingTransaction);

    if (proof.receiverAddress !== this.treasuryAddress) {
      throw new ApiError(400, 'Transaction receiver does not match the merchant payment address.');
    }

    if (proof.amountMicroAlgos < DEMO_RESOURCE.amountMicroAlgos) {
      throw new ApiError(
        400,
        `Transaction amount ${proof.amountMicroAlgos} is below the required ${DEMO_RESOURCE.amountMicroAlgos} microAlgos.`
      );
    }

    this.assertPaymentNotSettled(normalizedTxId);
    const totalUsedUsd = this.ledger.recordSpend(session.agent.did, DEMO_RESOURCE.requestAmountUsd);
    const receipt = await this.issueReceipt(session, authorization, {
      paymentTxId: normalizedTxId,
      settlementMode: 'live-algod-verified',
      simulation: false,
      proof: {
        confirmedRound: proof.confirmedRound,
        roundTime: proof.roundTime,
        senderAddress: proof.senderAddress,
        receiverAddress: proof.receiverAddress,
        feeMicroAlgos: proof.feeMicroAlgos,
        note: proof.note,
        verifier: 'algod',
        message: `Verified against algod at ${algodBaseUrl}`
      }
    });
    this.settledPaymentTxIds.add(normalizedTxId);

    return {
      mode: 'live-algod-verified',
      totalUsedTodayUsd: totalUsedUsd,
      livePayment: proof,
      ...receipt
    };
  }

  async simulateSettlement(session: DemoSession, authorizationJwt: string) {
    const authorization = await this.validateAuthorization(session, authorizationJwt);
    const simulatedTxId = `SIM-${randomUUID()}`;
    const totalUsedUsd = this.ledger.recordSpend(session.agent.did, DEMO_RESOURCE.requestAmountUsd);
    const receipt = await this.issueReceipt(session, authorization, {
      paymentTxId: simulatedTxId,
      settlementMode: 'offline-simulation',
      simulation: true,
      proof: {
        receiverAddress: this.treasuryAddress,
        verifier: 'demo-simulation',
        message: 'Demo-only receipt. No algod verification or on-chain settlement was performed.'
      }
    });

    return {
      mode: 'offline-simulation',
      totalUsedTodayUsd: totalUsedUsd,
      ...receipt
    };
  }

  async verifyCredential(jwt: string) {
    return verifyCredentialJwt<object>(jwt);
  }

  // ── Local agent funding & payment ─────────────────────────────────────

  async getAgentBalance(session: DemoSession) {
    const info = await this.algod.accountInformation(session.agentAlgoAddress).do();
    const microAlgos = Number(info.amount ?? 0);
    return {
      address: session.agentAlgoAddress,
      balanceMicroAlgos: microAlgos,
      balanceAlgos: microAlgos / 1_000_000,
      merchantAddress: this.treasuryAddress,
      requiredMicroAlgos: DEMO_RESOURCE.amountMicroAlgos
    };
  }

  async fundAgent(session: DemoSession) {
    const status = await this.getStatus();
    if (!status.algod.reachable) {
      throw new ApiError(503, 'algod is unreachable — start AlgoKit LocalNet first.');
    }

    const dispenser = await getDispenserAccount();
    const suggestedParams = await this.algod.getTransactionParams().do();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: dispenser.addr,
      receiver: session.agentAlgoAddress,
      amount: 2_000_000, // 2 ALGO covers the fee and the 0.1 ALGO resource payment
      suggestedParams
    });

    const signed = txn.signTxn(dispenser.sk);
    const { txid } = await this.algod.sendRawTransaction(signed).do();
    await algosdk.waitForConfirmation(this.algod, txid, 5);

    return {
      txId: txid,
      fundedAddress: session.agentAlgoAddress,
      amountMicroAlgos: 2_000_000,
      loraUrl: `https://lora.algokit.io/localnet/transaction/${txid}`
    };
  }

  async submitAgentPayment(session: DemoSession, authorizationJwt: string) {
    const status = await this.getStatus();
    if (!status.algod.reachable) {
      throw new ApiError(503, 'algod is unreachable — start AlgoKit LocalNet first.');
    }

    await this.validateAuthorization(session, authorizationJwt);

    const suggestedParams = await this.algod.getTransactionParams().do();
    const encoder = new TextEncoder();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: session.agentAlgoAddress,
      receiver: this.treasuryAddress,
      amount: DEMO_RESOURCE.amountMicroAlgos,
      note: encoder.encode(`x402:${DEMO_RESOURCE.path}`),
      suggestedParams
    });

    const signed = txn.signTxn(session.agentAlgoSk);
    const { txid } = await this.algod.sendRawTransaction(signed).do();
    await algosdk.waitForConfirmation(this.algod, txid, 5);

    return {
      txId: txid,
      senderAddress: session.agentAlgoAddress,
      receiverAddress: this.treasuryAddress,
      amountMicroAlgos: DEMO_RESOURCE.amountMicroAlgos,
      loraUrl: `https://lora.algokit.io/localnet/transaction/${txid}`
    };
  }

  private async issueReceipt(
    session: DemoSession,
    authorization: ValidatedAuthorization,
    input: {
      paymentTxId: string;
      settlementMode: 'live-algod-verified' | 'offline-simulation';
      simulation: boolean;
      proof: ReceiptClaims['proof'];
    }
  ) {
    const claims: ReceiptClaims = {
      controllerDid: session.controller.did,
      merchantDid: this.merchantIdentity.did,
      merchantPaymentAddress: this.treasuryAddress,
      resourcePath: DEMO_RESOURCE.path,
      description: DEMO_RESOURCE.description,
      amountUsd: DEMO_RESOURCE.requestAmountUsd,
      amountMicroAlgos: DEMO_RESOURCE.amountMicroAlgos,
      asset: DEMO_RESOURCE.asset,
      network: DEMO_RESOURCE.network,
      paymentTxId: input.paymentTxId,
      settlementMode: input.settlementMode,
      simulation: input.simulation,
      proof: input.proof
    };

    const receiptJwt = await issueCredentialJwt({
      issuer: this.merchantIdentity,
      subject: session.agent.did,
      credentialType: 'PaymentReceiptCredential',
      credentialSubject: claims
    });

    const verification = await verifyCredentialJwt<ReceiptClaims>(receiptJwt);

    return {
      authorizationSummary: {
        issuerDid: authorization.verification.payload.iss,
        subjectDid: authorization.verification.payload.sub,
        remainingDailyCapUsd: authorization.remainingDailyCapUsd
      },
      receiptJwt,
      verification
    };
  }

  private async validateAuthorization(
    session: DemoSession,
    authorizationJwt: string
  ): Promise<ValidatedAuthorization> {
    const verification = await verifyCredentialJwt<SpendAuthorizationClaims>(authorizationJwt);
    const subject = verification.payload.sub;
    const issuer = verification.payload.iss;
    const claims = verification.payload.vc?.credentialSubject;

    if (!claims) {
      throw new ApiError(400, 'Authorization VC is missing a credentialSubject.');
    }

    if (subject !== session.agent.did) {
      throw new ApiError(400, 'Authorization subject does not match the active demo agent.');
    }

    if (issuer !== session.controller.did) {
      throw new ApiError(400, 'Authorization issuer does not match the session controller DID.');
    }

    if (claims.merchantDid !== this.merchantIdentity.did) {
      throw new ApiError(400, 'Authorization was not issued for this merchant DID.');
    }

    if (claims.merchantPaymentAddress !== this.treasuryAddress) {
      throw new ApiError(400, 'Authorization merchant payment address does not match this merchant.');
    }

    if (claims.resourcePath !== DEMO_RESOURCE.path) {
      throw new ApiError(400, 'Authorization does not match the protected resource path.');
    }

    if (claims.requestAmountUsd !== DEMO_RESOURCE.requestAmountUsd) {
      throw new ApiError(400, 'Authorization amount does not match the protected resource price.');
    }

    if (claims.validOn !== todayString()) {
      throw new ApiError(400, 'Authorization is not valid for today.');
    }

    this.ledger.assertCanSpend(session.agent.did, claims.requestAmountUsd, claims.dailyCapUsd);

    return {
      verification,
      remainingDailyCapUsd: roundCurrency(
        claims.dailyCapUsd - this.ledger.getUsedToday(session.agent.did) - claims.requestAmountUsd
      )
    };
  }

  private extractLivePaymentProof(paymentTxId: string, raw: unknown): PaymentProof {
    const transaction = (raw as { txn?: { txn?: Record<string, unknown> } }).txn?.txn;
    const confirmedRound = Number(
      (raw as { confirmedRound?: unknown; 'confirmed-round'?: unknown }).confirmedRound ??
        (raw as { 'confirmed-round'?: unknown })['confirmed-round'] ??
        0
    );
    const poolError = String(
      (raw as { poolError?: unknown; 'pool-error'?: unknown }).poolError ??
        (raw as { 'pool-error'?: unknown })['pool-error'] ??
        ''
    );

    if (poolError) {
      throw new ApiError(400, `Algod reported a pool error for ${paymentTxId}: ${poolError}`);
    }

    if (!transaction) {
      throw new ApiError(400, 'Algod did not return transaction details for the provided tx id.');
    }

    if (String(transaction.type ?? '') !== 'pay') {
      throw new ApiError(400, 'Provided tx id is not an Algorand payment transaction.');
    }

    if (confirmedRound < 1) {
      throw new ApiError(400, 'Provided tx id is not yet confirmed on algod.');
    }

    const sender = (transaction as { snd?: unknown; sender?: unknown }).snd ?? (transaction as { sender?: unknown }).sender;
    const receiver =
      (transaction as { rcv?: unknown; payment?: { receiver?: unknown } }).rcv ??
      (transaction as { payment?: { receiver?: unknown } }).payment?.receiver;
    const amount =
      (transaction as { amt?: unknown; payment?: { amount?: unknown } }).amt ??
      (transaction as { payment?: { amount?: unknown } }).payment?.amount ??
      0;
    const fee = (transaction as { fee?: unknown }).fee ?? 0;
    const note = (transaction as { note?: unknown }).note;

    return {
      txId: paymentTxId,
      amountMicroAlgos: Number(amount ?? 0),
      confirmedRound,
      roundTime:
        Number(
          (raw as { roundTime?: unknown; 'round-time'?: unknown }).roundTime ??
            (raw as { 'round-time'?: unknown })['round-time'] ??
            0
        ) || undefined,
      senderAddress: sender ? normalizeAddress(sender) : undefined,
      receiverAddress: normalizeAddress(receiver),
      feeMicroAlgos: Number(fee ?? 0) || undefined,
      note: note ? normalizeNote(note) : undefined
    };
  }

  private assertPaymentNotSettled(paymentTxId: string): void {
    if (this.settledPaymentTxIds.has(paymentTxId)) {
      throw new ApiError(409, 'This Algorand payment transaction has already been settled.');
    }
  }

  private async awaitConfirmedTransaction(paymentTxId: string): Promise<unknown> {
    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const pending = await this.algod.pendingTransactionInformation(paymentTxId).do();
      const poolError = String(
        (pending as { poolError?: unknown; 'pool-error'?: unknown }).poolError ??
          (pending as { 'pool-error'?: unknown })['pool-error'] ??
          ''
      );
      if (poolError.length > 0) {
        throw new ApiError(400, `Algod reported a pool error for ${paymentTxId}: ${poolError}`);
      }

      const confirmedRound = Number(
        (pending as { confirmedRound?: unknown; 'confirmed-round'?: unknown }).confirmedRound ??
          (pending as { 'confirmed-round'?: unknown })['confirmed-round'] ??
          0
      );
      if (confirmedRound > 0) {
        return pending;
      }

      await delay(1000);
    }

    throw new ApiError(
      400,
      'Provided tx id is not yet confirmed on algod. Ensure the tx id is valid and retry in a few seconds.'
    );
  }
}

interface ValidatedAuthorization {
  verification: VerifiedCredential<SpendAuthorizationClaims>;
  remainingDailyCapUsd: number;
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeAddress(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'publicKey' in value) {
    const publicKey = (value as { publicKey?: unknown }).publicKey;
    if (publicKey instanceof Uint8Array) {
      return algosdk.encodeAddress(publicKey);
    }
    if (Array.isArray(publicKey)) {
      return algosdk.encodeAddress(Uint8Array.from(publicKey));
    }
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Uint8Array) {
    return algosdk.encodeAddress(value);
  }

  if (Array.isArray(value)) {
    return algosdk.encodeAddress(Uint8Array.from(value));
  }

  throw new ApiError(400, 'Unable to decode an Algorand address from algod response.');
}

function normalizeNote(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8');
  }

  if (Array.isArray(value)) {
    return Buffer.from(value).toString('utf8');
  }

  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const merchantService = new MerchantService();
