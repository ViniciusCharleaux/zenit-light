import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { openDatabaseFromBytes, type Db } from './db'
import { createServices } from './services'
import { localToday } from '../shared/date'
import { writeSettings } from './settings'
import { checkForUpdates, quitAndInstall } from './updater'
import type { ExportResult, ImportResult, LocationResult } from '../shared/types'

type Handler = (...args: any[]) => unknown

export function registerIpc(db: Db, databasePath: string, wasmPath: string): void {
  const services = createServices(db, localToday)
  const userData = app.getPath('userData')
  const defaultPath = path.join(userData, 'controle-gastos.sqlite')
  let currentPath = databasePath

  const samePath = (first: string, second: string): boolean => path.resolve(first) === path.resolve(second)

  function relocate(target: string): void {
    const source = currentPath
    if (samePath(target, source)) {
      return
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const bytes = db.snapshot()
    fs.writeFileSync(target, bytes)
    if (fs.statSync(target).size !== bytes.length) {
      throw new Error('Não foi possível gravar o arquivo no novo local')
    }
    writeSettings(userData, samePath(target, defaultPath) ? {} : { databasePath: target })
    db.setFilePath(target)
    currentPath = target
    try {
      fs.rmSync(source, { force: true })
    } catch {
      return
    }
  }

  async function changeLocation(): Promise<LocationResult> {
    const options = {
      title: 'Escolher onde salvar os dados',
      defaultPath: currentPath,
      buttonLabel: 'Salvar aqui',
      filters: [{ name: 'Banco SQLite', extensions: ['sqlite'] }]
    }
    const window = BrowserWindow.getFocusedWindow()
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }
    const target = /\.sqlite$/i.test(result.filePath) ? result.filePath : `${result.filePath}.sqlite`
    if (samePath(target, currentPath)) {
      return { canceled: true }
    }
    relocate(target)
    return { canceled: false, path: currentPath }
  }

  function resetLocation(): LocationResult {
    if (samePath(currentPath, defaultPath)) {
      return { canceled: true }
    }
    if (fs.existsSync(defaultPath)) {
      fs.renameSync(defaultPath, path.join(userData, `controle-gastos.antigo-${Date.now()}.sqlite`))
    }
    relocate(defaultPath)
    return { canceled: false, path: currentPath }
  }

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

    const backupDir = path.join(path.dirname(currentPath), 'backups')
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
    checkForUpdates: () => checkForUpdates(),
    quitAndInstall: () => quitAndInstall(),
    getDatabaseInfo: () => ({ path: currentPath, isDefault: samePath(currentPath, defaultPath) }),
    changeDatabaseLocation: changeLocation,
    resetDatabaseLocation: resetLocation,
    revealDatabase: () => {
      shell.showItemInFolder(currentPath)
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
