import fs from 'node:fs'
import path from 'node:path'

export interface Settings {
  databasePath?: string
}

const FILE_NAME = 'settings.json'

export function readSettings(directory: string): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(directory, FILE_NAME), 'utf8')) as unknown
    if (typeof raw === 'object' && raw !== null) {
      const databasePath = (raw as Settings).databasePath
      if (typeof databasePath === 'string' && databasePath !== '') {
        return { databasePath }
      }
    }
  } catch {
    return {}
  }
  return {}
}

export function writeSettings(directory: string, settings: Settings): void {
  fs.mkdirSync(directory, { recursive: true })
  const target = path.join(directory, FILE_NAME)
  const temporary = `${target}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(settings, null, 2))
  fs.renameSync(temporary, target)
}

export function resolveDatabasePath(
  directory: string,
  defaultPath: string,
  confirmFallback: (unavailable: string) => boolean
): string | null {
  const { databasePath } = readSettings(directory)
  if (!databasePath) {
    return defaultPath
  }
  if (fs.existsSync(path.dirname(databasePath))) {
    return databasePath
  }
  return confirmFallback(databasePath) ? defaultPath : null
}
