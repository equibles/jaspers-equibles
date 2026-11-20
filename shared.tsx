import { useEffect, useState, type ReactElement } from 'react'
import { useBridge, usePublish, usePublishText, type PanelRef } from '@jaspers-ai/sdk'

// What both views share: the ticker field, publishing, number formats, and writing the panel's state.

/** Writes the panel's state whole, so a new ticker leaves nothing of the last one behind. */
export function useWriteState<T>(panel: PanelRef): (next: T) => void {
  const bridge = useBridge()
  return (next: T) => void bridge.setState({ id: panel.id, workspaceId: panel.workspaceId }, [], stripUndefined(next))
}

function stripUndefined<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

export function TickerField({ symbol, onSymbol }: { symbol: string; onSymbol: (symbol: string) => void }): ReactElement {
  const [draft, setDraft] = useState(symbol)
  useEffect(() => setDraft(symbol), [symbol])
  const commit = () => {
    const next = draft.trim().toUpperCase()
    if (next && next !== symbol) onSymbol(next)
  }
  return (
    <input
      className="eq-ticker"
      value={draft}
      placeholder="Ticker"
      aria-label="Ticker"
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') setDraft(symbol)
      }}
    />
  )
}

/** Publishes the output, and the text when the view has one, from wherever the view has them. */
export function Publish({ panel, output, text }: { panel: PanelRef; output: Record<string, unknown>; text: string | null }): null {
  usePublish(panel, output)
  usePublishText(panel, text)
  return null
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function shares(value: number | null): string {
  return value === null ? '' : whole.format(value)
}

export function money(value: number | null): string {
  return value === null ? '' : `$${compact.format(value)}`
}

export function percent(value: number | null): string {
  return value === null ? '' : `${value.toFixed(2)}%`
}

/** The app's error, without the transport's prefix, which says nothing to the user. */
export function cleanError(error: string): string {
  return error.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '')
}
