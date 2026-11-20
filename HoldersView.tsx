import type { ReactElement } from 'react'
import { useData, type PanelRef } from '@jaspers-ai/sdk'
import { isRecord, num, str } from './api'
import { DEFAULT_LIMIT, holdersMeta, holdersOutput, MAX_LIMIT, readHolderRows } from './holders'
import { cleanError, money, percent, Publish, shares, TickerField, useWriteState } from './shared'
import './styles.css'

// A stock's 13F holders as a table, with the quarter's totals above it and filers that asked the SEC
// to keep a position confidential below it. "More" lists 25 more, up to 200.

interface HoldersState {
  symbol?: string
  limit?: number
  reportDate?: string | null
}

function readState(raw: unknown): HoldersState {
  const state = isRecord(raw) ? raw : {}
  return { symbol: str(state['symbol']) ?? undefined, limit: num(state['limit']) ?? undefined, reportDate: str(state['reportDate']) }
}

export function HoldersView({ panel }: { panel: PanelRef }): ReactElement {
  const raw = useData(`workspaces/${panel.workspaceId}/panels/${panel.id}/state`)
  const write = useWriteState<HoldersState>(panel)
  if (raw === undefined) return <div className="eq-root"><p className="eq-note">Loading…</p></div>
  const state = readState(raw)
  const bar = <TickerField symbol={state.symbol ?? ''} onSymbol={(symbol) => write({ symbol })} />
  if (!state.symbol) {
    return (
      <div className="eq-root">
        <Publish panel={panel} output={holdersOutput(null, null, [], null)} text={null} />
        <div className="eq-bar">{bar}</div>
        <p className="eq-note">Type a ticker, or ask for one.</p>
      </div>
    )
  }
  return <Table panel={panel} state={{ ...state, symbol: state.symbol }} bar={bar} write={write} />
}

function Table({
  panel,
  state,
  bar,
  write,
}: {
  panel: PanelRef
  state: HoldersState & { symbol: string }
  bar: ReactElement
  write: (next: HoldersState) => void
}): ReactElement {
  const limit = Math.min(state.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
  const args = state.reportDate ? { symbol: state.symbol, limit, reportDate: state.reportDate } : { symbol: state.symbol, limit }
  const run = useData('equibles/holders', args)
  const meta = run.data ? holdersMeta(run.meta, state.symbol) : null
  const rows = meta ? readHolderRows(run.data) : []
  const error = run.error ? cleanError(run.error) : null
  return (
    <div className="eq-root">
      <Publish panel={panel} output={holdersOutput(state.symbol, meta, rows, error)} text={null} />
      <div className="eq-bar">
        {bar}
        {meta && (
          <span className="eq-muted eq-grow eq-ellipsis">
            Quarter ending {meta.reportDate ?? 'unknown'} · {meta.totalInstitutions?.toLocaleString('en-US') ?? '?'} institutions ·{' '}
            {shares(meta.totalShares)} shares · {money(meta.totalValue)}
          </span>
        )}
        {run.loading && <span className="eq-muted">loading…</span>}
      </div>
      {error ? (
        <p className="eq-error">{error}</p>
      ) : !meta ? (
        <p className="eq-note">Loading holders…</p>
      ) : rows.length === 0 ? (
        <p className="eq-note">No 13F holders on file for {state.symbol}.</p>
      ) : (
        <div className="eq-body">
          <table className="eq-table">
            <thead>
              <tr>
                <th className="eq-num">#</th>
                <th>Institution</th>
                <th>Type</th>
                <th>Style</th>
                <th className="eq-num">Shares</th>
                <th className="eq-num">Value</th>
                <th className="eq-num">% of inst.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.rank}-${row.cik ?? row.name}-${row.positionType ?? ''}`}>
                  <td className="eq-num eq-muted">{row.rank}</td>
                  <td>
                    {row.name}
                    {row.positionType && row.positionType !== 'Common' ? <span className="eq-tag">{row.positionType}</span> : null}
                  </td>
                  <td className="eq-muted">{row.holderType ?? ''}</td>
                  <td className="eq-muted">{row.style ?? ''}</td>
                  <td className="eq-num">{shares(row.shares)}</td>
                  <td className="eq-num">{money(row.value)}</td>
                  <td className="eq-num">{percent(row.percentOfTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {meta.hasMore && limit < MAX_LIMIT && (
            <button type="button" className="eq-button eq-more" onClick={() => write({ ...state, limit: Math.min(limit + 25, MAX_LIMIT) })}>
              More
            </button>
          )}
          {meta.confidentialFilers.length > 0 && (
            <p className="eq-note">
              Filed confidentially this quarter, so not in the table:{' '}
              {meta.confidentialFilers
                .map((filer) => `${filer.name} (last disclosed ${shares(filer.lastDisclosedShares)} shares, quarter ending ${filer.lastDisclosedReportDate ?? 'unknown'})`)
                .join('; ')}
            </p>
          )}
          <p className="eq-source">13F filings via Equibles</p>
        </div>
      )}
    </div>
  )
}
