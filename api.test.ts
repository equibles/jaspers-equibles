import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { apiUrl, errorMessage, fitOutput, getJson, tickerPath } from './api.ts'

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

test('a ticker on another exchange keeps its MIC in one path segment', () => {
  assert.equal(tickerPath(' xlis:nos '), 'XLIS%3ANOS')
  assert.equal(apiUrl('/stocks/AAPL/investor-events', { eventType: 'EarningsCall', limit: 40, offset: undefined }), 'https://api.equibles.com/v1/stocks/AAPL/investor-events?eventType=EarningsCall&limit=40')
})

test('the request carries the key as a placeholder the app fills in, never a key', async () => {
  let sent: Headers | null = null
  const fetch = async (_url: string, init?: RequestInit) => {
    sent = new Headers(init?.headers)
    return new Response(JSON.stringify(fixture('holders-aapl.json')), { status: 200 })
  }
  await getJson(fetch, 'https://api.equibles.com/v1/stocks/AAPL/institutional-holders?limit=3')
  assert.equal(sent!.get('authorization'), 'Bearer ${secret:apikey}')
})

test('a refused key says where to set it again', async () => {
  const fetch = async () => new Response(JSON.stringify(fixture('error-401.json')), { status: 401 })
  await assert.rejects(getJson(fetch, 'https://api.equibles.com/v1/stocks/AAPL/institutional-holders'), (error: Error) => {
    assert.match(error.message, /^Equibles refused the API key\. Invalid API key format/)
    assert.match(error.message, /Set it again in Settings > Plugins > equibles\.$/)
    return true
  })
})

test("any other failure is the API's own words", () => {
  assert.equal(errorMessage(404, fixture('error-404.json')), "Stock 'ZZZZZQ' not found.")
  assert.equal(errorMessage(502, null), 'Equibles answered HTTP 502.')
})

test('an output too large to publish loses the tail of its longest list', () => {
  const output = { symbol: 'AAPL', top: Array.from({ length: 200 }, (_, i) => ({ name: `Filer ${i}`, note: 'x'.repeat(40) })), calls: [1, 2] }
  const fitted = fitOutput(output, ['top', 'calls'])
  assert.ok(new TextEncoder().encode(JSON.stringify(fitted)).length <= 4096)
  assert.equal(fitted.top[0]!.name, 'Filer 0')
  assert.deepEqual(fitted.calls, [1, 2])
})
