import { Db } from './db'
import {
  addMonths,
  closingDate,
  formatDate,
  isInvoiceClosed,
  monthLabel,
  monthOf,
  openInvoiceMonth,
  splitInstallments
} from '../shared/date'
import type {
  Api,
  CalendarFixedItem,
  CalendarInstallmentItem,
  CalendarMonth,
  CardDTO,
  CardInput,
  FixedEntryRow,
  FixedExpenseDTO,
  FixedExpenseInput,
  HistoryMonth,
  HistoryOverview,
  ImportCounts,
  InstallmentRow,
  InvoiceRow,
  MainOnlyMethod,
  MonthData,
  PurchaseDetail,
  PurchaseInput,
  PurchaseSummary,
  PurchaseUpdateInput,
  SettledPurchase
} from '../shared/types'

export class UserError extends Error {}

export type ServiceApi = Omit<Api, MainOnlyMethod>

type Sync<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R> ? (...args: A) => R : never
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function fail(message: string): never {
  throw new UserError(message)
}

function text(value: unknown, message: string): string {
  const cleaned = typeof value === 'string' ? value.trim() : ''
  if (!cleaned) {
    fail(message)
  }
  if (cleaned.length > 120) {
    fail('O texto pode ter no máximo 120 caracteres')
  }
  return cleaned
}

function integer(value: unknown, min: number, max: number, message: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    fail(message)
  }
  return parsed
}

function month(value: unknown): string {
  if (typeof value !== 'string' || !MONTH_RE.test(value)) {
    fail('Mês inválido')
  }
  return value as string
}

interface CardRow {
  id: number
  name: string
  limitCents: number
  closingDay: number
}

interface PurchaseRow {
  id: number
  name: string
  cardId: number
  cardName: string
  closingDay: number
  purchaseDate: string
  totalCents: number
  installmentsCount: number
  status: 'active' | 'cancelled'
  paidCount: number
  paidCents: number
  remainingCount: number
  remainingCents: number
  nextMonth: string | null
  lastMonth: string | null
  nextAmountCents: number | null
}

const PURCHASE_SELECT = `
  SELECT p.id, p.name, p.card_id AS cardId, c.name AS cardName, c.closing_day AS closingDay,
    p.purchase_date AS purchaseDate, p.total_cents AS totalCents,
    p.installments_count AS installmentsCount, p.status AS status,
    COALESCE(SUM(CASE WHEN i.paid_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS paidCount,
    COALESCE(SUM(CASE WHEN i.paid_at IS NOT NULL THEN i.amount_cents ELSE 0 END), 0) AS paidCents,
    COALESCE(SUM(CASE WHEN i.paid_at IS NULL THEN 1 ELSE 0 END), 0) AS remainingCount,
    COALESCE(SUM(CASE WHEN i.paid_at IS NULL THEN i.amount_cents ELSE 0 END), 0) AS remainingCents,
    MIN(CASE WHEN i.paid_at IS NULL THEN i.ref_month END) AS nextMonth,
    MAX(i.ref_month) AS lastMonth,
    (SELECT x.amount_cents FROM installments x WHERE x.purchase_id = p.id AND x.paid_at IS NULL
      ORDER BY x.ref_month, x.number LIMIT 1) AS nextAmountCents
  FROM purchases p
  JOIN cards c ON c.id = p.card_id
  LEFT JOIN installments i ON i.purchase_id = p.id
`

export function createServices(db: Db, getToday: () => string) {
  const nowIso = (): string => new Date().toISOString()
  const currentMonth = (): string => monthOf(getToday())

  function getCard(id: unknown): CardRow {
    const card = db.get<CardRow>(
      'SELECT id, name, credit_limit_cents AS limitCents, closing_day AS closingDay FROM cards WHERE id = ?',
      [Number(id)]
    )
    return card ?? fail('Cartão não encontrado')
  }

  function assertInvoiceOpen(card: CardRow, months: string[]): void {
    for (const target of months) {
      const paid = db.get<{ id: number }>('SELECT id FROM invoices WHERE card_id = ? AND ref_month = ?', [
        card.id,
        target
      ])
      if (paid) {
        fail(`A fatura de ${monthLabel(target)} do cartão ${card.name} já foi paga`)
      }
    }
  }

  function renumber(purchaseId: number): void {
    const rows = db.all<{ id: number }>(
      'SELECT id FROM installments WHERE purchase_id = ? ORDER BY ref_month, number, id',
      [purchaseId]
    )
    rows.forEach((row, index) => {
      db.run('UPDATE installments SET number = ? WHERE id = ?', [index + 1, row.id])
    })
  }

  function ensureFixedEntries(): void {
    const current = currentMonth()
    const last = db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'fixed_last_month'")
    if (last && last.value >= current) {
      return
    }
    db.transaction(() => {
      let target = last ? addMonths(last.value, 1) : current
      while (target <= current) {
        db.run(
          `INSERT INTO fixed_entries (expense_id, ref_month, name, amount_cents, due_day, card_id)
           SELECT id, ?, name, amount_cents, due_day, card_id FROM fixed_expenses
           WHERE active = 1 AND NOT EXISTS (
             SELECT 1 FROM fixed_entries e WHERE e.expense_id = fixed_expenses.id AND e.ref_month = ?
           )`,
          [target, target]
        )
        target = addMonths(target, 1)
      }
      db.run(
        "INSERT INTO meta (key, value) VALUES ('fixed_last_month', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [current]
      )
    })
  }

  function syncCurrentEntry(expenseId: number): void {
    const target = currentMonth()
    const expense = db.get<{
      name: string
      amountCents: number
      dueDay: number
      active: number
      cardId: number | null
    }>(
      'SELECT name, amount_cents AS amountCents, due_day AS dueDay, active, card_id AS cardId FROM fixed_expenses WHERE id = ?',
      [expenseId]
    )
    if (!expense) {
      return
    }
    const entry = db.get<{ id: number; paidAt: string | null }>(
      'SELECT id, paid_at AS paidAt FROM fixed_entries WHERE expense_id = ? AND ref_month = ?',
      [expenseId, target]
    )
    if (expense.active) {
      if (!entry) {
        db.run(
          'INSERT INTO fixed_entries (expense_id, ref_month, name, amount_cents, due_day, card_id) VALUES (?, ?, ?, ?, ?, ?)',
          [expenseId, target, expense.name, expense.amountCents, expense.dueDay, expense.cardId]
        )
      } else if (!entry.paidAt) {
        db.run('UPDATE fixed_entries SET name = ?, amount_cents = ?, due_day = ?, card_id = ? WHERE id = ?', [
          expense.name,
          expense.amountCents,
          expense.dueDay,
          expense.cardId,
          entry.id
        ])
      }
    } else if (entry && !entry.paidAt) {
      db.run('DELETE FROM fixed_entries WHERE id = ?', [entry.id])
    }
  }

  function listCards(): CardDTO[] {
    const today = getToday()
    const current = currentMonth()
    const rows = db.all<CardRow & { usedCents: number; purchasesCount: number; invoicePaid: number }>(
      `SELECT c.id, c.name, c.credit_limit_cents AS limitCents, c.closing_day AS closingDay,
        COALESCE((SELECT SUM(i.amount_cents) FROM installments i JOIN purchases p ON p.id = i.purchase_id
          WHERE p.card_id = c.id AND i.paid_at IS NULL), 0) AS usedCents,
        (SELECT COUNT(*) FROM purchases p WHERE p.card_id = c.id) AS purchasesCount,
        (SELECT COUNT(*) FROM invoices v WHERE v.card_id = c.id AND v.ref_month = ?) AS invoicePaid
       FROM cards c ORDER BY c.name COLLATE NOCASE`,
      [current]
    )
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      limitCents: row.limitCents,
      closingDay: row.closingDay,
      usedCents: row.usedCents,
      availableCents: row.limitCents - row.usedCents,
      purchasesCount: row.purchasesCount,
      openInvoiceMonth: openInvoiceMonth(row.closingDay, today),
      currentInvoiceStatus:
        row.invoicePaid > 0 ? 'paid' : isInvoiceClosed(current, row.closingDay, today) ? 'closed' : 'open'
    }))
  }

  function saveCard(input: CardInput): void {
    const name = text(input.name, 'Informe o nome do cartão')
    const limit = integer(input.limitCents, 0, 100_000_000_00, 'Informe um limite válido')
    const closingDay = integer(input.closingDay, 1, 31, 'O dia de fechamento deve estar entre 1 e 31')
    db.transaction(() => {
      if (input.id) {
        getCard(input.id)
        db.run('UPDATE cards SET name = ?, credit_limit_cents = ?, closing_day = ? WHERE id = ?', [
          name,
          limit,
          closingDay,
          input.id
        ])
      } else {
        db.run('INSERT INTO cards (name, credit_limit_cents, closing_day, created_at) VALUES (?, ?, ?, ?)', [
          name,
          limit,
          closingDay,
          nowIso()
        ])
      }
    })
  }

  function deleteCard(id: number): void {
    db.transaction(() => {
      const card = getCard(id)
      const count = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM purchases WHERE card_id = ?', [card.id])
      if (count && count.n > 0) {
        fail('Este cartão possui compras cadastradas e não pode ser excluído')
      }
      const linked = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM fixed_expenses WHERE card_id = ?', [card.id])
      if (linked && linked.n > 0) {
        fail('Este cartão está vinculado a gastos fixos e não pode ser excluído')
      }
      db.run('UPDATE fixed_entries SET card_id = NULL WHERE card_id = ?', [card.id])
      db.run('DELETE FROM invoices WHERE card_id = ?', [card.id])
      db.run('DELETE FROM cards WHERE id = ?', [card.id])
    })
  }

  function listFixedExpenses(): FixedExpenseDTO[] {
    return db
      .all<{
        id: number
        name: string
        amountCents: number
        dueDay: number
        active: number
        cardId: number | null
        cardName: string | null
      }>(
        `SELECT f.id, f.name, f.amount_cents AS amountCents, f.due_day AS dueDay, f.active,
          f.card_id AS cardId, c.name AS cardName
         FROM fixed_expenses f LEFT JOIN cards c ON c.id = f.card_id
         ORDER BY f.active DESC, f.due_day, f.name COLLATE NOCASE`
      )
      .map((row) => ({ ...row, active: row.active === 1 }))
  }

  function saveFixedExpense(input: FixedExpenseInput): void {
    const name = text(input.name, 'Informe o nome do gasto')
    const amount = integer(input.amountCents, 1, 100_000_000_00, 'Informe um valor maior que zero')
    const dueDay = integer(input.dueDay, 1, 31, 'O dia de vencimento deve estar entre 1 e 31')
    const active = input.active ? 1 : 0
    const cardId = input.cardId ? getCard(input.cardId).id : null
    db.transaction(() => {
      ensureFixedEntries()
      let id = input.id ?? 0
      if (id) {
        const exists = db.get<{ id: number }>('SELECT id FROM fixed_expenses WHERE id = ?', [id])
        if (!exists) {
          fail('Gasto fixo não encontrado')
        }
        db.run(
          'UPDATE fixed_expenses SET name = ?, amount_cents = ?, due_day = ?, active = ?, card_id = ? WHERE id = ?',
          [name, amount, dueDay, active, cardId, id]
        )
      } else {
        id = db.insert(
          'INSERT INTO fixed_expenses (name, amount_cents, due_day, active, card_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [name, amount, dueDay, active, cardId, nowIso()]
        )
      }
      syncCurrentEntry(id)
    })
  }

  function deleteFixedExpense(id: number): void {
    db.transaction(() => {
      ensureFixedEntries()
      db.run('DELETE FROM fixed_entries WHERE expense_id = ? AND ref_month >= ? AND paid_at IS NULL', [
        id,
        currentMonth()
      ])
      db.run('UPDATE fixed_entries SET expense_id = NULL WHERE expense_id = ?', [id])
      db.run('DELETE FROM fixed_expenses WHERE id = ?', [id])
    })
  }

  function setFixedEntryPaid(entryId: number, paid: boolean): void {
    db.transaction(() => {
      const entry = db.get<{ id: number }>('SELECT id FROM fixed_entries WHERE id = ?', [entryId])
      if (!entry) {
        fail('Lançamento não encontrado')
      }
      db.run('UPDATE fixed_entries SET paid_at = ? WHERE id = ?', [paid ? nowIso() : null, entryId])
    })
  }

  function getMonth(target: string): MonthData {
    month(target)
    ensureFixedEntries()
    const today = getToday()
    const current = currentMonth()

    const installments: InstallmentRow[] = db
      .all<{
        id: number
        purchaseId: number
        purchaseName: string
        cardId: number
        cardName: string
        number: number
        installmentsCount: number
        month: string
        amountCents: number
        paidAt: string | null
      }>(
        `SELECT i.id, i.purchase_id AS purchaseId, p.name AS purchaseName, p.card_id AS cardId,
          c.name AS cardName, i.number, p.installments_count AS installmentsCount,
          i.ref_month AS month, i.amount_cents AS amountCents, i.paid_at AS paidAt
         FROM installments i
         JOIN purchases p ON p.id = i.purchase_id
         JOIN cards c ON c.id = p.card_id
         WHERE i.ref_month = ?
         ORDER BY c.name COLLATE NOCASE, p.name COLLATE NOCASE, i.number`,
        [target]
      )
      .map((row) => ({
        id: row.id,
        purchaseId: row.purchaseId,
        purchaseName: row.purchaseName,
        cardId: row.cardId,
        cardName: row.cardName,
        number: row.number,
        count: row.installmentsCount,
        month: row.month,
        amountCents: row.amountCents,
        paid: row.paidAt !== null
      }))

    let fixed: FixedEntryRow[]
    if (target <= current) {
      fixed = db
        .all<{
          id: number
          expenseId: number | null
          name: string
          cardName: string | null
          dueDay: number
          amountCents: number
          paidAt: string | null
          previousAmountCents: number | null
        }>(
          `SELECT e.id, e.expense_id AS expenseId, e.name, e.due_day AS dueDay, e.amount_cents AS amountCents,
            e.paid_at AS paidAt, c.name AS cardName,
            (SELECT prev.amount_cents FROM fixed_entries prev
              WHERE prev.expense_id = e.expense_id AND prev.ref_month = ?) AS previousAmountCents
           FROM fixed_entries e LEFT JOIN cards c ON c.id = e.card_id
           WHERE e.ref_month = ? ORDER BY e.due_day, e.name COLLATE NOCASE`,
          [addMonths(target, -1), target]
        )
        .map((row) => ({
          key: `entry-${row.id}`,
          entryId: row.id,
          expenseId: row.expenseId,
          name: row.name,
          cardName: row.cardName,
          dueDay: row.dueDay,
          amountCents: row.amountCents,
          previousAmountCents: row.previousAmountCents,
          paid: row.paidAt !== null,
          projected: false
        }))
    } else {
      fixed = db
        .all<{ id: number; name: string; cardName: string | null; dueDay: number; amountCents: number }>(
          `SELECT f.id, f.name, c.name AS cardName, f.due_day AS dueDay, f.amount_cents AS amountCents
           FROM fixed_expenses f LEFT JOIN cards c ON c.id = f.card_id
           WHERE f.active = 1 ORDER BY f.due_day, f.name COLLATE NOCASE`
        )
        .map((row) => ({
          key: `expense-${row.id}`,
          entryId: null,
          expenseId: row.id,
          name: row.name,
          cardName: row.cardName,
          dueDay: row.dueDay,
          amountCents: row.amountCents,
          previousAmountCents: null,
          paid: false,
          projected: true
        }))
    }

    const invoiceRecords = db.all<{ cardId: number }>('SELECT card_id AS cardId FROM invoices WHERE ref_month = ?', [
      target
    ])
    const recorded = new Set(invoiceRecords.map((row) => row.cardId))
    const byCard = new Map<number, InstallmentRow[]>()
    for (const row of installments) {
      byCard.set(row.cardId, [...(byCard.get(row.cardId) ?? []), row])
    }
    const invoices: InvoiceRow[] = []
    for (const [cardId, rows] of byCard) {
      const card = getCard(cardId)
      const total = rows.reduce((sum, row) => sum + row.amountCents, 0)
      const pending = rows.filter((row) => !row.paid).reduce((sum, row) => sum + row.amountCents, 0)
      invoices.push({
        cardId,
        cardName: card.name,
        month: target,
        closingDay: card.closingDay,
        closingDate: closingDate(target, card.closingDay),
        closed: isInvoiceClosed(target, card.closingDay, today),
        paid: rows.every((row) => row.paid),
        undoable: recorded.has(cardId),
        totalCents: total,
        pendingCents: pending
      })
    }

    const installmentsCents = installments.reduce((sum, row) => sum + row.amountCents, 0)
    const fixedCents = fixed.reduce((sum, row) => sum + row.amountCents, 0)
    const paidCents =
      installments.filter((row) => row.paid).reduce((sum, row) => sum + row.amountCents, 0) +
      fixed.filter((row) => row.paid).reduce((sum, row) => sum + row.amountCents, 0)
    const totalCents = installmentsCents + fixedCents

    return {
      month: target,
      installments,
      fixed,
      invoices,
      totals: { installmentsCents, fixedCents, totalCents, paidCents, pendingCents: totalCents - paidCents }
    }
  }

  function getCalendar(year: number): CalendarMonth[] {
    const safeYear = integer(year, 1970, 2200, 'Ano inválido')
    ensureFixedEntries()
    const current = currentMonth()
    const prefix = `${safeYear}-%`
    const installmentRows = db.all<{
      month: string
      name: string
      cardName: string
      number: number
      count: number
      amount: number
      paid: number
    }>(
      `SELECT i.ref_month AS month, p.name AS name, c.name AS cardName, i.number AS number,
        p.installments_count AS count, i.amount_cents AS amount,
        CASE WHEN i.paid_at IS NULL THEN 0 ELSE 1 END AS paid
       FROM installments i
       JOIN purchases p ON p.id = i.purchase_id
       JOIN cards c ON c.id = p.card_id
       WHERE i.ref_month LIKE ?
       ORDER BY i.ref_month, c.name COLLATE NOCASE, p.name COLLATE NOCASE, i.number`,
      [prefix]
    )
    const fixedRows = db.all<{ month: string; name: string; cardName: string | null; amount: number; paid: number }>(
      `SELECT e.ref_month AS month, e.name AS name, c.name AS cardName, e.amount_cents AS amount,
        CASE WHEN e.paid_at IS NULL THEN 0 ELSE 1 END AS paid
       FROM fixed_entries e LEFT JOIN cards c ON c.id = e.card_id
       WHERE e.ref_month LIKE ?
       ORDER BY e.ref_month, e.due_day, e.name COLLATE NOCASE`,
      [prefix]
    )
    const projectedRows = db.all<{ name: string; cardName: string | null; amount: number }>(
      `SELECT f.name AS name, c.name AS cardName, f.amount_cents AS amount
       FROM fixed_expenses f LEFT JOIN cards c ON c.id = f.card_id
       WHERE f.active = 1 ORDER BY f.due_day, f.name COLLATE NOCASE`
    )
    const result: CalendarMonth[] = []
    for (let index = 1; index <= 12; index += 1) {
      const key = `${safeYear}-${String(index).padStart(2, '0')}`
      const projected = key > current
      const installmentItems: CalendarInstallmentItem[] = installmentRows
        .filter((row) => row.month === key)
        .map((row) => ({
          name: row.name,
          cardName: row.cardName,
          number: row.number,
          count: row.count,
          amountCents: row.amount,
          paid: row.paid === 1
        }))
      const fixedItems: CalendarFixedItem[] = projected
        ? projectedRows.map((row) => ({
            name: row.name,
            cardName: row.cardName,
            amountCents: row.amount,
            paid: false
          }))
        : fixedRows
            .filter((row) => row.month === key)
            .map((row) => ({
              name: row.name,
              cardName: row.cardName,
              amountCents: row.amount,
              paid: row.paid === 1
            }))
      const installmentsCents = installmentItems.reduce((sum, item) => sum + item.amountCents, 0)
      const fixedCents = fixedItems.reduce((sum, item) => sum + item.amountCents, 0)
      const paidCents =
        installmentItems.filter((item) => item.paid).reduce((sum, item) => sum + item.amountCents, 0) +
        fixedItems.filter((item) => item.paid).reduce((sum, item) => sum + item.amountCents, 0)
      const items = installmentItems.length + fixedItems.length
      result.push({
        month: key,
        installmentsCents,
        fixedCents,
        totalCents: installmentsCents + fixedCents,
        paidCents,
        installmentsCount: installmentItems.length,
        allPaid: items > 0 && [...installmentItems, ...fixedItems].every((item) => item.paid),
        projected,
        installmentItems,
        fixedItems
      })
    }
    return result
  }

  function getHistory(): HistoryOverview {
    ensureFixedEntries()
    const current = currentMonth()
    const map = new Map<string, { installments: number; fixed: number; paid: number; unpaid: number }>()
    const slot = (key: string) => {
      const existing = map.get(key) ?? { installments: 0, fixed: 0, paid: 0, unpaid: 0 }
      map.set(key, existing)
      return existing
    }
    const installmentRows = db.all<{ month: string; amount: number; paid: number }>(
      'SELECT ref_month AS month, amount_cents AS amount, CASE WHEN paid_at IS NULL THEN 0 ELSE 1 END AS paid FROM installments'
    )
    for (const row of installmentRows) {
      const entry = slot(row.month)
      entry.installments += row.amount
      if (row.paid) {
        entry.paid += row.amount
      } else {
        entry.unpaid += 1
      }
    }
    const fixedRows = db.all<{ month: string; amount: number; paid: number }>(
      'SELECT ref_month AS month, amount_cents AS amount, CASE WHEN paid_at IS NULL THEN 0 ELSE 1 END AS paid FROM fixed_entries'
    )
    for (const row of fixedRows) {
      const entry = slot(row.month)
      entry.fixed += row.amount
      if (row.paid) {
        entry.paid += row.amount
      } else {
        entry.unpaid += 1
      }
    }
    const months: HistoryMonth[] = []
    for (const [key, value] of map) {
      if (key > current || (key === current && value.paid === 0)) {
        continue
      }
      months.push({
        month: key,
        installmentsCents: value.installments,
        fixedCents: value.fixed,
        totalCents: value.installments + value.fixed,
        paidCents: value.paid,
        status: value.unpaid === 0 ? 'paid' : value.paid > 0 ? 'partial' : 'open'
      })
    }
    months.sort((a, b) => (a.month < b.month ? 1 : -1))

    const totalPaid =
      db.get<{ total: number }>(
        'SELECT COALESCE(SUM(amount_cents), 0) AS total FROM installments WHERE paid_at IS NOT NULL'
      )?.total ?? 0
    const settled: SettledPurchase[] = db.all<SettledPurchase>(
      `SELECT p.id, p.name, c.name AS cardName, p.total_cents AS totalCents, p.installments_count AS count,
        p.status AS status, (SELECT MAX(ref_month) FROM installments WHERE purchase_id = p.id) AS lastMonth
       FROM purchases p JOIN cards c ON c.id = p.card_id
       WHERE p.status = 'cancelled'
         OR NOT EXISTS (SELECT 1 FROM installments i WHERE i.purchase_id = p.id AND i.paid_at IS NULL)
       ORDER BY lastMonth DESC, p.name COLLATE NOCASE`
    )
    const active = settled.filter((row) => row.status === 'active')
    const fixedEvolution = db.all<{ month: string; totalCents: number }>(
      `SELECT ref_month AS month, SUM(amount_cents) AS totalCents FROM fixed_entries
       WHERE ref_month <= ? GROUP BY ref_month ORDER BY ref_month`,
      [current]
    )
    return {
      months,
      totalPaidInstallmentsCents: totalPaid,
      settledCount: active.length,
      settledTotalCents: active.reduce((sum, row) => sum + row.totalCents, 0),
      settled,
      fixedEvolution
    }
  }

  function toSummary(row: PurchaseRow): PurchaseSummary {
    const anticipationMonth = openInvoiceMonth(row.closingDay, getToday())
    const movable =
      db.get<{ n: number }>(
        'SELECT COUNT(*) AS n FROM installments WHERE purchase_id = ? AND paid_at IS NULL AND ref_month > ?',
        [row.id, anticipationMonth]
      )?.n ?? 0
    return {
      id: row.id,
      name: row.name,
      cardId: row.cardId,
      cardName: row.cardName,
      purchaseDate: row.purchaseDate,
      totalCents: row.totalCents,
      count: row.installmentsCount,
      status: row.status,
      paidCount: row.paidCount,
      paidCents: row.paidCents,
      remainingCount: row.remainingCount,
      remainingCents: row.remainingCents,
      nextMonth: row.nextMonth,
      lastMonth: row.lastMonth,
      nextAmountCents: row.nextAmountCents,
      anticipatableCount: row.status === 'active' ? movable : 0,
      anticipationMonth
    }
  }

  function listPurchases(): PurchaseSummary[] {
    return db
      .all<PurchaseRow>(
        `${PURCHASE_SELECT} WHERE p.status = 'active' GROUP BY p.id HAVING remainingCount > 0
         ORDER BY nextMonth, p.name COLLATE NOCASE`
      )
      .map(toSummary)
  }

  function getPurchase(id: number): PurchaseDetail {
    const row = db.get<PurchaseRow>(`${PURCHASE_SELECT} WHERE p.id = ? GROUP BY p.id`, [Number(id)])
    if (!row) {
      fail('Compra não encontrada')
    }
    const installments = db
      .all<{ id: number; number: number; month: string; amountCents: number; paidAt: string | null }>(
        `SELECT id, number, ref_month AS month, amount_cents AS amountCents, paid_at AS paidAt
         FROM installments WHERE purchase_id = ? ORDER BY ref_month, number`,
        [Number(id)]
      )
      .map((item) => ({
        id: item.id,
        number: item.number,
        month: item.month,
        amountCents: item.amountCents,
        paid: item.paidAt !== null
      }))
    return { purchase: toSummary(row as PurchaseRow), installments }
  }

  function createPurchase(input: PurchaseInput): void {
    const name = text(input.name, 'Informe o nome do produto')
    const card = getCard(input.cardId)
    const count = integer(input.count, 1, 120, 'O número de parcelas deve estar entre 1 e 120')
    const paidCount = integer(input.paidCount ?? 0, 0, count, 'Parcelas pagas não pode passar do total de parcelas')
    if (typeof input.purchaseDate !== 'string' || !DATE_RE.test(input.purchaseDate)) {
      fail('Data da compra inválida')
    }
    const firstMonth = month(input.firstMonth)
    let amounts: number[]
    if (input.installmentCents !== null && input.installmentCents !== undefined) {
      const value = integer(input.installmentCents, 1, 100_000_000_00, 'Valor da parcela inválido')
      amounts = Array.from({ length: count }, () => value)
    } else {
      const total = integer(input.totalCents, 1, 100_000_000_00, 'Informe o valor total da compra')
      amounts = splitInstallments(total, count)
    }
    const unpaidMonths = amounts.slice(paidCount).map((_, index) => addMonths(firstMonth, paidCount + index))
    assertInvoiceOpen(card, unpaidMonths)
    const total = amounts.reduce((sum, value) => sum + value, 0)
    db.transaction(() => {
      const purchaseId = db.insert(
        `INSERT INTO purchases (card_id, name, purchase_date, total_cents, installments_count, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        [card.id, name, input.purchaseDate, total, count, nowIso()]
      )
      const paidAt = nowIso()
      amounts.forEach((amount, index) => {
        db.run(
          'INSERT INTO installments (purchase_id, number, ref_month, amount_cents, paid_at) VALUES (?, ?, ?, ?, ?)',
          [purchaseId, index + 1, addMonths(firstMonth, index), amount, index < paidCount ? paidAt : null]
        )
      })
    })
  }

  function updatePurchase(input: PurchaseUpdateInput): void {
    const name = text(input.name, 'Informe o nome do produto')
    const card = getCard(input.cardId)
    const newTotal = integer(input.totalCents, 1, 100_000_000_00, 'Informe o valor total da compra')
    const newCount = integer(input.count, 1, 120, 'O número de parcelas deve estar entre 1 e 120')
    db.transaction(() => {
      const purchase = db.get<{ id: number; totalCents: number; count: number; status: string }>(
        `SELECT id, total_cents AS totalCents, installments_count AS count, status FROM purchases WHERE id = ?`,
        [input.id]
      )
      if (!purchase) {
        fail('Compra não encontrada')
      }
      if (purchase.status !== 'active') {
        fail('Esta compra foi encerrada e não pode ser editada')
      }
      db.run('UPDATE purchases SET name = ?, card_id = ? WHERE id = ?', [name, card.id, purchase.id])
      if (newTotal !== purchase.totalCents || newCount !== purchase.count) {
        const paid = db.get<{ n: number; total: number }>(
          `SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS total
           FROM installments WHERE purchase_id = ? AND paid_at IS NOT NULL`,
          [purchase.id]
        )
        const paidCount = paid?.n ?? 0
        const paidTotal = paid?.total ?? 0
        const anchor = db.get<{ month: string | null }>(
          'SELECT MIN(ref_month) AS month FROM installments WHERE purchase_id = ? AND paid_at IS NULL',
          [purchase.id]
        )?.month
        if (!anchor) {
          fail('Esta compra já está quitada')
        }
        if (newCount <= paidCount) {
          fail(`O número de parcelas deve ser maior que as ${paidCount} já pagas`)
        }
        const remainingTotal = newTotal - paidTotal
        if (remainingTotal <= 0) {
          fail('O valor total deve ser maior que o já pago')
        }
        const amounts = splitInstallments(remainingTotal, newCount - paidCount)
        db.run('DELETE FROM installments WHERE purchase_id = ? AND paid_at IS NULL', [purchase.id])
        amounts.forEach((amount, index) => {
          db.run('INSERT INTO installments (purchase_id, number, ref_month, amount_cents) VALUES (?, ?, ?, ?)', [
            purchase.id,
            paidCount + index + 1,
            addMonths(anchor, index),
            amount
          ])
        })
        db.run('UPDATE purchases SET total_cents = ?, installments_count = ? WHERE id = ?', [
          newTotal,
          newCount,
          purchase.id
        ])
        renumber(purchase.id)
      }
      const unpaidMonths = db
        .all<{ month: string }>(
          'SELECT DISTINCT ref_month AS month FROM installments WHERE purchase_id = ? AND paid_at IS NULL',
          [purchase.id]
        )
        .map((row) => row.month)
      assertInvoiceOpen(card, unpaidMonths)
    })
  }

  function deletePurchase(id: number): void {
    db.transaction(() => {
      const purchase = db.get<{ id: number }>('SELECT id FROM purchases WHERE id = ?', [id])
      if (!purchase) {
        fail('Compra não encontrada')
      }
      const paid = db.get<{ n: number; total: number }>(
        `SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS total
         FROM installments WHERE purchase_id = ? AND paid_at IS NOT NULL`,
        [id]
      )
      db.run('DELETE FROM installments WHERE purchase_id = ? AND paid_at IS NULL', [id])
      if (!paid || paid.n === 0) {
        db.run('DELETE FROM purchases WHERE id = ?', [id])
        return
      }
      db.run("UPDATE purchases SET status = 'cancelled', installments_count = ?, total_cents = ? WHERE id = ?", [
        paid.n,
        paid.total,
        id
      ])
      renumber(id)
    })
  }

  function anticipatePurchase(id: number, quantity: number): void {
    db.transaction(() => {
      const purchase = db.get<{ cardId: number; status: string }>(
        'SELECT card_id AS cardId, status FROM purchases WHERE id = ?',
        [id]
      )
      if (!purchase) {
        fail('Compra não encontrada')
      }
      if (purchase.status !== 'active') {
        fail('Esta compra foi encerrada')
      }
      const card = getCard(purchase.cardId)
      const target = openInvoiceMonth(card.closingDay, getToday())
      const movable = db.all<{ id: number }>(
        `SELECT id FROM installments WHERE purchase_id = ? AND paid_at IS NULL AND ref_month > ?
         ORDER BY ref_month, number`,
        [id, target]
      )
      if (movable.length === 0) {
        fail('Não há parcelas futuras para antecipar')
      }
      const qty = integer(quantity, 1, movable.length, `Escolha entre 1 e ${movable.length} parcelas`)
      assertInvoiceOpen(card, [target])
      for (const row of movable.slice(movable.length - qty)) {
        db.run('UPDATE installments SET ref_month = ? WHERE id = ?', [target, row.id])
      }
      renumber(id)
    })
  }

  function setInstallmentAmount(id: number, amountCents: number): void {
    const amount = integer(amountCents, 1, 100_000_000_00, 'Informe um valor maior que zero')
    db.transaction(() => {
      const installment = db.get<{ purchaseId: number; paidAt: string | null }>(
        'SELECT purchase_id AS purchaseId, paid_at AS paidAt FROM installments WHERE id = ?',
        [id]
      )
      if (!installment) {
        fail('Parcela não encontrada')
      }
      if (installment.paidAt) {
        fail('Parcelas pagas não podem ser alteradas')
      }
      db.run('UPDATE installments SET amount_cents = ? WHERE id = ?', [amount, id])
      db.run(
        'UPDATE purchases SET total_cents = (SELECT SUM(amount_cents) FROM installments WHERE purchase_id = ?) WHERE id = ?',
        [installment.purchaseId, installment.purchaseId]
      )
    })
  }

  function payInvoice(cardId: number, target: string): void {
    month(target)
    db.transaction(() => {
      const card = getCard(cardId)
      const closing = closingDate(target, card.closingDay)
      if (!isInvoiceClosed(target, card.closingDay, getToday())) {
        fail(`A fatura só pode ser paga depois do fechamento (${formatDate(closing)})`)
      }
      const pending = db.get<{ n: number; total: number }>(
        `SELECT COUNT(*) AS n, COALESCE(SUM(i.amount_cents), 0) AS total
         FROM installments i JOIN purchases p ON p.id = i.purchase_id
         WHERE p.card_id = ? AND i.ref_month = ? AND i.paid_at IS NULL`,
        [card.id, target]
      )
      if (!pending || pending.n === 0) {
        fail('Não há parcelas pendentes nesta fatura')
      }
      const paidAt = nowIso()
      db.run(
        `UPDATE installments SET paid_at = ?
         WHERE ref_month = ? AND paid_at IS NULL
           AND purchase_id IN (SELECT id FROM purchases WHERE card_id = ?)`,
        [paidAt, target, card.id]
      )
      db.run(
        `INSERT INTO invoices (card_id, ref_month, paid_at, amount_cents) VALUES (?, ?, ?, ?)
         ON CONFLICT(card_id, ref_month) DO UPDATE SET paid_at = excluded.paid_at, amount_cents = excluded.amount_cents`,
        [card.id, target, paidAt, pending.total]
      )
    })
  }

  function unpayInvoice(cardId: number, target: string): void {
    month(target)
    db.transaction(() => {
      const invoice = db.get<{ paidAt: string }>(
        'SELECT paid_at AS paidAt FROM invoices WHERE card_id = ? AND ref_month = ?',
        [cardId, target]
      )
      if (!invoice) {
        fail('Esta fatura não foi marcada como paga')
      }
      db.run(
        `UPDATE installments SET paid_at = NULL
         WHERE ref_month = ? AND paid_at = ?
           AND purchase_id IN (SELECT id FROM purchases WHERE card_id = ?)`,
        [target, invoice.paidAt, cardId]
      )
      db.run('DELETE FROM invoices WHERE card_id = ? AND ref_month = ?', [cardId, target])
    })
  }

  function dumpAll(): Record<string, unknown> {
    return {
      version: 1,
      exportedAt: nowIso(),
      cards: db.all('SELECT * FROM cards'),
      purchases: db.all('SELECT * FROM purchases'),
      installments: db.all('SELECT * FROM installments'),
      fixedExpenses: db.all('SELECT * FROM fixed_expenses'),
      fixedEntries: db.all('SELECT * FROM fixed_entries'),
      invoices: db.all('SELECT * FROM invoices')
    }
  }

  function buildCsv(): string {
    const escape = (value: string | number): string => {
      const raw = String(value)
      return /[;"\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
    }
    const money = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',')
    const lines: string[] = [['Tipo', 'Descrição', 'Cartão', 'Mês', 'Parcela', 'Valor', 'Situação', 'Pago em'].join(';')]
    const installments = db.all<{
      name: string
      cardName: string
      month: string
      number: number
      total: number
      amount: number
      paidAt: string | null
    }>(
      `SELECT p.name AS name, c.name AS cardName, i.ref_month AS month, i.number AS number,
        p.installments_count AS total, i.amount_cents AS amount, i.paid_at AS paidAt
       FROM installments i JOIN purchases p ON p.id = i.purchase_id JOIN cards c ON c.id = p.card_id
       ORDER BY i.ref_month, c.name, p.name`
    )
    for (const row of installments) {
      lines.push(
        [
          'Parcela',
          row.name,
          row.cardName,
          row.month,
          `${row.number}/${row.total}`,
          money(row.amount),
          row.paidAt ? 'Paga' : 'Pendente',
          row.paidAt ? row.paidAt.slice(0, 10) : ''
        ]
          .map(escape)
          .join(';')
      )
    }
    const fixed = db.all<{ name: string; month: string; amount: number; paidAt: string | null }>(
      'SELECT name, ref_month AS month, amount_cents AS amount, paid_at AS paidAt FROM fixed_entries ORDER BY ref_month, name'
    )
    for (const row of fixed) {
      lines.push(
        [
          'Fixo',
          row.name,
          '',
          row.month,
          '',
          money(row.amount),
          row.paidAt ? 'Pago' : 'Pendente',
          row.paidAt ? row.paidAt.slice(0, 10) : ''
        ]
          .map(escape)
          .join(';')
      )
    }
    return `\uFEFF${lines.join('\r\n')}\r\n`
  }

  const api: Sync<ServiceApi> = {
    listCards,
    saveCard,
    deleteCard,
    listFixedExpenses,
    saveFixedExpense,
    deleteFixedExpense,
    setFixedEntryPaid,
    getMonth,
    getCalendar,
    getHistory,
    listPurchases,
    getPurchase,
    createPurchase,
    updatePurchase,
    deletePurchase,
    anticipatePurchase,
    setInstallmentAmount,
    payInvoice,
    unpayInvoice
  }

  function importData(payload: unknown): ImportCounts {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      fail('Arquivo inválido: não parece uma exportação do Controle de Gastos')
    }
    const source = payload as Record<string, unknown>
    if (source.version !== 1) {
      fail('Arquivo inválido: versão de exportação não reconhecida')
    }
    const section = (key: string): Record<string, unknown>[] => {
      const value = source[key]
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'object' || item === null)) {
        fail(`Arquivo inválido: seção "${key}" ausente ou incorreta`)
      }
      return value as Record<string, unknown>[]
    }
    const int = (row: Record<string, unknown>, key: string): number => {
      const value = row[key]
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        fail(`Arquivo inválido: campo "${key}" incorreto`)
      }
      return value as number
    }
    const optInt = (row: Record<string, unknown>, key: string): number | null =>
      row[key] === null || row[key] === undefined ? null : int(row, key)
    const str = (row: Record<string, unknown>, key: string): string => {
      const value = row[key]
      if (typeof value !== 'string' || value === '') {
        fail(`Arquivo inválido: campo "${key}" incorreto`)
      }
      return value as string
    }
    const optStr = (row: Record<string, unknown>, key: string): string | null => {
      const value = row[key]
      if (value === null || value === undefined) {
        return null
      }
      if (typeof value !== 'string') {
        fail(`Arquivo inválido: campo "${key}" incorreto`)
      }
      return value as string
    }
    const monthField = (row: Record<string, unknown>, key: string): string => {
      const value = str(row, key)
      if (!MONTH_RE.test(value)) {
        fail(`Arquivo inválido: mês "${value}" incorreto`)
      }
      return value
    }

    const cards = section('cards')
    const purchases = section('purchases')
    const installments = section('installments')
    const fixedExpenses = section('fixedExpenses')
    const fixedEntries = section('fixedEntries')
    const invoices = section('invoices')

    try {
      return db.transaction(() => {
        db.run('DELETE FROM installments')
        db.run('DELETE FROM purchases')
        db.run('DELETE FROM invoices')
        db.run('DELETE FROM fixed_entries')
        db.run('DELETE FROM fixed_expenses')
        db.run('DELETE FROM cards')
        db.run('DELETE FROM meta')

        for (const row of cards) {
          db.run(
            'INSERT INTO cards (id, name, credit_limit_cents, closing_day, created_at) VALUES (?, ?, ?, ?, ?)',
            [
              int(row, 'id'),
              str(row, 'name'),
              int(row, 'credit_limit_cents'),
              int(row, 'closing_day'),
              optStr(row, 'created_at') ?? nowIso()
            ]
          )
        }
        for (const row of purchases) {
          const status = str(row, 'status')
          if (status !== 'active' && status !== 'cancelled') {
            fail('Arquivo inválido: situação de compra incorreta')
          }
          db.run(
            `INSERT INTO purchases (id, card_id, name, purchase_date, total_cents, installments_count, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              int(row, 'id'),
              int(row, 'card_id'),
              str(row, 'name'),
              str(row, 'purchase_date'),
              int(row, 'total_cents'),
              int(row, 'installments_count'),
              status,
              optStr(row, 'created_at') ?? nowIso()
            ]
          )
        }
        for (const row of installments) {
          db.run(
            'INSERT INTO installments (id, purchase_id, number, ref_month, amount_cents, paid_at) VALUES (?, ?, ?, ?, ?, ?)',
            [
              int(row, 'id'),
              int(row, 'purchase_id'),
              int(row, 'number'),
              monthField(row, 'ref_month'),
              int(row, 'amount_cents'),
              optStr(row, 'paid_at')
            ]
          )
        }
        for (const row of fixedExpenses) {
          db.run(
            `INSERT INTO fixed_expenses (id, name, amount_cents, due_day, active, card_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              int(row, 'id'),
              str(row, 'name'),
              int(row, 'amount_cents'),
              int(row, 'due_day'),
              int(row, 'active') ? 1 : 0,
              optInt(row, 'card_id'),
              optStr(row, 'created_at') ?? nowIso()
            ]
          )
        }
        let lastFixedMonth = ''
        for (const row of fixedEntries) {
          const refMonth = monthField(row, 'ref_month')
          if (refMonth > lastFixedMonth) {
            lastFixedMonth = refMonth
          }
          db.run(
            `INSERT INTO fixed_entries (id, expense_id, ref_month, name, amount_cents, due_day, paid_at, card_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              int(row, 'id'),
              optInt(row, 'expense_id'),
              refMonth,
              str(row, 'name'),
              int(row, 'amount_cents'),
              int(row, 'due_day'),
              optStr(row, 'paid_at'),
              optInt(row, 'card_id')
            ]
          )
        }
        for (const row of invoices) {
          db.run('INSERT INTO invoices (id, card_id, ref_month, paid_at, amount_cents) VALUES (?, ?, ?, ?, ?)', [
            int(row, 'id'),
            int(row, 'card_id'),
            monthField(row, 'ref_month'),
            str(row, 'paid_at'),
            int(row, 'amount_cents')
          ])
        }
        if (lastFixedMonth) {
          db.run("INSERT INTO meta (key, value) VALUES ('fixed_last_month', ?)", [lastFixedMonth])
        }
        return {
          cards: cards.length,
          purchases: purchases.length,
          installments: installments.length,
          fixedExpenses: fixedExpenses.length,
          fixedEntries: fixedEntries.length,
          invoices: invoices.length
        }
      })
    } catch (error) {
      if (error instanceof UserError) {
        throw error
      }
      throw new UserError('O arquivo tem dados inconsistentes e nada foi importado')
    }
  }

  return { ...api, dumpAll, buildCsv, importData }
}
