import { createSecret, enforceRateLimit, hashSecret, isSameOrigin, noStoreJson, normalizeCode, PROVISIONAL_CLAIM_TTL_SECONDS, safeSecretEquals, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { get, putIfAbsent } from '@/lib/server/store';
import type { FileMeta } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StoredReceiverClaim = {
  receiverId: string;
  tokenHash: string;
  finalized: boolean;
};

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson(
        {
          success: false,
          error: 'Unable to join transfer.',
          code: 'INVALID_ORIGIN',
          reasons: ['Cross-origin security block']
        },
        { status: 403 }
      );
    }

    if (!(await enforceRateLimit(request, 'join', 30))) {
      return noStoreJson(
        {
          success: false,
          error: 'Too many verification attempts.',
          code: 'RATE_LIMITED',
          reasons: ['Rate limit exceeded. Please wait a minute and try again.']
        },
        { status: 429 }
      );
    }

    let body: { code?: unknown; receiverId?: unknown; resumeToken?: unknown; token?: unknown };
    try {
      const raw = await request.text();
      if (!raw) {
        return noStoreJson(
          {
            success: false,
            error: 'Missing request body.',
            code: 'MISSING_PAYLOAD',
            reasons: ['Please enter transfer code.']
          },
          { status: 400 }
        );
      }
      body = JSON.parse(raw);
    } catch {
      return noStoreJson(
        {
          success: false,
          error: 'Invalid format. Enter a 6-digit code. Example: 438-639',
          code: 'INVALID_JSON',
          reasons: ['Format must be a 6-digit code. Example: 438-639']
        },
        { status: 400 }
      );
    }

    const rawInput = body.code !== undefined && body.code !== null ? String(body.code) : '';
    const code = normalizeCode(rawInput);

    if (!rawInput.trim()) {
      return noStoreJson(
        {
          success: false,
          error: 'Please enter transfer code.',
          code: 'EMPTY_CODE',
          reasons: ['Transfer code field cannot be empty']
        },
        { status: 400 }
      );
    }

    if (!code || code.length !== 6) {
      return noStoreJson(
        {
          success: false,
          error: 'Invalid format. Enter a 6-digit code. Example: 438-639',
          code: 'INVALID_CODE_FORMAT',
          reasons: ['Format must be 6 digits (XXX-XXX)']
        },
        { status: 400 }
      );
    }

    const rawSession = await get(`pb:session:${code}`);
    if (!rawSession) {
      return noStoreJson(
        {
          success: false,
          error: 'Transfer code not found',
          code: 'SESSION_NOT_FOUND',
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

    let sessionObj: { files?: FileMeta[]; createdAt?: number; expiresAt?: string } = {};
    try {
      sessionObj = JSON.parse(rawSession);
    } catch {}

    const receiverIdParam = typeof body.receiverId === 'string' ? body.receiverId.trim() : '';
    const resumeTokenParam =
      typeof body.resumeToken === 'string'
        ? body.resumeToken.trim()
        : typeof body.token === 'string'
        ? body.token.trim()
        : '';

    const existingClaimRaw = await get(`pb:receiver:${code}`);
    let receiverId: string;
    let receiverToken: string;

    if (existingClaimRaw) {
      let existingClaim: StoredReceiverClaim | null = null;
      try {
        existingClaim = JSON.parse(existingClaimRaw) as StoredReceiverClaim;
      } catch {
        // Fallback for legacy format where value was just tokenHash string
        existingClaim = { receiverId: '', tokenHash: existingClaimRaw, finalized: true };
      }

      const isSameReceiverToken =
        resumeTokenParam && existingClaim?.tokenHash
          ? safeSecretEquals(resumeTokenParam, existingClaim.tokenHash)
          : false;

      const isSameReceiverId =
        receiverIdParam && existingClaim?.receiverId ? receiverIdParam === existingClaim.receiverId : true;

      if (isSameReceiverToken && isSameReceiverId) {
        receiverId = existingClaim.receiverId || receiverIdParam || `rec_${createSecret().slice(0, 16)}`;
        receiverToken = resumeTokenParam;
      } else {
        return noStoreJson(
          {
            success: false,
            error: 'This transfer code is already in use by another receiver.',
            code: 'CODE_ALREADY_CLAIMED',
            reasons: [
              'Code already claimed by another device',
              'Ask the sender to create a new code'
            ]
          },
          { status: 409 }
        );
      }
    } else {
      receiverId = receiverIdParam || `rec_${createSecret().slice(0, 16)}`;
      receiverToken = resumeTokenParam || createSecret();

      const claimData: StoredReceiverClaim = {
        receiverId,
        tokenHash: hashSecret(receiverToken),
        finalized: false
      };

      const claimed = await putIfAbsent(
        `pb:receiver:${code}`,
        JSON.stringify(claimData),
        SESSION_TTL_SECONDS
      );

      if (!claimed) {
        return noStoreJson(
          {
            success: false,
            error: 'This transfer code is already in use by another receiver.',
            code: 'CODE_CLAIM_CONFLICT',
            reasons: [
              'Code already claimed by another device',
              'Ask the sender to create a new code'
            ]
          },
          { status: 409 }
        );
      }
    }

    return noStoreJson({
      success: true,
      code,
      sessionId: code,
      receiverId,
      token: receiverToken,
      resumeToken: receiverToken,
      expiresIn: SESSION_TTL_SECONDS,
      files: sessionObj.files || []
    });
  } catch (err) {
    console.error('Transfer join failed unexpectedly:', err instanceof Error ? err.message : err);
    return noStoreJson(
      {
        success: false,
        error: 'Unable to connect. Please try again.',
        code: 'INTERNAL_SERVER_ERROR',
        reasons: ['Server session storage unavailable or network connection failed']
      },
      { status: 500 }
    );
  }
}

