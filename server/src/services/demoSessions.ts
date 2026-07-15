import { randomUUID } from 'node:crypto';
import { createDidKeyIdentity, type DemoIdentity } from './didKey.js';

export interface DemoSession {
  id: string;
  createdAt: string;
  agent: DemoIdentity;
  controller: DemoIdentity;
}

class DemoSessionStore {
  private readonly sessions = new Map<string, DemoSession>();

  create(): DemoSession {
    const session: DemoSession = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      agent: createDidKeyIdentity(),
      controller: createDidKeyIdentity()
    };

    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): DemoSession | undefined {
    return this.sessions.get(sessionId);
  }
}

export const demoSessions = new DemoSessionStore();
