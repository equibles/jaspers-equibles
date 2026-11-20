import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  callOutput,
  callsUrl,
  callSummary,
  chosenCall,
  clock,
  fetchTranscript,
  findMatches,
  readCalls,
  segments,
  transcriptMeta,
  transcriptText,
  transcriptUrl,
} from './calls.ts'

const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

/** The first recorded page, then nothing more: enough for what reads three turns. */
const firstPageOnly = async (url: string): Promise<unknown> =>
  new URL(url).searchParams.get('offset') === '0' ? fixture('speakers-page1.json') : { data: [], hasMore: false }

test('the requests ask for earnings calls only, and a whole call a page at a time', () => {
  assert.equal(callsUrl('aapl'), 'https://api.equibles.com/v1/stocks/AAPL/investor-events?eventType=EarningsCall&limit=40')
  assert.equal(transcriptUrl('AAPL', 2026, 3, 0), 'https://api.equibles.com/v1/stocks/AAPL/earnings-calls/2026/3/speakers?limit=200&offset=0')
})

test('calls read newest first, with the reason a call has no transcript', () => {
  const calls = readCalls(fixture('calls-aapl.json')['data'])
  assert.deepEqual(
    calls.map((call) => [call.year, call.quarter, call.hasTranscript, call.date]),
    [
      [2026, 4, false, '2026-11-02'],
      [2026, 3, true, '2026-07-30'],
      [2026, 2, true, calls[2]!.date],
    ],
  )
  assert.equal(calls[0]!.note, 'No transcript source available')
  assert.equal(calls[1]!.note, null)
})

test('with no quarter asked for, the newest call with a transcript is chosen, not the newest call', () => {
  const calls = readCalls(fixture('calls-aapl.json')['data'])
  assert.deepEqual([chosenCall(calls)?.year, chosenCall(calls)?.quarter], [2026, 3])
  assert.equal(chosenCall(calls, 2026, 4)?.hasTranscript, false)
  assert.equal(chosenCall(calls, 2019, 1), null)
  assert.equal(chosenCall([]), null)
})

test('of two records for one quarter, the one with a transcript stays', () => {
  const calls = readCalls([
    { eventType: 'EarningsCall', fiscalYear: 2026, fiscalQuarter: 3, hasTranscript: false },
    { eventType: 'EarningsCall', fiscalYear: 2026, fiscalQuarter: 3, hasTranscript: true },
    { eventType: 'Conference', fiscalYear: 2026, fiscalQuarter: 3, hasTranscript: true },
  ])
  assert.deepEqual(calls.map((call) => call.hasTranscript), [true])
})

test('a transcript longer than a page is followed to its last page, turns numbered in order', async () => {
  const asked: string[] = []
  const pages = new Map([
    ['0', fixture('speakers-page1.json')],
    ['3', fixture('speakers-page2.json')],
  ])
  const transcript = await fetchTranscript(
    async (url) => {
      asked.push(url)
      return pages.get(new URL(url).searchParams.get('offset')!)
    },
    'aapl',
    2026,
    3,
  )
  assert.equal(asked.length, 2)
  assert.deepEqual(
    transcript.rows.map((turn) => [turn.n, turn.speaker]),
    [
      [1, 'Suhasini Chandramouli'],
      [2, 'Tim Cook'],
      [3, transcript.rows[2]!.speaker],
      [4, transcript.rows[3]!.speaker],
      [5, transcript.rows[4]!.speaker],
      [6, transcript.rows[5]!.speaker],
    ],
  )
  assert.equal(transcript.rows[1]!.role, 'CEO')
  assert.equal(transcript.title, 'Apple Inc. Q3 FY2026 Earnings Call')
  assert.equal(transcript.date, '2026-07-30')
  assert.equal(transcript.turnCount, 46)
})

test("the panel's text names the call first, then each turn under the number the view shows", async () => {
  const { rows, ...meta } = await fetchTranscript(firstPageOnly, 'AAPL', 2026, 3)
  const text = transcriptText(meta, rows.slice(0, 2))
  const lines = text.split('\n')
  assert.equal(lines[0], 'AAPL Q3 FY2026 earnings call, 2026-07-30: Apple Inc. Q3 FY2026 Earnings Call (Equibles, speaker-labelled)')
  assert.equal(lines[2], '[1] Suhasini Chandramouli, Head of Investor Relations (0:02)')
  assert.match(text, /\n\n\[2\] Tim Cook, CEO \(1:44\)\nThank you, Suhasini\./)
})

test("a run still holding another call's answer is not read as this one's", async () => {
  const { rows: _rows, ...meta } = await fetchTranscript(firstPageOnly, 'AAPL', 2026, 3)
  assert.equal(transcriptMeta(meta, 'AAPL', 2026, 2), null)
  assert.equal(transcriptMeta(meta, 'msft', 2026, 3), null)
  assert.equal(transcriptMeta(meta, 'aapl', 2026, 3)?.turnCount, 46)
})

test('find matches whatever the case, and marks every place in a turn', async () => {
  const { rows } = await fetchTranscript(firstPageOnly, 'AAPL', 2026, 3)
  const matches = findMatches(rows, 'SUHASINI')
  assert.deepEqual(matches.map((match) => match.n), [1, 2])
  assert.deepEqual(findMatches(rows, '   '), [])
  assert.deepEqual(segments('Revenue, then revenue again', 'revenue'), [
    { text: 'Revenue', hit: true },
    { text: ', then ', hit: false },
    { text: 'revenue', hit: true },
    { text: ' again', hit: false },
  ])
})

test('the clock reads minutes, and hours once a call runs past one', () => {
  assert.equal(clock(104.28), '1:44')
  assert.equal(clock(3723), '1:02:03')
  assert.equal(clock(null), '')
})

test('the published output stays under 4 KB and says why a call has no transcript', async () => {
  const calls = readCalls(fixture('calls-aapl.json')['data'])
  const { rows, ...meta } = await fetchTranscript(firstPageOnly, 'AAPL', 2026, 3)
  const many = Array.from({ length: 300 }, (_, i) => ({ ...rows[1]!, n: i + 1, speaker: `Speaker ${i}` }))
  const output = callOutput({ symbol: 'AAPL', calls, chosen: chosenCall(calls), meta, turns: many, find: 'thank', error: null })
  assert.ok(new TextEncoder().encode(JSON.stringify(output)).length <= 4096)
  assert.equal(output.turns, 300)
  assert.equal(output.matches, 300)
  assert.equal(callSummary({ symbol: 'AAPL' }, output), 'AAPL Q3 FY2026 earnings call: 300 turns, "thank" in 300 turns')
  const none = callOutput({ symbol: 'AAPL', calls, chosen: chosenCall(calls, 2026, 4), meta: null, turns: [], error: null })
  assert.equal(none.note, 'No transcript source available')
})
