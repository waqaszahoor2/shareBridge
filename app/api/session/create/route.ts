import { createCode, createSecret, enforceRateLimit, hashSecret, isSameOrigin, noStoreJson, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { putIfAbsent } from '@/lib/server/store';
import type { FileMeta } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      console.error('Transfer creation failed: Invalid request origin');
      return noStoreJson(
        { error: 'Unable to create transfer. Please try again.' },
        { status: 403 }
      );
    }

    if (!(await enforceRateLimit(request, 'create', 20))) {
      console.error('Transfer creation failed: Rate limit exceeded');
      return noStoreJson(
        { error: 'Too many creation requests. Please try again shortly.' },
        { status: 429 }
      );
    }

    let files: FileMeta[] = [];
    try {
      const raw = await request.text();
      if (raw) {
        const parsed = JSON.parse(raw) as { files?: FileMeta[] };
        if (Array.isArray(parsed.files)) {
          files = parsed.files
            .filter((f) => f && typeof f.name === 'string' && f.name.trim().length > 0 && typeof f.size === 'number' && f.size > 0)
            .map((f) => ({
              id: String(f.id || '').slice(0, 80),
              name: String(f.name).trim().slice(0, 255),
              size: Math.max(1, Number(f.size || 0)),
              type: String(f.type || 'application/octet-stream').slice(0, 120),
              extension: String(f.extension || '').slice(0, 12)
            }));
        }
      }
    } catch (parseError) {
      console.error('Transfer creation failed: Invalid request body JSON', parseError);
      return noStoreJson(
        { error: 'Unable to create transfer. Please try again.' },
        { status: 400 }
      );
    }

    if (!files.length) {
      console.error('Transfer creation failed: Empty or invalid file selection');
      return noStoreJson(
        { error: 'Please select at least one valid file.' },
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

    console.error('Transfer creation failed: Code allocation collision after 12 attempts');
    return noStoreJson(
      { error: 'Unable to create transfer. Please try again.' },
      { status: 503 }
    );
  } catch (err) {
    console.error('Transfer creation failed unexpectedly:', err instanceof Error ? err.message : err);
    return noStoreJson(
      { error: 'Unable to create transfer. Please try again.' },
      { status: 500 }
    );
  }
}
