import cors from 'cors';
import express from 'express';
import { ZodError, z } from 'zod';
import { settings } from './config.js';
import { ApiError } from './errors.js';
import { demoSessions } from './services/demoSessions.js';
import { merchantService } from './services/merchantService.js';

const authorizationSchema = z.object({
  sessionId: z.string().uuid(),
  dailyCapUsd: z.coerce.number().positive().default(50)
});

const settlementSchema = z.object({
  sessionId: z.string().uuid(),
  authorizationJwt: z.string().min(1),
  paymentTxId: z.string().min(1).optional()
});

const agentPaySchema = z.object({
  sessionId: z.string().uuid(),
  authorizationJwt: z.string().min(1)
});

const verifySchema = z.object({
  jwt: z.string().min(1)
});

export const app = express();

app.use(
  cors({
    origin: settings.CLIENT_ORIGIN
  })
);
app.use(express.json());

app.get('/api/status', asyncRoute(async (_req, res) => {
  res.json(await merchantService.getStatus());
}));

// The "paid resource" from the agent-identity flow (step 0).
// Returns an x402 payment challenge so callers can see the full protocol.
app.get('/v1/market-data/ALGO-USD', asyncRoute(async (_req, res) => {
  const offer = merchantService.getOffer();
  res.status(402).json({
    error: 'payment_required',
    message: 'This market-data endpoint requires a micro-payment per request.',
    note: 'Use the interactive demo to walk through the full flow: create an agent identity, get a spend-authorization VC, settle an Algorand payment, then receive a verifiable receipt.',
    x402: {
      x402Version: 1,
      accepts: [
        {
          scheme: 'exact',
          network: offer.network,
          maxAmountRequired: String(offer.amountMicroAlgos),
          resource: offer.path,
          description: offer.description,
          mimeType: 'application/json',
          payTo: offer.merchantPaymentAddress,
          maxTimeoutSeconds: 300,
          asset: offer.asset,
          extra: {
            paymentMethod: 'algorand-payment',
            receiptFormat: 'vc-jwt',
            settleEndpoint: '/api/merchant/access',
            merchantDid: offer.merchantDid
          }
        }
      ]
    }
  });
}));

app.post('/api/identity/demo', asyncRoute(async (_req, res) => {
  const session = demoSessions.create();
  res.json({
    sessionId: session.id,
    createdAt: session.createdAt,
    agent: {
      did: session.agent.did,
      didDocument: session.agent.didDocument,
      algoAddress: session.agentAlgoAddress
    },
    controller: {
      did: session.controller.did,
      didDocument: session.controller.didDocument
    },
    merchant: {
      did: merchantService.getOffer().merchantDid,
      paymentAddress: merchantService.getOffer().merchantPaymentAddress
    }
  });
}));

app.post('/api/authorizations/issue', asyncRoute(async (req, res) => {
  const body = authorizationSchema.parse(req.body);
  const session = getSession(body.sessionId);
  res.json(await merchantService.issueAuthorization(session, body.dailyCapUsd));
}));

app.post('/api/merchant/access', asyncRoute(async (req, res) => {
  const body = settlementSchema.parse(req.body);
  const session = getSession(body.sessionId);

  if (!body.paymentTxId) {
    res.status(402).json(await merchantService.createPaymentRequired(session, body.authorizationJwt));
    return;
  }

  res.json(await merchantService.settleLive(session, body.authorizationJwt, body.paymentTxId));
}));

app.post('/api/demo/simulate-receipt', asyncRoute(async (req, res) => {
  const body = settlementSchema.parse(req.body);
  const session = getSession(body.sessionId);
  res.json(await merchantService.simulateSettlement(session, body.authorizationJwt));
}));

app.post('/api/credentials/verify', asyncRoute(async (req, res) => {
  const body = verifySchema.parse(req.body);
  res.json(await merchantService.verifyCredential(body.jwt));
}));

// ── Agent funding & on-chain payment ──────────────────────────────────

app.get('/api/agent/balance', asyncRoute(async (req, res) => {
  const sessionId = z.string().uuid().parse(req.query['sessionId']);
  const session = getSession(sessionId);
  res.json(await merchantService.getAgentBalance(session));
}));

app.post('/api/agent/fund', asyncRoute(async (req, res) => {
  const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(req.body);
  const session = getSession(sessionId);
  res.json(await merchantService.fundAgent(session));
}));

app.post('/api/agent/pay', asyncRoute(async (req, res) => {
  const body = agentPaySchema.parse(req.body);
  const session = getSession(body.sessionId);
  res.json(await merchantService.submitAgentPayment(session, body.authorizationJwt));
}));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'validation_error',
      message: error.issues.map((issue) => issue.message).join('; '),
      details: error.issues
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: error.name,
      message: error.message,
      details: error.details
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error';
  res.status(500).json({
    error: 'internal_error',
    message
  });
});

function getSession(sessionId: string) {
  const session = demoSessions.get(sessionId);
  if (!session) {
    throw new ApiError(404, 'Demo session not found. Create a new identity first.');
  }

  return session;
}

function asyncRoute(
  handler: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>
) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}
