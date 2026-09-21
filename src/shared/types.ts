export interface CardDTO {
  id: number
  name: string
  limitCents: number
  closingDay: number
  usedCents: number
  availableCents: number
  purchasesCount: number
  openInvoiceMonth: string
  currentInvoiceStatus: 'open' | 'closed' | 'paid'
}

export interface CardInput {
  id?: number
  name: string
  limitCents: number
  closingDay: number
}

export interface FixedExpenseDTO {
  id: number
  name: string
  amountCents: number
  dueDay: number
  active: boolean
  cardId: number | null
  cardName: string | null
}

export interface FixedExpenseInput {
  id?: number
  name: string
  amountCents: number
  dueDay: number
  active: boolean
  cardId?: number | null
}

export interface InstallmentRow {
  id: number
  purchaseId: number
  purchaseName: string
  cardId: number
  cardName: string
  number: number
  count: number
  month: string
  amountCents: number
  paid: boolean
}

export interface FixedEntryRow {
  key: string
  entryId: number | null
  expenseId: number | null
  name: string
  cardName: string | null
  dueDay: number
  amountCents: number
  previousAmountCents: number | null
  paid: boolean
  projected: boolean
}

export interface InvoiceRow {
  cardId: number
  cardName: string
  month: string
  closingDay: number
  closingDate: string
  closed: boolean
  paid: boolean
  undoable: boolean
  totalCents: number
  pendingCents: number
}

export interface MonthTotals {
  installmentsCents: number
  fixedCents: number
  totalCents: number
  paidCents: number
  pendingCents: number
}

export interface MonthData {
  month: string
  installments: InstallmentRow[]
  fixed: FixedEntryRow[]
  invoices: InvoiceRow[]
  totals: MonthTotals
}

export interface CalendarInstallmentItem {
  name: string
  cardName: string
  number: number
  count: number
  amountCents: number
  paid: boolean
}

export interface CalendarFixedItem {
  name: string
  cardName: string | null
  amountCents: number
  paid: boolean
}

export interface CalendarMonth {
  month: string
  installmentsCents: number
  fixedCents: number
  totalCents: number
  paidCents: number
  installmentsCount: number
  allPaid: boolean
  projected: boolean
  installmentItems: CalendarInstallmentItem[]
  fixedItems: CalendarFixedItem[]
}

export type MonthStatus = 'paid' | 'partial' | 'open'

export interface HistoryMonth {
  month: string
  installmentsCents: number
  fixedCents: number
  totalCents: number
  paidCents: number
  status: MonthStatus
}

export interface SettledPurchase {
  id: number
  name: string
  cardName: string
  totalCents: number
  count: number
  lastMonth: string | null
  status: 'active' | 'cancelled'
}

export interface FixedEvolutionRow {
  month: string
  totalCents: number
}

export interface HistoryOverview {
  months: HistoryMonth[]
  totalPaidInstallmentsCents: number
  settledCount: number
  settledTotalCents: number
  settled: SettledPurchase[]
  fixedEvolution: FixedEvolutionRow[]
}

export interface PurchaseSummary {
  id: number
  name: string
  cardId: number
  cardName: string
  purchaseDate: string
  totalCents: number
  count: number
  status: 'active' | 'cancelled'
  paidCount: number
  paidCents: number
  remainingCount: number
  remainingCents: number
  nextMonth: string | null
  lastMonth: string | null
  nextAmountCents: number | null
  anticipatableCount: number
  anticipationMonth: string
}

export interface PurchaseInstallment {
  id: number
  number: number
  month: string
  amountCents: number
  paid: boolean
}

export interface PurchaseDetail {
  purchase: PurchaseSummary
  installments: PurchaseInstallment[]
}

export interface PurchaseInput {
  name: string
  cardId: number
  purchaseDate: string
  totalCents: number
  count: number
  installmentCents: number | null
  firstMonth: string
  paidCount: number
}

export interface PurchaseUpdateInput {
  id: number
  name: string
  cardId: number
  totalCents: number
  count: number
}

export interface ExportResult {
  canceled: boolean
  path?: string
}

export interface Api {
  listCards(): Promise<CardDTO[]>
  saveCard(input: CardInput): Promise<void>
  deleteCard(id: number): Promise<void>
  listFixedExpenses(): Promise<FixedExpenseDTO[]>
  saveFixedExpense(input: FixedExpenseInput): Promise<void>
  deleteFixedExpense(id: number): Promise<void>
  setFixedEntryPaid(entryId: number, paid: boolean): Promise<void>
  getMonth(month: string): Promise<MonthData>
  getCalendar(year: number): Promise<CalendarMonth[]>
  getHistory(): Promise<HistoryOverview>
  listPurchases(): Promise<PurchaseSummary[]>
  getPurchase(id: number): Promise<PurchaseDetail>
  createPurchase(input: PurchaseInput): Promise<void>
  updatePurchase(input: PurchaseUpdateInput): Promise<void>
  deletePurchase(id: number): Promise<void>
  anticipatePurchase(id: number, quantity: number): Promise<void>
  setInstallmentAmount(id: number, amountCents: number): Promise<void>
  payInvoice(cardId: number, month: string): Promise<void>
  unpayInvoice(cardId: number, month: string): Promise<void>
  exportJson(): Promise<ExportResult>
  exportCsv(): Promise<ExportResult>
  exportDatabase(): Promise<ExportResult>
  getDatabasePath(): Promise<string>
  revealDatabase(): Promise<void>
}
