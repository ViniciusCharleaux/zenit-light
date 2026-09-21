import { Check, Undo2 } from 'lucide-react'
import { formatDate, monthShort } from '@shared/date'
import type { MonthData } from '@shared/types'
import { api } from '../lib/api'
import { formatCents, formatSigned } from '../lib/format'
import { useToast } from './Toast'

interface MonthDetailProps {
  data: MonthData
  onChanged: () => void
}

export function MonthDetail({ data, onChanged }: MonthDetailProps) {
  const { run } = useToast()

  const payInvoice = async (cardId: number) => {
    if (await run(() => api.payInvoice(cardId, data.month), 'Fatura marcada como paga')) {
      onChanged()
    }
  }

  const undoInvoice = async (cardId: number) => {
    if (await run(() => api.unpayInvoice(cardId, data.month), 'Pagamento da fatura desfeito')) {
      onChanged()
    }
  }

  const toggleFixed = async (entryId: number, paid: boolean) => {
    if (await run(() => api.setFixedEntryPaid(entryId, paid))) {
      onChanged()
    }
  }

  return (
    <div className="stack">
      <div className="card card-flush">
        <div className="card-head">
          <h3>Faturas dos cartões</h3>
        </div>
        {data.invoices.length === 0 ? (
          <div className="empty">Nenhuma parcela em cartão neste mês.</div>
        ) : (
          data.invoices.map((invoice) => (
            <div className="invoice" key={invoice.cardId}>
              <div>
                <div className="invoice-name">
                  {invoice.cardName}
                  {invoice.paid ? (
                    <span className="badge success">Paga</span>
                  ) : invoice.closed ? (
                    <span className="badge warning">Fechada em {formatDate(invoice.closingDate)}</span>
                  ) : (
                    <span className="badge">Aberta · fecha em {formatDate(invoice.closingDate)}</span>
                  )}
                </div>
                <div className="hint">
                  {invoice.paid
                    ? 'Limite liberado'
                    : invoice.closed
                      ? 'O fechamento já passou. Marque como paga quando pagar.'
                      : 'Ainda aceita compras nesta fatura'}
                </div>
              </div>
              <div className="strong">{formatCents(invoice.totalCents)}</div>
              <div>
                {invoice.paid ? (
                  invoice.undoable ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => undoInvoice(invoice.cardId)}>
                      <Undo2 size={14} /> Desfazer
                    </button>
                  ) : null
                ) : (
                  <button
                    className="btn btn-sm"
                    disabled={!invoice.closed}
                    title={invoice.closed ? '' : 'Disponível depois do fechamento'}
                    onClick={() => payInvoice(invoice.cardId)}
                  >
                    <Check size={14} /> Marcar fatura como paga
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card card-flush">
        <div className="card-head">
          <h3>Parcelas do mês</h3>
          <span className="muted">{formatCents(data.totals.installmentsCents)}</span>
        </div>
        {data.installments.length === 0 ? (
          <div className="empty">
            <strong>Sem parcelas em {monthShort(data.month)}</strong>
            Compras parceladas aparecem aqui no mês de cada parcela.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Cartão</th>
                <th>Parcela</th>
                <th className="num">Valor</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {data.installments.map((row) => (
                <tr key={row.id}>
                  <td className="strong">{row.purchaseName}</td>
                  <td className="muted">{row.cardName}</td>
                  <td>
                    {row.number}/{row.count}
                  </td>
                  <td className="num">{formatCents(row.amountCents)}</td>
                  <td>
                    <span className={`badge ${row.paid ? 'success' : 'muted'}`}>{row.paid ? 'Paga' : 'Pendente'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card card-flush">
        <div className="card-head">
          <h3>Gastos fixos</h3>
          <span className="muted">{formatCents(data.totals.fixedCents)}</span>
        </div>
        {data.fixed.length === 0 ? (
          <div className="empty">
            <strong>Nenhum gasto fixo neste mês</strong>
            Cadastre seus custos mensais na aba Gastos fixos.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 48 }} />
                <th>Gasto</th>
                <th>Vence</th>
                <th className="num">Valor</th>
                <th className="num">Variação</th>
              </tr>
            </thead>
            <tbody>
              {data.fixed.map((row) => {
                const delta = row.previousAmountCents === null ? null : row.amountCents - row.previousAmountCents
                return (
                  <tr key={row.key}>
                    <td>
                      {row.projected ? null : (
                        <button
                          className={`check ${row.paid ? 'on' : ''}`}
                          aria-label={row.paid ? 'Marcar como pendente' : 'Marcar como pago'}
                          onClick={() => toggleFixed(row.entryId as number, !row.paid)}
                        >
                          <Check size={14} strokeWidth={3} />
                        </button>
                      )}
                    </td>
                    <td>
                      <span className="strong">{row.name}</span>{' '}
                      {row.projected ? <span className="badge muted">Previsto</span> : null}
                      {row.cardName ? <div className="hint">{row.cardName}</div> : null}
                    </td>
                    <td className="muted">dia {row.dueDay}</td>
                    <td className="num">{formatCents(row.amountCents)}</td>
                    <td className="num">
                      {delta === null || delta === 0 ? (
                        <span className="dim">-</span>
                      ) : (
                        <span className={`badge ${delta > 0 ? 'danger' : 'success'}`}>{formatSigned(delta)}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
