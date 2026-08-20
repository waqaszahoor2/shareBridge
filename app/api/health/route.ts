import { noStoreJson } from '@/lib/server/security';
import { hasRedis } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return noStoreJson({
    status: 'ok',
    service: 'PeerBridge',
    signaling: 'http-polling',
    sessionStore: hasRedis() ? 'redis' : 'memory',
    productionReady: hasRedis() || !process.env.VERCEL
  });
}
