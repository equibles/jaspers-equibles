// Equibles' REST API, which the views read: rows with explicit periods, where the MCP connection
// answers the assistant in prose. The key is the plugin's secret, filled in by the app as a request
// goes out, so the plugin's own code never holds it.

export const API_HOST = 'api.equibles.com'
const API = `https://${API_HOST}/v1`
// Single quotes: the app substitutes the placeholder, JavaScript must not.
const AUTH = { Authorization: 'Bearer ${secret:apikey}' }

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export function normalSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

/** A ticker as a path segment: AAPL, or MIC:TICKER for a company listed on another exchange (XLIS:NOS). */
export function tickerPath(symbol: string): string {
  return encodeURIComponent(normalSymbol(symbol))
}

export function apiUrl(route: string, query: Record<string, string | number | undefined> = {}): string {
  const url = new URL(`${API}${route}`)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  }
  return url.toString()
}

/** One GET, answered as JSON, or thrown as the API's own message, which says what to do next. */
export async function getJson(fetch: Fetch, url: string): Promise<unknown> {
  const response = await fetch(url, { headers: AUTH })
  const body: unknown = await response.json().catch(() => null)
  if (response.ok) return body
  throw new Error(errorMessage(response.status, body))
}

export function errorMessage(status: number, body: unknown): string {
  const error = isRecord(body) && isRecord(body['error']) ? body['error'] : null
  const said = error ? str(error['message']) : null
  if (status === 401) return `Equibles refused the API key. ${said ?? ''} Set it again in Settings > Plugins > equibles.`.replace(/\s+/g, ' ').trim()
  return said ?? `Equibles answered HTTP ${status}.`
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

/** Trims an output until its JSON fits what a publish may carry, dropping the tail of its longest list first. */
export function fitOutput<T extends Record<string, unknown>>(output: T, lists: (keyof T)[], limit = 4096): T {
  const fitted: T = { ...output }
  const size = () => new TextEncoder().encode(JSON.stringify(fitted)).length
  while (size() > limit) {
    const longest = lists
      .filter((key) => Array.isArray(fitted[key]) && (fitted[key] as unknown[]).length > 0)
      .sort((a, b) => (fitted[b] as unknown[]).length - (fitted[a] as unknown[]).length)[0]
    if (longest === undefined) break
    fitted[longest] = (fitted[longest] as unknown[]).slice(0, -1) as T[keyof T]
  }
  return fitted
}
