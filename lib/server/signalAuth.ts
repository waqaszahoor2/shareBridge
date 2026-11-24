import { get } from '@/lib/server/store';
import { safeSecretEquals } from '@/lib/server/security';
import type { PeerRole } from '@/lib/types';

export async function authenticateSignal(code: string, role: PeerRole, token: string) {
  if (!token || token.length < 16 || token.length > 128) return false;

  if (role === 'sender') {
    const raw = await get(`pb:session:${code}`);
    if (!raw) return false;
    try {
      const session = JSON.parse(raw) as { ownerHash?: string };
      return Boolean(session.ownerHash && safeSecretEquals(token, session.ownerHash));
    } catch {
      return false;
    }
  }

  const session = await get(`pb:session:${code}`);
  if (!session) return false;
  const receiverClaimRaw = await get(`pb:receiver:${code}`);
  if (!receiverClaimRaw) return false;

  let tokenHash = receiverClaimRaw;
  try {
    const parsed = JSON.parse(receiverClaimRaw) as { tokenHash?: string };
    if (parsed.tokenHash) tokenHash = parsed.tokenHash;
  } catch {}

  return Boolean(tokenHash && safeSecretEquals(token, tokenHash));
}
