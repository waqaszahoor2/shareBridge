export function normalizeTransferCode(code: string | null | undefined): string {
  if (typeof code !== 'string' && typeof code !== 'number') return '';
  return String(code).replace(/\D/g, '').slice(0, 6);
}

export function formatTransferCode(code: string | null | undefined): string {
  const clean = normalizeTransferCode(code);
  if (clean.length <= 3) {
    return clean;
  }
  return `${clean.slice(0, 3)}-${clean.slice(3)}`;
}
