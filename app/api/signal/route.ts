import { randomUUID } from 'node:crypto';
import type { PeerRole, SignalMessage, SignalType } from '@/lib/types';
import { enforceRateLimit, isSameOrigin, noStoreJson, normalizeCode, safeSecretEquals, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { get, pushSignal, readSignals } from '@/lib/server/store';

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
};

async function authenticate(code: string, role: PeerRole, token: string) {
  if (token.length < 32 || token.length > 128) return false;

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
  const receiverHash = await get(`pb:receiver:${code}`);
  return Boolean(receiverHash && safeSecretEquals(token, receiverHash));
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: 'Invalid request origin.' }, { status: 403 });
  if (!(await enforceRateLimit(request, 'signal', 420))) {
    return noStoreJson({ error: 'Signal rate limit exceeded.' }, { status: 429 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > 100_000) return noStoreJson({ error: 'Signal message is too large.' }, { status: 413 });

  const raw = await request.text();
  if (raw.length > 100_000) return noStoreJson({ error: 'Signal message is too large.' }, { status: 413 });

  let body: SignalBody;
  try {
    body = JSON.parse(raw) as SignalBody;
  } catch {
    return noStoreJson({ error: 'Invalid request body.' }, { status: 400 });
  }

  const code = normalizeCode(body.code);
  const role = body.role === 'sender' || body.role === 'receiver' ? body.role : null;
  const token = typeof body.token === 'string' ? body.token : '';
  if (!code || !role || !token) return noStoreJson({ error: 'Invalid signaling credentials.' }, { status: 400 });
  if (!(await authenticate(code, role, token))) {
    console.error(`[Signaling Error] Unauthorized attempt for code: ${code}, role: ${role}`);
    return noStoreJson(
      {
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
    const messages = await readSignals(`pb:sig:${code}:${role}`);
    const parsed = messages.flatMap((item) => {
      try {
        return [JSON.parse(item) as SignalMessage];
      } catch {
        return [];
      }
    });
    return noStoreJson({ messages: parsed });
  }

  if (body.action === 'send') {
    if (!body.type || !allowedTypes.has(body.type)) {
      return noStoreJson({ error: 'Unsupported signal type.' }, { status: 400 });
    }

    const message: SignalMessage = {
      id: randomUUID(),
      type: body.type,
      payload: body.payload,
      sentAt: Date.now()
    };
    const destination: PeerRole = role === 'sender' ? 'receiver' : 'sender';
    await pushSignal(`pb:sig:${code}:${destination}`, JSON.stringify(message), SESSION_TTL_SECONDS);
    return noStoreJson({ ok: true, id: message.id });
  }

  return noStoreJson({ error: 'Unsupported signaling action.' }, { status: 400 });
}
