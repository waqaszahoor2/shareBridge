import { noStoreJson } from '@/lib/server/security';
import { hasRedis } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return noStoreJson({
    status: 'ok',
    service: 'PeerBridge',
    sessionStore: hasRedis() ? 'redis' : 'fallback'
  });
}
