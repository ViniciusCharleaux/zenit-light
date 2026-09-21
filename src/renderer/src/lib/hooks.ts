import { useCallback, useEffect, useState } from 'react'

export function useData<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    loader()
      .then((value) => {
        if (alive) {
          setData(value)
          setError(null)
        }
      })
      .catch((reason: Error) => {
        if (alive) {
          setError(reason.message)
        }
      })
    return () => {
      alive = false
    }
  }, [...deps, tick])

  const reload = useCallback(() => setTick((value) => value + 1), [])
  return { data, error, reload }
}
