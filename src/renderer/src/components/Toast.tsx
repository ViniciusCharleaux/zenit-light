import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Kind = 'success' | 'error'

interface ToastItem {
  id: number
  kind: Kind
  message: string
}

interface ToastApi {
  notify: (message: string, kind?: Kind) => void
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const notify = useCallback((message: string, kind: Kind = 'success') => {
    const id = Date.now() + Math.random()
    setItems((current) => [...current, { id, kind, message }])
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4200)
  }, [])

  const run = useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      try {
        await action()
        if (success) {
          notify(success)
        }
        return true
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Algo deu errado', 'error')
        return false
      }
    },
    [notify]
  )

  const value = useMemo(() => ({ notify, run }), [notify, run])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast ${item.kind}`}>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('ToastProvider ausente')
  }
  return context
}
