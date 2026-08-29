import { enforceRateLimit, isSameOrigin, noStoreJson, normalizeCode, safeSecretEquals } from '@/lib/server/security';
import { del, get } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson({ success: false, error: 'Invalid origin' }, { status: 403 });
    }

    if (!(await enforceRateLimit(request, 'release', 40))) {
      return noStoreJson({ success: false, error: 'Rate limit exceeded' }, { status: 429 });
    }

    let body: { code?: string; receiverId?: string; resumeToken?: string; token?: string };
    try {
      body = await request.json();
    } catch {
      return noStoreJson({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const code = normalizeCode(body.code);
    const token = typeof body.resumeToken === 'string' ? body.resumeToken : typeof body.token === 'string' ? body.token : '';

    if (!code || !token) {
      return noStoreJson({ success: false, error: 'Missing code or token' }, { status: 400 });
    }

    const existingClaimRaw = await get(`pb:receiver:${code}`);
    if (!existingClaimRaw) {
      return noStoreJson({ success: true, released: false, message: 'No claim existed' });
    }

    let tokenHash = existingClaimRaw;
    let finalized = false;

    try {
      const parsed = JSON.parse(existingClaimRaw) as { tokenHash?: string; finalized?: boolean };
      if (parsed.tokenHash) tokenHash = parsed.tokenHash;
      if (parsed.finalized) finalized = Boolean(parsed.finalized);
    } catch {}

    if (safeSecretEquals(token, tokenHash)) {
      if (!finalized) {
        await del(`pb:receiver:${code}`);
        return noStoreJson({ success: true, released: true });
      }
      return noStoreJson({ success: true, released: false, message: 'Claim is finalized' });
    }

    return noStoreJson({ success: false, error: 'Unauthorized token' }, { status: 401 });
  } catch (err) {
    console.error('Release session failed:', err instanceof Error ? err.message : err);
    return noStoreJson({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
