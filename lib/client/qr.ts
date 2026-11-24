import { normalizeCode } from '@/lib/utils/transferCode';

export function extractTransferCodeFromQr(value: string, appOrigin: string) {
  const raw = value.trim();
  const digits = normalizeCode(raw);
  if (digits) return digits;

  try {
    const url = new URL(raw, appOrigin);
    if (url.origin !== appOrigin || url.pathname !== '/receive') return '';
    return normalizeCode(url.searchParams.get('code'));
  } catch {
    return '';
  }
}
