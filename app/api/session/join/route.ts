import { createSecret, enforceRateLimit, hashSecret, isSameOrigin, noStoreJson, normalizeCode, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { get, putIfAbsent } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      console.error('Transfer join failed: Invalid request origin');
      return noStoreJson(
        { success: false, message: 'Unable to connect. Please try again.', error: 'Invalid request origin' },
        { status: 403 }
      );
    }

    if (!(await enforceRateLimit(request, 'join', 30))) {
      console.error('Transfer join failed: Rate limit exceeded');
      return noStoreJson(
        { success: false, message: 'Too many verification attempts. Please try again shortly.', error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    let body: { code?: string };
    try {
      body = (await request.json()) as { code?: string };
    } catch (parseError) {
      console.error('Transfer join failed: Invalid request body JSON', parseError);
      return noStoreJson(
        { success: false, message: 'Invalid format. Enter a 6-digit code. Example: 583-921', error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const rawInput = body.code || '';
    const code = normalizeCode(rawInput);

    console.log(`[Receiver Join Debug]\nReceived code: ${rawInput}\nNormalized: ${code}\nSearching: pb:session:${code}`);

    if (!rawInput.trim()) {
      return noStoreJson(
        { success: false, message: 'Please enter the transfer code.', error: 'Empty code input' },
        { status: 400 }
      );
    }

    if (!code) {
      console.error(`Transfer join failed: Code format invalid (${rawInput})`);
      return noStoreJson(
        { success: false, message: 'Invalid format. Enter a 6-digit code. Example: 583-921', error: 'Invalid code format' },
        { status: 400 }
      );
    }

    const rawSession = await get(`pb:session:${code}`);
    console.log(`Redis result for pb:session:${code}: ${rawSession ? 'FOUND' : 'NOT FOUND'}`);

    if (!rawSession) {
      console.error(`Transfer join failed: Session key pb:session:${code} not found or expired`);
      return noStoreJson(
        { success: false, message: 'Transfer code not found. Check with sender.', error: 'Transfer code not found' },
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
        { success: false, message: 'This transfer code is already in use by another receiver.', error: 'Receiver already claimed' },
        { status: 409 }
      );
    }

    console.log(`Receiver Join Successful! Code: ${code}, Session ID: ${receiverToken}`);

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
      { success: false, message: 'Unable to connect. Please try again.', error: 'Server error' },
      { status: 500 }
    );
  }
}
