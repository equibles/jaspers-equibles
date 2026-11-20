import { defineConnection, definePlugin, defineSource, defineView } from '@jaspers-ai/sdk'
import { z } from 'zod'
import { API_HOST, getJson, isRecord, normalSymbol } from './api'
import { CallView } from './CallView'
import { callsUrl, callSummary, fetchTranscript, readCalls } from './calls'
import { DEFAULT_LIMIT, holdersSummary, holdersUrl, MAX_LIMIT, readHolders } from './holders'
import { HoldersView } from './HoldersView'
import { CALL_INSTRUCTIONS, HOLDERS_INSTRUCTIONS } from './instructions'

// Equibles in Jaspers Terminal. The assistant reaches Equibles' remote MCP server, equibles/mcp, for
// filings, statements, transcripts, ownership, estimates and guidance. Two views show what reads best
// laid out: a stock's 13F holders, and an earnings call in speaker turns. They read the REST API,
// which answers in rows, where the MCP tools answer the assistant in prose. One key serves both.

const MINUTE = 60_000

// The MCP tools offered: research data only, so the assistant's tool list stays short.
const TOOLS = [
  'SearchListings',
  'GetFinancialStatement',
  'GetFinancialFact',
  'CompareFinancialFact',
  'ListFilings',
  'SearchDocuments',
  'SearchDocument',
  'ReadDocumentLines',
  'ListInvestorEvents',
  'GetEarningsCallEvent',
  'GetEarningsCallTranscript',
  'GetEarningsCallQuestions',
  'GetInvestorEventTranscript',
  'GetAnalystEstimates',
  'GetGuidance',
  'GetTopHolders',
  'GetAllHolders',
  'GetInstitutionalOwnershipHistory',
  'GetInstitutionPortfolio',
  'GetInstitutionSummary',
  'SearchInstitutions',
  'GetInsiderTransactions',
  'SearchInsiders',
  'GetEtfHoldings',
  'SearchEtfs',
]

const Ticker = z.string().trim().min(1).max(24).describe('Ticker, like AAPL, or MIC:TICKER for a company listed on another exchange, like XLIS:NOS')
const Quarter = z.number().int().min(1).max(4)

const holders = defineSource({
  description:
    "A stock's institutional holders from 13F filings: each filer ranked by shares, with value, percent of the institutional total, holder type and style, and the quarter's totals.",
  input: z.object({
    symbol: Ticker,
    limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    reportDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('A 13F quarter end, YYYY-MM-DD; the latest when left out'),
  }),
  hosts: [API_HOST],
  ttlMs: 60 * MINUTE,
  run: async (args, ctx) => readHolders(args.symbol, await getJson(ctx.fetch, holdersUrl(args))),
})

const calls = defineSource({
  description: "A company's earnings calls, newest first: fiscal year and quarter, date, and whether a transcript is on file.",
  input: z.object({ symbol: Ticker }),
  hosts: [API_HOST],
  ttlMs: 30 * MINUTE,
  run: async (args, ctx) => {
    const body = await getJson(ctx.fetch, callsUrl(args.symbol))
    return { symbol: normalSymbol(args.symbol), rows: readCalls(isRecord(body) ? body['data'] : undefined) }
  },
})

// A call's transcript does not change once it is on file.
const transcript = defineSource({
  description: "One earnings call's transcript in speaker turns: each turn's speaker, role, start time and text.",
  input: z.object({ symbol: Ticker, year: z.number().int().min(1990).max(2100), quarter: Quarter }),
  hosts: [API_HOST],
  ttlMs: 24 * 60 * MINUTE,
  run: async (args, ctx) => fetchTranscript((url) => getJson(ctx.fetch, url), args.symbol, args.year, args.quarter),
})

const HoldersState = z.object({
  symbol: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  reportDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
})

const HoldersOutput = z.object({
  symbol: z.string().nullable(),
  reportDate: z.string().nullable(),
  totalInstitutions: z.number().nullable(),
  totalShares: z.number().nullable(),
  shown: z.number(),
  hasMore: z.boolean(),
  top: z.array(
    z.object({ rank: z.number(), name: z.string(), shares: z.number().nullable(), percentOfTotal: z.number().nullable(), holderType: z.string().nullable() }),
  ),
  error: z.string().nullable(),
})

const CallState = z.object({
  symbol: z.string().optional(),
  year: z.number().int().nullable().optional(),
  quarter: Quarter.nullable().optional(),
  find: z.string().optional(),
})

const Match = z.object({ n: z.number(), speaker: z.string(), snippet: z.string() })

const CallOutput = z.object({
  symbol: z.string().nullable(),
  year: z.number().nullable(),
  quarter: z.number().nullable(),
  date: z.string().nullable(),
  title: z.string().nullable(),
  calls: z.array(z.object({ year: z.number(), quarter: z.number(), date: z.string().nullable(), hasTranscript: z.boolean() })),
  turns: z.number(),
  speakers: z.array(z.object({ name: z.string(), role: z.string().nullable() })),
  find: z.string().nullable(),
  matches: z.number(),
  snippets: z.array(Match),
  note: z.string().nullable(),
  error: z.string().nullable(),
})

export default definePlugin({
  id: 'equibles',
  secrets: { apikey: { label: 'Equibles API key' } },
  connections: {
    mcp: defineConnection({
      url: 'https://mcp.equibles.com/mcp',
      auth: 'bearer',
      headers: { Authorization: 'Bearer ${secret:apikey}' },
      tools: TOOLS,
    }),
  },
  sources: { holders, calls, transcript },
  views: {
    holders: defineView(HoldersView, {
      title: 'Institutional holders',
      state: HoldersState,
      output: HoldersOutput,
      instructions: HOLDERS_INSTRUCTIONS,
      renders: [holders],
      summarize: holdersSummary,
    }),
    call: defineView(CallView, {
      title: 'Earnings call',
      state: CallState,
      output: CallOutput,
      instructions: CALL_INSTRUCTIONS,
      renders: [calls, transcript],
      summarize: callSummary,
    }),
  },
})
