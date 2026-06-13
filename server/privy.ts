import type * as http from 'node:http';
import { PrivyClient } from '@privy-io/node';

export interface VerifiedPrivyLogin {
  userId: string;
}

const PRIVY_APP_ID = process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';

let client: PrivyClient | null = null;

function bearerToken(req: http.IncomingMessage): string | null {
  const auth = req.headers.authorization ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m?.[1]?.trim() || null;
}

function privyClient(): PrivyClient | null {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) return null;
  client ??= new PrivyClient({ appId: PRIVY_APP_ID, appSecret: PRIVY_APP_SECRET });
  return client;
}

export function privyConfigured(): boolean {
  return Boolean(PRIVY_APP_ID && PRIVY_APP_SECRET);
}

export async function verifyPrivyRequest(req: http.IncomingMessage): Promise<VerifiedPrivyLogin> {
  const token = bearerToken(req);
  if (!token) throw new Error('missing Privy access token');
  if (!PRIVY_APP_ID) throw new Error('PRIVY_APP_ID or VITE_PRIVY_APP_ID is not configured on the server');

  const sdk = privyClient();
  if (!sdk) {
    throw new Error('Privy server verification is not configured. Set PRIVY_APP_SECRET from the same Privy app.');
  }

  const claims = await sdk.utils().auth().verifyAccessToken(token);
  return { userId: claims.user_id };
}

export async function verifiedPrivySolanaWallet(userId: string, solanaWallet: string): Promise<boolean> {
  const sdk = privyClient();
  if (!sdk) throw new Error('PRIVY_APP_SECRET is required to verify Solana wallet ownership');
  const user = await sdk.users()._get(userId);
  return user.linked_accounts.some((account) => {
    const linked = account as { address?: unknown; chain_type?: unknown; connector_type?: unknown; wallet_client?: unknown };
    return linked.chain_type === 'solana'
      && typeof linked.address === 'string'
      && linked.address === solanaWallet
      && (linked.connector_type === 'embedded' || linked.wallet_client === 'privy');
  });
}

export function validSolanaAddress(address: unknown): address is string {
  return typeof address === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}
