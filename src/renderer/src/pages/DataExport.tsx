import { useState } from 'react'
import { Database, FileJson, FileSpreadsheet, FolderOpen, Upload } from 'lucide-react'
import { ConfirmDialog } from '../components/Modal'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { useData } from '../lib/hooks'

export function DataExport() {
  const { run, notify } = useToast()
  const path = useData(() => api.getDatabasePath(), [])
  const [confirmingImport, setConfirmingImport] = useState(false)

  const importData = async () => {
    setConfirmingImport(false)
    try {
      const result = await api.importData()
      if (result.canceled || !result.counts) {
        return
      }
      const { cards, purchases, installments, fixedExpenses } = result.counts
      notify(
        `Importado: ${cards} cartões, ${purchases} compras, ${installments} parcelas e ${fixedExpenses} gastos fixos. Uma cópia dos dados anteriores foi salva na pasta backups.`
      )
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível importar', 'error')
    }
  }

  const exportWith = async (action: () => Promise<{ canceled: boolean; path?: string }>) => {
    try {
      const result = await action()
      if (!result.canceled) {
        notify(`Arquivo salvo em ${result.path}`)
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível exportar', 'error')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dados</h1>
          <p className="page-sub">Tudo fica salvo neste computador. Exporte quando quiser uma cópia.</p>
        </div>
      </div>

      <div className="stack">
        <div className="grid grid-3">
          <div className="card stack">
            <span className="icon-bubble">
              <FileJson size={16} />
            </span>
            <div>
              <div className="purchase-name">JSON completo</div>
              <div className="hint">Cartões, compras, parcelas, gastos fixos e faturas em um único arquivo.</div>
            </div>
            <button className="btn btn-ghost" onClick={() => exportWith(() => api.exportJson())}>
              Exportar JSON
            </button>
          </div>
          <div className="card stack">
            <span className="icon-bubble">
              <FileSpreadsheet size={16} />
            </span>
            <div>
              <div className="purchase-name">Planilha CSV</div>
              <div className="hint">Todas as parcelas e gastos fixos, prontos para abrir no Excel.</div>
            </div>
            <button className="btn btn-ghost" onClick={() => exportWith(() => api.exportCsv())}>
              Exportar CSV
            </button>
          </div>
          <div className="card stack">
            <span className="icon-bubble">
              <Database size={16} />
            </span>
            <div>
              <div className="purchase-name">Banco SQLite</div>
              <div className="hint">Cópia do arquivo do banco, útil como backup.</div>
            </div>
            <button className="btn btn-ghost" onClick={() => exportWith(() => api.exportDatabase())}>
              Exportar banco
            </button>
          </div>
        </div>

        <div className="card row-between wrap">
          <div>
            <div className="strong">Importar dados</div>
            <div className="hint">
              Restaura a partir de um JSON ou banco SQLite exportado por este app. Substitui todos os dados atuais.
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => setConfirmingImport(true)}>
            <Upload size={16} /> Importar
          </button>
        </div>

        <div className="card row-between wrap">
          <div>
            <div className="strong">Local do banco de dados</div>
            <div className="hint" style={{ wordBreak: 'break-all' }}>
              {path.data ?? '...'}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => run(() => api.revealDatabase())}>
            <FolderOpen size={14} /> Mostrar na pasta
          </button>
        </div>
      </div>

      {confirmingImport ? (
        <ConfirmDialog
          title="Importar dados"
          message="Importar vai substituir todos os cartões, compras, parcelas e gastos fixos atuais pelos do arquivo. Antes de substituir, o app guarda uma cópia dos dados atuais na pasta backups. Deseja continuar?"
          confirmLabel="Escolher arquivo"
          danger
          onConfirm={importData}
          onCancel={() => setConfirmingImport(false)}
        />
      ) : null}
    </div>
  )
}
