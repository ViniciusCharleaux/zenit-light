import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { localToday, monthLabel, monthOf, monthShort } from '@shared/date'
import type { CalendarMonth } from '@shared/types'
import { MonthDetail } from '../components/MonthDetail'
import { api } from '../lib/api'
import { formatCents } from '../lib/format'
import { useData } from '../lib/hooks'

const MAX_ITEMS = 5

function compact(cents: number): string {
  if (cents === 0) {
    return '-'
  }
  return `R$ ${Math.round(cents / 100).toLocaleString('pt-BR')}`
}

function statusOf(item: CalendarMonth): { label: string; tone: string } {
  if (item.totalCents === 0) {
    return { label: 'Sem lançamentos', tone: 'muted' }
  }
  if (item.projected) {
    return { label: 'Previsto', tone: '' }
  }
  if (item.allPaid) {
    return { label: 'Pago', tone: 'success' }
  }
  return item.paidCents > 0 ? { label: 'Parcial', tone: 'warning' } : { label: 'A pagar', tone: 'danger' }
}

function Tooltip({ item }: { item: CalendarMonth }) {
  const status = statusOf(item)
  const extraInstallments = item.installmentItems.length - MAX_ITEMS
  const extraFixed = item.fixedItems.length - MAX_ITEMS
  return (
    <span className="tip" role="tooltip">
      <span className="tip-head">
        <strong>{monthLabel(item.month)}</strong>
        <span className={`badge ${status.tone}`}>{status.label}</span>
      </span>
      <span className="tip-total">{formatCents(item.totalCents)}</span>
      {item.totalCents > 0 && !item.projected ? (
        <span className="tip-sub">
          {formatCents(item.paidCents)} pagos · faltam {formatCents(item.totalCents - item.paidCents)}
        </span>
      ) : null}

      {item.installmentItems.length > 0 ? (
        <span className="tip-section">
          <span className="tip-title">
            <span className="legend-dot inst" />
            Parcelas <em>{formatCents(item.installmentsCents)}</em>
          </span>
          {item.installmentItems.slice(0, MAX_ITEMS).map((row, index) => (
            <span className="tip-row" key={`${row.name}-${index}`}>
              <span className="tip-name">
                {row.name} <small>{row.number}/{row.count}</small>
              </span>
              <span>{formatCents(row.amountCents)}</span>
            </span>
          ))}
          {extraInstallments > 0 ? <span className="tip-more">+ {extraInstallments} mais</span> : null}
        </span>
      ) : null}

      {item.fixedItems.length > 0 ? (
        <span className="tip-section">
          <span className="tip-title">
            <span className="legend-dot fixed" />
            Gastos fixos <em>{formatCents(item.fixedCents)}</em>
          </span>
          {item.fixedItems.slice(0, MAX_ITEMS).map((row, index) => (
            <span className="tip-row" key={`${row.name}-${index}`}>
              <span className="tip-name">
                {row.name}
                {row.cardName ? <small>{row.cardName}</small> : null}
              </span>
              <span>{formatCents(row.amountCents)}</span>
            </span>
          ))}
          {extraFixed > 0 ? <span className="tip-more">+ {extraFixed} mais</span> : null}
        </span>
      ) : null}

      {item.totalCents === 0 ? <span className="tip-sub">Nada previsto para este mês.</span> : null}
    </span>
  )
}

export function Calendar() {
  const currentMonth = monthOf(localToday())
  const [year, setYear] = useState(Number(currentMonth.slice(0, 4)))
  const [selected, setSelected] = useState(currentMonth)

  const calendar = useData(() => api.getCalendar(year), [year])
  const detail = useData(() => api.getMonth(selected), [selected])

  const reload = () => {
    calendar.reload()
    detail.reload()
  }

  const changeYear = (delta: number) => {
    const next = year + delta
    setYear(next)
    setSelected(`${next}-${selected.slice(5, 7)}`)
  }

  const months = calendar.data ?? []
  const maxTotal = Math.max(1, ...months.map((item) => item.totalCents))
  const yearTotal = months.reduce((sum, item) => sum + item.totalCents, 0)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendário</h1>
          <p className="page-sub">Passe o mouse sobre um mês para ver o que vence nele.</p>
        </div>
        <div className="row">
          <button className="btn-icon" onClick={() => changeYear(-1)} aria-label="Ano anterior">
            <ChevronLeft size={18} />
          </button>
          <span className="strong" style={{ minWidth: 48, textAlign: 'center' }}>
            {year}
          </span>
          <button className="btn-icon" onClick={() => changeYear(1)} aria-label="Próximo ano">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="stack">
        <div className="card chart-card">
          <div className="row-between wrap">
            <div className="chart-legend">
              <span>
                <span className="legend-dot inst" /> Parcelas
              </span>
              <span>
                <span className="legend-dot fixed" /> Gastos fixos
              </span>
              <span>
                <span className="legend-dot projected" /> Previsto
              </span>
            </div>
            <span className="muted">
              Total em {year}: <strong style={{ color: 'var(--text)' }}>{formatCents(yearTotal)}</strong>
            </span>
          </div>

          <div className="chart">
            {months.map((item, index) => {
              const height = item.totalCents > 0 ? Math.max(4, (item.totalCents / maxTotal) * 100) : 0
              return (
                <button
                  key={item.month}
                  className={`chart-col ${item.month === selected ? 'active' : ''} ${
                    index >= 6 ? 'tip-left' : 'tip-right'
                  }`}
                  onClick={() => setSelected(item.month)}
                  aria-label={`${monthLabel(item.month)}: ${formatCents(item.totalCents)}`}
                >
                  <span className="col-value">
                    {item.allPaid ? <Check size={12} strokeWidth={3} color="var(--success)" /> : null}
                    {compact(item.totalCents)}
                  </span>
                  <span className="col-plot">
                    {height > 0 ? (
                      <span className="col-bar" style={{ height: `${height}%` }}>
                        <span
                          className="seg seg-inst"
                          style={{ flexGrow: item.installmentsCents, display: item.installmentsCents ? 'block' : 'none' }}
                        />
                        <span
                          className={`seg seg-fixed ${item.projected ? 'projected' : ''}`}
                          style={{ flexGrow: item.fixedCents, display: item.fixedCents ? 'block' : 'none' }}
                        />
                      </span>
                    ) : (
                      <span className="col-stub" />
                    )}
                  </span>
                  <span className={`col-label ${item.month === currentMonth ? 'current' : ''}`}>
                    {monthShort(item.month).slice(0, 3)}
                  </span>
                  <Tooltip item={item} />
                </button>
              )
            })}
          </div>
        </div>

        <h2 className="card-title" style={{ fontSize: 18, margin: '8px 0 0' }}>
          {monthLabel(selected)}
        </h2>
        {detail.data ? (
          <MonthDetail data={detail.data} onChanged={reload} />
        ) : (
          <div className="empty">{detail.error ?? 'Carregando...'}</div>
        )}
      </div>
    </div>
  )
}
