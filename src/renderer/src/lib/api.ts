import type { Api } from '@shared/types'

type Reply = { ok: true; data: unknown } | { ok: false; error: string }

declare global {
  interface Window {
    bridge: { invoke(channel: string, ...args: unknown[]): Promise<Reply> }
  }
}

async function call(channel: string, args: unknown[]): Promise<unknown> {
  const reply = await window.bridge.invoke(channel, ...args)
  if (!reply.ok) {
    throw new Error(reply.error)
  }
  return reply.data
}

export const api = new Proxy({} as Api, {
  get: (_target, name) => (...args: unknown[]) => call(String(name), args)
})
