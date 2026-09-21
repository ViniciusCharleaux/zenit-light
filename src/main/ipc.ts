import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { openDatabaseFromBytes, type Db } from './db'
import { createServices } from './services'
import { localToday } from '../shared/date'
import type { ExportResult, ImportResult } from '../shared/types'

type Handler = (...args: any[]) => unknown

export function registerIpc(db: Db, databasePath: string, wasmPath: string): void {
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

  const { dumpAll, buildCsv, importData: importPayload, ...api } = services

  async function importFile(): Promise<ImportResult> {
    const options = {
      properties: ['openFile' as const],
      filters: [{ name: 'Exportação do Controle de Gastos', extensions: ['json', 'sqlite'] }]
    }
    const window = BrowserWindow.getFocusedWindow()
    const chosen = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    if (chosen.canceled || chosen.filePaths.length === 0) {
      return { canceled: true }
    }
    const filePath = chosen.filePaths[0]
    const raw = fs.readFileSync(filePath)
    let payload: unknown
    if (filePath.toLowerCase().endsWith('.json')) {
      try {
        payload = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''))
      } catch {
        throw new Error('O arquivo JSON é inválido')
      }
    } else {
      const source = await openDatabaseFromBytes(wasmPath, raw)
      payload = createServices(source, localToday).dumpAll()
    }

    const backupDir = path.join(path.dirname(databasePath), 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const backupPath = path.join(backupDir, `antes-da-importacao-${Date.now()}.sqlite`)
    fs.writeFileSync(backupPath, db.snapshot())
    try {
      const counts = importPayload(payload)
      return { canceled: false, path: filePath, backupPath, counts }
    } catch (error) {
      fs.rmSync(backupPath, { force: true })
      throw error
    }
  }

  const handlers: Record<string, Handler> = {
    ...api,
    exportJson: () => saveFile('controle-gastos', 'json', 'JSON', JSON.stringify(dumpAll(), null, 2)),
    exportCsv: () => saveFile('controle-gastos', 'csv', 'CSV', buildCsv()),
    exportDatabase: () => saveFile('controle-gastos', 'sqlite', 'Banco SQLite', db.snapshot()),
    importData: importFile,
    getAppVersion: () => app.getVersion(),
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
