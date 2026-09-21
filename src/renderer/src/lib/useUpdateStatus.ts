import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'

export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => window.bridge.onUpdateStatus(setStatus), [])
  return status
}
