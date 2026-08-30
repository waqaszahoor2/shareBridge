'use client';

import type { FileMeta, PeerRole, SignalMessage, SignalType } from '@/lib/types';

export type SessionResponse = {
  success?: boolean;
  code: string;
  sessionId: string;
  receiverId?: string;
  token: string;
  resumeToken?: string;
  expiresIn: number;
  expiresAt?: string;
  files?: FileMeta[];
  error?: string;
  reasons?: string[];
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
  } catch {
    throw new Error('Unable to connect to server. Please check your internet connection.');
  }

  let data: T & { error?: string; reasons?: string[] };
  try {
    data = (await response.json()) as T & { error?: string; reasons?: string[] };
  } catch {
    throw new Error(`Server returned an unreadable response (${response.status}).`);
  }

  if (!response.ok) {
    const errorMsg = data.error || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    if (data.reasons && Array.isArray(data.reasons)) {
      (err as Error & { reasons?: string[] }).reasons = data.reasons;
    }
    throw err;
  }
  return data;
}

export async function createTransferSession(files: FileMeta[] = []) {
  return postJson<SessionResponse>('/api/session/create', { files });
}

export async function joinTransferSession(args: { code: string; receiverId?: string; resumeToken?: string }) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await postJson<SessionResponse>('/api/session/join', args);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message.toLowerCase().includes('not found') && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError || new Error('Transfer code not found');
}

export async function releaseTransferSession(args: { code: string; receiverId?: string; resumeToken?: string }) {
  try {
    await postJson<{ success: boolean }>('/api/session/release', args);
  } catch {}
}

export async function sendSignal(args: {
  code: string;
  role: PeerRole;
  token: string;
  type: SignalType;
  payload: unknown;
}) {
  return postJson<{ ok: true; id: string; seq: number }>('/api/signal', { action: 'send', ...args });
}

export async function pollSignals(args: { code: string; role: PeerRole; token: string; since?: number }) {
  return postJson<{ success: boolean; messages: SignalMessage[]; lastSeq?: number }>('/api/signal', {
    action: 'poll',
    ...args
  });
}

export function startSignalPolling(
  args: { code: string; role: PeerRole; token: string },
  onMessage: (message: SignalMessage) => Promise<void> | void,
  onError: (error: Error) => void
) {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = 600;
  let lastSeq = 0;
  let consecutiveErrors = 0;
  const seen = new Set<string>();

  const loop = async () => {
    if (!active) return;
    try {
      const res = await pollSignals({ ...args, since: lastSeq });
      delay = 600;
      consecutiveErrors = 0;
      if (res.lastSeq && res.lastSeq > lastSeq) {
        lastSeq = res.lastSeq;
      }
      for (const message of res.messages || []) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);
        if (seen.size > 500) {
          const first = seen.values().next().value as string | undefined;
          if (first) seen.delete(first);
        }
        await onMessage(message);
      }
    } catch (error) {
      consecutiveErrors += 1;
      delay = Math.min(delay * 1.5, 3000);
      // Only surface error to UI if 5 consecutive poll attempts fail (mobile 4G network resiliency)
      if (consecutiveErrors >= 5) {
        onError(error instanceof Error ? error : new Error('Signaling poll failed.'));
      }
    } finally {
      if (active) timer = setTimeout(loop, delay);
    }
  };

  void loop();
  return () => {
    active = false;
    if (timer) clearTimeout(timer);
  };
}

