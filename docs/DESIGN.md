# Design: a prediction market as a Percolator asset

This document explains the mapping, the parameters, and the trade-offs. It
assumes you have skimmed the upstream program README (trust boundaries,
account model, instruction overview). Percolator terms are used as upstream
uses them.

## 1. The mapping

| Prediction market concept | Percolator concept |
| --- | --- |
| Market (one collateral vault, many questions) | Market group account, asset 0 reserved |
| Question | Asset slot `i >= 1`, generation `market_id` |
| P(YES) | Price, scaled by 1e6, in `[1, 1_000_000]` |
| Buy YES | Long, `size_q > 0` |
| Buy NO | Short, `size_q < 0` |
| One share | `POS_SCALE` = 1_000_000 quantity units |
| Share pays 1.00 if YES | Price 1_000_000 atoms per share with a 6-decimal collateral |
| Resolution YES / NO | Final mark 1_000_000 / 1, then shutdown at the frozen mark |
| Question creator | Activator of the slot, pays the init fee |
| Resolver | The slot's `oracle_authority` (and shutdown signer) |
| Market operator | `marketauth` |

Why not a dedicated binary-outcome engine? Because the hard parts of a
leveraged, cross-margined, permissionless venue are solvency accounting,
liquidation, bankruptcy handling, and containment, and Percolator already has
those with a proof campaign behind them. The parts we add are thin: a price
convention, a lifecycle script, a manifest format, and services.

### 1.1 The price floor

The engine rejects a zero price. NO therefore resolves to 0.000001, not 0.
A YES holder loses `p - 0.000001` per share instead of `p`. At 1e6 shares that
is one collateral unit of residue; at realistic sizes it is dust. The SDK's
`MARK_NO` constant is that floor, and `pnlAtMark` accounts for it.

### 1.2 Generations

Slots are reused. When a question is retired the next activation of the same
index gets a new `market_id`. Every leg, every trade instruction, and every
manifest binds `(asset_index, market_id)`, so a position or a signed trade on
an old question can never touch a new one. The question key used everywhere
in this repo is `market/asset_index/market_id`.

## 2. Lifecycle

```
            create-question              resolver tick          resolver tick
creator ---------------------> Active/Manual -----------> Active/AuthMark ------> marks follow fair
                                (slot i, gen g)          ConfigureAuthMark        PushAuthMark

      closesAt       decision        PushAuthMark(final)      effective == target     SHUTDOWN
 ... --------> closed --------> ---------------------------> converged ------------> Recovery
                                                                                    (mark frozen)

      + force_close_delay_slots       ForceCloseAbandonedAsset x N        OI == 0       RETIRE
 ... ----------------------------> keeper nets long vs short -------------> resolved -----------> Retired
```

Two details matter and are easy to get wrong.

**Convergence before shutdown.** `PushAuthMark` sets the *raw target*. The
engine moves the *effective* price toward it by at most
`max_price_move_bps_per_slot` per slot, driven by cranks and trades. Shutdown
freezes the *effective* price. If the resolver shuts down one slot after
pushing the final mark, the question freezes at a lagged price and pays out
wrongly. The resolver therefore waits for `effective_price == raw_target`
(`QuestionState.converged`) before sending SHUTDOWN. With the defaults (300 bps
per slot) moving from 0.50 to 1.00 takes about fourteen cranked slots.

**Who signs shutdown.** `UpdateAssetLifecycle(SHUTDOWN)` accepts `marketauth`
(binding asset 0's authority epoch) or the slot's `asset_admin` (binding that
slot's epoch). The activator becomes `asset_admin`. The simplest deployment
has the resolver service hold `marketauth`'s key or have creators rotate
`asset_admin` to it; `buildShutdown` handles both epochs.

## 3. Parameters

`packages/ops/src/params.ts` holds the defaults. The reasoning:

| Parameter | Default | Why |
| --- | --- | --- |
| `initial_margin_bps` | 10_000 | Buying YES is fully collateralized: cost equals max loss. |
| `maintenance_margin_bps` | 2_500 | Must exceed the per-accrual loss budget plus liquidation fee (spec section 1.3): 12% + ~1.1%. |
| `max_price_move_bps_per_slot` | 300 | Probabilities jump on news. 3% per slot lets a 0.5 to 1.0 move complete in ~6 seconds while still bounding per-crank loss. |
| `max_accrual_dt_slots` | 4 | Caps how many slots of price movement one accrual can book. |
| `max_abs_funding_e9_per_slot` | 0 | Prediction markets have no basis to fund. Disabled. |
| `trade_fee_base_bps` | 20 | 0.2% of notional, split per the fee redirect policy. |
| `liquidation_fee_bps` | 100 | Cranker share 20% via policy. |
| `permissionless_market_init_fee` | 1.000000 | Nonzero makes creation permissionless; the fee lands in asset-0 insurance. |
| `force_close_delay_slots` | 1_500 | ~10 minute exit window after shutdown before anyone can net positions. |
| `permissionless_resolve_stale_slots` | 648_000 | ~3 days without any oracle update resolves the whole market. Safety valve if the resolver disappears. |

### 3.1 Margin, honestly

Margin is a percentage of notional, and notional is `shares * price`. A long
at price `p` posts `p` per share and can lose at most `p`. Fully covered.
A short at `p` posts `p` per share but can lose `1 - p`. At `p = 0.20` the
short is covered 1:4. This is the same shape as any perp (a short can lose
more than its margin) and it is handled the same way:

1. The per-slot cap limits how much loss accrues between cranks.
2. Maintenance margin at 25% triggers liquidation long before the position
   is underwater at the cap.
3. Liquidation shortfall hits the question's own insurance budget and then
   the question's own B domain. It never touches another question.
4. The winning side's profit is realizable only up to the losing side's
   reserved backing. If shorts are wiped out, YES holders get a credit rate
   below 100% and cannot withdraw the unbacked part. They are not made whole
   by other users.

A bounded-outcome margin rule (post `max(p, 1 - p)` instead of `p`) would
remove the gap and is the single most valuable engine change for this use
case. It is out of scope for a client-side project and listed in the roadmap.

## 4. Trading: RFQ now, AMM later

`TradeNoCpi` requires both portfolio owners to sign. The maker exposes quotes
over HTTP; a taker builds the transaction with itself as A and the maker as B,
signs, and posts it. The maker re-derives its quote from a fresh snapshot,
checks every field of the instruction (`packages/maker/src/fill.ts`), checks
that its position epoch is still current, co-signs, and submits. Nothing is
custodied. A stale epoch, a worse price, a bigger size, a second instruction,
or the maker as fee payer all reject.

`TradeCpi` is the production path upstream: the LP opts into a matcher
program once and fills no longer need its signature. An LMSR or
constant-product matcher for binary outcomes is the natural next step and
requires Rust. The SDK already derives the matcher delegate PDA.

## 5. Manifests

The chain stores a slot, a generation, and a mark. The manifest stores what
humans need:

```json
{
  "version": 1,
  "market": "<market group>",
  "assetIndex": 3,
  "marketId": "7",
  "title": "...",
  "resolutionCriteria": "...",
  "closesAt": "2026-12-31T00:00:00.000Z",
  "resolvesBy": "2027-01-02T00:00:00.000Z",
  "resolver": "<oracle authority>",
  "creator": "<activator>",
  ...
}
```

It is canonicalized (sorted keys, no whitespace), hashed with SHA-256, and
signed by the creator. The activation transaction carries an SPL Memo
`predictulator:q:v1:<hash>`. The resolver countersigns on registration. An
indexer can therefore prove that the question shown on a page is exactly the
one the slot was created for, without trusting the resolver's API.

## 6. Realizable credit, shown to users

The most important number on the question page is not the probability; it is
the credit rate per side. `source_credit_short.credit_rate_num` is how much
of the YES side's claimed profit the shorts have reserved; the reverse for NO.
At `1e12` every atom of profit is backed. Below that, winners are waiting on
losers' margin, not on the protocol. The web app shows it as "YES profit
realizable: 100%". This is the containment guarantee made visible.

## 7. What this is not

- Not an on-chain orderbook. Fills are bilateral.
- Not a fully collateralized market. See section 3.1.
- Not trust-minimized resolution. The resolver is an oracle you choose.
- Not audited, not production, not for real funds.
