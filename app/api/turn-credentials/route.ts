import { enforceRateLimit, generateTurnCredentials, isSameOrigin, noStoreJson } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson({ success: false, error: 'Invalid origin' }, { status: 403 });
    }

    if (!(await enforceRateLimit(request, 'turn', 60))) {
      return noStoreJson({ success: false, error: 'Rate limit exceeded' }, { status: 429 });
    }

    const iceServers = generateTurnCredentials('pb_user', 14400); // 4 hour validity

    return noStoreJson({
      success: true,
      iceServers
    });
  } catch (err) {
    console.error('Failed to generate TURN credentials:', err instanceof Error ? err.message : err);
    return noStoreJson({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
