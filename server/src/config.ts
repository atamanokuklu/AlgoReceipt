import { z } from 'zod';

// dotenv sets keys with blank values (e.g. `ALGOD_SERVER=`) to an empty string rather than
// leaving them unset, which would otherwise silently override our per-network defaults below
// with ''. Treat blank env vars as "not set" so `z.string().default(...)` actually kicks in.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, value === '' ? undefined : value])
);

const REQUESTED_NETWORK =
  (rawEnv.ALGO_NETWORK ?? 'localnet').trim().toLowerCase() === 'testnet' ? 'testnet' : 'localnet';

const LOCALNET_GENESIS_TOKEN = 'a'.repeat(64);

/** Sensible per-network defaults; explicit env vars always win. */
const NETWORK_ALGOD_DEFAULTS =
  REQUESTED_NETWORK === 'testnet'
    ? {
        // AlgoNode's free public TestNet API — no token required.
        ALGOD_SERVER: 'https://testnet-api.algonode.cloud',
        ALGOD_PORT: '',
        ALGOD_TOKEN: ''
      }
    : {
        ALGOD_SERVER: 'http://localhost',
        ALGOD_PORT: '4001',
        ALGOD_TOKEN: LOCALNET_GENESIS_TOKEN
      };

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  /** 'localnet' uses AlgoKit LocalNet + KMD dispenser funding. 'testnet' uses public TestNet
   * algod and requires manually funding the merchant/agent accounts (see README). */
  ALGO_NETWORK: z.enum(['localnet', 'testnet']).default(REQUESTED_NETWORK),
  ALGOD_SERVER: z.string().default(NETWORK_ALGOD_DEFAULTS.ALGOD_SERVER),
  ALGOD_PORT: z.string().default(NETWORK_ALGOD_DEFAULTS.ALGOD_PORT),
  ALGOD_TOKEN: z.string().default(NETWORK_ALGOD_DEFAULTS.ALGOD_TOKEN),
  KMD_SERVER: z.string().default('http://localhost'),
  KMD_PORT: z.coerce.number().int().positive().default(4002),
  KMD_TOKEN: z.string().default(''),
  /** Optional 25-word mnemonics for persistent TestNet accounts so funding survives restarts. */
  MERCHANT_MNEMONIC: z.string().optional(),
  AGENT_MNEMONIC: z.string().optional(),
  TESTNET_FAUCET_URL: z.string().default('https://bank.testnet.algorand.network/')
});

export const settings = envSchema.parse(rawEnv);

export const isTestnet = settings.ALGO_NETWORK === 'testnet';

export const algodBaseUrl = settings.ALGOD_PORT
  ? `${settings.ALGOD_SERVER.replace(/\/$/, '')}:${settings.ALGOD_PORT}`
  : settings.ALGOD_SERVER.replace(/\/$/, '');

/** Lora's URL network segment matches our ALGO_NETWORK value directly. */
export function buildLoraTxUrl(txId: string): string {
  return `https://lora.algokit.io/${settings.ALGO_NETWORK}/transaction/${txId}`;
}
