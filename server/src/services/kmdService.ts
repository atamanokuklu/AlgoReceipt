import algosdk from 'algosdk';
import { settings } from '../config.js';

const KMD_WALLET_NAME = 'unencrypted-default-wallet';
const KMD_WALLET_PASSWORD = '';

export interface DispenserAccount {
  addr: string;
  sk: Uint8Array;
}

export async function getDispenserAccount(): Promise<DispenserAccount> {
  const kmd = new algosdk.Kmd(
    settings.KMD_TOKEN,
    settings.KMD_SERVER,
    settings.KMD_PORT
  );

  const { wallets } = await kmd.listWallets();
  const wallet = (wallets as Array<{ id: string; name: string }>).find(
    (w) => w.name === KMD_WALLET_NAME
  );

  if (!wallet) {
    throw new Error(
      `KMD wallet "${KMD_WALLET_NAME}" not found. Is AlgoKit LocalNet running?`
    );
  }

  const { wallet_handle_token: token } = await kmd.initWalletHandle(
    wallet.id,
    KMD_WALLET_PASSWORD
  );

  try {
    const { addresses } = await kmd.listKeys(token);
    if (!addresses?.length) {
      throw new Error('No keys in KMD default wallet.');
    }

    // Sort to pick the richest-by-default genesis account (first alphabetically)
    const address = (addresses as string[]).sort()[0];
    const { private_key } = await kmd.exportKey(token, KMD_WALLET_PASSWORD, address);

    return { addr: address, sk: private_key as Uint8Array };
  } finally {
    await kmd.releaseWalletHandle(token).catch(() => undefined);
  }
}
