import { Database, FileJson, FileSpreadsheet, FolderOpen } from 'lucide-react'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { useData } from '../lib/hooks'

export function DataExport() {
  const { run, notify } = useToast()
  const path = useData(() => api.getDatabasePath(), [])

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
    </div>
  )
}
