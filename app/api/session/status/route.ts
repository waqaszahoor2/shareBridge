import { enforceRateLimit, isSameOrigin, noStoreJson, normalizeCode, safeSecretEquals, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { del, get, put } from '@/lib/server/store';
import type { PeerRole } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = normalizeCode(searchParams.get('code'));
    const role = searchParams.get('role') === 'sender' || searchParams.get('role') === 'receiver' ? (searchParams.get('role') as PeerRole) : null;
    const token = searchParams.get('token') || '';

    if (!code || !token || !role) {
      return noStoreJson({ success: false, error: 'Missing required parameters' }, { status: 400 });
    }

    const rawSession = await get(`pb:session:${code}`);
    if (!rawSession) {
      return noStoreJson({ success: false, error: 'Session not found', code: 'SESSION_NOT_FOUND' }, { status: 404 });
    }

    let session: any;
    try {
      session = JSON.parse(rawSession);
    } catch {
      return noStoreJson({ success: false, error: 'Corrupt session data' }, { status: 500 });
    }

    let authenticated = false;
    if (role === 'sender') {
      authenticated = Boolean(session.ownerHash && safeSecretEquals(token, session.ownerHash));
    } else {
      authenticated = Boolean(session.receiverTokenHash && safeSecretEquals(token, session.receiverTokenHash));
      if (!authenticated) {
        const claimRaw = await get(`pb:receiver:${code}`);
        if (claimRaw) {
          try {
            const claim = JSON.parse(claimRaw);
            if (claim.tokenHash && safeSecretEquals(token, claim.tokenHash)) {
              authenticated = true;
            }
          } catch {}
        }
      }
    }

    if (!authenticated) {
      return noStoreJson({ success: false, error: 'Unauthorized token' }, { status: 401 });
    }

    return noStoreJson({
      success: true,
      code,
      status: session.status || 'created',
      receiverId: session.receiverId,
      files: session.files || [],
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    });
  } catch (err) {
    console.error('Session GET status error:', err instanceof Error ? err.message : err);
    return noStoreJson({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson({ success: false, error: 'Invalid origin' }, { status: 403 });
    }

    if (!(await enforceRateLimit(request, 'session-status', 120))) {
      return noStoreJson({ success: false, error: 'Rate limit exceeded' }, { status: 429 });
    }

    let body: {
      action?: 'get' | 'approve' | 'decline' | 'update';
      code?: string;
      role?: PeerRole;
      token?: string;
      status?: string;
    };
    try {
      body = await request.json();
    } catch {
      return noStoreJson({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const code = normalizeCode(body.code);
    const role = body.role === 'sender' || body.role === 'receiver' ? body.role : null;
    const token = typeof body.token === 'string' ? body.token : '';
    const action = body.action || 'get';

    if (!code || !token || !role) {
      return noStoreJson({ success: false, error: 'Missing required parameters' }, { status: 400 });
    }

    const rawSession = await get(`pb:session:${code}`);
    if (!rawSession) {
      return noStoreJson({ success: false, error: 'Session not found', code: 'SESSION_NOT_FOUND' }, { status: 404 });
    }

    let session: any;
    try {
      session = JSON.parse(rawSession);
    } catch {
      return noStoreJson({ success: false, error: 'Corrupt session data' }, { status: 500 });
    }

    let authenticated = false;
    if (role === 'sender') {
      authenticated = Boolean(session.ownerHash && safeSecretEquals(token, session.ownerHash));
    } else {
      authenticated = Boolean(session.receiverTokenHash && safeSecretEquals(token, session.receiverTokenHash));
      if (!authenticated) {
        const claimRaw = await get(`pb:receiver:${code}`);
        if (claimRaw) {
          try {
            const claim = JSON.parse(claimRaw);
            if (claim.tokenHash && safeSecretEquals(token, claim.tokenHash)) {
              authenticated = true;
            }
          } catch {}
        }
      }
    }

    if (!authenticated) {
      return noStoreJson({ success: false, error: 'Unauthorized token' }, { status: 401 });
    }

    if (action === 'get') {
      return noStoreJson({
        success: true,
        code,
        status: session.status || 'created',
        receiverId: session.receiverId,
        files: session.files || [],
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
      });
    }

    if (action === 'approve') {
      if (role !== 'sender') {
        return noStoreJson({ success: false, error: 'Only sender can approve transfer' }, { status: 403 });
      }

      session.status = 'approved';
      session.updatedAt = Date.now();
      await put(`pb:session:${code}`, JSON.stringify(session), SESSION_TTL_SECONDS);

      const claimRaw = await get(`pb:receiver:${code}`);
      if (claimRaw) {
        try {
          const claim = JSON.parse(claimRaw);
          claim.status = 'approved';
          await put(`pb:receiver:${code}`, JSON.stringify(claim), SESSION_TTL_SECONDS);
        } catch {}
      }

      return noStoreJson({ success: true, status: 'approved' });
    }

    if (action === 'decline') {
      session.status = 'declined';
      session.updatedAt = Date.now();
      await put(`pb:session:${code}`, JSON.stringify(session), SESSION_TTL_SECONDS);
      await del(`pb:receiver:${code}`);
      return noStoreJson({ success: true, status: 'declined' });
    }

    if (action === 'update') {
      const newStatus = body.status;
      const validStatuses = ['created', 'pending_approval', 'approved', 'signaling', 'connected', 'transferring', 'completed', 'declined', 'expired'];
      if (!newStatus || !validStatuses.includes(newStatus)) {
        return noStoreJson({ success: false, error: 'Invalid target status' }, { status: 400 });
      }
      session.status = newStatus;
      session.updatedAt = Date.now();
      await put(`pb:session:${code}`, JSON.stringify(session), SESSION_TTL_SECONDS);
      return noStoreJson({ success: true, status: newStatus });
    }

    return noStoreJson({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('Session POST status error:', err instanceof Error ? err.message : err);
    return noStoreJson({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
