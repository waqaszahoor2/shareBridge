export function normalizeTransferCode(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function formatTransferCodeDisplay(code: string): string {
  const digits = String(code).replace(/\D/g, '').slice(0, 6);
  if (digits.length > 3) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return digits;
}
