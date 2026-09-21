import { formatCents } from '../lib/format'

interface MoneyInputProps {
  value: number
  onChange: (cents: number) => void
  id?: string
  autoFocus?: boolean
}

export function MoneyInput({ value, onChange, id, autoFocus }: MoneyInputProps) {
  return (
    <input
      id={id}
      className="input"
      inputMode="numeric"
      autoFocus={autoFocus}
      placeholder="R$ 0,00"
      value={value > 0 ? formatCents(value) : ''}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '')
        onChange(digits ? Math.min(parseInt(digits, 10), 999_999_999_99) : 0)
      }}
    />
  )
}
