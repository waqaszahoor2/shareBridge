import { Redis } from '@upstash/redis';
import { Realtime } from '@upstash/realtime';
import { z } from 'zod';
import type { PeerRole, SignalMessage } from '@/lib/types';
import { SESSION_TTL_SECONDS } from '@/lib/server/security';

const signalSchema = z.object({
  id: z.string(),
  seq: z.number().int(),
  type: z.enum(['offer', 'answer', 'ice']),
  payload: z.unknown(),
  sentAt: z.number().int()
});

const schema = { signal: { message: signalSchema } };

function createSignalRealtime() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Upstash Redis credentials are required for realtime signaling.');

  const redis = new Redis({ url, token });
  return new Realtime({
    schema,
    redis,
    history: { maxLength: 200, expireAfterSecs: SESSION_TTL_SECONDS }
  });
}

let realtime: ReturnType<typeof createSignalRealtime> | undefined;

export function getSignalRealtime() {
  realtime ??= createSignalRealtime();
  return realtime;
}

export function getSignalChannel(code: string, role: PeerRole) {
  return `peerbridge-signal:${code}:${role}`;
}

export function emitSignal(code: string, role: PeerRole, message: SignalMessage) {
  return getSignalRealtime().channel(getSignalChannel(code, role)).emit('signal.message', message);
}
