import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

let configured = false

function broadcast(status: UpdateStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('update-status', status)
  }
}

export function setupAutoUpdater(): void {
  if (configured) {
    return
  }
  configured = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => broadcast({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => broadcast({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    broadcast({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => broadcast({ state: 'downloaded', version: info.version }))
  autoUpdater.on('error', (error) => broadcast({ state: 'error', message: error.message }))
}

export function checkForUpdates(): void {
  if (!app.isPackaged) {
    broadcast({ state: 'error', message: 'A verificação de atualizações só funciona na versão instalada.' })
    return
  }
  void autoUpdater.checkForUpdates()
}

export function scheduleUpdateChecks(): void {
  if (!app.isPackaged) {
    return
  }
  setTimeout(() => void autoUpdater.checkForUpdates(), 4000)
  setInterval(() => void autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
