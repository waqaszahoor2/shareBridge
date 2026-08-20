import 'server-only';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { incrementWithTtl } from './store';

export const SESSION_TTL_SECONDS = 10 * 60;

export function createCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function normalizeCode(value: unknown) {
  if (typeof value !== 'string') return null;
  const code = value.replace(/\D/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}

export function createSecret() {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

export function safeSecretEquals(secret: string, expectedHash: string) {
  try {
    const actual = Buffer.from(hashSecret(secret), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function getClientIp(request: Request) {
  return (
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  ).slice(0, 80);
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function enforceRateLimit(request: Request, action: string, limit: number) {
  const ip = getClientIp(request);
  const window = Math.floor(Date.now() / 60_000);
  const key = `pb:rate:${action}:${ip}:${window}`;
  const count = await incrementWithTtl(key, 90);
  return count <= limit;
}

export function noStoreJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}
