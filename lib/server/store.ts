import 'server-only';

type LocalValue = { value: string; expiresAt: number };

const globalStore = globalThis as unknown as {
  _pbKv?: Map<string, LocalValue>;
  _pbLists?: Map<string, { values: string[]; expiresAt: number }>;
};

const localKv = globalStore._pbKv ?? (globalStore._pbKv = new Map<string, LocalValue>());
const localLists = globalStore._pbLists ?? (globalStore._pbLists = new Map<string, { values: string[]; expiresAt: number }>());

function now() {
  return Date.now();
}

function cleanLocalKey(key: string) {
  const item = localKv.get(key);
  if (item && item.expiresAt <= now()) localKv.delete(key);
  const list = localLists.get(key);
  if (list && list.expiresAt <= now()) localLists.delete(key);
}

function getRedisConfig(): { url?: string; token?: string } {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.VERCEL_KV_API_URL ||
    process.env.REST_KV_URL;

  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.VERCEL_KV_API_TOKEN ||
    process.env.REST_KV_TOKEN;

  return { url, token };
}

export function hasRedis(): boolean {
  const { url, token } = getRedisConfig();
  return Boolean(url && token);
}

async function redisCommand<T = unknown>(args: Array<string | number>): Promise<T> {
  const { url, token } = getRedisConfig();
  if (!url || !token) {
    throw new Error('Missing environment variable: UPSTASH_REDIS_REST_URL/KV_REST_API_URL or token');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'PeerBridge/1.0'
    },
    body: JSON.stringify(args),
    cache: 'no-store'
  });

  if (!response.ok) throw new Error(`Redis HTTP request failed (${response.status})`);
  const data = (await response.json()) as { result?: T; error?: string };
  if (data.error) throw new Error(`Redis command error: ${data.error}`);
  return data.result as T;
}

export async function putIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (hasRedis()) {
    try {
      const result = await redisCommand<string | null>(['SET', key, value, 'EX', ttlSeconds, 'NX']);
      return result === 'OK';
    } catch (err) {
      console.error('Redis SET NX operation failed:', err instanceof Error ? err.message : err);
    }
  }

  cleanLocalKey(key);
  if (localKv.has(key)) return false;
  localKv.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
  return true;
}

export async function put(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (hasRedis()) {
    try {
      await redisCommand(['SET', key, value, 'EX', ttlSeconds]);
      return;
    } catch (err) {
      console.error('Redis SET operation failed:', err instanceof Error ? err.message : err);
    }
  }
  localKv.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
}

export async function get(key: string): Promise<string | null> {
  if (hasRedis()) {
    try {
      return await redisCommand<string | null>(['GET', key]);
    } catch (err) {
      console.error('Redis GET operation failed:', err instanceof Error ? err.message : err);
    }
  }
  cleanLocalKey(key);
  return localKv.get(key)?.value ?? null;
}

export async function del(key: string): Promise<void> {
  if (hasRedis()) {
    try {
      await redisCommand(['DEL', key]);
      return;
    } catch (err) {
      console.error('Redis DEL operation failed:', err instanceof Error ? err.message : err);
    }
  }
  localKv.delete(key);
  localLists.delete(key);
}

export async function pushSignal(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (hasRedis()) {
    try {
      await redisCommand(['RPUSH', key, value]);
      await redisCommand(['LTRIM', key, -200, -1]);
      await redisCommand(['EXPIRE', key, ttlSeconds]);
      return;
    } catch (err) {
      console.error('Redis RPUSH operation failed:', err instanceof Error ? err.message : err);
    }
  }

  cleanLocalKey(key);
  const item = localLists.get(key) ?? { values: [], expiresAt: now() + ttlSeconds * 1000 };
  item.values.push(value);
  if (item.values.length > 200) item.values = item.values.slice(-200);
  item.expiresAt = now() + ttlSeconds * 1000;
  localLists.set(key, item);
}

export async function readSignals(key: string): Promise<string[]> {
  if (hasRedis()) {
    try {
      return (await redisCommand<string[] | null>(['LRANGE', key, 0, -1])) ?? [];
    } catch (err) {
      console.error('Redis LRANGE operation failed:', err instanceof Error ? err.message : err);
    }
  }
  cleanLocalKey(key);
  return localLists.get(key)?.values ?? [];
}

export async function incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
  if (hasRedis()) {
    try {
      const count = await redisCommand<number>(['INCR', key]);
      if (count === 1) await redisCommand(['EXPIRE', key, ttlSeconds]);
      return Number(count);
    } catch (err) {
      console.error('Redis INCR operation failed:', err instanceof Error ? err.message : err);
    }
  }

  cleanLocalKey(key);
  const current = Number(localKv.get(key)?.value ?? '0') + 1;
  localKv.set(key, { value: String(current), expiresAt: now() + ttlSeconds * 1000 });
  return current;
}

