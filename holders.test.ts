import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { holdersMeta, holdersOutput, holdersSummary, holdersUrl, readHolderRows, readHolders } from './holders.ts'

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

test('the request asks for one quarter of one stock, the limit kept within the API cap', () => {
  assert.equal(holdersUrl({ symbol: 'aapl', limit: 25 }), 'https://api.equibles.com/v1/stocks/AAPL/institutional-holders?limit=25')
  assert.equal(holdersUrl({ symbol: 'AAPL', limit: 900, reportDate: '2026-06-30' }), 'https://api.equibles.com/v1/stocks/AAPL/institutional-holders?limit=200&reportDate=2026-06-30')
})

test("a recorded answer reads as ranked rows beside the quarter's totals", () => {
  const holders = readHolders('aapl', fixture('holders-aapl.json'))
  assert.equal(holders.symbol, 'AAPL')
  assert.equal(holders.reportDate, '2026-09-30')
  assert.equal(holders.totalInstitutions, 6169)
  assert.equal(holders.totalShares, 9804479468)
  assert.equal(holders.hasMore, true)
  assert.deepEqual(
    holders.rows.map((row) => [row.rank, row.name, row.shares, row.holderType]),
    [
      [1, 'BlackRock, Inc.', 1157077341, 'Holding company'],
      [2, 'VANGUARD CAPITAL MANAGEMENT LLC', 955227784, 'Registered adviser'],
      [3, 'STATE STREET CORP', 622507478, 'Bank'],
    ],
  )
  assert.deepEqual(holders.confidentialFilers, [{ name: 'NORGES BANK', lastDisclosedShares: 190726866, lastDisclosedReportDate: '2026-06-30' }])
})

test("a run still holding another ticker's answer is not read as this one's", () => {
  const { rows, ...meta } = readHolders('AAPL', fixture('holders-aapl.json'))
  assert.equal(holdersMeta(meta, 'MSFT'), null)
  assert.equal(holdersMeta(meta, 'aapl')?.totalInstitutions, 6169)
  assert.equal(readHolderRows(rows)[2]!.rank, 3)
})

test('the published output and summary name the quarter and the top of the table', () => {
  const { rows, ...meta } = readHolders('AAPL', fixture('holders-aapl.json'))
  const output = holdersOutput('AAPL', meta, rows, null)
  assert.equal(output.shown, 3)
  assert.deepEqual(output.top[0], { rank: 1, name: 'BlackRock, Inc.', shares: 1157077341, percentOfTotal: 11.8, holderType: 'Holding company' })
  assert.equal(holdersSummary({ symbol: 'AAPL' }, output), 'Institutional holders of AAPL: 3 of 6,169 filers, quarter ending 2026-09-30')
  assert.equal(holdersSummary({}, holdersOutput(null, null, [], null)), 'Institutional holders: no ticker yet')
})
