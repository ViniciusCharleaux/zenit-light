import { useState } from 'react'
import { Eye, FastForward, Pencil, Plus, Trash2 } from 'lucide-react'
import { monthShort } from '@shared/date'
import type { PurchaseSummary } from '@shared/types'
import { ConfirmDialog } from '../components/Modal'
import { NewPurchaseModal } from '../components/NewPurchaseModal'
import { AnticipateModal, EditPurchaseModal, PurchaseDetailModal } from '../components/PurchaseModals'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { formatCents, percent } from '../lib/format'
import { useData } from '../lib/hooks'
import type { PageId } from '../App'

type Dialog =
  | { kind: 'new' }
  | { kind: 'detail'; purchase: PurchaseSummary }
  | { kind: 'anticipate'; purchase: PurchaseSummary }
  | { kind: 'edit'; purchase: PurchaseSummary }
  | { kind: 'delete'; purchase: PurchaseSummary }

export function Purchases({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { run } = useToast()
  const cards = useData(() => api.listCards(), [])
  const purchases = useData(() => api.listPurchases(), [])
  const [dialog, setDialog] = useState<Dialog | null>(null)

  const cardList = cards.data ?? []

  const reloadAll = () => {
    cards.reload()
    purchases.reload()
  }

  const remove = async () => {
    if (dialog?.kind !== 'delete') {
      return
    }
    const ok = await run(() => api.deletePurchase(dialog.purchase.id), 'Compra excluída')
    if (ok) {
      setDialog(null)
      reloadAll()
    }
  }

  const list = purchases.data ?? []

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Compras parceladas</h1>
          <p className="page-sub">Cadastre uma compra e as parcelas caem automaticamente nos meses certos.</p>
        </div>
        <button className="btn" onClick={() => setDialog({ kind: 'new' })}>
          <Plus size={16} /> Nova compra
        </button>
      </div>

      <div className="card card-flush">
        <div className="card-head">
          <h3>Em pagamento</h3>
          <span className="muted">
            {list.length} {list.length === 1 ? 'compra' : 'compras'}
          </span>
        </div>
        {list.length === 0 ? (
          <div className="empty">
            <strong>Nenhuma compra em pagamento</strong>
            As compras parceladas ativas aparecem aqui com o andamento de cada uma.
          </div>
        ) : (
          list.map((item) => (
            <div className="purchase" key={item.id}>
              <div className="row-between">
                <div>
                  <div className="purchase-name">{item.name}</div>
                  <div className="hint">
                    {item.cardName} · comprado em {item.purchaseDate.slice(8, 10)}/{item.purchaseDate.slice(5, 7)}
                  </div>
                </div>
                <div className="row" style={{ gap: 2 }}>
                  <button
                    className="btn-icon"
                    aria-label="Ver parcelas"
                    title="Ver parcelas"
                    onClick={() => setDialog({ kind: 'detail', purchase: item })}
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    className="btn-icon"
                    aria-label="Antecipar parcelas"
                    title={item.anticipatableCount > 0 ? 'Antecipar parcelas' : 'Sem parcelas futuras para antecipar'}
                    disabled={item.anticipatableCount === 0}
                    onClick={() => setDialog({ kind: 'anticipate', purchase: item })}
                  >
                    <FastForward size={16} />
                  </button>
                  <button
                    className="btn-icon"
                    aria-label="Editar"
                    title="Editar"
                    onClick={() => setDialog({ kind: 'edit', purchase: item })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="btn-icon danger"
                    aria-label="Excluir"
                    title="Excluir"
                    onClick={() => setDialog({ kind: 'delete', purchase: item })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="progress">
                <span style={{ width: `${percent(item.paidCount, item.count)}%` }} />
              </div>
              <div className="purchase-values">
                <div>
                  <span>Andamento</span>
                  <strong>
                    {item.paidCount}/{item.count} pagas
                  </strong>
                </div>
                <div>
                  <span>Parcela</span>
                  <strong>{item.nextAmountCents !== null ? formatCents(item.nextAmountCents) : '-'}</strong>
                </div>
                <div>
                  <span>Próxima</span>
                  <strong>{item.nextMonth ? monthShort(item.nextMonth) : '-'}</strong>
                </div>
                <div>
                  <span>Última</span>
                  <strong>{item.lastMonth ? monthShort(item.lastMonth) : '-'}</strong>
                </div>
                <div>
                  <span>Restante</span>
                  <strong>{formatCents(item.remainingCents)}</strong>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {dialog?.kind === 'new' ? (
        <NewPurchaseModal
          cards={cardList}
          onClose={() => setDialog(null)}
          onCreated={reloadAll}
          onGoToCards={() => onNavigate('cards')}
        />
      ) : null}
      {dialog?.kind === 'detail' ? (
        <PurchaseDetailModal purchase={dialog.purchase} onClose={() => setDialog(null)} onChanged={reloadAll} />
      ) : null}
      {dialog?.kind === 'anticipate' ? (
        <AnticipateModal purchase={dialog.purchase} onClose={() => setDialog(null)} onChanged={reloadAll} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <EditPurchaseModal
          purchase={dialog.purchase}
          cards={cardList}
          onClose={() => setDialog(null)}
          onChanged={reloadAll}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <ConfirmDialog
          title="Excluir compra"
          message={
            dialog.purchase.paidCount > 0
              ? `Excluir "${dialog.purchase.name}"? As ${dialog.purchase.paidCount} parcelas já pagas ficam no histórico e as pendentes são removidas.`
              : `Excluir "${dialog.purchase.name}" e todas as suas parcelas?`
          }
          confirmLabel="Excluir"
          danger
          onConfirm={remove}
          onCancel={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}
