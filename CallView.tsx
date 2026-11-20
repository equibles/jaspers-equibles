import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useData, type PanelRef } from '@jaspers-ai/sdk'
import { isRecord, num, str } from './api'
import {
  callLabel,
  callOutput,
  chosenCall,
  clock,
  findMatches,
  readCalls,
  readTurns,
  segments,
  transcriptMeta,
  transcriptText,
  type Call,
} from './calls'
import { cleanError, Publish, TickerField, useWriteState } from './shared'
import './styles.css'

// One company's earnings call: its calls to pick from, then the transcript in numbered speaker turns,
// with find. The transcript waits for the list of calls, which names the newest call with a
// transcript when no quarter is asked for, so its arguments are the same however the call was opened.

interface CallState {
  symbol?: string
  year?: number | null
  quarter?: number | null
  find?: string
}

function readState(raw: unknown): CallState {
  const state = isRecord(raw) ? raw : {}
  const year = num(state['year'])
  const quarter = num(state['quarter'])
  return {
    symbol: str(state['symbol']) ?? undefined,
    // A quarter only with its year.
    year: year !== null && quarter !== null ? year : null,
    quarter: year !== null && quarter !== null ? quarter : null,
    find: str(state['find']) ?? undefined,
  }
}

export function CallView({ panel }: { panel: PanelRef }): ReactElement {
  const raw = useData(`workspaces/${panel.workspaceId}/panels/${panel.id}/state`)
  const write = useWriteState<CallState>(panel)
  if (raw === undefined) return <div className="eq-root"><p className="eq-note">Loading…</p></div>
  const state = readState(raw)
  if (!state.symbol) {
    return (
      <div className="eq-root">
        <Publish panel={panel} output={callOutput({ symbol: null, calls: [], chosen: null, meta: null, turns: [], error: null })} text={null} />
        <div className="eq-bar">
          <TickerField symbol="" onSymbol={(symbol) => write({ symbol })} />
        </div>
        <p className="eq-note">Type a ticker, or ask for a company's call.</p>
      </div>
    )
  }
  return <CallPage panel={panel} state={{ ...state, symbol: state.symbol }} write={write} />
}

function CallPage({ panel, state, write }: { panel: PanelRef; state: CallState & { symbol: string }; write: (next: CallState) => void }): ReactElement {
  const run = useData('equibles/calls', { symbol: state.symbol })
  // Until the new company's calls are in, the run still holds the last company's.
  const fresh = run.data !== undefined && str(run.meta['symbol']) === state.symbol.trim().toUpperCase()
  const calls = fresh ? readCalls(run.data) : []
  const chosen = fresh ? chosenCall(calls, state.year, state.quarter) : null
  const error = run.error ? cleanError(run.error) : null
  const bar = (
    <div className="eq-bar">
      <TickerField symbol={state.symbol} onSymbol={(symbol) => write({ symbol, find: state.find })} />
      {chosen && (
        <select
          className="eq-select"
          aria-label="Call"
          value={`${chosen.year}-${chosen.quarter}`}
          onChange={(event) => {
            const [year, quarter] = event.target.value.split('-').map(Number)
            write({ ...state, year, quarter })
          }}
        >
          {calls.map((call) => (
            <option key={`${call.year}-${call.quarter}`} value={`${call.year}-${call.quarter}`}>
              {callLabel(call)}
              {call.date ? ` · ${call.date}` : ''}
              {call.hasTranscript ? '' : ' · no transcript'}
            </option>
          ))}
        </select>
      )}
      <FindField find={state.find ?? ''} onFind={(find) => write({ ...state, find: find || undefined })} />
      {run.loading && <span className="eq-muted">loading…</span>}
    </div>
  )
  const publishEmpty = (message: string | null) => (
    <Publish panel={panel} output={callOutput({ symbol: state.symbol, calls, chosen, meta: null, turns: [], find: state.find, error: message })} text={null} />
  )
  if (error) return <div className="eq-root">{publishEmpty(error)}{bar}<p className="eq-error">{error}</p></div>
  if (!fresh) return <div className="eq-root">{bar}<p className="eq-note">Loading calls…</p></div>
  if (!chosen) {
    const message = state.year ? `No ${callLabel({ year: state.year, quarter: state.quarter ?? 0 })} call on file for ${state.symbol}.` : `No earnings calls on file for ${state.symbol}.`
    return <div className="eq-root">{publishEmpty(message)}{bar}<p className="eq-note">{message}</p></div>
  }
  if (!chosen.hasTranscript) {
    return (
      <div className="eq-root">
        {publishEmpty(null)}
        {bar}
        <p className="eq-note">
          {callLabel(chosen)}: {chosen.note ?? 'No transcript for this call yet.'}
        </p>
      </div>
    )
  }
  return <Transcript panel={panel} state={state} calls={calls} chosen={chosen} bar={bar} />
}

function Transcript({
  panel,
  state,
  calls,
  chosen,
  bar,
}: {
  panel: PanelRef
  state: CallState & { symbol: string }
  calls: Call[]
  chosen: Call
  bar: ReactElement
}): ReactElement {
  const run = useData('equibles/transcript', { symbol: state.symbol, year: chosen.year, quarter: chosen.quarter })
  const meta = run.data ? transcriptMeta(run.meta, state.symbol, chosen.year, chosen.quarter) : null
  const turns = meta ? readTurns(run.data) : []
  const error = run.error ? cleanError(run.error) : null
  const matches = findMatches(turns, state.find)
  const first = matches[0]?.n ?? null
  const body = useRef<HTMLDivElement>(null)
  // Scrolls to the first turn find names, once per new phrase.
  useEffect(() => {
    if (first === null) return
    body.current?.querySelector(`[data-turn="${first}"]`)?.scrollIntoView({ block: 'start' })
  }, [first, state.find])
  const output = callOutput({ symbol: state.symbol, calls, chosen, meta, turns, find: state.find, error })
  return (
    <div className="eq-root">
      <Publish panel={panel} output={output} text={meta && turns.length > 0 ? transcriptText(meta, turns) : null} />
      {bar}
      {error ? (
        <p className="eq-error">{error}</p>
      ) : !meta ? (
        <p className="eq-note">Loading the transcript…</p>
      ) : turns.length === 0 ? (
        <p className="eq-note">{callLabel(chosen)}: the transcript has no turns yet.</p>
      ) : (
        <div className="eq-body" ref={body}>
          <p className="eq-muted eq-head">
            {meta.title ?? `${state.symbol} ${callLabel(chosen)}`}
            {meta.date ? ` · ${meta.date}` : ''} · {turns.length} turns
            {state.find ? ` · "${state.find}" in ${matches.length}` : ''}
          </p>
          {turns.map((turn) => (
            <section key={turn.n} className="eq-turn" data-turn={turn.n}>
              <div className="eq-speaker">
                <span className="eq-n">{turn.n}</span>
                <strong>{turn.speaker}</strong>
                {turn.role ? <span className="eq-muted"> · {turn.role}</span> : null}
                {turn.start !== null ? <span className="eq-muted eq-time">{clock(turn.start)}</span> : null}
              </div>
              <p className="eq-text">
                {segments(turn.text, state.find).map((part, index) => (part.hit ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}
              </p>
            </section>
          ))}
          <p className="eq-source">Transcript via Equibles</p>
        </div>
      )}
    </div>
  )
}

function FindField({ find, onFind }: { find: string; onFind: (find: string) => void }): ReactElement {
  const [draft, setDraft] = useState(find)
  useEffect(() => setDraft(find), [find])
  return (
    <input
      className="eq-find"
      value={draft}
      placeholder="Find"
      aria-label="Find in transcript"
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onFind(draft.trim())
        if (event.key === 'Escape') {
          setDraft('')
          onFind('')
        }
      }}
    />
  )
}
