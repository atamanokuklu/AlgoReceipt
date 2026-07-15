import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  ChevronRight,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  ShieldCheck,
  Zap
} from 'lucide-react';

type StatusResponse = {
  merchantDid: string;
  merchantPaymentAddress: string;
  offer: {
    path: string;
    description: string;
    requestAmountUsd: number;
    amountMicroAlgos: number;
    asset: string;
    network: string;
  };
  algod: {
    reachable: boolean;
    mode: string;
    url: string;
    tokenConfigured: boolean;
    lastRound?: number;
    message?: string;
  };
};

type IdentityResponse = {
  sessionId: string;
  createdAt: string;
  agent: { did: string; didDocument: unknown };
  controller: { did: string; didDocument: unknown };
  merchant: { did: string; paymentAddress: string };
};

type AuthorizationResponse = {
  authorizationJwt: string;
  verification: {
    valid: boolean;
    payload: Record<string, unknown>;
    issuerDocument: unknown;
  };
  capStatus: {
    usedTodayUsd: number;
    requestAmountUsd: number;
    dailyCapUsd: number;
    remainingAfterRequestUsd: number;
  };
};

type PaywallResponse = {
  error: string;
  message: string;
  requestId: string;
  x402: Record<string, unknown>;
  note: string;
};

type ReceiptResponse = {
  mode: string;
  totalUsedTodayUsd: number;
  receiptJwt: string;
  verification: {
    valid: boolean;
    payload: Record<string, unknown>;
    issuerDocument: unknown;
  };
  livePayment?: Record<string, unknown>;
};

const STEPS = [
  {
    label: 'Request',
    title: 'Agent requests a paid resource',
    icon: Bot,
    body: 'Preview the paid ALGO/USD market-data request and inspect current algod availability.'
  },
  {
    label: 'Identity',
    title: 'Create demo did:key identities',
    icon: Fingerprint,
    body: 'Generate an Ed25519 agent DID and controller DID with fully resolvable did:key documents.'
  },
  {
    label: 'Authorize',
    title: 'Issue a spend authorization VC-JWT',
    icon: ShieldCheck,
    body: 'The controller signs a VC-JWT limiting what the agent can spend today.'
  },
  {
    label: 'Settle',
    title: 'Request x402 payment challenge and settle',
    icon: Zap,
    body: 'Get a 402 payment-required response, then use either live algod verification or the demo-only simulation.'
  },
  {
    label: 'Receipt',
    title: 'Verify the signed payment receipt',
    icon: FileCheck2,
    body: 'Inspect the receipt VC-JWT, decoded claims, and verification result.'
  }
] as const;

/** Map the server's network string to a Lora segment. */
function loraNetwork(network: string): string {
  if (network.includes('testnet')) return 'testnet';
  if (network.includes('mainnet')) return 'mainnet';
  return 'localnet';
}

function loraUrl(txId: string, network: string): string {
  return `https://lora.algokit.io/${loraNetwork(network)}/transaction/${txId}`;
}

function LoraPanel({ txId, network, simulation }: { txId: string; network: string; simulation: boolean }) {
  if (!txId || txId === '—' || simulation) {
    return (
      <div className="lora-panel lora-panel-sim">
        <div className="lora-label">Lora Explorer</div>
        <span className="lora-note">Not available for simulated transactions — no on-chain proof.</span>
      </div>
    );
  }

  const url = loraUrl(txId, network);
  const net = loraNetwork(network);

  return (
    <div className="lora-panel">
      <div className="lora-label">View on Lora · {net}</div>
      <div className="lora-txid">{txId}</div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="lora-button">
        Open in Lora Explorer <ExternalLink size={13} />
      </a>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [identity, setIdentity] = useState<IdentityResponse | null>(null);
  const [authorization, setAuthorization] = useState<AuthorizationResponse | null>(null);
  const [paywall, setPaywall] = useState<PaywallResponse | null>(null);
  const [receipt, setReceipt] = useState<ReceiptResponse | null>(null);
  const [dailyCapUsd, setDailyCapUsd] = useState('50');
  const [paymentTxId, setPaymentTxId] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshStatus();
  }, []);

  const requestPreview = useMemo(() => {
    const did = identity?.agent.did ?? 'did:key:z...';
    const path = status?.offer.path ?? '/v1/market-data/ALGO-USD';
    return [`GET ${path}`, `Agent-DID: ${did}`, 'Accept: application/json'].join('\n');
  }, [identity, status]);

  const step = STEPS[active];
  const Icon = step.icon;

  async function refreshStatus() {
    setError(null);
    const response = await fetchJson<StatusResponse>('/api/status');
    setStatus(response);
  }

  async function createIdentity() {
    await runAction('identity', async () => {
      const response = await fetchJson<IdentityResponse>('/api/identity/demo', {
        method: 'POST'
      });
      setIdentity(response);
      setAuthorization(null);
      setPaywall(null);
      setReceipt(null);
      setActive(2 > STEPS.length - 1 ? STEPS.length - 1 : 1);
    });
  }

  async function issueAuthorization() {
    if (!identity) {
      setError('Create a demo identity first.');
      return;
    }

    await runAction('authorization', async () => {
      const response = await fetchJson<AuthorizationResponse>('/api/authorizations/issue', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: identity.sessionId,
          dailyCapUsd: Number(dailyCapUsd)
        })
      });
      setAuthorization(response);
      setPaywall(null);
      setReceipt(null);
      setActive(3 > STEPS.length - 1 ? STEPS.length - 1 : 2);
    });
  }

  async function requestPaywall() {
    if (!identity || !authorization) {
      setError('Create identity and authorization first.');
      return;
    }

    await runAction('paywall', async () => {
      const response = await fetchJson<PaywallResponse>('/api/merchant/access', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: identity.sessionId,
          authorizationJwt: authorization.authorizationJwt
        }),
        allowStatuses: [402]
      });
      setPaywall(response);
      setActive(3);
    });
  }

  async function simulateReceipt() {
    if (!identity || !authorization) {
      setError('Create identity and authorization first.');
      return;
    }

    await runAction('simulation', async () => {
      const response = await fetchJson<ReceiptResponse>('/api/demo/simulate-receipt', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: identity.sessionId,
          authorizationJwt: authorization.authorizationJwt
        })
      });
      setReceipt(response);
      setActive(4);
    });
  }

  async function submitLiveReceipt() {
    if (!identity || !authorization || !paymentTxId.trim()) {
      setError('Enter a live Algorand transaction id first.');
      return;
    }

    await runAction('live-settlement', async () => {
      const response = await fetchJson<ReceiptResponse>('/api/merchant/access', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: identity.sessionId,
          authorizationJwt: authorization.authorizationJwt,
          paymentTxId: paymentTxId.trim()
        })
      });
      setReceipt(response);
      setActive(4);
    });
  }

  return (
    <div className="app-shell">
      <div className="content">
        <div className="title-block">
          <div className="eyebrow">Algorand x402</div>
          <h1>Agent identity &amp; verifiable payment receipts</h1>
          <p>
            Live settlement is only claimed when algod can verify a real Algorand payment. Otherwise the UI
            offers a separate offline simulation path.
          </p>
        </div>

        <div className="status-banner">
          <span className={`badge ${status?.algod.reachable ? 'badge-live' : 'badge-offline'}`}>
            {status?.algod.reachable ? 'algod reachable' : 'offline simulation mode'}
          </span>
          <span>{status?.algod.url ?? 'Loading algod status...'}</span>
          {!status?.algod.reachable && status?.algod.message ? <span>· {status.algod.message}</span> : null}
        </div>

        <div className="stepper" role="tablist" aria-label="Demo flow steps">
          {STEPS.map((item, index) => (
            <div className="stepper-item" key={item.label}>
              <button
                className={`step-dot ${index === active ? 'active' : index < active ? 'done' : ''}`}
                onClick={() => setActive(index)}
                type="button"
              >
                {index < active ? <Check size={14} strokeWidth={3} /> : index + 1}
              </button>
              {index < STEPS.length - 1 ? <div className={`step-line ${index < active ? 'done' : ''}`} /> : null}
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div className="panel-icon">
              <Icon size={18} />
            </div>
            <div>
              <div className="step-caption">
                Step {active + 1} · {step.label}
              </div>
              <h2>{step.title}</h2>
            </div>
          </div>
          <p className="panel-copy">{step.body}</p>

          {active === 0 ? (
            <div className="detail-stack">
              <CodeBlock value={requestPreview} />
              <div className="kv-card">
                <KvRow label="Resource" value={status?.offer.description ?? 'Loading...'} />
                <KvRow label="Quote" value={status ? `$${status.offer.requestAmountUsd.toFixed(2)} / ${status.offer.amountMicroAlgos} µALGO` : '—'} />
                <KvRow label="Network" value={status?.offer.network ?? 'algorand-localnet'} />
              </div>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={() => void refreshStatus()}>
                  Refresh status
                </button>
              </div>
            </div>
          ) : null}

          {active === 1 ? (
            <div className="detail-stack">
              <div className="button-row">
                <button type="button" className="primary-button" onClick={() => void createIdentity()}>
                  Create demo identity <ChevronRight size={14} />
                </button>
              </div>
              <JsonPanel title="Identity session" value={identity} emptyText="No identity created yet." />
            </div>
          ) : null}

          {active === 2 ? (
            <div className="detail-stack">
              <label className="field">
                <span>Daily cap (USD)</span>
                <input
                  value={dailyCapUsd}
                  onChange={(event) => setDailyCapUsd(event.target.value)}
                  inputMode="decimal"
                />
              </label>
              <div className="button-row">
                <button type="button" className="primary-button" onClick={() => void issueAuthorization()}>
                  Issue authorization VC-JWT <ChevronRight size={14} />
                </button>
              </div>
              <JsonPanel title="Authorization" value={authorization} emptyText="Issue an authorization to continue." />
            </div>
          ) : null}

          {active === 3 ? (
            <div className="detail-stack">
              <div className="button-row">
                <button type="button" className="primary-button" onClick={() => void requestPaywall()}>
                  Request x402 challenge <ChevronRight size={14} />
                </button>
              </div>
              <JsonPanel title="402 payment-required payload" value={paywall} emptyText="Request the merchant paywall first." />

              <div className="sub-panel">
                <div className="sub-panel-header">
                  <strong>Live settlement</strong>
                  <span className={`badge ${status?.algod.reachable ? 'badge-live' : 'badge-muted'}`}>
                    {status?.algod.reachable ? 'enabled' : 'needs reachable algod'}
                  </span>
                </div>
                <label className="field">
                  <span>Algorand tx id</span>
                  <input
                    value={paymentTxId}
                    onChange={(event) => setPaymentTxId(event.target.value)}
                    placeholder="Paste a confirmed LocalNet tx id"
                    disabled={!status?.algod.reachable}
                  />
                </label>
                {paymentTxId.trim() && status?.algod.reachable ? (
                  <a
                    href={loraUrl(paymentTxId.trim(), status?.offer.network ?? 'algorand:localnet')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lora-inline-link"
                  >
                    Preview on Lora <ExternalLink size={12} />
                  </a>
                ) : null}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!status?.algod.reachable}
                  onClick={() => void submitLiveReceipt()}
                >
                  Verify live payment
                </button>
              </div>

              <div className="sub-panel simulation-panel">
                <div className="sub-panel-header">
                  <strong>Offline simulation</strong>
                  <span className="badge badge-offline">demo only</span>
                </div>
                <p>
                  Generates a signed receipt clearly marked as simulated. No algod call or on-chain proof is claimed.
                </p>
                <button type="button" className="secondary-button" onClick={() => void simulateReceipt()}>
                  Run offline simulated receipt flow
                </button>
              </div>
            </div>
          ) : null}

          {active === 4 ? (
            <div className="detail-stack">
              <ReceiptCard
                receipt={receipt}
                agentDid={identity?.agent.did}
                merchantDid={status?.merchantDid}
              />
              <LoraPanel
                txId={(() => {
                  const subject = (receipt?.verification.payload as { vc?: { credentialSubject?: Record<string, unknown> } } | undefined)?.vc?.credentialSubject;
                  return typeof subject?.paymentTxId === 'string' ? subject.paymentTxId : '—';
                })()}
                network={status?.offer.network ?? 'algorand:localnet'}
                simulation={receipt?.mode === 'offline-simulation'}
              />
              <JsonPanel title="Receipt + verification" value={receipt} emptyText="No receipt yet." />
            </div>
          ) : null}

          {loading ? <div className="info-banner">Working: {loading}</div> : null}
          {error ? <div className="error-banner">{error}</div> : null}
        </div>
      </div>
    </div>
  );

  async function runAction(label: string, action: () => Promise<void>) {
    try {
      setLoading(label);
      setError(null);
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Request failed');
    } finally {
      setLoading(null);
    }
  }
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  return <pre className="code-block">{value}</pre>;
}

function JsonPanel({
  title,
  value,
  emptyText
}: {
  title: string;
  value: unknown;
  emptyText: string;
}) {
  return (
    <div className="json-panel">
      <div className="json-title">{title}</div>
      <pre>{value ? JSON.stringify(value, null, 2) : emptyText}</pre>
    </div>
  );
}

function ReceiptCard({
  receipt,
  agentDid,
  merchantDid
}: {
  receipt: ReceiptResponse | null;
  agentDid?: string;
  merchantDid?: string;
}) {
  const subject = (receipt?.verification.payload as { vc?: { credentialSubject?: Record<string, unknown> } } | undefined)
    ?.vc?.credentialSubject;
  const simulation = subject?.simulation === true;
  const txId = typeof subject?.paymentTxId === 'string' ? subject.paymentTxId : '—';
  const amount = typeof subject?.amountUsd === 'number' ? `$${subject.amountUsd.toFixed(2)}` : '—';
  const network = typeof subject?.network === 'string' ? subject.network : 'algorand-localnet';

  return (
    <div className="receipt-card">
      <div className="receipt-top">
        <div>
          <div className="receipt-eyebrow">Verifiable receipt</div>
          <div className="receipt-title">Market data access</div>
        </div>
        <div className={`receipt-stamp ${simulation ? 'receipt-stamp-sim' : 'receipt-stamp-live'}`}>
          {simulation ? 'Simulated' : 'Verified'}
        </div>
      </div>
      <div className="receipt-grid">
        <KvRow label="Paid by" value={shorten(agentDid)} />
        <KvRow label="Paid to" value={shorten(merchantDid)} />
        <KvRow label="Amount" value={amount} />
        <KvRow label="Network" value={network} />
        <KvRow label="Tx id" value={shorten(txId, 18)} />
      </div>
      <div className="receipt-footer">
        <Check size={14} strokeWidth={3} />
        {simulation
          ? 'Signature valid — clearly labeled offline simulation'
          : 'Signature valid — receipt was issued after algod verification'}
      </div>
    </div>
  );
}

function shorten(value: string | undefined, width = 24) {
  if (!value) {
    return '—';
  }

  if (value.length <= width) {
    return value;
  }

  return `${value.slice(0, Math.floor(width / 2))}…${value.slice(-Math.floor(width / 2))}`;
}

async function fetchJson<T>(
  input: string,
  init?: RequestInit & { allowStatuses?: number[] }
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok && !init?.allowStatuses?.includes(response.status)) {
    throw new Error(typeof data.message === 'string' ? data.message : `Request failed with ${response.status}`);
  }

  return data as T;
}
