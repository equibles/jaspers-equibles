import { apiUrl, fitOutput, isRecord, list, normalSymbol, num, str, tickerPath } from './api.ts'

// The pure half of the call view: a company's earnings calls, the chosen call's transcript in
// speaker turns, find, and what the view tells the assistant.

/** Speaker turns per request: the API's cap, so most calls take one request of a free key's daily 100. */
const PAGE = 200
/** Pages followed at most, so a runaway answer cannot spend a day's requests. */
const MAX_PAGES = 5

export interface Call {
  year: number
  quarter: number
  title: string | null
  date: string | null
  hasTranscript: boolean
  /** Why there is no transcript, in the API's words, for a call without one. */
  note: string | null
}

export interface Turn {
  n: number
  speaker: string
  role: string | null
  start: number | null
  text: string
}

export interface TranscriptMeta {
  symbol: string
  year: number
  quarter: number
  title: string | null
  date: string | null
  turnCount: number
}

export function callsUrl(symbol: string): string {
  return apiUrl(`/stocks/${tickerPath(symbol)}/investor-events`, { eventType: 'EarningsCall', limit: 40 })
}

export function transcriptUrl(symbol: string, year: number, quarter: number, offset: number): string {
  return apiUrl(`/stocks/${tickerPath(symbol)}/earnings-calls/${year}/${quarter}/speakers`, { limit: PAGE, offset })
}

function day(value: unknown): string | null {
  const text = str(value)
  return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null
}

/** Earnings calls, newest first; of two records for one quarter, the one with a transcript. */
export function readCalls(rows: unknown): Call[] {
  const calls = list(rows)
    .filter((row) => row['eventType'] === undefined || row['eventType'] === 'EarningsCall')
    .flatMap((row): Call[] => {
      const year = num(row['fiscalYear'] ?? row['year'])
      const quarter = num(row['fiscalQuarter'] ?? row['quarter'])
      if (year === null || quarter === null) return []
      const materials = isRecord(row['materials']) ? row['materials'] : {}
      const transcript = isRecord(materials['transcript']) ? materials['transcript'] : {}
      const hasTranscript = row['hasTranscript'] === true
      return [
        {
          year,
          quarter,
          title: str(row['title']),
          date: day(row['callDate'] ?? row['date']),
          hasTranscript,
          note: hasTranscript ? null : (str(transcript['reason']) ?? str(row['note'])),
        },
      ]
    })
    .sort((a, b) => b.year - a.year || b.quarter - a.quarter || Number(b.hasTranscript) - Number(a.hasTranscript))
  return calls.filter((call, index) => index === 0 || calls[index - 1]!.year !== call.year || calls[index - 1]!.quarter !== call.quarter)
}

/** The call asked for, else the newest with a transcript: a company's newest call often has none yet. */
export function chosenCall(calls: Call[], year?: number | null, quarter?: number | null): Call | null {
  if (year != null && quarter != null) return calls.find((call) => call.year === year && call.quarter === quarter) ?? null
  return calls.find((call) => call.hasTranscript) ?? calls[0] ?? null
}

export function readTurns(rows: unknown, from = 1): Turn[] {
  return list(rows).map((row, index) => ({
    n: num(row['n']) ?? from + index,
    speaker: str(row['speakerName'] ?? row['speaker']) ?? 'Unidentified speaker',
    role: str(row['speakerRole'] ?? row['role']),
    start: num(row['startSeconds'] ?? row['start']),
    text: str(row['text']) ?? '',
  }))
}

/** Every turn of one call, page by page, as the source returns it: turns under `rows`, the call beside them. */
export async function fetchTranscript(
  get: (url: string) => Promise<unknown>,
  symbol: string,
  year: number,
  quarter: number,
): Promise<TranscriptMeta & { rows: Turn[] }> {
  const rows: Turn[] = []
  let first: Record<string, unknown> = {}
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await get(transcriptUrl(symbol, year, quarter, rows.length))
    const record = isRecord(body) ? body : {}
    if (page === 0) first = record
    const turns = readTurns(record['data'], rows.length + 1)
    rows.push(...turns)
    if (record['hasMore'] !== true || turns.length === 0) break
  }
  return {
    symbol: normalSymbol(symbol),
    year,
    quarter,
    title: str(first['eventTitle']),
    date: day(first['callDate']),
    turnCount: num(first['totalTurnCount']) ?? rows.length,
    rows,
  }
}

/** A run's meta read back in the view, or null while the run still holds another call's answer. */
export function transcriptMeta(meta: Record<string, unknown>, symbol: string, year: number, quarter: number): TranscriptMeta | null {
  if (str(meta['symbol']) !== normalSymbol(symbol) || meta['year'] !== year || meta['quarter'] !== quarter) return null
  return { symbol: normalSymbol(symbol), year, quarter, title: str(meta['title']), date: str(meta['date']), turnCount: num(meta['turnCount']) ?? 0 }
}

export function clock(seconds: number | null): string {
  if (seconds === null || seconds < 0) return ''
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function callLabel(call: { year: number; quarter: number }): string {
  return `Q${call.quarter} FY${call.year}`
}

/**
 * The transcript as the panel's text, for the assistant to read a part at a time and quote. Its first
 * line names the call, since a citation of the text takes that line as its title.
 */
export function transcriptText(meta: TranscriptMeta, turns: Turn[]): string {
  const head = `${meta.symbol} ${callLabel(meta)} earnings call${meta.date ? `, ${meta.date}` : ''}: ${meta.title ?? 'transcript'} (Equibles, speaker-labelled)`
  const body = turns.map((turn) => {
    const who = turn.role ? `${turn.speaker}, ${turn.role}` : turn.speaker
    const at = clock(turn.start)
    return `[${turn.n}] ${who}${at ? ` (${at})` : ''}\n${turn.text}`
  })
  return [head, ...body].join('\n\n')
}

export interface Match {
  n: number
  speaker: string
  snippet: string
}

/** Every turn the phrase appears in, whatever the case, with a snippet around its first place there. */
export function findMatches(turns: Turn[], find: string | undefined): Match[] {
  const needle = (find ?? '').trim().toLowerCase()
  if (needle.length === 0) return []
  return turns.flatMap((turn) => {
    const at = turn.text.toLowerCase().indexOf(needle)
    return at < 0 ? [] : [{ n: turn.n, speaker: turn.speaker, snippet: snippet(turn.text, at, needle.length) }]
  })
}

export function snippet(text: string, at: number, length: number, around = 80): string {
  const start = Math.max(0, at - around)
  const end = Math.min(text.length, at + length + around)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/** Splits text where the phrase appears, for the view to mark it. */
export function segments(text: string, find: string | undefined): { text: string; hit: boolean }[] {
  const needle = (find ?? '').trim().toLowerCase()
  if (needle.length === 0) return [{ text, hit: false }]
  const out: { text: string; hit: boolean }[] = []
  const lower = text.toLowerCase()
  let from = 0
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + needle.length)) {
    if (at > from) out.push({ text: text.slice(from, at), hit: false })
    out.push({ text: text.slice(at, at + needle.length), hit: true })
    from = at + needle.length
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false })
  return out
}

export interface CallOutput extends Record<string, unknown> {
  symbol: string | null
  year: number | null
  quarter: number | null
  date: string | null
  title: string | null
  calls: { year: number; quarter: number; date: string | null; hasTranscript: boolean }[]
  turns: number
  speakers: { name: string; role: string | null }[]
  find: string | null
  matches: number
  snippets: Match[]
  note: string | null
  error: string | null
}

/** What the view publishes: the call, the calls around it, who spoke, and find, under a publish's 4 KB. */
export function callOutput(args: {
  symbol: string | null
  calls: Call[]
  chosen: Call | null
  meta: TranscriptMeta | null
  turns: Turn[]
  find?: string | undefined
  error: string | null
}): CallOutput {
  const speakers = new Map<string, string | null>()
  for (const turn of args.turns) if (!speakers.has(turn.speaker)) speakers.set(turn.speaker, turn.role)
  const matches = findMatches(args.turns, args.find)
  const find = (args.find ?? '').trim()
  return fitOutput<CallOutput>(
    {
      symbol: args.symbol,
      year: args.chosen?.year ?? null,
      quarter: args.chosen?.quarter ?? null,
      date: args.meta?.date ?? args.chosen?.date ?? null,
      title: args.meta?.title ?? args.chosen?.title ?? null,
      calls: args.calls.slice(0, 8).map((call) => ({ year: call.year, quarter: call.quarter, date: call.date, hasTranscript: call.hasTranscript })),
      turns: args.turns.length,
      speakers: [...speakers].slice(0, 16).map(([name, role]) => ({ name, role })),
      find: find || null,
      matches: matches.length,
      snippets: matches.slice(0, 5),
      note: args.chosen && !args.chosen.hasTranscript ? (args.chosen.note ?? 'No transcript for this call yet.') : null,
      error: args.error,
    },
    ['snippets', 'speakers', 'calls'],
  )
}

export function callSummary(state: { symbol?: string | undefined }, output: Partial<CallOutput>): string {
  const symbol = output.symbol ?? state.symbol
  if (!symbol) return 'Earnings call: no ticker yet'
  if (output.error) return `Earnings call for ${symbol}: ${output.error}`
  if (output.year == null || output.quarter == null) return `Earnings call for ${symbol}: loading`
  const found = output.find ? `, "${output.find}" in ${output.matches ?? 0} turns` : ''
  return `${symbol} Q${output.quarter} FY${output.year} earnings call: ${output.turns ?? 0} turns${found}`
}
