import { CreditCard, Receipt, Wallet } from 'lucide-react'
import { localToday, monthLabel, monthOf } from '@shared/date'
import { MonthDetail } from '../components/MonthDetail'
import { api } from '../lib/api'
import { formatCents, percent } from '../lib/format'
import { useData } from '../lib/hooks'

export function Dashboard() {
  const month = monthOf(localToday())
  const monthData = useData(() => api.getMonth(month), [month])
  const cards = useData(() => api.listCards(), [])

  const reload = () => {
    monthData.reload()
    cards.reload()
  }

  const data = monthData.data
  const paidPercent = data ? percent(data.totals.paidCents, data.totals.totalCents) : 0

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Resumo de {monthLabel(month)}</h1>
          <p className="page-sub">O que você tem para pagar neste mês.</p>
        </div>
      </div>

      {data ? (
        <div className="stack">
          <div className="grid grid-3">
            <div className="stat">
              <div className="stat-label">
                <span className="icon-bubble">
                  <CreditCard size={16} />
                </span>
                Parcelas
              </div>
              <div className="stat-value">{formatCents(data.totals.installmentsCents)}</div>
              <div className="stat-note">
                {data.installments.length} {data.installments.length === 1 ? 'parcela' : 'parcelas'} neste mês
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">
                <span className="icon-bubble">
                  <Receipt size={16} />
                </span>
                Gastos fixos
              </div>
              <div className="stat-value">{formatCents(data.totals.fixedCents)}</div>
              <div className="stat-note">
                {data.fixed.length} {data.fixed.length === 1 ? 'gasto' : 'gastos'} mensais
              </div>
            </div>
            <div className="stat stat-hero">
              <div className="stat-label">
                <span className="icon-bubble">
                  <Wallet size={16} />
                </span>
                Total do mês
              </div>
              <div className="stat-value">{formatCents(data.totals.totalCents)}</div>
              <div className="progress">
                <span style={{ width: `${paidPercent}%` }} />
              </div>
              <div className="stat-note">
                {formatCents(data.totals.paidCents)} pagos · faltam {formatCents(data.totals.pendingCents)}
              </div>
            </div>
          </div>

          {cards.data && cards.data.length > 0 ? (
            <div className="card">
              <h3 className="card-title">Limite dos cartões</h3>
              <div className="grid grid-2">
                {cards.data.map((card) => {
                  const used = percent(card.usedCents, card.limitCents)
                  return (
                    <div key={card.id} className="stack" style={{ gap: 8 }}>
                      <div className="row-between">
                        <span className="strong">{card.name}</span>
                        <span className="muted">
                          {formatCents(card.availableCents)} disponível de {formatCents(card.limitCents)}
                        </span>
                      </div>
                      <div className={`progress ${used >= 85 ? 'warn' : ''}`}>
                        <span style={{ width: `${used}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <MonthDetail data={data} onChanged={reload} />
        </div>
      ) : (
        <div className="empty">{monthData.error ?? 'Carregando...'}</div>
      )}
    </div>
  )
}
