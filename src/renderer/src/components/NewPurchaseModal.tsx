import { useState } from 'react'
import { firstInstallmentMonth, localToday, monthLabel, monthOf, splitInstallments } from '@shared/date'
import type { CardDTO } from '@shared/types'
import { api } from '../lib/api'
import { formatCents } from '../lib/format'
import { Field } from './Field'
import { Modal } from './Modal'
import { MoneyInput } from './MoneyInput'
import { useToast } from './Toast'

interface NewPurchaseModalProps {
  cards: CardDTO[]
  onClose: () => void
  onCreated: () => void
  onGoToCards: () => void
}

export function NewPurchaseModal({ cards, onClose, onCreated, onGoToCards }: NewPurchaseModalProps) {
  const { run } = useToast()
  const [name, setName] = useState('')
  const [cardChoice, setCardChoice] = useState<number | null>(null)
  const [date, setDate] = useState(localToday())
  const [total, setTotal] = useState(0)
  const [count, setCount] = useState(1)
  const [installmentOverride, setInstallmentOverride] = useState<number | null>(null)
  const [monthOverride, setMonthOverride] = useState<string | null>(null)
  const [paidCount, setPaidCount] = useState(0)

  const card = cards.find((item) => item.id === cardChoice) ?? cards[0]
  const safeCount = Math.max(1, Math.min(120, Math.floor(count) || 1))
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const autoMonth = validDate
    ? card
      ? firstInstallmentMonth(date, card.closingDay)
      : monthOf(date)
    : monthOf(localToday())
  const firstMonth = monthOverride ?? autoMonth

  const amounts =
    installmentOverride !== null
      ? Array.from({ length: safeCount }, () => installmentOverride)
      : total > 0
        ? splitInstallments(total, safeCount)
        : []
  const regular = amounts.length > 0 ? amounts[amounts.length - 1] : 0
  const finalTotal = amounts.reduce((sum, value) => sum + value, 0)
  const lastMonth = (() => {
    const [year, month] = firstMonth.split('-').map(Number)
    const index = year * 12 + (month - 1) + safeCount - 1
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
  })()

  const submit = async () => {
    if (!card) {
      return
    }
    const ok = await run(
      () =>
        api.createPurchase({
          name,
          cardId: card.id,
          purchaseDate: date,
          totalCents: total,
          count: safeCount,
          installmentCents: installmentOverride,
          firstMonth,
          paidCount: Math.max(0, Math.min(safeCount, Math.floor(paidCount) || 0))
        }),
      'Compra cadastrada'
    )
    if (ok) {
      onCreated()
      onClose()
    }
  }

  if (cards.length === 0) {
    return (
      <Modal
        title="Nova compra parcelada"
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn"
              onClick={() => {
                onClose()
                onGoToCards()
              }}
            >
              Ir para Cartões
            </button>
          </>
        }
      >
        <div className="notice">Cadastre um cartão antes de registrar uma compra parcelada.</div>
      </Modal>
    )
  }

  return (
    <Modal
      title="Nova compra parcelada"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" onClick={submit}>
            Cadastrar compra
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Produto" htmlFor="pc-name" full>
          <input
            id="pc-name"
            className="input"
            placeholder="Ex.: PS5"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Cartão" htmlFor="pc-card">
          <select
            id="pc-card"
            className="input"
            value={card?.id ?? ''}
            onChange={(event) => {
              setCardChoice(Number(event.target.value))
              setMonthOverride(null)
            }}
          >
            {cards.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data da compra" htmlFor="pc-date">
          <input
            id="pc-date"
            className="input"
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value)
              setMonthOverride(null)
            }}
          />
        </Field>
        <Field label="Valor total" htmlFor="pc-total">
          <MoneyInput
            id="pc-total"
            value={installmentOverride !== null ? finalTotal : total}
            onChange={(value) => {
              setTotal(value)
              setInstallmentOverride(null)
            }}
          />
        </Field>
        <Field label="Nº de parcelas" htmlFor="pc-count">
          <input
            id="pc-count"
            className="input"
            type="number"
            min={1}
            max={120}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
          />
        </Field>
        <Field
          label="Valor da parcela"
          htmlFor="pc-installment"
          hint={
            installmentOverride !== null ? (
              <button className="link-btn" onClick={() => setInstallmentOverride(null)}>
                Voltar ao valor calculado
              </button>
            ) : amounts.length > 1 && amounts[0] !== regular ? (
              `1ª parcela de ${formatCents(amounts[0])} (centavos de ajuste)`
            ) : (
              'Calculado automaticamente. Você pode editar.'
            )
          }
        >
          <MoneyInput
            id="pc-installment"
            value={installmentOverride ?? regular}
            onChange={(value) => setInstallmentOverride(value || null)}
          />
        </Field>
        <Field
          label="Mês da 1ª parcela"
          htmlFor="pc-month"
          hint={
            monthOverride !== null ? (
              <button className="link-btn" onClick={() => setMonthOverride(null)}>
                Usar cálculo pelo fechamento
              </button>
            ) : card ? (
              `Fechamento do cartão: dia ${card.closingDay}`
            ) : undefined
          }
        >
          <input
            id="pc-month"
            className="input"
            type="month"
            value={firstMonth}
            onChange={(event) => setMonthOverride(event.target.value || null)}
          />
        </Field>
        <Field label="Parcelas já pagas" htmlFor="pc-paid" hint="Use se a compra já estava em andamento.">
          <input
            id="pc-paid"
            className="input"
            type="number"
            min={0}
            max={safeCount}
            value={paidCount}
            onChange={(event) => setPaidCount(Number(event.target.value))}
          />
        </Field>
        <div className="full preview">
          {finalTotal > 0 ? (
            <>
              <strong>
                {safeCount}x de {formatCents(regular)}
              </strong>{' '}
              · total {formatCents(finalTotal)}
              <br />
              1ª parcela em {monthLabel(firstMonth)}
              {safeCount > 1 ? `, última em ${monthLabel(lastMonth)}` : ''}
            </>
          ) : (
            'Informe o valor total e o número de parcelas para ver o resumo.'
          )}
        </div>
      </div>
    </Modal>
  )
}
