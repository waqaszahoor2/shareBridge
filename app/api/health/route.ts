import { noStoreJson } from '@/lib/server/security';
import { hasRedis } from '@/lib/server/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const isRedisConnected = hasRedis();
  return noStoreJson({
    status: 'ok',
    redis: isRedisConnected ? 'connected' : 'fallback',
    service: 'PeerBridge',
    sessionStore: isRedisConnected ? 'redis' : 'fallback'
  });
}
