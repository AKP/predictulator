# Operations runbook (devnet)

Everything below is for Solana devnet with test tokens.

## 0. Build and deploy the program

Predictulator uses upstream `percolator-prog` unmodified. You need a Rust
toolchain, the Agave CLI, and platform-tools. The exact versions that are
known to work are in fivebar-perps' `docs/BUILD.md`, which tracks the same
upstream commit:

```bash
git clone https://github.com/aeyakovenko/percolator-prog
cd percolator-prog
git checkout 5cb331dde354517c6371a8acf92cecb194f3bb73   # commit the SDK layouts were transcribed from
cargo build-sbf --tools-version v1.52 --arch v0
solana program deploy target/deploy/percolator_prog.so --url devnet
```

Record the program id as `PROGRAM_ID`.

If you deploy a newer commit, run that build's `examples/dump_sizes.rs` and
compare with `packages/sdk/test/layout.test.ts`. Any change in struct sizes
means the schemas in `packages/sdk/src/layout.ts` must be re-transcribed before
a single decode is trusted.

## 1. Keys

```bash
mkdir keys
solana-keygen new -o keys/admin.json      # marketauth, pays for the market
solana-keygen new -o keys/resolver.json   # oracle authority for questions
solana-keygen new -o keys/maker.json
solana-keygen new -o keys/keeper.json
solana airdrop 2 keys/admin.json --url devnet   # repeat for the others
```

`keys/` is gitignored.

## 2. Collateral and market

```bash
export RPC_URL=https://api.devnet.solana.com
export PROGRAM_ID=...

npm run ops -- mint-test-tokens --payer keys/admin.json
# prints a 6-decimal mint and funds admin's token account with 1,000 units
npm run ops -- mint-test-tokens --payer keys/admin.json --mint <mint> --to <maker pubkey>

npm run ops -- init-market --admin keys/admin.json --mint <mint>
export MARKET=...
npm run ops -- show
```

`init-market` does four things in two transactions: allocates the market
account sized for one slot, creates the vault as the vault authority's
associated token account, calls `InitMarket` with the parameters in
`packages/ops/src/params.ts`, then sets the question creation fee, the force-close
delay, and the liquidation cranker share.

## 3. Portfolios

Every participant, including the maker and the keeper, needs a portfolio:

```bash
npm run ops -- portfolio create  --owner keys/maker.json
npm run ops -- portfolio deposit --owner keys/maker.json --amount 500
npm run ops -- portfolio create  --owner keys/keeper.json
npm run ops -- portfolio list    --owner keys/maker.json
```

## 4. Services

Copy `.env.example` to `.env`, fill in `PROGRAM_ID`, `MARKET`, `MAKER_PORTFOLIO`,
`REWARD_PORTFOLIO`, and a real `RESOLVER_ADMIN_TOKEN`. Then in three shells:

```bash
npm run maker      # :8788  quotes, /fill, /fair
npm run resolver   # :8787  registry, marks (from the maker's /fair), resolution
npm run keeper     #        cranks, liquidations, force-closes
```

Order matters only for the resolver's mark source: with `MARK_SOURCE` pointing
at the maker, start the maker first. `DRY_RUN=1` makes the resolver and keeper
log what they would send without sending.

## 5. A question

Write a manifest without the chain-assigned fields (see
`packages/ops/manifests/example-question.json`), then:

```bash
npm run ops -- create-question --creator keys/admin.json \
  --manifest my-question.json \
  --resolver $(solana-keygen pubkey keys/resolver.json) \
  --resolver-url http://localhost:8787 \
  --initial-probability 0.55
```

The command reads the market to learn the next slot and generation, fills
those into the manifest, signs it with the creator key, sends one transaction
containing the rent top-up, the memo with the manifest hash, and the
activation, then POSTs the signed manifest to the resolver. On its next tick
the resolver switches the slot to AuthMark mode and the maker starts quoting.

Anyone can do this, not just the admin: a non-admin creator pays the creation
fee from their token account.

## 6. Resolving

After `closesAt`:

```bash
export RESOLVER_ADMIN_TOKEN=...
npm run ops -- resolve --resolver-url http://localhost:8787 --asset 1 --gen 2 --outcome YES --note "Coinbase close 312.40"
```

Watch the resolver log: it pushes the final mark, waits for convergence (the
keeper's cranks move the effective price), shuts the slot down, and once the
keeper has netted every position it retires the slot if it holds `marketauth`.

## 7. Web app

```bash
cp apps/web/.env.example apps/web/.env   # set VITE_PROGRAM_ID, VITE_MARKET
npm run dev:web
```

The page reads the market directly from RPC, the question list from the
resolver, and quotes from the maker. With no market configured it shows a
setup screen rather than placeholder data.

## 8. Things that will bite

- **Rent on slot growth.** Activating a new slot grows the market account by
  one slot (1,813 bytes). The program does not fund that rent; the SDK adds a
  system transfer from the creator in the same transaction.
- **Sequences and epochs.** Deposits and withdrawals bind the portfolio's
  matcher sequence; trades bind its position epoch; oracle pushes bind a
  strictly increasing observation sequence; policy updates bind a per-lane
  policy sequence and the asset-0 authority epoch. Every builder in the SDK
  takes the current value from a fresh decode. Reusing a stale snapshot
  yields `EngineStale`.
- **Both owners sign a trade.** There is no way around this on the
  `TradeNoCpi` path; that is what the maker's `/fill` endpoint is for.
- **Keeper reward.** The cranker share is paid only when the keeper appends
  its own writable portfolio and signs. `REWARD_PORTFOLIO` enables it.

## 9. Audit the registry against chain

The resolver's registry is a convenience. The chain is the record: every
activation transaction carries the manifest hash in an SPL Memo next to the
`UpdateAssetLifecycle(ACTIVATE)` instruction. The indexer reads those back.

```bash
export RPC_URL=https://api.devnet.solana.com PROGRAM_ID=<deployed> MARKET=<market>

# every activation this market has ever had: slot, generation, hash, activator, signature
npm run indexer -- scan --out activations.json

# grade the resolver's registry against chain; exit 1 on anything but "verified"
npm run indexer -- verify --resolver-url http://localhost:8787
#   verified       3/9        tx 5Ht2kq8Yx9Lm… hash 9f1c0a7b2d4e…
#   hash-mismatch  4/9        tx 2Ab9... hash 11aa…  registry 22bb…
#   unregistered   5/10       tx 7Cd1... hash 33cc…
#   not-on-chain   6/11
```

`hash-mismatch` means the resolver is serving a manifest whose canonical hash
is not the one the creator committed on chain. `unregistered` is a slot that
was activated with a Predictulator memo but never posted to this resolver.
`not-on-chain` is a registry entry with no matching activation. Run it from
cron against any resolver you rely on.

## 10. Give an agent the market

`packages/mcp` is a stdio MCP server over the SDK. It holds no keys: it reads
chain state, fetches quotes, and returns unsigned transactions for the
wallet to sign.

```json
{
  "mcpServers": {
    "predictulator": {
      "command": "npx",
      "args": ["predictulator-mcp"],
      "env": {
        "RPC_URL": "https://api.devnet.solana.com",
        "PROGRAM_ID": "<deployed>",
        "MARKET": "<market>",
        "RESOLVER_URL": "http://localhost:8787",
        "MAKER_URL": "http://localhost:8788"
      }
    }
  }
}
```

Tools: `market_summary`, `list_questions`, `get_question`,
`explain_credit_rate`, `get_portfolio`, `preview_trade`, `build_trade`,
`submit_fill`. `build_trade` returns base64 that the agent's wallet must sign
without changing the fee payer; `submit_fill` forwards the signed bytes to
the maker, which still validates every field before co-signing.
