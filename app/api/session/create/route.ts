import { createCode, createSecret, enforceRateLimit, hashSecret, isSameOrigin, noStoreJson, SESSION_TTL_SECONDS } from '@/lib/server/security';
import { putIfAbsent } from '@/lib/server/store';
import type { FileMeta } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILES = 20;
const MAX_SINGLE_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB
const MAX_TOTAL_SIZE = 100 * 1024 * 1024 * 1024; // 100GB

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson(
        {
          success: false,
          error: 'Unable to create transfer.',
          code: 'INVALID_ORIGIN',
          reasons: ['Cross-origin request blocked']
        },
        { status: 403 }
      );
    }

    if (!(await enforceRateLimit(request, 'create', 20))) {
      return noStoreJson(
        {
          success: false,
          error: 'Too many creation requests. Please try again shortly.',
          code: 'RATE_LIMITED',
          reasons: ['Rate limit exceeded. Please wait a minute.']
        },
        { status: 429 }
      );
    }

    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (contentLength > 100_000) {
      return noStoreJson(
        {
          success: false,
          error: 'Request body is too large.',
          code: 'BODY_TOO_LARGE',
          reasons: ['Maximum metadata payload size is 100KB']
        },
        { status: 413 }
      );
    }

    let files: FileMeta[] = [];
    try {
      const raw = await request.text();
      if (raw.length > 100_000) {
        return noStoreJson(
          {
            success: false,
            error: 'Request body is too large.',
            code: 'BODY_TOO_LARGE',
            reasons: ['Maximum metadata payload size is 100KB']
          },
          { status: 413 }
        );
      }
      if (raw) {
        const parsed = JSON.parse(raw) as { files?: unknown };
        if (!Array.isArray(parsed.files)) {
          return noStoreJson(
            {
              success: false,
              error: 'Invalid file list format.',
              code: 'INVALID_FILE_LIST',
              reasons: ['Files must be an array']
            },
            { status: 400 }
          );
        }

        if (parsed.files.length === 0) {
          return noStoreJson(
            {
              success: false,
              error: 'Please select at least one file.',
              code: 'EMPTY_FILE_LIST',
              reasons: ['At least 1 file is required to create a transfer session']
            },
            { status: 400 }
          );
        }

        if (parsed.files.length > MAX_FILES) {
          return noStoreJson(
            {
              success: false,
              error: `Maximum ${MAX_FILES} files allowed per transfer session.`,
              code: 'TOO_MANY_FILES',
              reasons: [`Selected ${parsed.files.length} files, but limit is ${MAX_FILES}`]
            },
            { status: 400 }
          );
        }

        const seenIds = new Set<string>();

        for (const item of parsed.files) {
          const f = item as Partial<FileMeta>;
          if (!f || typeof f.name !== 'string' || !f.name.trim()) {
            return noStoreJson(
              {
                success: false,
                error: 'Invalid file metadata: missing name.',
                code: 'INVALID_FILE_NAME',
                reasons: ['File names must be non-empty strings']
              },
              { status: 400 }
            );
          }

          if (typeof f.size !== 'number' || !Number.isSafeInteger(f.size) || f.size <= 0) {
            return noStoreJson(
              {
                success: false,
                error: `Invalid size for file "${f.name}".`,
                code: 'INVALID_FILE_SIZE',
                reasons: ['File size must be a positive integer in bytes']
              },
              { status: 400 }
            );
          }

          if (f.size > MAX_SINGLE_FILE_SIZE) {
            return noStoreJson(
              {
                success: false,
                error: `File "${f.name}" exceeds maximum allowed single file limit (50 GB).`,
                code: 'FILE_TOO_LARGE',
                reasons: ['Maximum supported single file size is 50 GB']
              },
              { status: 400 }
            );
          }

          const fileId = String(f.id || '').trim().slice(0, 80);
          if (!fileId) {
            return noStoreJson(
              {
                success: false,
                error: `Missing identifier for file "${f.name}".`,
                code: 'MISSING_FILE_ID',
                reasons: ['Each file must have a unique identifier']
              },
              { status: 400 }
            );
          }

          if (seenIds.has(fileId)) {
            return noStoreJson(
              {
                success: false,
                error: `Duplicate file identifier detected for "${f.name}".`,
                code: 'DUPLICATE_FILE_ID',
                reasons: ['Each file in the selection must have a distinct identifier']
              },
              { status: 400 }
            );
          }
          seenIds.add(fileId);

          files.push({
            id: fileId,
            name: String(f.name).trim().slice(0, 255),
            size: f.size,
            type: String(f.type || 'application/octet-stream').slice(0, 120),
            extension: String(f.extension || '').slice(0, 12)
          });
        }
      }
    } catch {
      return noStoreJson(
        {
          success: false,
          error: 'Unable to parse request body.',
          code: 'INVALID_JSON',
          reasons: ['Request payload must be valid JSON']
        },
        { status: 400 }
      );
    }

    if (!files.length) {
      return noStoreJson(
        {
          success: false,
          error: 'Please select at least one valid file.',
          code: 'NO_VALID_FILES',
          reasons: ['No valid files were provided in request body']
        },
        { status: 400 }
      );
    }

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_TOTAL_SIZE) {
      return noStoreJson(
        {
          success: false,
          error: 'Total transfer size exceeds 100 GB limit.',
          code: 'TOTAL_SIZE_EXCEEDED',
          reasons: ['Total size of all files combined cannot exceed 100 GB']
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
          sessionId: code,
          token: ownerToken,
          expiresIn: SESSION_TTL_SECONDS,
          expiresAt,
          files
        });
      }
    }

    return noStoreJson(
      {
        success: false,
        error: 'Unable to generate unique transfer code. Please try again.',
        code: 'CODE_COLLISION_ERROR',
        reasons: ['Code allocation collision after multiple attempts']
      },
      { status: 503 }
    );
  } catch (err) {
    console.error('Transfer creation failed unexpectedly:', err instanceof Error ? err.message : err);
    return noStoreJson(
      {
        success: false,
        error: 'Unable to create transfer. Please try again.',
        code: 'INTERNAL_SERVER_ERROR',
        reasons: ['Unexpected server error during session creation']
      },
      { status: 500 }
    );
  }
}

