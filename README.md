# Controle de Gastos

App desktop pessoal para controlar gastos fixos mensais e compras parceladas.
Electron + React + TypeScript + SQLite (sql.js). Os dados ficam salvos localmente.

## Como rodar

Requisitos: Node.js 20.19+ ou 22.12+.

```
npm install
npm run dev
```

Outros comandos:

- `npm test` roda os testes da lógica de negócio
- `npm run typecheck` confere os tipos
- `npm run build` gera o build em `out/`
- `npm run dist` gera o instalador do seu sistema (electron-builder)

O banco fica em `controle-gastos.sqlite` dentro da pasta de dados do app. A aba Dados mostra o caminho exato e permite exportar JSON, CSV e o próprio banco.

## Regras de negócio

- **Fechamento do cartão:** compra feita depois do dia de fechamento entra na fatura do mês seguinte. O mês da 1ª parcela é calculado sozinho e pode ser ajustado no cadastro.
- **Parcelas:** valor total dividido pelo número de parcelas; os centavos de arredondamento vão para a primeira parcela. O valor da parcela pode ser editado no cadastro (sem juros automáticos) e, depois, parcela por parcela nos detalhes da compra.
- **Fatura:** depois do dia de fechamento ela aparece como "Fechada". Ao marcar como paga, as parcelas do mês são quitadas, o limite do cartão é liberado e o histórico é atualizado. Dá para desfazer.
- **Limite:** limite do cartão menos a soma de todas as parcelas ainda não pagas.
- **Gastos fixos:** cada mês guarda uma cópia (congelada) dos valores. Editar um gasto muda o mês atual (se ainda não pago) e os próximos; meses anteriores não mudam. A aba Gastos fixos mostra a evolução mês a mês.
- **Editar compra:** parcelas pagas são preservadas e as pendentes são recalculadas a partir do primeiro mês pendente.
- **Excluir compra:** as pendentes são removidas. Se já havia parcelas pagas, a compra fica no histórico como "Encerrada".
- **Antecipar:** escolhe quantas parcelas restantes antecipar (por padrão todas). Elas saem do fim do parcelamento, a última primeiro, e vão para a fatura aberta do cartão.
- **Parcelas já pagas:** no cadastro dá para informar quantas parcelas de uma compra em andamento já foram pagas.

## Estrutura

```
src/main       processo principal: banco (db.ts), regras (services.ts), IPC e janela
src/preload    ponte segura entre main e renderer
src/shared     tipos e funções de data usados pelos dois lados
src/renderer   interface React (páginas, componentes e estilos)
tests          testes da lógica de negócio
```
