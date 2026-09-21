import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { CardDTO } from '@shared/types'
import { ConfirmDialog, Modal } from '../components/Modal'
import { Field } from '../components/Field'
import { MoneyInput } from '../components/MoneyInput'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { formatCents, percent } from '../lib/format'
import { useData } from '../lib/hooks'

interface FormState {
  id?: number
  name: string
  limitCents: number
  closingDay: number
}

const STATUS = {
  open: { label: 'Fatura aberta', tone: '' },
  closed: { label: 'Fatura fechada', tone: 'warning' },
  paid: { label: 'Fatura paga', tone: 'success' }
} as const

export function Cards() {
  const { run } = useToast()
  const cards = useData(() => api.listCards(), [])
  const [form, setForm] = useState<FormState | null>(null)
  const [removing, setRemoving] = useState<CardDTO | null>(null)

  const save = async () => {
    if (!form) {
      return
    }
    const ok = await run(
      () => api.saveCard({ id: form.id, name: form.name, limitCents: form.limitCents, closingDay: form.closingDay }),
      form.id ? 'Cartão atualizado' : 'Cartão criado'
    )
    if (ok) {
      setForm(null)
      cards.reload()
    }
  }

  const remove = async () => {
    if (!removing) {
      return
    }
    const ok = await run(() => api.deleteCard(removing.id), 'Cartão excluído')
    if (ok) {
      setRemoving(null)
      cards.reload()
    }
  }

  const list = cards.data ?? []

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cartões</h1>
          <p className="page-sub">Limite e dia de fechamento definem em qual fatura cada compra entra.</p>
        </div>
        <button className="btn" onClick={() => setForm({ name: '', limitCents: 0, closingDay: 10 })}>
          <Plus size={16} /> Novo cartão
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card empty">
          <strong>Nenhum cartão cadastrado</strong>
          Cadastre um cartão para registrar compras parceladas.
        </div>
      ) : (
        <div className="grid grid-2">
          {list.map((card) => {
            const used = percent(card.usedCents, card.limitCents)
            const status = STATUS[card.currentInvoiceStatus]
            return (
              <div className="card stack" key={card.id} style={{ gap: 14 }}>
                <div className="row-between">
                  <div>
                    <div className="purchase-name">{card.name}</div>
                    <div className="hint">Fecha todo dia {card.closingDay}</div>
                  </div>
                  <div className="row" style={{ gap: 2 }}>
                    <span className={`badge ${status.tone}`} style={{ marginRight: 8 }}>
                      {status.label}
                    </span>
                    <button
                      className="btn-icon"
                      aria-label="Editar"
                      onClick={() =>
                        setForm({
                          id: card.id,
                          name: card.name,
                          limitCents: card.limitCents,
                          closingDay: card.closingDay
                        })
                      }
                    >
                      <Pencil size={16} />
                    </button>
                    <button className="btn-icon danger" aria-label="Excluir" onClick={() => setRemoving(card)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className={`progress ${used >= 85 ? 'warn' : ''}`}>
                  <span style={{ width: `${used}%` }} />
                </div>
                <div className="purchase-values">
                  <div>
                    <span>Limite</span>
                    <strong>{formatCents(card.limitCents)}</strong>
                  </div>
                  <div>
                    <span>Em uso</span>
                    <strong>{formatCents(card.usedCents)}</strong>
                  </div>
                  <div>
                    <span>Disponível</span>
                    <strong>{formatCents(card.availableCents)}</strong>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {form ? (
        <Modal
          title={form.id ? 'Editar cartão' : 'Novo cartão'}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button className="btn" onClick={save}>
                Salvar
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Nome do cartão" htmlFor="cd-name" full>
              <input
                id="cd-name"
                className="input"
                autoFocus
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Ex.: Nubank"
              />
            </Field>
            <Field label="Limite" htmlFor="cd-limit">
              <MoneyInput
                id="cd-limit"
                value={form.limitCents}
                onChange={(limitCents) => setForm({ ...form, limitCents })}
              />
            </Field>
            <Field label="Dia do fechamento" htmlFor="cd-day" hint="Compras depois desse dia vão para a fatura do mês seguinte.">
              <input
                id="cd-day"
                className="input"
                type="number"
                min={1}
                max={31}
                value={form.closingDay}
                onChange={(event) => setForm({ ...form, closingDay: Number(event.target.value) })}
              />
            </Field>
          </div>
        </Modal>
      ) : null}

      {removing ? (
        <ConfirmDialog
          title="Excluir cartão"
          message={`Excluir o cartão "${removing.name}"? Só é possível se ele não tiver compras.`}
          confirmLabel="Excluir"
          danger
          onConfirm={remove}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </div>
  )
}
