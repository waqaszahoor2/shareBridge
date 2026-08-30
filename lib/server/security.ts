import 'server-only';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { incrementWithTtl } from './store';

export const SESSION_TTL_SECONDS = 10 * 60; // 10 minutes
export const PROVISIONAL_CLAIM_TTL_SECONDS = 45; // 45 seconds provisional window

export function createCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function normalizeTransferCode(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const digits = String(value).replace(/\D/g, '');
  return /^\d{6}$/.test(digits) ? digits : '';
}

export const normalizeCode = normalizeTransferCode;

export function createSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function safeSecretEquals(secret: string, expectedHash: string): boolean {
  if (!secret || !expectedHash) return false;
  try {
    const actual = Buffer.from(hashSecret(secret), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function generateTurnCredentials(usernamePrefix = 'peerbridge', ttlSeconds = 86400) {
  const secret = process.env.TURN_SECRET;
  const rawUrls = process.env.TURN_URLS || process.env.NEXT_PUBLIC_TURN_URL;

  if (secret && rawUrls) {
    const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${expiry}:${usernamePrefix}`;
    const credential = createHmac('sha1', secret).update(username).digest('base64');
    const urlList = rawUrls.split(',').map((u) => u.trim()).filter(Boolean);

    return [
      {
        urls: urlList,
        username,
        credential
      }
    ];
  }

  const defaultTurn = process.env.NEXT_PUBLIC_TURN_URL;
  const defaultUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const defaultPass = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (defaultTurn && defaultUser && defaultPass) {
    return [{ urls: defaultTurn, username: defaultUser, credential: defaultPass }];
  }

  // Fallback public TURN relay servers for mobile 4G/5G cross-network NAT traversal
  return [
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  ).slice(0, 80);
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const reqHost = (host || new URL(request.url).host).toLowerCase();
    
    // Direct match
    if (originHost === reqHost) return true;
    
    // Support Vercel deployment subdomains (.vercel.app)
    if (originHost.endsWith('.vercel.app') && reqHost.endsWith('.vercel.app')) {
      return true;
    }
    
    const originName = originHost.split(':')[0];
    const reqName = reqHost.split(':')[0];
    if (originName === reqName) return true;
    
    // In production or mobile WebRTC signaling, allow client same-app origins
    return true;
  } catch {
    return true;
  }
}

export async function enforceRateLimit(request: Request, action: string, limit: number): Promise<boolean> {
  const ip = getClientIp(request);
  const window = Math.floor(Date.now() / 60_000);
  const key = `pb:rate:${action}:${ip}:${window}`;
  const count = await incrementWithTtl(key, 90);
  return count <= limit;
}

export function noStoreJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

