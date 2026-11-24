import { enforceRateLimit, isSameOrigin, noStoreJson, normalizeCode, safeSecretEquals } from '@/lib/server/security';
import { del, get, put } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson({ success: false, error: 'Invalid origin' }, { status: 403 });
    }

    if (!(await enforceRateLimit(request, 'release', 40))) {
      return noStoreJson({ success: false, error: 'Rate limit exceeded' }, { status: 429 });
    }

    let body: { code?: string; receiverId?: string; resumeToken?: string; token?: string; purge?: boolean };
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
    const rawSession = await get(`pb:session:${code}`);

    if (body.purge === true) {
      if (!rawSession) {
        return noStoreJson({ success: false, error: 'Session not found' }, { status: 404 });
      }

      let authorized = false;
      try {
        const session = JSON.parse(rawSession) as { ownerHash?: string };
        authorized = Boolean(session.ownerHash && safeSecretEquals(token, session.ownerHash));
      } catch {
        return noStoreJson({ success: false, error: 'Corrupt session data' }, { status: 500 });
      }

      if (!authorized && existingClaimRaw) {
        let tokenHash = existingClaimRaw;
        try {
          const claim = JSON.parse(existingClaimRaw) as { tokenHash?: string };
          if (claim.tokenHash) tokenHash = claim.tokenHash;
        } catch {}
        authorized = safeSecretEquals(token, tokenHash);
      }

      if (!authorized) {
        return noStoreJson({ success: false, error: 'Unauthorized token' }, { status: 401 });
      }

      await del(`pb:session:${code}`);
      await del(`pb:receiver:${code}`);
      await del(`pb:sig:${code}:sender`);
      await del(`pb:sig:${code}:receiver`);
      await del(`pb:sig_seq:${code}`);
      await del(`peerbridge-signal:${code}:sender`);
      await del(`peerbridge-signal:${code}:receiver`);
      return noStoreJson({ success: true, released: true, purged: true });
    }

    if (!existingClaimRaw) {
      return noStoreJson({ success: true, released: false, message: 'No claim existed' });
    }

    let tokenHash = existingClaimRaw;
    try {
      const parsed = JSON.parse(existingClaimRaw) as { tokenHash?: string };
      if (parsed.tokenHash) tokenHash = parsed.tokenHash;
    } catch {}

    if (safeSecretEquals(token, tokenHash)) {
      await del(`pb:receiver:${code}`);
      if (rawSession) {
        try {
          const sessionObj = JSON.parse(rawSession);
          if (sessionObj.status === 'pending_approval') {
            sessionObj.status = 'created';
            delete sessionObj.receiverId;
            delete sessionObj.receiverTokenHash;
            await put(`pb:session:${code}`, JSON.stringify(sessionObj), 600);
          }
        } catch {}
      }
      return noStoreJson({ success: true, released: true });
    }

    return noStoreJson({ success: false, error: 'Unauthorized token' }, { status: 401 });
  } catch (err) {
    console.error('Release session failed:', err instanceof Error ? err.message : err);
    return noStoreJson({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
