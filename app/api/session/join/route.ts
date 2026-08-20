import { createSecret, enforceRateLimit, hashSecret, isSameOrigin, noStoreJson, normalizeCode, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { get, hasRedis, putIfAbsent } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: 'Invalid request origin.' }, { status: 403 });
  if (!(await enforceRateLimit(request, 'join', 24))) {
    return noStoreJson({ error: 'Too many code attempts. Try again shortly.' }, { status: 429 });
  }

  if (process.env.VERCEL && !hasRedis()) {
    return noStoreJson(
      { error: 'Production session storage is not configured.', code: 'PRODUCTION_STORAGE_REQUIRED' },
      { status: 503 }
    );
  }

  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return noStoreJson({ error: 'Invalid request body.' }, { status: 400 });
  }

  const code = normalizeCode(body.code);
  if (!code) return noStoreJson({ error: 'Enter a valid 6-digit transfer code.' }, { status: 400 });

  const session = await get(`pb:session:${code}`);
  if (!session) return noStoreJson({ error: 'Transfer code not found or expired.' }, { status: 404 });

  const receiverToken = createSecret();
  const claimed = await putIfAbsent(
    `pb:receiver:${code}`,
    hashSecret(receiverToken),
    SESSION_TTL_SECONDS
  );

  if (!claimed) {
    return noStoreJson({ error: 'This transfer already has a receiver.' }, { status: 409 });
  }

  return noStoreJson({ code, token: receiverToken, expiresIn: SESSION_TTL_SECONDS });
}
