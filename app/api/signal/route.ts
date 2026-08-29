import { randomUUID } from 'node:crypto';
import type { PeerRole, SignalMessage, SignalType } from '@/lib/types';
import { enforceRateLimit, isSameOrigin, noStoreJson, normalizeCode, safeSecretEquals, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { get, incrementWithTtl, pushSignal, readSignals } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedTypes = new Set<SignalType>(['offer', 'answer', 'ice']);

type SignalBody = {
  action?: 'send' | 'poll';
  code?: string;
  role?: PeerRole;
  token?: string;
  type?: SignalType;
  payload?: unknown;
  since?: number;
};

async function authenticate(code: string, role: PeerRole, token: string) {
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

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return noStoreJson({ success: false, error: 'Invalid request origin.' }, { status: 403 });
  }

  if (!(await enforceRateLimit(request, 'signal', 420))) {
    return noStoreJson({ success: false, error: 'Signal rate limit exceeded.' }, { status: 429 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > 100_000) {
    return noStoreJson({ success: false, error: 'Signal message is too large.' }, { status: 413 });
  }

  const raw = await request.text();
  if (raw.length > 100_000) {
    return noStoreJson({ success: false, error: 'Signal message is too large.' }, { status: 413 });
  }

  let body: SignalBody;
  try {
    body = JSON.parse(raw) as SignalBody;
  } catch {
    return noStoreJson({ success: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const code = normalizeCode(body.code);
  const role = body.role === 'sender' || body.role === 'receiver' ? body.role : null;
  const token = typeof body.token === 'string' ? body.token : '';

  if (!code || !role || !token) {
    return noStoreJson({ success: false, error: 'Invalid signaling credentials.' }, { status: 400 });
  }

  if (!(await authenticate(code, role, token))) {
    return noStoreJson(
      {
        success: false,
        error: 'Unable to join transfer.',
        reasons: [
          'Code expired',
          'Session unavailable',
          'Network blocked connection',
          'Server session storage unavailable'
        ]
      },
      { status: 401 }
    );
  }

  if (body.action === 'poll') {
    const sinceSeq = typeof body.since === 'number' && body.since >= 0 ? body.since : 0;
    const rawMessages = await readSignals(`pb:sig:${code}:${role}`);
    const parsed: SignalMessage[] = [];
    let maxSeq = sinceSeq;

    for (const item of rawMessages) {
      try {
        const msg = JSON.parse(item) as SignalMessage;
        if (msg && typeof msg.seq === 'number') {
          if (msg.seq > maxSeq) maxSeq = msg.seq;
          if (msg.seq > sinceSeq) {
            parsed.push(msg);
          }
        } else if (msg) {
          parsed.push(msg);
        }
      } catch {}
    }

    return noStoreJson({ success: true, messages: parsed, lastSeq: maxSeq });
  }

  if (body.action === 'send') {
    if (!body.type || !allowedTypes.has(body.type)) {
      return noStoreJson({ success: false, error: 'Unsupported signal type.' }, { status: 400 });
    }

    const seq = await incrementWithTtl(`pb:sig_seq:${code}`, SESSION_TTL_SECONDS);

    const message: SignalMessage = {
      id: randomUUID(),
      seq,
      type: body.type,
      payload: body.payload,
      sentAt: Date.now()
    };

    const destination: PeerRole = role === 'sender' ? 'receiver' : 'sender';
    await pushSignal(`pb:sig:${code}:${destination}`, JSON.stringify(message), SESSION_TTL_SECONDS);
    return noStoreJson({ success: true, ok: true, id: message.id, seq });
  }

  return noStoreJson({ success: false, error: 'Unsupported signaling action.' }, { status: 400 });
}

