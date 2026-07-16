# Algorand Agent Identity + Payment Receipts

Local demo of the ACK-ID + ACK-Pay idea:

1. An agent gets a cryptographic `did:key` identity.
2. A controller issues a W3C Verifiable Credential authorizing spend.
3. The agent requests an x402-protected market-data resource.
4. The agent pays on Algorand LocalNet.
5. The merchant verifies the transaction and issues a signed VC receipt.
6. The receipt can be checked offline and linked to Lora for chain inspection.

This wires together existing primitives rather than inventing a new protocol: W3C DIDs/VCs, VC-JWT signatures, x402-style payment challenges, and Algorand transactions. The demo makes the missing integration visible: a wallet address alone does not identify the agent, its controller, its authority, or the purpose of payment.

## Run locally

Requirements: Node 24+, npm 11+, Docker, and AlgoKit.

```powershell
cmd /c "algokit localnet start"
cmd /c "npm install"
cmd /c "npm run dev"
```

Open `http://localhost:5173`.

The backend uses:

| Service | URL |
| --- | --- |
| React/Vite | `http://localhost:5173` |
| Express API | `http://localhost:3001` |
| algod LocalNet | `http://localhost:4001` |
| KMD LocalNet | `http://localhost:4002` |
| Lora | `https://lora.algokit.io/localnet` |

`server\.env.example` contains the LocalNet defaults. The LocalNet KMD wallet funds demo agents from the genesis account.

## Demo walkthrough

Use the five steps in the UI:

1. **Request** — inspect the paid `ALGO/USD` resource and x402 quote.
2. **Identity** — create an agent DID, controller DID, and Algorand account; fund the account from LocalNet.
3. **Authorize** — issue a signed spend-authorization VC with a daily cap.
4. **Settle** — request the payment challenge, send a real LocalNet payment, and verify it.
5. **Receipt** — browse all receipts from the current session, select one for full details, and open its transaction in Lora.

The automated path signs a real payment locally. The offline simulation is intentionally labeled and never claims on-chain settlement.

## Build and test

```powershell
cmd /c "npm run build"
cmd /c "npm run test"
```

## Project layout

- `client` — React flow, receipt history, detailed receipt view, and Lora links.
- `server/src/app.ts` — API routes.
- `server/src/services/merchantService.ts` — authorization, payment verification, and receipt issuance.
- `server/src/services/didKey.ts` and `vc.ts` — DID documents and VC-JWT signing/verification.
- `server/src/services/kmdService.ts` — LocalNet genesis-wallet funding.
- `docs/demo-slides.md` — evaluator-ready presentation script.

## Scope

Sessions and the spend ledger are in memory for demonstration. `did:key` is used for local portability; production deployments would add durable key custody, revocation/status checks, stronger replay protection, and a wallet/ARC-58 adapter.
