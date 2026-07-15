import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  ALGOD_SERVER: z.string().default('http://localhost'),
  ALGOD_PORT: z.string().default('4001'),
  ALGOD_TOKEN: z.string().default(''),
  KMD_SERVER: z.string().default('http://localhost'),
  KMD_PORT: z.coerce.number().int().positive().default(4002),
  KMD_TOKEN: z.string().default('')
});

export const settings = envSchema.parse(process.env);

export const algodBaseUrl = `${settings.ALGOD_SERVER.replace(/\/$/, '')}:${settings.ALGOD_PORT}`;
