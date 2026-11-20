// What the assistant is told while each view is focused: what it shows, how state drives it, and
// what output holds.

export const HOLDERS_INSTRUCTIONS = [
  "A stock's institutional holders from 13F filings, ranked by shares, with each filer's value, percent of the institutional total, holder type and style.",
  'state.symbol is the ticker (AAPL, or MIC:TICKER for another exchange). state.limit is how many filers to list, 25 when left out, at most 200. state.reportDate picks a 13F quarter end (YYYY-MM-DD); left out, the latest. To show another stock set the whole state, { symbol: "MSFT" }.',
  'output: the quarter (reportDate), totalInstitutions and totalShares for the whole quarter, how many rows are shown, hasMore, the top 15 rows, and error. The latest quarter can still be filling in while managers file, up to 45 days after the quarter ends.',
  'For ownership history, one institution\'s portfolio, insider trades, or a filer the table does not show, use the equibles/mcp tools.',
].join('\n')

export const CALL_INSTRUCTIONS = [
  "One earnings call's transcript in speaker turns: each turn's speaker, role, start time and text, numbered as the view shows them.",
  'state.symbol is the ticker. state.year and state.quarter pick the call (the company\'s fiscal year and quarter, as output.calls lists them), both or neither; neither is the newest call with a transcript. To show another company set the whole state, { symbol: "MSFT" }, so the last company\'s quarter does not carry over.',
  'state.find highlights a word or phrase and counts the turns it is in; output.matches and output.snippets (turn number, speaker, text) say where.',
  'output: the call, the recent calls, turns, speakers with their roles, find, matches, snippets, note (why a call has no transcript), and error. The transcript itself is the panel\'s text, read with get panels/<id>/text a part at a time, its turns under the numbers the view shows. Quote it from there and name the speaker the turn names.',
  'For the analyst questions alone, the call\'s guidance, or earlier calls\' themes, use the equibles/mcp tools.',
].join('\n')
