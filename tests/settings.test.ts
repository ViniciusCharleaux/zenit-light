import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openDatabase } from '../src/main/db'
import { createServices } from '../src/main/services'
import { readSettings, resolveDatabasePath, writeSettings } from '../src/main/settings'

const require = createRequire(import.meta.url)
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')

function temporaryDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'controle-'))
}

test('configurações são gravadas e lidas', () => {
  const directory = temporaryDirectory()
  assert.deepEqual(readSettings(directory), {})
  writeSettings(directory, { databasePath: '/dados/banco.sqlite' })
  assert.deepEqual(readSettings(directory), { databasePath: '/dados/banco.sqlite' })
  writeSettings(directory, {})
  assert.deepEqual(readSettings(directory), {})
  fs.writeFileSync(path.join(directory, 'settings.json'), 'quebrado')
  assert.deepEqual(readSettings(directory), {})
})

test('resolve o local do banco com fallback', () => {
  const directory = temporaryDirectory()
  const fallback = path.join(directory, 'padrao.sqlite')
  assert.equal(resolveDatabasePath(directory, fallback, () => false), fallback)

  const custom = path.join(temporaryDirectory(), 'dados.sqlite')
  writeSettings(directory, { databasePath: custom })
  assert.equal(resolveDatabasePath(directory, fallback, () => false), custom)

  const missing = path.join(directory, 'sumiu', 'dados.sqlite')
  writeSettings(directory, { databasePath: missing })
  assert.equal(resolveDatabasePath(directory, fallback, () => true), fallback)
  assert.equal(resolveDatabasePath(directory, fallback, () => false), null)
})

test('o banco passa a gravar no novo arquivo depois de trocar o local', async () => {
  const directory = temporaryDirectory()
  const first = path.join(directory, 'a.sqlite')
  const second = path.join(directory, 'b.sqlite')
  const db = await openDatabase(wasmPath, first)
  const services = createServices(db, () => '2026-09-18')
  services.saveCard({ name: 'Nubank', limitCents: 100000, closingDay: 10 })
  assert.equal(db.getFilePath(), first)

  fs.writeFileSync(second, db.snapshot())
  db.setFilePath(second)
  fs.rmSync(first)
  services.saveCard({ name: 'Inter', limitCents: 200000, closingDay: 5 })
  assert.equal(fs.existsSync(first), false)

  const reopened = await openDatabase(wasmPath, second)
  const names = createServices(reopened, () => '2026-09-18')
    .listCards()
    .map((card) => card.name)
  assert.deepEqual(names, ['Inter', 'Nubank'])
})
