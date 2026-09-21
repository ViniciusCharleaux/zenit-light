import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { monthShort } from '@shared/date'
import type { FixedExpenseDTO } from '@shared/types'
import { ConfirmDialog, Modal } from '../components/Modal'
import { Field } from '../components/Field'
import { MoneyInput } from '../components/MoneyInput'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { formatCents, formatSigned } from '../lib/format'
import { useData } from '../lib/hooks'

interface FormState {
  id?: number
  name: string
  amountCents: number
  dueDay: number
  active: boolean
  cardId: number | null
}

const EMPTY: FormState = { name: '', amountCents: 0, dueDay: 5, active: true, cardId: null }

export function FixedExpenses() {
  const { run } = useToast()
  const expenses = useData(() => api.listFixedExpenses(), [])
  const history = useData(() => api.getHistory(), [])
  const cards = useData(() => api.listCards(), [])
  const [form, setForm] = useState<FormState | null>(null)
  const [removing, setRemoving] = useState<FixedExpenseDTO | null>(null)

  const reload = () => {
    expenses.reload()
    history.reload()
  }

  const list = expenses.data ?? []
  const activeTotal = list.filter((item) => item.active).reduce((sum, item) => sum + item.amountCents, 0)

  const save = async () => {
    if (!form) {
      return
    }
    const ok = await run(
      () =>
        api.saveFixedExpense({
          id: form.id,
          name: form.name,
          amountCents: form.amountCents,
          dueDay: form.dueDay,
          active: form.active,
          cardId: form.cardId
        }),
      form.id ? 'Gasto fixo atualizado' : 'Gasto fixo criado'
    )
    if (ok) {
      setForm(null)
      reload()
    }
  }

  const toggle = async (item: FixedExpenseDTO) => {
    const ok = await run(() =>
      api.saveFixedExpense({
        id: item.id,
        name: item.name,
        amountCents: item.amountCents,
        dueDay: item.dueDay,
        active: !item.active,
        cardId: item.cardId
      })
    )
    if (ok) {
      reload()
    }
  }

  const remove = async () => {
    if (!removing) {
      return
    }
    const ok = await run(() => api.deleteFixedExpense(removing.id), 'Gasto fixo excluído')
    if (ok) {
      setRemoving(null)
      reload()
    }
  }

  const evolution = history.data?.fixedEvolution ?? []
  const maxTotal = Math.max(1, ...evolution.map((row) => row.totalCents))
  const rows = evolution
    .map((row, index) => ({
      ...row,
      delta: index === 0 ? null : row.totalCents - evolution[index - 1].totalCents,
      previous: index === 0 ? 0 : evolution[index - 1].totalCents
    }))
    .reverse()
    .slice(0, 12)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Gastos fixos</h1>
          <p className="page-sub">
            {list.filter((item) => item.active).length} ativos · {formatCents(activeTotal)} por mês
          </p>
        </div>
        <button className="btn" onClick={() => setForm({ ...EMPTY })}>
          <Plus size={16} /> Novo gasto fixo
        </button>
      </div>

      <div className="stack">
        <div className="card card-flush">
          {list.length === 0 ? (
            <div className="empty">
              <strong>Nenhum gasto fixo cadastrado</strong>
              Cadastre aluguel, internet, assinaturas e outros custos que se repetem todo mês.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Gasto</th>
                  <th>Vencimento</th>
                  <th>Cartão</th>
                  <th className="num">Valor</th>
                  <th>Ativo</th>
                  <th style={{ width: 96 }} />
                </tr>
              </thead>
              <tbody>
                {list.map((item) => (
                  <tr key={item.id} style={{ opacity: item.active ? 1 : 0.55 }}>
                    <td className="strong">{item.name}</td>
                    <td className="muted">todo dia {item.dueDay}</td>
                    <td className="muted">{item.cardName ?? '-'}</td>
                    <td className="num">{formatCents(item.amountCents)}</td>
                    <td>
                      <button
                        className={`switch ${item.active ? 'on' : ''}`}
                        onClick={() => toggle(item)}
                        aria-label={item.active ? 'Desativar' : 'Ativar'}
                      />
                    </td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                        <button className="btn-icon" aria-label="Editar" onClick={() =>
                            setForm({
                              id: item.id,
                              name: item.name,
                              amountCents: item.amountCents,
                              dueDay: item.dueDay,
                              active: item.active,
                              cardId: item.cardId
                            })
                          }>
                          <Pencil size={16} />
                        </button>
                        <button className="btn-icon danger" aria-label="Excluir" onClick={() => setRemoving(item)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Evolução dos gastos fixos</h3>
          {rows.length === 0 ? (
            <div className="hint">Os valores de cada mês ficam guardados e aparecem aqui para comparar.</div>
          ) : (
            <div className="bars">
              {rows.map((row) => (
                <div className="bar-row" key={row.month}>
                  <span className="muted">{monthShort(row.month)}</span>
                  <div className="bar-track">
                    <span style={{ width: `${Math.round((row.totalCents / maxTotal) * 100)}%` }} />
                  </div>
                  <span className="strong num">{formatCents(row.totalCents)}</span>
                  <span className="num">
                    {row.delta === null || row.delta === 0 ? (
                      <span className="dim">-</span>
                    ) : (
                      <span className={`badge ${row.delta > 0 ? 'danger' : 'success'}`}>
                        {formatSigned(row.delta)} ({row.delta > 0 ? '+' : ''}
                        {Math.round((row.delta / row.previous) * 1000) / 10}%)
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {form ? (
        <Modal
          title={form.id ? 'Editar gasto fixo' : 'Novo gasto fixo'}
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
            <Field label="Nome" htmlFor="fx-name" full>
              <input
                id="fx-name"
                className="input"
                autoFocus
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Ex.: Internet"
              />
            </Field>
            <Field label="Valor mensal" htmlFor="fx-amount">
              <MoneyInput
                id="fx-amount"
                value={form.amountCents}
                onChange={(amountCents) => setForm({ ...form, amountCents })}
              />
            </Field>
            <Field label="Dia do vencimento" htmlFor="fx-day">
              <input
                id="fx-day"
                className="input"
                type="number"
                min={1}
                max={31}
                value={form.dueDay}
                onChange={(event) => setForm({ ...form, dueDay: Number(event.target.value) })}
              />
            </Field>
            <Field label="Cartão" htmlFor="fx-card" hint="Opcional. Indica em qual cartão esse gasto é cobrado." full>
              <select
                id="fx-card"
                className="input"
                value={form.cardId ?? ''}
                onChange={(event) => setForm({ ...form, cardId: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">Sem cartão</option>
                {(cards.data ?? []).map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Situação"
              full
              hint="Alterar o valor vale para o mês atual (se ainda não pago) e os próximos. Meses anteriores ficam congelados."
            >
              <div className="row">
                <button
                  type="button"
                  className={`switch ${form.active ? 'on' : ''}`}
                  onClick={() => setForm({ ...form, active: !form.active })}
                  aria-label="Ativo"
                />
                <span className="muted">{form.active ? 'Ativo' : 'Inativo'}</span>
              </div>
            </Field>
          </div>
        </Modal>
      ) : null}

      {removing ? (
        <ConfirmDialog
          title="Excluir gasto fixo"
          message={`Excluir "${removing.name}"? Os meses já pagos continuam no histórico com o valor da época.`}
          confirmLabel="Excluir"
          danger
          onConfirm={remove}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </div>
  )
}
