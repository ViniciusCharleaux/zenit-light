export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
]

export function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function addMonths(month: string, delta: number): string {
  const year = Number(month.slice(0, 4))
  const monthIndex = Number(month.slice(5, 7)) - 1
  const total = year * 12 + monthIndex + delta
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

export function daysInMonth(month: string): number {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
}

export function closingDate(month: string, closingDay: number): string {
  return `${month}-${pad(Math.min(closingDay, daysInMonth(month)))}`
}

export function isInvoiceClosed(month: string, closingDay: number, today: string): boolean {
  return today > closingDate(month, closingDay)
}

export function firstInstallmentMonth(purchaseDate: string, closingDay: number): string {
  const month = monthOf(purchaseDate)
  const day = Number(purchaseDate.slice(8, 10))
  return day > Math.min(closingDay, daysInMonth(month)) ? addMonths(month, 1) : month
}

export function openInvoiceMonth(closingDay: number, today: string): string {
  return firstInstallmentMonth(today, closingDay)
}

export function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}

export function monthShort(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1].slice(0, 3)}/${month.slice(2, 4)}`
}

export function formatDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
}

export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count)
  const remainder = totalCents - base * count
  return Array.from({ length: count }, (_, index) => (index === 0 ? base + remainder : base))
}
