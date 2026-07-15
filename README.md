# Algorand x402 Agent Identity + Verifiable Receipts Demo

Hackathon prototype with:

- **Vite + React + TypeScript** frontend
- **Express + TypeScript** backend
- **Ed25519 `did:key`** demo identities
- **VC-JWT** spend authorizations and payment receipts
- **Algorand algod verification** for live settlement when LocalNet is actually reachable
- **Clearly labeled offline simulation mode** for demo UI only

## Workspace layout

- `client` – React demo UI
- `server` – Express API, DID/VC logic, Algorand verification

## Requirements

- Node **24+**
- npm **11+**
- For live Algorand settlement verification: an **algod endpoint**

This repo defaults to **LocalNet-style algod settings**:

- `ALGOD_SERVER=http://localhost`
- `ALGOD_PORT=4001`
- `ALGOD_TOKEN=`

If Docker is not running and LocalNet is unavailable, the app stays honest:

- `/api/status` reports algod as unreachable
- live settlement stays disabled/fails safely
- the UI offers a **demo-only offline simulation**

## Install

> On this Windows setup, run npm through `cmd /c` to avoid `npm.ps1` execution-policy issues.

```powershell
cmd /c "npm install"
```

## Run

Start both apps:

```powershell
cmd /c "npm run dev"
```

Or individually:

```powershell
cmd /c "npm run dev -w server"
cmd /c "npm run dev -w client"
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Build and test

```powershell
cmd /c "npm run build"
cmd /c "npm run test"
```

## Environment

Create `server\.env` from `server\.env.example` if you need custom settings.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Express server port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS origin |
| `ALGOD_SERVER` | `http://localhost` | algod host |
| `ALGOD_PORT` | `4001` | algod port |
| `ALGOD_TOKEN` | empty | algod API token |

## LocalNet notes

Live settlement verification requires a real algod endpoint. A common local option is Algorand LocalNet, which itself requires **Docker**. Docker is **not** installed in this validation environment, so live settlement could not be exercised here.

Example LocalNet-oriented env:

```env
ALGOD_SERVER=http://localhost
ALGOD_PORT=4001
ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

Once algod is reachable, the backend verifies a submitted transaction id against algod and only then issues a live receipt VC-JWT.

## Demo flow

1. Preview the paid request
2. Create a demo agent/controller `did:key` identity pair
3. Issue a signed spend authorization VC-JWT
4. Request the merchant paywall, then either:
   - submit a **real Algorand tx id** for live verification, or
   - use the **offline simulation** path for demo purposes only
5. Inspect the signed receipt VC-JWT and verification output

## Limitations

- Live settlement depends on a reachable algod node.
- The demo uses in-memory sessions and spend tracking.
- Offline simulation issues a clearly marked simulated receipt and does **not** claim on-chain settlement.
