import { useEffect, useState } from 'react'
import { CheckCircle2, PiggyBank, ShoppingBag } from 'lucide-react'
import { monthLabel, monthShort } from '@shared/date'
import type { MonthStatus } from '@shared/types'
import { MonthDetail } from '../components/MonthDetail'
import { api } from '../lib/api'
import { formatCents } from '../lib/format'
import { useData } from '../lib/hooks'

const STATUS_LABEL: Record<MonthStatus, string> = {
  paid: 'Pago',
  partial: 'Parcial',
  open: 'Em aberto'
}

export function History() {
  const overview = useData(() => api.getHistory(), [])
  const [selected, setSelected] = useState<string | null>(null)

  const months = overview.data?.months ?? []
  const active = selected ?? months[0]?.month ?? null

  useEffect(() => {
    if (selected === null && months.length > 0) {
      setSelected(months[0].month)
    }
  }, [selected, months])

  const detail = useData(() => (active ? api.getMonth(active) : Promise.resolve(null)), [active])

  const reload = () => {
    overview.reload()
    detail.reload()
  }

  const data = overview.data
  const activeInfo = months.find((item) => item.month === active)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Histórico</h1>
          <p className="page-sub">Meses anteriores, compras quitadas e o total já gasto em parcelados.</p>
        </div>
      </div>

      {data ? (
        <div className="stack">
          <div className="grid grid-3">
            <div className="stat">
              <div className="stat-label">
                <span className="icon-bubble">
                  <PiggyBank size={16} />
                </span>
                Total pago em parcelados
              </div>
              <div className="stat-value">{formatCents(data.totalPaidInstallmentsCents)}</div>
              <div className="stat-note">Soma de todas as parcelas já pagas</div>
            </div>
            <div className="stat">
              <div className="stat-label">
                <span className="icon-bubble">
                  <CheckCircle2 size={16} />
                </span>
                Compras quitadas
              </div>
              <div className="stat-value">{data.settledCount}</div>
              <div className="stat-note">Parceladas e pagas por completo</div>
            </div>
            <div className="stat">
              <div className="stat-label">
                <span className="icon-bubble">
                  <ShoppingBag size={16} />
                </span>
                Valor das quitadas
              </div>
              <div className="stat-value">{formatCents(data.settledTotalCents)}</div>
              <div className="stat-note">Total das compras já quitadas</div>
            </div>
          </div>

          {months.length === 0 ? (
            <div className="card empty">
              <strong>Ainda não há meses no histórico</strong>
              Os meses aparecem aqui depois que passam ou quando você paga uma fatura.
            </div>
          ) : (
            <>
              <div className="chips">
                {months.map((item) => (
                  <button
                    key={item.month}
                    className={`chip ${item.month === active ? 'active' : ''}`}
                    onClick={() => setSelected(item.month)}
                  >
                    <span className={`dot ${item.status}`} />
                    {monthShort(item.month)}
                  </button>
                ))}
              </div>

              {active && activeInfo ? (
                <div className="row-between">
                  <h2 className="card-title" style={{ fontSize: 18, margin: 0 }}>
                    {monthLabel(active)}
                  </h2>
                  <div className="row">
                    <span className="muted">
                      {formatCents(activeInfo.paidCents)} de {formatCents(activeInfo.totalCents)} pagos
                    </span>
                    <span
                      className={`badge ${
                        activeInfo.status === 'paid' ? 'success' : activeInfo.status === 'partial' ? 'warning' : 'danger'
                      }`}
                    >
                      {STATUS_LABEL[activeInfo.status]}
                    </span>
                  </div>
                </div>
              ) : null}

              {detail.data ? <MonthDetail data={detail.data} onChanged={reload} /> : null}
            </>
          )}

          <div className="card card-flush">
            <div className="card-head">
              <h3>Compras quitadas</h3>
            </div>
            {data.settled.length === 0 ? (
              <div className="empty">Nenhuma compra parcelada foi quitada ainda.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Cartão</th>
                    <th>Parcelas</th>
                    <th>Última parcela</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.settled.map((row) => (
                    <tr key={row.id}>
                      <td className="strong">
                        {row.name}{' '}
                        {row.status === 'cancelled' ? <span className="badge warning">Encerrada</span> : null}
                      </td>
                      <td className="muted">{row.cardName}</td>
                      <td>{row.count}x</td>
                      <td className="muted">{row.lastMonth ? monthShort(row.lastMonth) : '-'}</td>
                      <td className="num">{formatCents(row.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="empty">{overview.error ?? 'Carregando...'}</div>
      )}
    </div>
  )
}
