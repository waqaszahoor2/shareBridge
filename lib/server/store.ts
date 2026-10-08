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
    process.env.KV_URL ||
    process.env.REDIS_URL ||
    process.env.REST_KV_URL;

  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.VERCEL_KV_API_TOKEN ||
    process.env.KV_TOKEN ||
    process.env.REDIS_TOKEN ||
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

async function safeRedisCommand<T = unknown>(args: Array<string | number>): Promise<{ ok: boolean; result?: T }> {
  if (!hasRedis()) return { ok: false };
  try {
    const result = await redisCommand<T>(args);
    return { ok: true, result };
  } catch (err) {
    console.warn('[Store] Redis operation failed, falling back to local store:', err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

export async function putIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (hasRedis()) {
    const res = await safeRedisCommand<string | null>(['SET', key, value, 'EX', ttlSeconds, 'NX']);
    if (res.ok) {
      return res.result === 'OK';
    }
  }

  cleanLocalKey(key);
  if (localKv.has(key)) return false;
  localKv.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
  return true;
}

export async function put(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (hasRedis()) {
    const res = await safeRedisCommand(['SET', key, value, 'EX', ttlSeconds]);
    if (res.ok) return;
  }
  localKv.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
}

export async function get(key: string): Promise<string | null> {
  if (hasRedis()) {
    const res = await safeRedisCommand<string | null>(['GET', key]);
    if (res.ok) return res.result ?? null;
  }
  cleanLocalKey(key);
  return localKv.get(key)?.value ?? null;
}

export async function del(key: string): Promise<void> {
  if (hasRedis()) {
    const res = await safeRedisCommand(['DEL', key]);
    if (res.ok) return;
  }
  localKv.delete(key);
  localLists.delete(key);
}

export async function pushSignal(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (hasRedis()) {
    const res = await safeRedisCommand(['RPUSH', key, value]);
    if (res.ok) {
      await safeRedisCommand(['LTRIM', key, -200, -1]);
      await safeRedisCommand(['EXPIRE', key, ttlSeconds]);
      return;
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
    const res = await safeRedisCommand<string[] | null>(['LRANGE', key, 0, -1]);
    if (res.ok) return res.result ?? [];
  }
  cleanLocalKey(key);
  return localLists.get(key)?.values ?? [];
}

export async function incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
  if (hasRedis()) {
    const res = await safeRedisCommand<number>(['INCR', key]);
    if (res.ok && res.result !== undefined) {
      if (res.result === 1) await safeRedisCommand(['EXPIRE', key, ttlSeconds]);
      return Number(res.result);
    }
  }

  cleanLocalKey(key);
  const current = Number(localKv.get(key)?.value ?? '0') + 1;
  localKv.set(key, { value: String(current), expiresAt: now() + ttlSeconds * 1000 });
  return current;
}


