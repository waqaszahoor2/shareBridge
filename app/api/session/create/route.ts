import { createCode, createSecret, enforceRateLimit, hashSecret, isSameOrigin, noStoreJson, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { hasRedis, putIfAbsent } from '@/lib/server/store';
import type { FileMeta } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return noStoreJson(
      {
        error: 'Unable to create transfer session.',
        reasons: ['Request origin header does not match host', 'Cross-site request blocked for security']
      },
      { status: 403 }
    );
  }

  if (!(await enforceRateLimit(request, 'create', 12))) {
    return noStoreJson(
      {
        error: 'Unable to create transfer session.',
        reasons: ['Too many transfer creation attempts from this IP address', 'Rate limit window active (try again in 60s)']
      },
      { status: 429 }
    );
  }

  if (process.env.VERCEL && !hasRedis()) {
    return noStoreJson(
      {
        error: 'Unable to create transfer session.',
        code: 'PRODUCTION_STORAGE_REQUIRED',
        reasons: [
          'Server unavailable: Upstash Redis connection required on Vercel',
          'Missing environment variables: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN'
        ]
      },
      { status: 503 }
    );
  }

  let files: FileMeta[] = [];
  try {
    const raw = await request.text();
    if (raw) {
      const parsed = JSON.parse(raw) as { files?: FileMeta[] };
      if (Array.isArray(parsed.files)) {
        files = parsed.files.map((f) => ({
          id: String(f.id || '').slice(0, 80),
          name: String(f.name || 'unnamed').slice(0, 255),
          size: Math.max(0, Number(f.size || 0)),
          type: String(f.type || 'application/octet-stream').slice(0, 120),
          extension: String(f.extension || '').slice(0, 12)
        }));
      }
    }
  } catch {
    return noStoreJson(
      {
        error: 'Unable to create transfer session.',
        reasons: ['Invalid file selection payload sent to API']
      },
      { status: 400 }
    );
  }

  const ownerToken = createSecret();
  const ownerHash = hashSecret(ownerToken);
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_SECONDS * 1000).toISOString();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = createCode();
    const sessionData = {
      code,
      sessionId: ownerToken,
      ownerHash,
      files,
      status: 'waiting',
      createdAt: now,
      expiresAt
    };

    const created = await putIfAbsent(`pb:session:${code}`, JSON.stringify(sessionData), SESSION_TTL_SECONDS);
    if (created) {
      return noStoreJson({
        success: true,
        code,
        sessionId: ownerToken,
        token: ownerToken,
        expiresIn: SESSION_TTL_SECONDS,
        expiresAt,
        files
      });
    }
  }

  return noStoreJson(
    {
      error: 'Unable to create transfer session.',
      reasons: ['Could not allocate a unique transfer code after multiple attempts', 'Server storage code collision']
    },
    { status: 503 }
  );
}
