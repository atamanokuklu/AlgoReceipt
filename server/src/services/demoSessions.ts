import { randomUUID } from 'node:crypto';
import algosdk from 'algosdk';
import { isTestnet, settings } from '../config.js';
import { createDidKeyIdentity, type DemoIdentity } from './didKey.js';

export interface DemoSession {
  id: string;
  createdAt: string;
  agent: DemoIdentity;
  controller: DemoIdentity;
  /** Algorand account generated for this agent to send real on-chain payments. */
  agentAlgoAddress: string;
  agentAlgoSk: Uint8Array;
}

class DemoSessionStore {
  private readonly sessions = new Map<string, DemoSession>();

  create(): DemoSession {
    // On TestNet, reuse a persistent pre-funded account (set AGENT_MNEMONIC in .env) so
    // demo sessions don't require re-funding a brand-new address every time. On LocalNet
    // we always mint a fresh throwaway account and fund it from the KMD dispenser.
    const algoAccount =
      isTestnet && settings.AGENT_MNEMONIC
        ? algosdk.mnemonicToSecretKey(settings.AGENT_MNEMONIC.trim())
        : algosdk.generateAccount();
    const session: DemoSession = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      agent: createDidKeyIdentity(),
      controller: createDidKeyIdentity(),
      agentAlgoAddress: algoAccount.addr.toString(),
      agentAlgoSk: algoAccount.sk
    };

    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): DemoSession | undefined {
    return this.sessions.get(sessionId);
  }
}

export const demoSessions = new DemoSessionStore();
