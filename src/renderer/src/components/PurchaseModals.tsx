import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { monthLabel, monthShort } from '@shared/date'
import type { CardDTO, PurchaseSummary } from '@shared/types'
import { api } from '../lib/api'
import { formatCents } from '../lib/format'
import { useData } from '../lib/hooks'
import { Field } from './Field'
import { Modal } from './Modal'
import { MoneyInput } from './MoneyInput'
import { useToast } from './Toast'

interface DetailProps {
  purchase: PurchaseSummary
  onClose: () => void
  onChanged: () => void
}

function AmountCell({ id, amountCents, paid, onSaved }: { id: number; amountCents: number; paid: boolean; onSaved: () => void }) {
  const { run } = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(amountCents)

  if (!editing) {
    return (
      <div className="inline-edit">
        <span>{formatCents(amountCents)}</span>
        {paid ? null : (
          <button
            className="btn-icon"
            aria-label="Editar valor da parcela"
            onClick={() => {
              setValue(amountCents)
              setEditing(true)
            }}
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="inline-edit">
      <MoneyInput value={value} onChange={setValue} autoFocus />
      <button
        className="btn-icon"
        aria-label="Salvar valor"
        onClick={async () => {
          if (await run(() => api.setInstallmentAmount(id, value), 'Valor da parcela atualizado')) {
            setEditing(false)
            onSaved()
          }
        }}
      >
        <Check size={16} />
      </button>
    </div>
  )
}

export function PurchaseDetailModal({ purchase, onClose, onChanged }: DetailProps) {
  const detail = useData(() => api.getPurchase(purchase.id), [purchase.id])

  const saved = () => {
    detail.reload()
    onChanged()
  }

  return (
    <Modal title={purchase.name} onClose={onClose} wide>
      {detail.data ? (
        <div className="stack">
          <div className="purchase-values">
            <div>
              <span>Cartão</span>
              <strong>{detail.data.purchase.cardName}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{formatCents(detail.data.purchase.totalCents)}</strong>
            </div>
            <div>
              <span>Já pago</span>
              <strong>{formatCents(detail.data.purchase.paidCents)}</strong>
            </div>
            <div>
              <span>Restante</span>
              <strong>{formatCents(detail.data.purchase.remainingCents)}</strong>
            </div>
          </div>
          <div className="card card-flush">
            <table className="table">
              <thead>
                <tr>
                  <th>Parcela</th>
                  <th>Mês</th>
                  <th className="num">Valor</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {detail.data.installments.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.number}/{detail.data?.purchase.count}
                    </td>
                    <td className="muted">{monthLabel(item.month)}</td>
                    <td className="num">
                      <AmountCell id={item.id} amountCents={item.amountCents} paid={item.paid} onSaved={saved} />
                    </td>
                    <td>
                      <span className={`badge ${item.paid ? 'success' : 'muted'}`}>{item.paid ? 'Paga' : 'Pendente'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty">{detail.error ?? 'Carregando...'}</div>
      )}
    </Modal>
  )
}

interface AnticipateProps {
  purchase: PurchaseSummary
  onClose: () => void
  onChanged: () => void
}

export function AnticipateModal({ purchase, onClose, onChanged }: AnticipateProps) {
  const { run } = useToast()
  const detail = useData(() => api.getPurchase(purchase.id), [purchase.id])
  const [quantity, setQuantity] = useState(purchase.anticipatableCount)

  const movable = (detail.data?.installments ?? [])
    .filter((item) => !item.paid && item.month > purchase.anticipationMonth)
    .sort((a, b) => (a.month === b.month ? a.number - b.number : a.month < b.month ? -1 : 1))
  const chosen = movable.slice(Math.max(0, movable.length - quantity))
  const total = chosen.reduce((sum, item) => sum + item.amountCents, 0)

  const confirm = async () => {
    if (await run(() => api.anticipatePurchase(purchase.id, quantity), 'Parcelas antecipadas')) {
      onChanged()
      onClose()
    }
  }

  return (
    <Modal
      title={`Antecipar parcelas de ${purchase.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" onClick={confirm} disabled={chosen.length === 0}>
            Antecipar {chosen.length} {chosen.length === 1 ? 'parcela' : 'parcelas'}
          </button>
        </>
      }
    >
      <div className="stack">
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          As parcelas escolhidas saem do fim do parcelamento (a última primeiro) e passam para a fatura de{' '}
          <strong style={{ color: 'var(--text)' }}>{monthLabel(purchase.anticipationMonth)}</strong>.
        </p>
        <Field label="Quantidade de parcelas" htmlFor="ant-qty" hint={`Restantes que podem ser antecipadas: ${purchase.anticipatableCount}`}>
          <input
            id="ant-qty"
            className="input"
            type="number"
            min={1}
            max={purchase.anticipatableCount}
            value={quantity}
            onChange={(event) =>
              setQuantity(Math.min(purchase.anticipatableCount, Math.max(1, Number(event.target.value) || 1)))
            }
          />
        </Field>
        <div className="preview">
          {chosen.length > 0 ? (
            <>
              Parcelas {chosen.map((item) => `${item.number}/${purchase.count} (${monthShort(item.month)})`).join(', ')}
              <br />
              Valor somado na fatura: <strong>{formatCents(total)}</strong>
            </>
          ) : (
            'Nenhuma parcela futura para antecipar.'
          )}
        </div>
        <span className="hint">Se o banco der desconto na antecipação, ajuste o valor de cada parcela nos detalhes da compra.</span>
      </div>
    </Modal>
  )
}

interface EditProps {
  purchase: PurchaseSummary
  cards: CardDTO[]
  onClose: () => void
  onChanged: () => void
}

export function EditPurchaseModal({ purchase, cards, onClose, onChanged }: EditProps) {
  const { run } = useToast()
  const [name, setName] = useState(purchase.name)
  const [cardId, setCardId] = useState(purchase.cardId)
  const [totalCents, setTotalCents] = useState(purchase.totalCents)
  const [count, setCount] = useState(purchase.count)

  const save = async () => {
    const ok = await run(
      () => api.updatePurchase({ id: purchase.id, name, cardId, totalCents, count }),
      'Compra atualizada'
    )
    if (ok) {
      onChanged()
      onClose()
    }
  }

  return (
    <Modal
      title="Editar compra"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" onClick={save}>
            Salvar
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Produto" htmlFor="ep-name" full>
          <input id="ep-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Cartão" htmlFor="ep-card" full>
          <select id="ep-card" className="input" value={cardId} onChange={(event) => setCardId(Number(event.target.value))}>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Valor total" htmlFor="ep-total">
          <MoneyInput id="ep-total" value={totalCents} onChange={setTotalCents} />
        </Field>
        <Field label="Nº de parcelas" htmlFor="ep-count">
          <input
            id="ep-count"
            className="input"
            type="number"
            min={1}
            max={120}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
          />
        </Field>
        <div className="full hint">
          {purchase.paidCount} {purchase.paidCount === 1 ? 'parcela paga é preservada' : 'parcelas pagas são preservadas'}. As
          demais são recalculadas
          {purchase.nextMonth ? ` a partir de ${monthLabel(purchase.nextMonth)}` : ''}.
        </div>
      </div>
    </Modal>
  )
}
