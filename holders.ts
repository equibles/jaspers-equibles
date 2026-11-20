import { apiUrl, fitOutput, isRecord, list, normalSymbol, num, str, tickerPath } from './api.ts'

// The pure half of the holders view: the request, the rows, and what the view tells the assistant.

export const DEFAULT_LIMIT = 25
export const MAX_LIMIT = 200

export interface HoldersArgs {
  symbol: string
  limit: number
  reportDate?: string | undefined
}

export interface Holder {
  rank: number
  name: string
  cik: string | null
  shares: number | null
  value: number | null
  percentOfTotal: number | null
  positionType: string | null
  holderType: string | null
  style: string | null
}

export interface ConfidentialFiler {
  name: string
  lastDisclosedShares: number | null
  lastDisclosedReportDate: string | null
}

/** The quarter's totals beside the rows: the run's meta. */
export interface HoldersMeta {
  symbol: string
  reportDate: string | null
  totalInstitutions: number | null
  totalShares: number | null
  totalValue: number | null
  hasMore: boolean
  confidentialFilers: ConfidentialFiler[]
}

export function holdersUrl(args: HoldersArgs): string {
  return apiUrl(`/stocks/${tickerPath(args.symbol)}/institutional-holders`, {
    limit: Math.min(Math.max(1, Math.trunc(args.limit)), MAX_LIMIT),
    reportDate: args.reportDate,
  })
}

/** Rows as the API sends them, or as a run hands them back to the view; the API's carry no rank. */
export function readHolderRows(rows: unknown): Holder[] {
  return list(rows).map((row, index) => ({
    rank: num(row['rank']) ?? index + 1,
    name: str(row['name']) ?? 'Unnamed filer',
    cik: str(row['cik']),
    shares: num(row['shares']),
    value: num(row['value']),
    percentOfTotal: num(row['percentOfTotal']),
    positionType: str(row['positionType']),
    holderType: str(row['holderType']),
    style: str(row['style']),
  }))
}

function readMeta(symbol: string, meta: Record<string, unknown>): HoldersMeta {
  return {
    symbol: normalSymbol(symbol),
    reportDate: str(meta['reportDate']),
    totalInstitutions: num(meta['totalInstitutions']),
    totalShares: num(meta['totalShares']),
    totalValue: num(meta['totalValue']),
    hasMore: meta['hasMore'] === true,
    confidentialFilers: list(meta['confidentialFilers']).map((filer) => ({
      name: str(filer['name']) ?? 'Unnamed filer',
      lastDisclosedShares: num(filer['lastDisclosedShares']),
      lastDisclosedReportDate: str(filer['lastDisclosedReportDate']),
    })),
  }
}

/** The API's answer as the source returns it: the holders under `rows`, the totals beside them as meta. */
export function readHolders(symbol: string, body: unknown): HoldersMeta & { rows: Holder[] } {
  const record = isRecord(body) ? body : {}
  return { ...readMeta(symbol, isRecord(record['meta']) ? record['meta'] : {}), rows: readHolderRows(record['data']) }
}

/** A run's meta read back in the view. A run still holding the last ticker's answer is not this one's. */
export function holdersMeta(meta: Record<string, unknown>, symbol: string): HoldersMeta | null {
  return str(meta['symbol']) === normalSymbol(symbol) ? readMeta(symbol, meta) : null
}

export interface HoldersOutput extends Record<string, unknown> {
  symbol: string | null
  reportDate: string | null
  totalInstitutions: number | null
  totalShares: number | null
  shown: number
  hasMore: boolean
  top: { rank: number; name: string; shares: number | null; percentOfTotal: number | null; holderType: string | null }[]
  error: string | null
}

/** What the view publishes: the quarter, its totals, and the top of the table, under a publish's 4 KB. */
export function holdersOutput(symbol: string | null, meta: HoldersMeta | null, rows: Holder[], error: string | null): HoldersOutput {
  return fitOutput<HoldersOutput>(
    {
      symbol,
      reportDate: meta?.reportDate ?? null,
      totalInstitutions: meta?.totalInstitutions ?? null,
      totalShares: meta?.totalShares ?? null,
      shown: rows.length,
      hasMore: meta?.hasMore ?? false,
      top: rows.slice(0, 15).map((row) => ({
        rank: row.rank,
        name: row.name,
        shares: row.shares,
        percentOfTotal: row.percentOfTotal === null ? null : Math.round(row.percentOfTotal * 100) / 100,
        holderType: row.holderType,
      })),
      error,
    },
    ['top'],
  )
}

export function holdersSummary(state: { symbol?: string | undefined }, output: Partial<HoldersOutput>): string {
  const symbol = output.symbol ?? state.symbol
  if (!symbol) return 'Institutional holders: no ticker yet'
  if (output.error) return `Institutional holders of ${symbol}: ${output.error}`
  const of = output.totalInstitutions ? ` of ${output.totalInstitutions.toLocaleString('en-US')}` : ''
  return `Institutional holders of ${symbol}: ${output.shown ?? 0}${of} filers, quarter ending ${output.reportDate ?? 'unknown'}`
}
