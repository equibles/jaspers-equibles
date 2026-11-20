# jaspers-equibles

[Equibles](https://equibles.com) for [Jaspers Terminal](https://github.com/JaspersAI/terminal): SEC filings, financial statements, earnings call transcripts, 13F ownership, insider trades, analyst estimates and company guidance, for the assistant and in two views.

- **The connection, `equibles/mcp`:** Equibles' remote MCP server, offering the assistant 25 research tools. These cover statements and facts by period, filings and full-text document search, earnings calls and their analyst questions, estimates and guidance, 13F holders and institution portfolios, insider transactions, and ETF holdings.
- **`equibles/holders`:** a stock's institutional holders from 13F filings, ranked, with each filer's value, percent of the institutional total, holder type and style, and the quarter's totals. Filers that kept a position confidential this quarter are named below the table.
- **`equibles/call`:** an earnings call's transcript in numbered speaker turns, with speaker, role and time, a call picker and find. It opens the newest call that has a transcript. The transcript is the panel's text, so the assistant and research analysts can read and quote it.

Ask for "AAPL's top institutional holders" or "Microsoft's last earnings call", and the assistant places the view.

## Install

In Jaspers Terminal, open Settings > Plugins, paste

```
https://github.com/equibles/jaspers-equibles
```

and press Install. The app downloads the latest release, shows where it came from, and asks before any of it runs.

## Key

- **Equibles API key**, from <https://equibles.com/dashboard/apikeys>. A free key allows 100 requests a day; a call's transcript is usually one request.

The app asks for the key the first time something needs it, or take it in Settings > Plugins. It is sealed in your OS keychain and never reaches the plugin or the assistant: the app fills it in as each request goes out.

## Develop

```sh
git clone https://github.com/equibles/jaspers-equibles.git ~/Jaspers/plugins/equibles
cd ~/Jaspers/plugins/equibles
npm install
npm run typecheck
npm test
```

The tests run on recorded API responses in `fixtures/`, trimmed to a few rows. The views read the REST API (`api.equibles.com`), which answers in rows, while the MCP tools answer the assistant in prose; one key serves both.

## Release

```sh
npm version patch
git push --follow-tags
```

The Release workflow checks the plugin and attaches `equibles-<version>.zip` to a GitHub release. Update in Settings > Plugins picks it up.

## License

[MIT](LICENSE)
