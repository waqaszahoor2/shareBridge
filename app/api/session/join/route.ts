import { createSecret, enforceRateLimit, hashSecret, isSameOrigin, noStoreJson, normalizeCode, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { get, putIfAbsent } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      console.error('Transfer join failed: Invalid request origin');
      return noStoreJson(
        { error: 'Unable to join transfer. Please try again.' },
        { status: 403 }
      );
    }

    if (!(await enforceRateLimit(request, 'join', 30))) {
      console.error('Transfer join failed: Rate limit exceeded');
      return noStoreJson(
        { error: 'Too many verification attempts. Please try again shortly.' },
        { status: 429 }
      );
    }

    let body: { code?: string };
    try {
      body = (await request.json()) as { code?: string };
    } catch (parseError) {
      console.error('Transfer join failed: Invalid request body JSON', parseError);
      return noStoreJson(
        { error: 'Unable to join transfer. Please try again.' },
        { status: 400 }
      );
    }

    const code = normalizeCode(body.code);
    if (!code) {
      console.error('Transfer join failed: Invalid code format', body.code);
      return noStoreJson(
        { error: 'Enter a valid 6-digit transfer code.' },
        { status: 400 }
      );
    }

    const rawSession = await get(`pb:session:${code}`);
    if (!rawSession) {
      console.error(`Transfer join failed: Session code ${code} not found or expired`);
      return noStoreJson(
        { error: 'Invalid or expired transfer code.' },
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
      console.error(`Transfer join failed: Code ${code} already claimed by another receiver`);
      return noStoreJson(
        { error: 'This transfer code is already in use by another receiver.' },
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
  } catch (err) {
    console.error('Transfer join failed unexpectedly:', err instanceof Error ? err.message : err);
    return noStoreJson(
      { error: 'Unable to join transfer. Please try again.' },
      { status: 500 }
    );
  }
}
