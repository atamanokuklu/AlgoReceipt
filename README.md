# Algorand Agent Identity + Payment Receipts

Local demo of the ACK-ID + ACK-Pay idea:

1. An evaluator chooses a paid agent service.
2. An agent gets a cryptographic `did:key` identity.
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
| algod LocalNet | `http://localhost:4001` (TestNet: `https://testnet-api.algonode.cloud`) |
| KMD LocalNet | `http://localhost:4002` (not used on TestNet) |
| Lora | `https://lora.algokit.io/localnet` (TestNet: `https://lora.algokit.io/testnet`) |

`server\.env.example` contains the LocalNet defaults. The LocalNet KMD wallet funds demo agents from the genesis account.

## Run on Algorand TestNet (real transactions)

The same app can also point at public Algorand TestNet so payments are real, on-chain, and
independently verifiable on Lora TestNet — no LocalNet/Docker required.

1. **Generate persistent accounts** (one for the merchant treasury, one for the demo agent):
   ```powershell
   cmd /c "npm run gen:testnet-account -w server"
   ```
   Run it twice and note each printed address + 25-word mnemonic. Persistent accounts mean you
   only have to fund them once — restarting the server won't roll a new address.

2. **Fund both addresses with real TestNet ALGO.** TestNet ALGO is separate "play money" that
   must come from a TestNet faucet or an existing TestNet wallet — it is not the same as MainNet
   ALGO or any MainNet token balance:
   - Official dispenser: https://bank.testnet.algorand.network/ (paste the address, request ALGO).
   - Or send TestNet ALGO from your own Pera/Defly wallet if you already hold TestNet funds there.
   - The merchant treasury needs ~1 ALGO; the agent needs enough to cover the resource price plus
     Algorand's 0.1 ALGO minimum balance and fees (a few ALGO is plenty for the whole demo).
   - Note on USDT/USDC: Algorand TestNet does not have an official "USDT" ASA. If you want to pay
     with a stablecoin instead of ALGO, the closest real equivalent is TestNet USDC
     (asset ID `10458941`) — opting in and paying with an ASA is not wired into the payment flow
     yet (see Scope below), so today's demo settles in ALGO on both LocalNet and TestNet.

3. **Configure the server** — edit `server/.env`:
   ```ini
   ALGO_NETWORK=testnet
   MERCHANT_MNEMONIC=<merchant mnemonic from step 1>
   AGENT_MNEMONIC=<agent mnemonic from step 1>
   ```
   Leave `ALGOD_SERVER` / `ALGOD_PORT` / `ALGOD_TOKEN` unset — they default to AlgoNode's free
   public TestNet API (`https://testnet-api.algonode.cloud`, no token needed).

4. **Restart the server** (`npm run dev`). The status banner switches to "Algorand TestNet", the
   Identity step shows the funded agent address with a manual-funding panel (instead of the
   LocalNet dispenser button) if it still needs ALGO, and every settled payment links to
   `https://lora.algokit.io/testnet/transaction/<txid>` — a real, independently verifiable TestNet
   transaction.

## Demo walkthrough

Use the five steps in the UI. The first step lets you choose among:

- ALGO/USD market data
- Amsterdam weather
- English-to-French translation
- Basic counterparty risk score

Each use case has its own endpoint, description, and microAlgo price, and that selection is carried through the authorization, x402 challenge, payment note, and receipt.

Then continue:

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

Sessions and the spend ledger are in memory for demonstration. `did:key` is used for local portability; production deployments would add durable key custody, revocation/status checks, stronger replay protection, and a wallet/ARC-58 adapter. Payments settle in ALGO on both LocalNet and TestNet; ASA/stablecoin settlement (e.g. TestNet USDC) is not yet wired into the payment flow.
