import fs from 'node:fs'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { Db } from './db'
import { createServices } from './services'
import { localToday } from '../shared/date'
import type { ExportResult } from '../shared/types'

type Handler = (...args: any[]) => unknown

export function registerIpc(db: Db, databasePath: string): void {
  const services = createServices(db, localToday)

  async function saveFile(
    defaultName: string,
    extension: string,
    label: string,
    data: string | Uint8Array
  ): Promise<ExportResult> {
    const options = {
      defaultPath: `${defaultName}-${localToday()}.${extension}`,
      filters: [{ name: label, extensions: [extension] }]
    }
    const window = BrowserWindow.getFocusedWindow()
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }
    fs.writeFileSync(result.filePath, data)
    return { canceled: false, path: result.filePath }
  }

  const { dumpAll, buildCsv, ...api } = services

  const handlers: Record<string, Handler> = {
    ...api,
    exportJson: () => saveFile('controle-gastos', 'json', 'JSON', JSON.stringify(dumpAll(), null, 2)),
    exportCsv: () => saveFile('controle-gastos', 'csv', 'CSV', buildCsv()),
    exportDatabase: () => saveFile('controle-gastos', 'sqlite', 'Banco SQLite', db.snapshot()),
    getDatabasePath: () => databasePath,
    revealDatabase: () => {
      shell.showItemInFolder(databasePath)
    }
  }

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      try {
        return { ok: true, data: await handler(...args) }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    })
  }
}
