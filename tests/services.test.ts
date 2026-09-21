import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { openDatabase, openDatabaseFromBytes } from '../src/main/db'
import { createServices } from '../src/main/services'
import { firstInstallmentMonth, splitInstallments } from '../src/shared/date'

const require = createRequire(import.meta.url)
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')

async function setup(today: { value: string }) {
  const db = await openDatabase(wasmPath, null)
  const services = createServices(db, () => today.value)
  return { db, services }
}

test('divisão de parcelas coloca os centavos na primeira', () => {
  assert.deepEqual(splitInstallments(100000, 3), [33334, 33333, 33333])
  assert.deepEqual(splitInstallments(500000, 10), Array(10).fill(50000))
})

test('primeira parcela depende do fechamento', () => {
  assert.equal(firstInstallmentMonth('2026-09-05', 5), '2026-09')
  assert.equal(firstInstallmentMonth('2026-09-06', 5), '2026-10')
  assert.equal(firstInstallmentMonth('2026-12-20', 10), '2027-01')
})

test('compra parcelada, fatura, limite e histórico', async () => {
  const today = { value: '2026-09-18' }
  const { services } = await setup(today)
  services.saveCard({ name: 'Nubank', limitCents: 500000, closingDay: 10 })
  const card = services.listCards()[0]
  assert.equal(card.availableCents, 500000)
  assert.equal(card.currentInvoiceStatus, 'closed')

  services.createPurchase({
    name: 'PS5',
    cardId: card.id,
    purchaseDate: '2026-09-18',
    totalCents: 400000,
    count: 10,
    installmentCents: null,
    firstMonth: '2026-10',
    paidCount: 0
  })
  let list = services.listPurchases()
  assert.equal(list.length, 1)
  assert.equal(list[0].remainingCount, 10)
  assert.equal(services.listCards()[0].availableCents, 100000)
  assert.equal(services.getMonth('2026-10').totals.installmentsCents, 40000)
  assert.equal(services.getMonth('2026-09').totals.installmentsCents, 0)

  assert.throws(() => services.payInvoice(card.id, '2026-10'), /depois do fechamento/)

  today.value = '2026-10-11'
  services.payInvoice(card.id, '2026-10')
  assert.equal(services.listCards()[0].availableCents, 140000)
  const october = services.getMonth('2026-10')
  assert.equal(october.installments[0].paid, true)
  assert.equal(october.invoices[0].paid, true)
  assert.equal(services.getHistory().totalPaidInstallmentsCents, 40000)
  assert.equal(services.getHistory().months[0].month, '2026-10')

  services.unpayInvoice(card.id, '2026-10')
  assert.equal(services.listCards()[0].availableCents, 100000)
  services.payInvoice(card.id, '2026-10')

  list = services.listPurchases()
  assert.equal(list[0].anticipationMonth, '2026-11')
  assert.equal(list[0].anticipatableCount, 8)
  services.anticipatePurchase(list[0].id, 8)
  const detail = services.getPurchase(list[0].id)
  assert.equal(detail.installments.filter((row) => row.month === '2026-11').length, 9)
  assert.deepEqual(
    detail.installments.map((row) => row.number),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  )
  assert.equal(services.getMonth('2026-11').totals.installmentsCents, 360000)

  today.value = '2026-11-11'
  services.payInvoice(card.id, '2026-11')
  assert.equal(services.listPurchases().length, 0)
  const history = services.getHistory()
  assert.equal(history.settledCount, 1)
  assert.equal(history.settledTotalCents, 400000)
  assert.equal(history.totalPaidInstallmentsCents, 400000)
  assert.equal(services.listCards()[0].availableCents, 500000)
})

test('edição, exclusão e valor de parcela', async () => {
  const today = { value: '2026-09-02' }
  const { services } = await setup(today)
  services.saveCard({ name: 'Inter', limitCents: 300000, closingDay: 15 })
  const card = services.listCards()[0]
  services.createPurchase({
    name: 'Notebook',
    cardId: card.id,
    purchaseDate: '2026-09-02',
    totalCents: 300000,
    count: 3,
    installmentCents: null,
    firstMonth: '2026-08',
    paidCount: 1
  })
  const purchase = services.listPurchases()[0]
  assert.equal(purchase.paidCount, 1)
  assert.equal(purchase.nextMonth, '2026-09')

  services.updatePurchase({ id: purchase.id, name: 'Notebook Dell', cardId: card.id, totalCents: 500000, count: 5 })
  const detail = services.getPurchase(purchase.id)
  assert.equal(detail.installments.length, 5)
  assert.equal(detail.installments[0].paid, true)
  assert.equal(detail.installments[0].amountCents, 100000)
  assert.equal(detail.purchase.totalCents, 500000)
  assert.equal(detail.installments[1].month, '2026-09')

  services.setInstallmentAmount(detail.installments[2].id, 123456)
  assert.equal(services.getPurchase(purchase.id).purchase.totalCents, 500000 - 100000 + 123456)
  assert.throws(() => services.setInstallmentAmount(detail.installments[0].id, 1), /pagas/)
  assert.throws(
    () => services.updatePurchase({ id: purchase.id, name: 'x', cardId: card.id, totalCents: 500000, count: 1 }),
    /maior que/
  )

  services.deletePurchase(purchase.id)
  assert.equal(services.listPurchases().length, 0)
  const settled = services.getHistory().settled
  assert.equal(settled[0].status, 'cancelled')
  assert.equal(settled[0].totalCents, 100000)
  assert.throws(() => services.deleteCard(card.id), /não pode ser excluído/)
})

test('gastos fixos congelados por mês', async () => {
  const today = { value: '2026-09-18' }
  const { services } = await setup(today)
  services.saveFixedExpense({ name: 'Aluguel', amountCents: 150000, dueDay: 5, active: true })
  services.saveFixedExpense({ name: 'Internet', amountCents: 10000, dueDay: 10, active: true })
  let september = services.getMonth('2026-09')
  assert.equal(september.totals.fixedCents, 160000)
  const rent = september.fixed.find((row) => row.name === 'Aluguel')!
  services.setFixedEntryPaid(rent.entryId!, true)
  assert.equal(services.getMonth('2026-09').totals.paidCents, 150000)

  today.value = '2026-10-03'
  const expense = services.listFixedExpenses().find((row) => row.name === 'Aluguel')!
  services.saveFixedExpense({ ...expense, amountCents: 160000 })
  const october = services.getMonth('2026-10')
  assert.equal(october.totals.fixedCents, 170000)
  assert.equal(october.fixed.find((row) => row.name === 'Aluguel')!.previousAmountCents, 150000)
  assert.equal(services.getMonth('2026-09').totals.fixedCents, 160000)
  assert.equal(services.getMonth('2026-11').fixed[0].projected, true)
  assert.deepEqual(
    services.getHistory().fixedEvolution.map((row) => row.totalCents),
    [160000, 170000]
  )

  services.deleteFixedExpense(expense.id)
  assert.equal(services.getMonth('2026-10').totals.fixedCents, 10000)
  assert.equal(services.getMonth('2026-09').totals.fixedCents, 160000)
  const calendar = services.getCalendar(2026)
  assert.equal(calendar[8].fixedCents, 160000)
  assert.equal(calendar[10].projected, true)
})

test('exportações', async () => {
  const today = { value: '2026-09-18' }
  const { services } = await setup(today)
  services.saveCard({ name: 'Card', limitCents: 100000, closingDay: 20 })
  const dump = services.dumpAll() as { cards: unknown[] }
  assert.equal(dump.cards.length, 1)
  assert.ok(services.buildCsv().startsWith('\uFEFFTipo;'))
})

async function populated(today: { value: string }) {
  const { db, services } = await setup(today)
  services.saveCard({ name: 'Nubank', limitCents: 500000, closingDay: 10 })
  const card = services.listCards()[0]
  services.createPurchase({
    name: 'PS5',
    cardId: card.id,
    purchaseDate: '2026-09-02',
    totalCents: 400000,
    count: 4,
    installmentCents: null,
    firstMonth: '2026-09',
    paidCount: 1
  })
  services.saveFixedExpense({ name: 'Aluguel', amountCents: 150000, dueDay: 5, active: true, cardId: card.id })
  return { db, services, card }
}

test('importação por JSON restaura os mesmos dados', async () => {
  const today = { value: '2026-09-18' }
  const source = await populated(today)
  const exported = JSON.parse(JSON.stringify(source.services.dumpAll()))

  const target = await setup(today)
  target.services.saveCard({ name: 'Lixo', limitCents: 1, closingDay: 1 })
  const counts = target.services.importData(exported)
  assert.equal(counts.cards, 1)
  assert.equal(counts.installments, 4)
  assert.equal(target.services.listCards().length, 1)
  assert.equal(target.services.listCards()[0].name, 'Nubank')
  assert.equal(target.services.listCards()[0].usedCents, 300000)
  assert.equal(target.services.getMonth('2026-09').totals.totalCents, source.services.getMonth('2026-09').totals.totalCents)
  assert.equal(target.services.listFixedExpenses()[0].cardName, 'Nubank')
  assert.equal(target.services.getHistory().totalPaidInstallmentsCents, 100000)

  target.services.saveCard({ name: 'Novo', limitCents: 100, closingDay: 3 })
  assert.equal(target.services.listCards().length, 2)
})

test('importação por banco SQLite', async () => {
  const today = { value: '2026-09-18' }
  const source = await populated(today)
  const bytes = source.db.snapshot()
  const opened = await openDatabaseFromBytes(wasmPath, bytes)
  const payload = createServices(opened, () => today.value).dumpAll()

  const target = await setup(today)
  const counts = target.services.importData(payload)
  assert.equal(counts.purchases, 1)
  assert.equal(target.services.listPurchases()[0].name, 'PS5')

  await assert.rejects(() => openDatabaseFromBytes(wasmPath, new Uint8Array([1, 2, 3, 4])), /SQLite/)
  const blank = await openDatabase(wasmPath, null)
  await assert.rejects(() => openDatabaseFromBytes(wasmPath, new Uint8Array(0)), /não pertence/)
  assert.ok(blank)
})

test('importação recusa arquivos inválidos sem alterar os dados', async () => {
  const today = { value: '2026-09-18' }
  const target = await populated(today)
  assert.throws(() => target.services.importData({ version: 2 }), /versão/)
  assert.throws(() => target.services.importData(null), /inválido/)
  assert.throws(() => target.services.importData({ version: 1, cards: [] }), /seção/)
  const broken = JSON.parse(JSON.stringify(target.services.dumpAll()))
  broken.installments[0].purchase_id = 999
  assert.throws(() => target.services.importData(broken), /inconsistentes/)
  assert.equal(target.services.listCards().length, 1)
  assert.equal(target.services.listPurchases().length, 1)
  assert.equal(target.services.getMonth('2026-09').installments.length, 1)
})
