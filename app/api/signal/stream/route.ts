import { enforceRateLimit, isSameOrigin, noStoreJson, normalizeCode } from '@/lib/server/security';
import { hasRedis } from '@/lib/server/store';
import { authenticateSignal } from '@/lib/server/signalAuth';
import { getSignalChannel, getSignalRealtime } from '@/lib/server/signalRealtime';
import type { PeerRole } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

const encoder = new TextEncoder();

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return noStoreJson({ success: false, error: 'Invalid request origin.' }, { status: 403 });
  }
  if (!hasRedis()) {
    return noStoreJson({ success: false, error: 'Shared session storage is not configured.' }, { status: 503 });
  }
  if (!(await enforceRateLimit(request, 'signal-stream', 60))) {
    return noStoreJson({ success: false, error: 'Signal stream rate limit exceeded.' }, { status: 429 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > 4_096) {
    return noStoreJson({ success: false, error: 'Signal stream request is too large.' }, { status: 413 });
  }

  let body: { code?: string; role?: PeerRole; token?: string };
  try {
    const raw = await request.text();
    if (raw.length > 4_096) {
      return noStoreJson({ success: false, error: 'Signal stream request is too large.' }, { status: 413 });
    }
    body = JSON.parse(raw) as typeof body;
  } catch {
    return noStoreJson({ success: false, error: 'Invalid signal stream request.' }, { status: 400 });
  }

  const code = normalizeCode(body.code);
  const role = body.role === 'sender' || body.role === 'receiver' ? body.role : null;
  const token = typeof body.token === 'string' ? body.token : '';
  if (!code || !role || !(await authenticateSignal(code, role, token))) {
    return noStoreJson({ success: false, error: 'Invalid signaling credentials.' }, { status: 401 });
  }

  let controller: ReadableStreamDefaultController<Uint8Array>;
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let active = true;
  const close = () => {
    if (!active) return;
    active = false;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe?.();
    request.signal.removeEventListener('abort', close);
    try {
      controller.close();
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      controller.enqueue(encoder.encode(': connected\n\n'));
      heartbeat = setInterval(() => {
        if (active) controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 15_000);
    },
    cancel() {
      close();
    }
  });

  request.signal.addEventListener('abort', close, { once: true });
  if (request.signal.aborted) close();

  try {
    const stop = await getSignalRealtime().channel(getSignalChannel(code, role)).subscribe({
      events: ['signal.message'],
      history: { limit: 200 },
      onData({ data }) {
        if (active) controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }
    });
    if (active) unsubscribe = stop;
    else stop();
  } catch (error) {
    console.error('[Signal] Could not start realtime subscription:', error);
    close();
    return noStoreJson({ success: false, error: 'Realtime signaling is unavailable.' }, { status: 503 });
  }

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
