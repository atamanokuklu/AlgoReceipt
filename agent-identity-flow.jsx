import React, { useState } from "react";
import { Fingerprint, ShieldCheck, Zap, FileCheck2, Bot, ChevronRight, Check } from "lucide-react";

const STEPS = [
  {
    id: 0,
    label: "Request",
    title: "Agent requests a paid resource",
    icon: Bot,
    body:
      "A trading agent calls a market-data endpoint. No account, no API key — just an HTTP request.",
    detail: {
      kind: "code",
      lines: [
        "GET /v1/market-data/ALGO-USD",
        "Agent-DID: did:algo:9F3K...c71A",
      ],
    },
  },
  {
    id: 1,
    label: "Identity",
    title: "Server resolves the agent's DID",
    icon: Fingerprint,
    body:
      "The endpoint reads the agent's decentralized identifier and resolves it to a signed document — proving the key, and who it's controlled by, without calling a central registry.",
    detail: {
      kind: "kv",
      rows: [
        ["Controller", "Quiet Harbor Capital"],
        ["Agent DID", "did:algo:9F3K…c71A"],
        ["Key status", "Active"],
      ],
    },
  },
  {
    id: 2,
    label: "Authorize",
    title: "Spending credential is checked",
    icon: ShieldCheck,
    body:
      "A Verifiable Credential says exactly what this agent is allowed to spend, and on whose authority. The server checks the request fits inside it — before any money moves.",
    detail: {
      kind: "kv",
      rows: [
        ["Credential", "Spend authorization"],
        ["Limit", "$50.00 / day"],
        ["Used today", "$4.20"],
        ["This request", "$0.05 → within limit"],
      ],
    },
  },
  {
    id: 3,
    label: "Settle",
    title: "Payment settles on Algorand",
    icon: Zap,
    body:
      "An atomic transaction group moves the fee to the resource server. Finality is instant — no waiting, no partial execution.",
    detail: {
      kind: "code",
      lines: ["Network: Algorand Mainnet", "Amount: 0.05 USDC", "Finality: ~2.8s · confirmed"],
    },
  },
  {
    id: 4,
    label: "Receipt",
    title: "A signed receipt is issued",
    icon: FileCheck2,
    body:
      "The agent — and its controller — get back a Verifiable Credential receipt: portable proof of what was bought, by whom, and that it's paid for. Anyone can check it without touching the chain.",
    detail: { kind: "receipt" },
  },
];

function Detail({ step }) {
  const { detail } = step;
  if (detail.kind === "code") {
    return (
      <div className="rounded-lg bg-[#0A1614] border border-[#1E3A34] px-4 py-3 font-mono text-[13px] leading-6 text-[#7FE0BE]">
        {detail.lines.map((l, i) => (
          <div key={i} className={i === 0 ? "text-[#B7F5DC]" : "text-[#5C9985]"}>
            {l}
          </div>
        ))}
      </div>
    );
  }
  if (detail.kind === "kv") {
    return (
      <div className="rounded-lg border border-[#1E3A34] divide-y divide-[#16302B] overflow-hidden">
        {detail.rows.map(([k, v], i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5 bg-[#0A1614]">
            <span className="text-[12px] uppercase tracking-wide text-[#5C9985] font-mono">{k}</span>
            <span className="text-[13px] text-[#EAF5F0] font-medium">{v}</span>
          </div>
        ))}
      </div>
    );
  }
  if (detail.kind === "receipt") {
    return <Receipt />;
  }
  return null;
}

function Receipt() {
  return (
    <div className="relative">
      <div
        className="relative rounded-xl bg-[#EFF7F3] text-[#0A1614] px-5 pt-5 pb-6 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 6px 0, transparent 6px, #EFF7F3 6.5px)",
          backgroundSize: "16px 16px",
          backgroundPosition: "bottom",
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] tracking-[0.14em] uppercase text-[#5C9985] font-mono">
              Verifiable Receipt
            </div>
            <div className="text-[17px] font-semibold mt-0.5">Market Data Access</div>
          </div>
          <div className="rotate-6 border-2 border-[#0F7A5B] text-[#0F7A5B] text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded">
            Verified
          </div>
        </div>

        <div className="mt-4 border-t border-dashed border-[#B7CFC6] pt-3 space-y-2 font-mono text-[12px]">
          <Row k="Paid by" v="did:algo:9F3K…c71A" />
          <Row k="Paid to" v="did:algo:2L8x…90pQ" />
          <Row k="Amount" v="0.05 USDC" />
          <Row k="Network" v="Algorand Mainnet" />
          <Row k="Settled" v="Jul 13, 2026 · 14:02:11 UTC" />
        </div>

        <div className="mt-4 border-t border-dashed border-[#B7CFC6] pt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] text-[#0F7A5B] font-medium">
            <Check size={14} strokeWidth={3} />
            Signature valid — check without touching the chain
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#6B8A83]">{k}</span>
      <span className="text-[#0A1614]">{v}</span>
    </div>
  );
}

export default function AgentIdentityFlow() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];
  const Icon = step.icon;

  return (
    <div className="min-h-screen bg-[#08110F] text-[#EAF5F0] font-sans px-4 py-6 flex justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-5">
          <div className="text-[11px] tracking-[0.16em] uppercase text-[#5C9985] font-mono mb-1">
            Algorand x402
          </div>
          <h1 className="text-[20px] font-semibold leading-snug" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Agent identity &amp; payment receipts
          </h1>
        </div>

        {/* Stepper */}
        <div className="flex items-center mb-5">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button
                onClick={() => setActive(i)}
                aria-label={s.title}
                aria-current={i === active}
                className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[12px] font-mono border transition-colors focus:outline-none focus:ring-2 focus:ring-[#7FE0BE] ${
                  i === active
                    ? "bg-[#0F7A5B] border-[#0F7A5B] text-white"
                    : i < active
                    ? "bg-[#123A31] border-[#1E3A34] text-[#7FE0BE]"
                    : "bg-transparent border-[#1E3A34] text-[#5C9985]"
                }`}
              >
                {i < active ? <Check size={14} strokeWidth={3} /> : i + 1}
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px flex-1 mx-1 ${i < active ? "bg-[#0F7A5B]" : "bg-[#1E3A34]"}`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Active panel */}
        <div className="rounded-2xl border border-[#1E3A34] bg-[#0D1917] p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-[#123A31] flex items-center justify-center shrink-0">
              <Icon size={18} className="text-[#7FE0BE]" />
            </div>
            <div className="text-[12px] font-mono uppercase tracking-wide text-[#5C9985]">
              Step {active + 1} · {step.label}
            </div>
          </div>

          <h2 className="text-[16px] font-semibold mb-1.5 leading-snug">{step.title}</h2>
          <p className="text-[13.5px] text-[#A9C6BC] leading-relaxed mb-4">{step.body}</p>

          <Detail step={step} />

          <div className="flex items-center justify-between mt-5">
            <button
              onClick={() => setActive((a) => Math.max(0, a - 1))}
              disabled={active === 0}
              className="text-[13px] text-[#5C9985] disabled:opacity-30 px-1"
            >
              Back
            </button>
            {active < STEPS.length - 1 ? (
              <button
                onClick={() => setActive((a) => Math.min(STEPS.length - 1, a + 1))}
                className="flex items-center gap-1 text-[13px] font-medium bg-[#0F7A5B] hover:bg-[#128F6B] text-white px-4 py-2 rounded-lg transition-colors"
              >
                Next step <ChevronRight size={14} />
              </button>
            ) : (
              <span className="text-[12px] text-[#5C9985] font-mono">End of flow</span>
            )}
          </div>
        </div>

        <div className="mt-4 text-[12px] text-[#5C9985] leading-relaxed px-1">
          Every step after the first happens automatically in the background — the agent's
          controller only ever sees the request go out and the receipt come back.
        </div>
      </div>
    </div>
  );
}
