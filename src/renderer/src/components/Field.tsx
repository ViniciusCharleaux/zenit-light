import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  htmlFor?: string
  hint?: ReactNode
  full?: boolean
  children: ReactNode
}

export function Field({ label, htmlFor, hint, full, children }: FieldProps) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}
