import { createSecret, enforceRateLimit, hashSecret, isSameOrigin, noStoreJson, normalizeCode, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { get, hasRedis, putIfAbsent } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return noStoreJson(
      {
        error: 'Unable to join transfer session.',
        reasons: ['Request origin header does not match host', 'Cross-site request blocked for security']
      },
      { status: 403 }
    );
  }

  if (!(await enforceRateLimit(request, 'join', 24))) {
    return noStoreJson(
      {
        error: 'Unable to join transfer session.',
        reasons: ['Too many code verification attempts', 'Rate limit active (try again in 60s)']
      },
      { status: 429 }
    );
  }

  if (process.env.VERCEL && !hasRedis()) {
    return noStoreJson(
      {
        error: 'Unable to join transfer session.',
        code: 'PRODUCTION_STORAGE_REQUIRED',
        reasons: [
          'Server unavailable: Upstash Redis connection required on Vercel',
          'Missing environment variables: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN'
        ]
      },
      { status: 503 }
    );
  }

  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return noStoreJson(
      {
        error: 'Unable to join transfer session.',
        reasons: ['Invalid request payload']
      },
      { status: 400 }
    );
  }

  const code = normalizeCode(body.code);
  if (!code) {
    return noStoreJson(
      {
        error: 'Invalid transfer code format.',
        reasons: ['Transfer code must be exactly 6 numeric digits']
      },
      { status: 400 }
    );
  }

  const rawSession = await get(`pb:session:${code}`);
  if (!rawSession) {
    return noStoreJson(
      {
        error: 'Invalid or expired transfer code.',
        reasons: [
          'The 6-digit transfer code was not found or has expired',
          'Codes automatically expire 10 minutes after generation',
          'The sender device cancelled or refreshed their browser'
        ]
      },
      { status: 404 }
    );
  }

  let sessionObj: { files?: unknown; createdAt?: number; expiresAt?: string } = {};
  try {
    sessionObj = JSON.parse(rawSession);
  } catch {}

  const receiverToken = createSecret();
  const claimed = await putIfAbsent(
    `pb:receiver:${code}`,
    hashSecret(receiverToken),
    SESSION_TTL_SECONDS
  );

  if (!claimed) {
    return noStoreJson(
      {
        error: 'Unable to join transfer session.',
        reasons: [
          'Only one receiver device is allowed per transfer code',
          'Another receiver has already joined this transfer session'
        ]
      },
      { status: 409 }
    );
  }

  return noStoreJson({
    success: true,
    code,
    sessionId: receiverToken,
    token: receiverToken,
    expiresIn: SESSION_TTL_SECONDS,
    files: sessionObj.files || []
  });
}
