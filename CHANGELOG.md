# Changelog

All notable changes to this repository. Dates are UTC.

## 0.2.0 — 2026-11-10

### Added

- **Layout verifier** (`scripts/verify-layouts.mjs`, `npm run verify:layouts`). Fetches `percolator` and `percolator-prog` at the commits pinned in `packages/sdk/src/constants.ts`, parses every `#[repr(C)]` struct, evaluates the array-length constants, and diffs field names, types, and byte sizes against the SDK's declarative schemas. Twenty-one structs are checked. `--engine` and `--program` point it at a local checkout instead.
- **Indexer** (`packages/indexer`). `extractActivation` pairs the `predictulator:q:v1:<sha256>` memo with the `UpdateAssetLifecycle(ACTIVATE)` instruction in a parsed transaction; `scanActivations` walks the market's signature history; `reconcile` grades a resolver's registry against chain as `verified`, `hash-mismatch`, `unregistered`, or `not-on-chain`. CLI: `predictulator-indexer scan [--out file]` and `verify --resolver-url <url> [--json]` (exit 1 on any non-verified entry).
- **MCP server** (`packages/mcp`, `predictulator-mcp`). Stdio server with eight tools: `market_summary`, `list_questions`, `get_question`, `explain_credit_rate`, `get_portfolio`, `preview_trade`, `build_trade` (returns an unsigned, base64 `TradeNoCpi` for the wallet to sign), and `submit_fill` (forwards a taker-signed transaction to the maker). The server holds no keys.
- **Trading page position management** (`apps/web`). Every open leg has a close button (`RebalanceReduce` for the full size at the engine's effective price). A Convert PnL button issues `ConvertReleasedPnl` for the entered amount; it is enabled only while unrealized PnL is positive.
- **Site**: an Updates section (`#updates`) describing this release, with the verifier output and an MCP client config.
- `CHANGELOG.md` (this file).

### Fixed

- **Asset slot layout drift.** `ENGINE_ASSET_SLOT` carried two `provider_principal_*` fields that exist on the engine's master branch but not at the pinned commit. The engine slot is 1,301 bytes at the pin, not 1,333, so the asset slot stride is 1,813, not 1,845. Found by the first run of the verifier; `marketSlotCapacityFromLen` would have rejected every real market account. Docs, site copy, and tests updated.

### Changed

- All workspace packages are `0.2.0`.
- Test suite: 11 files, 67 tests (was 9 files, 59 tests).
- `docs/ROADMAP.md`: layout verification, indexer, and agent surface are done and moved out of the list.

## 0.1.0 — 2026-11-08

Initial release: SDK (layouts, encoders, decoders, client, manifests), resolver, maker, keeper, ops CLI, trading page, marketing site, design notes, runbook, roadmap. Nothing has run against a deployed market.
