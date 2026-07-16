# Agent Identity + Verifiable Payment Receipts

## Slide 1 — The problem

An x402 payment proves that money moved. It does not prove:

- which agent made the request;
- which controller authorized the agent;
- what the payment was for; or
- how another service can verify the receipt without querying the chain again.

This is the machine-readable equivalent of an ID card plus receipt for autonomous commerce.

## Slide 2 — The proposed flow

**ACK-ID equivalent:** a W3C DID identifies the agent and resolves to a verification document.

**ACK-Pay equivalent:** the merchant issues a signed Verifiable Credential after payment.

```text
Agent DID
   ↓
Controller spend-authorization VC
   ↓
x402 payment challenge
   ↓
Algorand LocalNet payment
   ↓
Merchant algod verification
   ↓
Signed payment-receipt VC
```

## Slide 3 — What the demo implements

- Ed25519 `did:key` identities for agent, controller, and merchant.
- VC-JWT spend authorization with resource, amount, network, and daily cap.
- x402-style `402 Payment Required` response.
- LocalNet KMD funding for a newly generated agent account.
- Real Algorand payment signed by the agent account.
- Algod confirmation and transaction-field validation.
- Merchant-issued `PaymentReceiptCredential`.
- Receipt signature verification, receipt history, and full detail inspection.
- Lora deep link for on-chain transaction exploration.

## Slide 4 — Live evaluator walkthrough

1. Start LocalNet and the app.
2. Open the Request step and confirm `algod reachable`.
3. Create the demo identity.
4. Fund the displayed agent account from the LocalNet genesis wallet.
5. Issue a `$50/day` spend authorization.
6. Request the x402 challenge.
7. Click **Send payment from agent & verify**.
8. Open the final Receipt step.
9. Select receipts in the history list to inspect every field.
10. Open the Lora link and compare the tx id, sender, receiver, amount, fee, note, and confirmed round.

## Slide 5 — How to read the receipt

The receipt contains:

- agent DID and controller DID;
- merchant DID and payment address;
- protected resource and description;
- USD and microAlgo amounts;
- Algorand network and transaction id;
- sender, receiver, fee, note, confirmed round, and round time;
- settlement mode and verifier message.

The green **Verified** stamp is shown only when the VC signature is valid **and** the payment was verified against algod. Offline simulation remains clearly labeled.

## Slide 6 — Why Algorand

Algorand supplies the fast, inexpensive settlement layer and developer tooling. LocalNet makes the entire flow reproducible for evaluators. Lora makes the transaction understandable instead of reducing the proof to an opaque hash.

The project’s value is the integration layer: DID issuance → delegated authorization → x402 payment → verifiable receipt.

## Slide 7 — Production path

The demo is intentionally local and in-memory. A production SDK would add:

- durable key custody or ARC-58 smart-wallet support;
- credential status and revocation;
- replay/idempotency storage;
- durable receipt storage and export;
- policy adapters for merchants and controllers;
- testnet/mainnet configuration and wallet UX.
