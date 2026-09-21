import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bridge', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)
})
