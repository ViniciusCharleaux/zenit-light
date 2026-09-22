import path from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { openDatabase } from './db'
import { registerIpc } from './ipc'
import { resolveDatabasePath } from './settings'
import { scheduleUpdateChecks, setupAutoUpdater } from './updater'

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#08111f',
    autoHideMenuBar: true,
    title: 'Zenit Light',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  window.once('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void window.loadURL(devUrl)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window) {
      if (window.isMinimized()) {
        window.restore()
      }
      window.focus()
    }
  })

  app.whenReady().then(async () => {
    const wasmPath = path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
    const userData = app.getPath('userData')
    const databasePath = resolveDatabasePath(
      userData,
      path.join(userData, 'controle-gastos.sqlite'),
      (unavailable) =>
        dialog.showMessageBoxSync({
          type: 'warning',
          title: 'Zenit Light',
          message: 'Não foi possível acessar o arquivo de dados',
          detail: `O app está configurado para usar:\n${unavailable}\n\nConfira se a pasta ou o drive está disponível. Se continuar com o local padrão, o app começa com um banco vazio e o arquivo original não é alterado.`,
          buttons: ['Usar local padrão', 'Sair'],
          defaultId: 0,
          cancelId: 1
        }) === 0
    )
    if (!databasePath) {
      app.quit()
      return
    }
    const db = await openDatabase(wasmPath, databasePath)
    registerIpc(db, databasePath, wasmPath)
    createWindow()
    setupAutoUpdater()
    scheduleUpdateChecks()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
