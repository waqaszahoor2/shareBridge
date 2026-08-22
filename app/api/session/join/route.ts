import { createSecret, enforceRateLimit, hashSecret, isSameOrigin, noStoreJson, normalizeCode, safeSecretEquals, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { get, putIfAbsent } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      console.error('Transfer join failed: Invalid request origin');
      return noStoreJson(
        {
          success: false,
          message: 'Unable to join transfer.',
          error: 'Invalid request origin',
          reasons: ['Network or cross-origin security block', 'Please reload the page and try again']
        },
        { status: 403 }
      );
    }

    if (!(await enforceRateLimit(request, 'join', 30))) {
      console.error('Transfer join failed: Rate limit exceeded');
      return noStoreJson(
        {
          success: false,
          message: 'Unable to join transfer.',
          error: 'Too many verification attempts',
          reasons: ['Rate limit exceeded. Please wait a minute and try again.']
        },
        { status: 429 }
      );
    }

    let body: { code?: string; token?: string };
    try {
      body = (await request.json()) as { code?: string; token?: string };
    } catch (parseError) {
      console.error('Transfer join failed: Invalid request body JSON', parseError);
      return noStoreJson(
        {
          success: false,
          message: 'Unable to join transfer.',
          error: 'Invalid request payload',
          reasons: ['Format must be a 6-digit code. Example: 438-639']
        },
        { status: 400 }
      );
    }

    const rawInput = body.code || '';
    const code = normalizeCode(rawInput);

    console.log(`[Receiver Join Request]\nReceived code: ${rawInput}\nNormalized: ${code}`);

    if (!rawInput.trim()) {
      return noStoreJson(
        { success: false, message: 'Please enter transfer code.', error: 'Empty code input' },
        { status: 400 }
      );
    }

    if (!code || code.length !== 6) {
      console.error(`Transfer join failed: Code format invalid (${rawInput})`);
      return noStoreJson(
        {
          success: false,
          message: 'Unable to join transfer.',
          error: 'Invalid format. Enter a 6-digit code. Example: 438-639',
          reasons: ['Format must be 6 digits (XXX-XXX)']
        },
        { status: 400 }
      );
    }

    const rawSession = await get(`pb:session:${code}`);
    console.log(`Redis result for pb:session:${code}: ${rawSession ? 'FOUND' : 'NOT FOUND'}`);

    if (!rawSession) {
      console.error(`Transfer join failed: Session key pb:session:${code} not found or expired`);
      return noStoreJson(
        {
          success: false,
          message: 'Unable to join transfer.',
          error: 'Transfer code not found',
          reasons: [
            'Code expired (10-minute limit)',
            'Session unavailable',
            'Network blocked connection',
            'Server session storage unavailable'
          ]
        },
        { status: 404 }
      );
    }

    let sessionObj: { files?: unknown; createdAt?: number; expiresAt?: string } = {};
    try {
      sessionObj = JSON.parse(rawSession);
    } catch {}

    const existingReceiverHash = await get(`pb:receiver:${code}`);
    let receiverToken: string;

    if (existingReceiverHash) {
      if (body.token && safeSecretEquals(body.token, existingReceiverHash)) {
        receiverToken = body.token;
        console.log(`[Receiver Join] Re-authenticated existing receiver for code ${code}`);
      } else {
        console.error(`Transfer join failed: Code ${code} already claimed by another receiver`);
        return noStoreJson(
          {
            success: false,
            message: 'Unable to join transfer.',
            error: 'This transfer code is already in use by another receiver.',
            reasons: [
              'Code already claimed by another device',
              'Ask the sender to create a new code'
            ]
          },
          { status: 409 }
        );
      }
    } else {
      receiverToken = createSecret();
      const claimed = await putIfAbsent(
        `pb:receiver:${code}`,
        hashSecret(receiverToken),
        SESSION_TTL_SECONDS
      );

      if (!claimed) {
        console.error(`Transfer join failed: Race condition on code ${code} claim`);
        return noStoreJson(
          {
            success: false,
            message: 'Unable to join transfer.',
            error: 'This transfer code is already in use by another receiver.',
            reasons: [
              'Code already claimed by another device',
              'Ask the sender to create a new code'
            ]
          },
          { status: 409 }
        );
      }
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
      {
        success: false,
        message: 'Unable to join transfer.',
        error: 'Unable to connect. Please try again.',
        reasons: ['Server session storage unavailable or network connection failed']
      },
      { status: 500 }
    );
  }
}
