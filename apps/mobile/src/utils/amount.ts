export function formatAmount(base: string, decimals: number): string {
  const s = base.padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

/** Converts "10" or "2.5" into base units, or null if invalid or too precise. */
export function parseAmount(input: string, decimals: number): string | null {
  const t = input.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [w, f = ''] = t.split('.');
  if (f.length > decimals) return null;
  const base = (w + f.padEnd(decimals, '0')).replace(/^0+/, '');
  return base === '' ? null : base;
}