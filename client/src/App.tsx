import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  ShieldCheck,
  Zap
} from 'lucide-react';

type StatusResponse = {
  merchantDid: string;
  merchantPaymentAddress: string;
  network: 'localnet' | 'testnet';
  offer: {
    resourceId: string;
    path: string;
    description: string;
    requestAmountUsd: number;
    amountMicroAlgos: number;
    asset: string;
    network: string;
  };
  resources: Array<{
    resourceId: string;
    path: string;
    description: string;
    requestAmountUsd: number;
    amountMicroAlgos: number;
    asset: string;
    network: string;
  }>;
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
  agent: { did: string; didDocument: unknown; algoAddress: string };
  controller: { did: string; didDocument: unknown };
  merchant: { did: string; paymentAddress: string };
};

type AgentBalanceResponse = {
  address: string;
  balanceMicroAlgos: number;
  balanceAlgos: number;
  merchantAddress: string;
  requiredMicroAlgos: number;
};

type AgentFundResponse =
  | {
      manual: false;
      txId: string;
      fundedAddress: string;
      amountMicroAlgos: number;
      loraUrl: string;
    }
  | {
      manual: true;
      network: string;
      fundedAddress: string;
      faucetUrl: string;
      message: string;
    };

type AgentPayResponse = {
  txId: string;
  senderAddress: string;
  receiverAddress: string;
  amountMicroAlgos: number;
  loraUrl: string;
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
    body: 'Choose a paid agent service, preview its x402 request, and inspect current algod availability.'
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

const RECEIPT_HISTORY_STORAGE_KEY = 'algorand-x402-verified-receipts-v4';

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
  const [balance, setBalance] = useState<AgentBalanceResponse | null>(null);
  const [fundResult, setFundResult] = useState<AgentFundResponse | null>(null);
  const [authorization, setAuthorization] = useState<AuthorizationResponse | null>(null);
  const [paywall, setPaywall] = useState<PaywallResponse | null>(null);
  const [receipt, setReceipt] = useState<ReceiptResponse | null>(null);
  const [receiptHistory, setReceiptHistory] = useState<ReceiptResponse[]>(loadReceiptHistory);
  const [selectedReceiptIndex, setSelectedReceiptIndex] = useState(0);
  const [selectedResourceId, setSelectedResourceId] = useState('market-data-algo-usd');
  const [dailyCapUsd, setDailyCapUsd] = useState('50');
  const [paymentTxId, setPaymentTxId] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshStatus();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(RECEIPT_HISTORY_STORAGE_KEY, JSON.stringify(receiptHistory));
  }, [receiptHistory]);

  const requestPreview = useMemo(() => {
    const did = identity?.agent.did ?? 'did:key:z...';
    const selectedResource = status?.resources?.find((resource) => resource.resourceId === selectedResourceId);
    const path = selectedResource?.path ?? status?.offer.path ?? '/v1/market-data/ALGO-USD';
    return [`GET ${path}`, `Agent-DID: ${did}`, 'Accept: application/json'].join('\n');
  }, [identity, selectedResourceId, status]);

  const step = STEPS[active];
  const Icon = step.icon;
  const completed = [
    Boolean(status?.resources?.some((resource) => resource.resourceId === selectedResourceId)),
    Boolean(identity),
    Boolean(authorization),
    Boolean(receipt)
  ][active];

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
      setBalance(null);
      setFundResult(null);
      setAuthorization(null);
      setPaywall(null);
      setReceipt(null);
      setSelectedReceiptIndex(0);
      setActive(2 > STEPS.length - 1 ? STEPS.length - 1 : 1);
      // fetch balance right away
      void fetchBalance(response.sessionId);
    });
  }

  async function fetchBalance(sessionId: string) {
    try {
      const resp = await fetchJson<AgentBalanceResponse>(
        `/api/agent/balance?sessionId=${encodeURIComponent(sessionId)}&resourceId=${encodeURIComponent(selectedResourceId)}`
      );
      setBalance(resp);
    } catch {
      // ignore — algod might be offline
    }
  }

  async function fundAgent() {
    if (!identity) return;
    await runAction('fund', async () => {
      const resp = await fetchJson<AgentFundResponse>('/api/agent/fund', {
        method: 'POST',
        body: JSON.stringify({ sessionId: identity.sessionId })
      });
      setFundResult(resp);
      void fetchBalance(identity.sessionId);
    });
  }

  async function sendAgentPayment() {
    if (!identity || !authorization) {
      setError('Create identity and authorization first.');
      return;
    }
    await runAction('on-chain payment', async () => {
      const resp = await fetchJson<AgentPayResponse>('/api/agent/pay', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: identity.sessionId,
          authorizationJwt: authorization.authorizationJwt,
          resourceId: selectedResourceId
        })
      });
      setPaymentTxId(resp.txId);
      void fetchBalance(identity.sessionId);
      // Keep the user on settlement so verification and receipt issuance are explicit.
      setError(null);
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
          dailyCapUsd: Number(dailyCapUsd),
          resourceId: selectedResourceId
        })
      });
      setAuthorization(response);
      setPaywall(null);
      setReceipt(null);
      setSelectedReceiptIndex(0);
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
          authorizationJwt: authorization.authorizationJwt,
          resourceId: selectedResourceId
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
          authorizationJwt: authorization.authorizationJwt,
          resourceId: selectedResourceId
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
      const normalizedTxId = paymentTxId.trim().toUpperCase();
      const response = await fetchJson<ReceiptResponse>('/api/merchant/access', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: identity.sessionId,
          authorizationJwt: authorization.authorizationJwt,
          paymentTxId: normalizedTxId,
          resourceId: selectedResourceId
        })
      });
      recordReceipt(response);
      setActive(4);
    });
  }

  function recordReceipt(nextReceipt: ReceiptResponse) {
    if (!isLiveVerifiedReceipt(nextReceipt)) {
      setError('Receipt was not accepted because live VC and algod verification did not both succeed.');
      return;
    }

    setReceipt(nextReceipt);
    setReceiptHistory((current) => [nextReceipt, ...current]);
    setSelectedReceiptIndex(0);
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
          <span className={`badge ${status?.network === 'testnet' ? 'badge-testnet' : 'badge-muted'}`}>
            {status?.network === 'testnet' ? 'Algorand TestNet' : 'Algorand LocalNet'}
          </span>
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
              <label className="field">
                <span>Choose a paid agent service</span>
                <select
                  value={selectedResourceId}
                  onChange={(event) => {
                    setSelectedResourceId(event.target.value);
                    setAuthorization(null);
                    setPaywall(null);
                    setReceipt(null);
                    setSelectedReceiptIndex(0);
                  }}
                >
                  {(status?.resources ?? []).map((resource) => (
                    <option key={resource.resourceId} value={resource.resourceId}>
                      {resource.description} · ${resource.requestAmountUsd.toFixed(2)}
                    </option>
                  ))}
                </select>
              </label>
              <CodeBlock value={requestPreview} />
              <div className="kv-card">
                <KvRow label="Resource" value={status?.resources?.find((resource) => resource.resourceId === selectedResourceId)?.description ?? 'Loading...'} />
                <KvRow label="Quote" value={status?.resources?.find((resource) => resource.resourceId === selectedResourceId) ? `$${status.resources.find((resource) => resource.resourceId === selectedResourceId)!.requestAmountUsd.toFixed(2)} / ${status.resources.find((resource) => resource.resourceId === selectedResourceId)!.amountMicroAlgos} µALGO` : '—'} />
                <KvRow label="Endpoint" value={status?.resources?.find((resource) => resource.resourceId === selectedResourceId)?.path ?? '—'} />
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

              {identity ? (
                <div className="agent-algo-card">
                  <div className="lora-label">Agent Algorand account</div>
                  <div className="agent-algo-addr">{identity.agent.algoAddress}</div>

                  <div className="agent-balance-row">
                    <span>Balance</span>
                    <strong>
                      {balance
                        ? `${balance.balanceAlgos.toFixed(6)} ALGO`
                        : status?.algod.reachable
                        ? 'Loading…'
                        : '— (algod offline)'}
                    </strong>
                  </div>

                  {status?.algod.reachable ? (
                    status.network === 'testnet' ? (
                      <div className="testnet-fund-panel">
                        <p className="lora-note">
                          TestNet has no auto-dispenser here — send real TestNet ALGO to the address above from
                          the official faucet or your own wallet (Pera/Defly), then refresh the balance.
                        </p>
                        <div className="button-row">
                          <a
                            className="secondary-button"
                            href="https://bank.testnet.algorand.network/"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open TestNet dispenser <ExternalLink size={13} />
                          </a>
                          <button
                            type="button"
                            className="icon-button"
                            title="Refresh balance"
                            onClick={() => void fetchBalance(identity.sessionId)}
                          >
                            ↻
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="button-row">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void fundAgent()}
                          disabled={!!loading}
                        >
                          Fund agent (5 ALGO from genesis) <ChevronRight size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          title="Refresh balance"
                          onClick={() => void fetchBalance(identity.sessionId)}
                        >
                          ↻
                        </button>
                      </div>
                    )
                  ) : (
                    <span className="lora-note">
                      {status?.network === 'testnet'
                        ? 'Waiting for the public TestNet algod node to become reachable.'
                        : 'Start AlgoKit LocalNet to fund the agent on-chain.'}
                    </span>
                  )}

                  {fundResult && !fundResult.manual ? (
                    <div className="fund-result">
                      <Check size={13} strokeWidth={3} />
                      Funded · tx {shorten(fundResult.txId, 20)}
                      <a href={fundResult.loraUrl} target="_blank" rel="noopener noreferrer" className="lora-inline-link" style={{ marginLeft: 6 }}>
                        Lora <ExternalLink size={11} />
                      </a>
                    </div>
                  ) : null}
                  {fundResult && fundResult.manual ? (
                    <div className="fund-result fund-result-manual">{fundResult.message}</div>
                  ) : null}
                </div>
              ) : null}

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

              {status?.algod.reachable ? (
                <div className="sub-panel live-pay-panel">
                  <div className="sub-panel-header">
                    <strong>Automated on-chain payment</strong>
                    <span className="badge badge-live">algod live</span>
                  </div>
                  <p>
                    Signs and submits a real Algorand payment from the agent's account to the merchant, then
                    auto-verifies and issues a receipt.
                  </p>
                  <div className="agent-balance-row">
                    <span>Agent balance</span>
                    <strong>
                      {balance ? `${balance.balanceAlgos.toFixed(6)} ALGO` : 'Loading…'}
                    </strong>
                  </div>
                  {balance && balance.balanceMicroAlgos < balance.requiredMicroAlgos ? (
                    <div className="warn-banner">
                      Agent needs funds — go back to Identity step and click Fund agent.
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void sendAgentPayment()}
                    disabled={!!loading || !balance || balance.balanceMicroAlgos < balance.requiredMicroAlgos}
                  >
                    Send payment from agent <Zap size={14} />
                  </button>
                </div>
              ) : null}

              <div className="sub-panel">
                <div className="sub-panel-header">
                  <strong>Manual live settlement</strong>
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
              {receiptHistory.length === 0 ? (
                <div className="empty-receipts">
                  No live verified receipts yet. Complete and verify an on-chain settlement to create the first receipt.
                </div>
              ) : (
                <>
                  <div className="receipt-list">
                    <div className="receipt-list-heading">
                      <div>
                        <div className="json-title">Receipt history</div>
                        <strong>{receiptHistory.length} receipt{receiptHistory.length === 1 ? '' : 's'}</strong>
                      </div>
                      <span className="badge badge-live">Live VC + algod verified</span>
                    </div>
                    {receiptHistory.map((item, index) => (
                      <ReceiptListItem
                        key={`${item.receiptJwt}-${index}`}
                        receipt={item}
                        index={index}
                        selected={index === selectedReceiptIndex}
                        onSelect={() => {
                          setSelectedReceiptIndex(index);
                          setReceipt(item);
                        }}
                      />
                    ))}
                  </div>
                  <ReceiptCard
                    receipt={receipt ?? receiptHistory[selectedReceiptIndex]}
                    agentDid={identity?.agent.did}
                    merchantDid={status?.merchantDid}
                  />
                  <div className="button-row receipt-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => downloadReceipt(receipt ?? receiptHistory[selectedReceiptIndex])}
                    >
                      Download selected receipt <Download size={14} />
                    </button>
                  </div>
                  <LoraPanel
                    txId={(getReceiptSubject(receipt ?? receiptHistory[selectedReceiptIndex])?.paymentTxId as string | undefined) ?? '—'}
                    network={status?.offer.network ?? 'algorand:localnet'}
                    simulation={getReceiptSubject(receipt ?? receiptHistory[selectedReceiptIndex])?.simulation === true}
                  />
                  <JsonPanel
                    title="Selected receipt VC-JWT + verification"
                    value={receipt ?? receiptHistory[selectedReceiptIndex]}
                    emptyText="No receipt yet."
                  />
                </>
              )}
            </div>
          ) : null}

          {active < STEPS.length - 1 && completed ? (
            <div className="next-step-row">
              <button
                type="button"
                className="next-step-button"
                onClick={() => setActive((current) => Math.min(current + 1, STEPS.length - 1))}
                disabled={Boolean(loading)}
              >
                Next: {STEPS[active + 1].label} <ChevronRight size={16} />
              </button>
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

function getReceiptSubject(receipt: ReceiptResponse | null): Record<string, unknown> | undefined {
  return (
    receipt?.verification.payload as
      | { vc?: { credentialSubject?: Record<string, unknown> } }
      | undefined
  )?.vc?.credentialSubject;
}

function isLiveVerifiedReceipt(receipt: ReceiptResponse): boolean {
  const subject = getReceiptSubject(receipt);
  const proof = subject?.proof as { verifier?: unknown } | undefined;
  return (
    receipt.mode === 'live-algod-verified' &&
    receipt.verification.valid === true &&
    subject?.simulation === false &&
    proof?.verifier === 'algod' &&
    typeof subject?.paymentTxId === 'string' &&
    !subject.paymentTxId.startsWith('SIM-')
  );
}

function ReceiptListItem({
  receipt,
  index,
  selected,
  onSelect
}: {
  receipt: ReceiptResponse;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const subject = getReceiptSubject(receipt);
  const simulation = subject?.simulation === true;
  const verified = receipt.verification.valid === true && !simulation;
  const txId = typeof subject?.paymentTxId === 'string' ? subject.paymentTxId : 'N/A';
  const amount =
    typeof subject?.amountMicroAlgos === 'number'
      ? `${subject.amountMicroAlgos.toLocaleString()} µALGO`
      : 'N/A';

  return (
    <button type="button" className={`receipt-list-item ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <span className="receipt-list-number">{index + 1}</span>
      <span className="receipt-list-main">
        <strong>{typeof subject?.description === 'string' ? subject.description : 'Payment receipt'}</strong>
        <span>{amount} · {txId}</span>
      </span>
      <span className={`receipt-status ${verified ? 'receipt-status-verified' : 'receipt-status-simulated'}`}>
        {verified ? 'Verified' : 'Simulation'}
      </span>
    </button>
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
  const subject = getReceiptSubject(receipt);
  const proof =
    (subject?.proof as
      | {
          confirmedRound?: number;
          roundTime?: number;
          senderAddress?: string;
          receiverAddress?: string;
          feeMicroAlgos?: number;
          note?: string;
          verifier?: string;
          message?: string;
        }
      | undefined) ?? {};

  const simulation = subject?.simulation === true;
  const verified = receipt?.verification.valid === true && !simulation;
  const txId = typeof subject?.paymentTxId === 'string' ? subject.paymentTxId : 'N/A';
  const amountUsd =
    typeof subject?.amountUsd === 'number' ? `$${subject.amountUsd.toFixed(2)}` : 'N/A';
  const amountMicroAlgos =
    typeof subject?.amountMicroAlgos === 'number'
      ? `${subject.amountMicroAlgos.toLocaleString()} µALGO`
      : 'N/A';
  const network = typeof subject?.network === 'string' ? subject.network : 'N/A';

  const details: Array<{ label: string; value: string; code?: boolean }> = [
    { label: 'Agent DID', value: typeof subject?.id === 'string' ? subject.id : agentDid ?? 'N/A', code: true },
    { label: 'Controller DID', value: typeof subject?.controllerDid === 'string' ? subject.controllerDid : 'N/A', code: true },
    { label: 'Merchant DID', value: typeof subject?.merchantDid === 'string' ? subject.merchantDid : merchantDid ?? 'N/A', code: true },
    { label: 'Merchant payment address', value: typeof subject?.merchantPaymentAddress === 'string' ? subject.merchantPaymentAddress : 'N/A', code: true },
    { label: 'Resource path', value: typeof subject?.resourcePath === 'string' ? subject.resourcePath : 'N/A', code: true },
    { label: 'Description', value: typeof subject?.description === 'string' ? subject.description : 'N/A' },
    { label: 'Settlement mode', value: typeof subject?.settlementMode === 'string' ? subject.settlementMode : 'N/A' },
    { label: 'Asset', value: typeof subject?.asset === 'string' ? subject.asset : 'N/A' },
    { label: 'Amount (USD)', value: amountUsd },
    { label: 'Amount (µALGO)', value: amountMicroAlgos },
    { label: 'Network', value: network, code: true },
    { label: 'Transaction ID', value: txId, code: true },
    { label: 'Confirmed round', value: typeof proof.confirmedRound === 'number' ? String(proof.confirmedRound) : 'N/A' },
    { label: 'Verified at (Berlin)', value: formatIsoBerlin(typeof subject?.verifiedAt === 'string' ? subject.verifiedAt : undefined) },
    { label: 'On-chain round time (LocalNet)', value: formatUnix(proof.roundTime) },
    { label: 'Sender address', value: proof.senderAddress ?? 'N/A', code: true },
    { label: 'Receiver address', value: proof.receiverAddress ?? 'N/A', code: true },
    { label: 'Fee (µALGO)', value: typeof proof.feeMicroAlgos === 'number' ? String(proof.feeMicroAlgos) : 'N/A' },
    { label: 'Note', value: proof.note ?? 'N/A', code: true },
    { label: 'Verifier', value: proof.verifier ?? 'N/A' },
    { label: 'Verifier message', value: proof.message ?? 'N/A' }
  ];

  return (
    <div className="receipt-card">
      <div className="receipt-top">
        <div>
          <div className="receipt-eyebrow">Verifiable receipt</div>
          <div className="receipt-title">
            {typeof subject?.description === 'string' ? subject.description : 'Payment receipt'}
          </div>
        </div>
        {verified ? (
          <div className="receipt-stamp receipt-stamp-live">Verified</div>
        ) : (
          <div className="receipt-stamp receipt-stamp-sim">Simulation</div>
        )}
      </div>
      <div className="receipt-grid-full">
        {details.map((entry) => (
          <div key={entry.label} className="receipt-field">
            <div className="receipt-field-label">{entry.label}</div>
            <div className={entry.code ? 'receipt-field-value receipt-field-value-code' : 'receipt-field-value'}>
              {entry.value}
            </div>
          </div>
        ))}
      </div>
      <div className="receipt-footer">
        <Check size={14} strokeWidth={3} />
        {verified
          ? 'Verified VC signature and confirmed Algorand payment'
          : 'VC signature valid — no on-chain verification claimed'}
      </div>
    </div>
  );
}

function formatUnix(value: number | undefined): string {
  if (!value || value <= 0) {
    return 'N/A';
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'long',
    timeZone: 'Europe/Berlin'
  }).format(new Date(value * 1000));
}

function formatIsoBerlin(value: string | undefined): string {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'long',
    timeZone: 'Europe/Berlin'
  }).format(date);
}
function downloadReceipt(receipt: ReceiptResponse | null) {
  if (!receipt) {
    return;
  }

  const subject = getReceiptSubject(receipt);
  const filename = `algorand-receipt-${typeof subject?.paymentTxId === 'string' ? subject.paymentTxId : 'selected'}.json`;
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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

function loadReceiptHistory(): ReceiptResponse[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const stored = window.localStorage.getItem(RECEIPT_HISTORY_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is ReceiptResponse => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const candidate = item as Partial<ReceiptResponse>;
      return (
        typeof candidate.receiptJwt === 'string' &&
        Boolean(candidate.verification) &&
        isLiveVerifiedReceipt(candidate as ReceiptResponse)
      );
    });
  } catch {
    return [];
  }
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
