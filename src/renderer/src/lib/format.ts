export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatSigned(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : ''
  return `${sign}${formatCents(Math.abs(cents))}`
}

export function percent(part: number, total: number): number {
  if (total <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, Math.round((part / total) * 100)))
}
