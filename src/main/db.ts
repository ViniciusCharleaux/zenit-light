import fs from 'node:fs'
import initSqlJs, { type Database, type SqlValue } from 'sql.js'

export type Param = string | number | null

const MIGRATIONS: string[] = [
  `
  CREATE TABLE cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    credit_limit_cents INTEGER NOT NULL,
    closing_day INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES cards(id),
    name TEXT NOT NULL,
    purchase_date TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    installments_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );
  CREATE TABLE installments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    ref_month TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    paid_at TEXT
  );
  CREATE INDEX idx_installments_month ON installments(ref_month);
  CREATE INDEX idx_installments_purchase ON installments(purchase_id);
  CREATE TABLE fixed_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    due_day INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE fixed_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER,
    ref_month TEXT NOT NULL,
    name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    due_day INTEGER NOT NULL,
    paid_at TEXT
  );
  CREATE INDEX idx_fixed_entries_month ON fixed_entries(ref_month);
  CREATE UNIQUE INDEX ux_fixed_entries ON fixed_entries(expense_id, ref_month) WHERE expense_id IS NOT NULL;
  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES cards(id),
    ref_month TEXT NOT NULL,
    paid_at TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    UNIQUE (card_id, ref_month)
  );
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE fixed_expenses ADD COLUMN card_id INTEGER REFERENCES cards(id);
  ALTER TABLE fixed_entries ADD COLUMN card_id INTEGER;
  `
]

export class Db {
  private depth = 0

  constructor(
    private readonly database: Database,
    private readonly filePath: string | null
  ) {
    this.database.run('PRAGMA foreign_keys = ON')
  }

  exec(sql: string): void {
    this.database.exec(sql)
  }

  run(sql: string, params: Param[] = []): void {
    this.database.run(sql, params as SqlValue[])
  }

  all<T>(sql: string, params: Param[] = []): T[] {
    const statement = this.database.prepare(sql)
    try {
      statement.bind(params as SqlValue[])
      const rows: T[] = []
      while (statement.step()) {
        rows.push(statement.getAsObject() as T)
      }
      return rows
    } finally {
      statement.free()
    }
  }

  get<T>(sql: string, params: Param[] = []): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  insert(sql: string, params: Param[] = []): number {
    this.run(sql, params)
    const row = this.get<{ id: number }>('SELECT last_insert_rowid() AS id')
    return row ? row.id : 0
  }

  transaction<T>(work: () => T): T {
    if (this.depth > 0) {
      return work()
    }
    this.database.run('BEGIN')
    this.depth += 1
    let result: T
    try {
      result = work()
      this.database.run('COMMIT')
    } catch (error) {
      try {
        this.database.run('ROLLBACK')
      } catch {
        return this.rethrow(error)
      }
      return this.rethrow(error)
    } finally {
      this.depth -= 1
    }
    this.persist()
    return result
  }

  snapshot(): Uint8Array {
    const data = this.database.export()
    this.database.run('PRAGMA foreign_keys = ON')
    return data
  }

  persist(): void {
    if (!this.filePath) {
      return
    }
    const temporary = `${this.filePath}.tmp`
    fs.writeFileSync(temporary, this.snapshot())
    fs.renameSync(temporary, this.filePath)
  }

  migrate(): void {
    const row = this.get<{ user_version: number }>('PRAGMA user_version')
    let version = row ? row.user_version : 0
    while (version < MIGRATIONS.length) {
      this.exec(MIGRATIONS[version])
      version += 1
      this.run(`PRAGMA user_version = ${version}`)
    }
    this.persist()
  }

  private rethrow(error: unknown): never {
    throw error
  }
}

export async function openDatabase(wasmPath: string, filePath: string | null): Promise<Db> {
  const wasmBinary = fs.readFileSync(wasmPath)
  const SQL = await initSqlJs({ wasmBinary: wasmBinary as unknown as ArrayBuffer })
  const existing = filePath && fs.existsSync(filePath) ? fs.readFileSync(filePath) : null
  const database = existing ? new SQL.Database(existing) : new SQL.Database()
  const db = new Db(database, filePath)
  db.migrate()
  return db
}
