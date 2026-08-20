import { createCode, createSecret, enforceRateLimit, hashSecret, isSameOrigin, noStoreJson, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { hasRedis, putIfAbsent } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return noStoreJson({ error: 'Invalid request origin.' }, { status: 403 });
  if (!(await enforceRateLimit(request, 'create', 12))) {
    return noStoreJson({ error: 'Too many transfer sessions. Try again shortly.' }, { status: 429 });
  }

  if (process.env.VERCEL && !hasRedis()) {
    return noStoreJson(
      {
        error: 'Production session storage is not configured.',
        code: 'PRODUCTION_STORAGE_REQUIRED'
      },
      { status: 503 }
    );
  }

  const ownerToken = createSecret();
  const ownerHash = hashSecret(ownerToken);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = createCode();
    const session = JSON.stringify({ ownerHash, createdAt: Date.now() });
    const created = await putIfAbsent(`pb:session:${code}`, session, SESSION_TTL_SECONDS);
    if (created) {
      return noStoreJson({ code, token: ownerToken, expiresIn: SESSION_TTL_SECONDS });
    }
  }

  return noStoreJson({ error: 'Could not allocate a transfer code. Please retry.' }, { status: 503 });
}
