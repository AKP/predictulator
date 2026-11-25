// Percolator review, disclosed to the maintainer 2026-11-11 and published in
// full at his request: the engine is an unaudited research project, devnet-only,
// not slated to go live for roughly a year, and he is actively soliciting bug
// reports. Nothing here is live or holds real funds.

export type Block =
  | {kind: 'p'; text: string}
  | {kind: 'h'; text: string}
  | {kind: 'list'; items: string[]}
  | {kind: 'code'; title?: string; code: string};

export interface Finding {
  id: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  status: string;
  title: string;
  blocks: Block[];
}

export const security = {
  intro: [
    'Predictulator runs on an engine and an on-chain program written by Anatoly Yakovenko, not by me. Before putting anything real behind it, I reviewed both at the commits this repo pins, by hand, against their own invariant charter and attack suites.',
    'The engine is heavily verified and most of it holds. Three issues came out of the review. All three went to the maintainer first; he asked that they be posted in full, since the code is an unaudited research project that is not going live for about a year and he wants the scrutiny. Each finding below carries the exact code, the sequence, and the fix.',
  ],
  commits: 'percolator-prog main 5cb331dd; engine 4db11a8c (the rev the program pins) and master b22bef7d.',
  findings: [
    {
      id: '1',
      severity: 'high',
      status: 'Reported. Loss of trader funds by an untrusted per-asset authority.',
      title: 'A backing authority can withdraw a loser’s paid margin before the winner settles',
      blocks: [
        {
          kind: 'p',
          text: 'When a mark moves on asset A, cranking the losing portfolio moves its realized loss out of capital and into A’s loss-side counterparty backing bucket, as loser-paid backing. The winner’s claim does not enter the domain’s claim bound until the winner’s own leg is settled. In that window the domain shows a zero claim bound, so the credit rate reads fully backed and the backing authority can withdraw the loser-paid atoms before the winner is ever paid.',
        },
        {kind: 'h', text: 'Why the rate reads full'},
        {
          kind: 'p',
          text: 'The per-domain credit rate is backing over claims, but with no settled claim yet the numerator check short-circuits to the maximum:',
        },
        {
          kind: 'code',
          title: 'engine / expected_source_credit_rate_num_for_state',
          code: `if state.positive_claim_bound_num == 0 {
    return Ok(CREDIT_RATE_SCALE);   // "fully realizable"
}
let available = available_backing_num_for_source_credit_state(state)?;
// rate = available * SCALE / positive_claim_bound_num, clamped to SCALE`,
        },
        {
          kind: 'p',
          text: 'So after the loser is cranked but before the winner is, the loss-side bucket holds the loser’s atoms, the claim bound is still zero, and withdraw_fresh_counterparty_backing_not_atomic sees a full rate and releases them.',
        },
        {kind: 'h', text: 'Why the wrapper guard does not stop it'},
        {
          kind: 'p',
          text: 'The wrapper blocks a Live-mode backing withdrawal when the domain is loss-stale. That holds in a single-asset market. But the market-wide flag it trusts, loss_stale_active, is only a cache of the last asset touched (the engine comment says it summarizes only the touched asset). Touching any second asset in the same slot overwrites the cache, and the asset-local fallback only checks whether a slot has elapsed, not the stale counts:',
        },
        {
          kind: 'code',
          title: 'program / asset_local_loss_stale_view (the fallback that should catch it)',
          code: `matches!(asset.lifecycle, ACTIVE | DRAIN_ONLY)
    && asset.slot_last.get() < group.header.current_slot.get()   // false in-slot
    && asset_local_has_position_or_loss_state_view(group, asset_index)`,
        },
        {
          kind: 'p',
          text: 'Compare the engine’s own predicate, which keys off the stale counts with no slot condition. The wrapper gate uses the weaker test:',
        },
        {
          kind: 'code',
          title: 'engine / asset_is_loss_stale_at_slot (the correct test)',
          code: `asset.stale_account_count_long != 0
    || asset.stale_account_count_short != 0
    || (asset_contributes_to_loss_stale_summary(asset)
        && asset.slot_last < current_slot)`,
        },
        {kind: 'h', text: 'The sequence, one transaction'},
        {
          kind: 'list',
          items: [
            'Market is Live with two active assets A and B. The attacker holds A’s backing_bucket_authority (in a permissionless deployment that is whatever key the asset’s creator supplied at activation). No provider deposit is needed.',
            'A mark move on A puts one side in loss. Wait until A’s effective price equals its target so the exposed-lag gate passes. Both sides now carry stale K/F snapshots.',
            'Crank the loser. Its loss moves from capital into A’s loss-side bucket as loser-paid backing; its PnL is restored to zero, so the negative-PnL counter stays clean. The header cache now reads loss_stale_active = true because the winner is still stale.',
            'Crank any attacker portfolio holding a current leg on B, in the same slot. The settlement entry runs for every active leg and rewrites loss_stale_active from B’s state, which is false. No slot has elapsed.',
            'WithdrawBackingBucket on A’s loss-side domain, no ledger account supplied (the ledger is the only place a principal cap lives, and it is optional). Every wrapper gate passes; the engine recomputes a full rate because the claim bound is zero; the vault pays the authority.',
            'Later the winner is cranked. Its claim bound rises, available backing is now zero, its credit rate is zero. The loser’s payment has already left the system, so the winner’s gain is permanently unrealizable.',
          ],
        },
        {
          kind: 'p',
          text: 'Conservation holds the whole way (counterparty backing and vault both fall by the same amount), which is why no engine invariant trips. It repeats on every adverse move the asset sees.',
        },
        {kind: 'h', text: 'Why the suite misses it'},
        {
          kind: 'p',
          text: 'The closest test, v16_program_loss_stale_reserve_matrix_preserves_senior_stocks_and_flat_exit (inv_027), advances the second asset at a later slot, which makes slot_last < current_slot true and the fallback fire. The same-slot variant is not covered, and tests/support/fuzz_model.rs does not model WithdrawBackingBucket at all, so the public-sequence generator cannot rediscover it.',
        },
        {kind: 'h', text: 'Fix'},
        {
          kind: 'p',
          text: 'In the wrapper’s live withdrawal gate, replace the slot_last < current_slot asset-local test with the engine’s predicate: reject while the asset’s stale_account_count on either side is nonzero. Independently, cap a Live-mode backing withdrawal at provider principal (fresh reserved minus loser-paid), which the provider_principal_ fields on master already make a two-line check.',
        },
      ],
    },
    {
      id: '2',
      severity: 'medium',
      status: 'Reported. Affects Predictulator directly.',
      title: 'New assets cannot get a live oracle once anyone in the market holds profit',
      blocks: [
        {
          kind: 'p',
          text: 'Configuring an authority or hybrid mark on a freshly activated asset is gated on a market-wide counter: the total settled positive PnL across every portfolio in the market. In any market with ongoing trading that total is almost never zero.',
        },
        {
          kind: 'code',
          title: 'program / require_asset_active_for_oracle_reconfiguration_view',
          code: `if asset_index >= group.markets.len()
    || group.markets[asset_index].engine.asset.lifecycle != 2
    || asset_local_has_position_or_loss_state_view(group, asset_index)
    || group.header.pnl_pos_tot.get() != 0        // market-wide, not per asset
    || group.header.stale_certificate_count.get() != 0
    || group.header.b_stale_account_count.get() != 0
    || group.header.negative_pnl_account_count.get() != 0
    // ... stress flags
{
    return Err(PercolatorError::EngineLockActive.into());
}`,
        },
        {
          kind: 'p',
          text: 'A permissionless asset is activated in MANUAL mode at a fixed price, and there is no manual price-push instruction; the only way to give it a live mark is ConfigureAuthMark / ConfigureEwmaMark / ConfigureHybridOracle, all of which call this gate. So the moment one unrelated trader anywhere in the market is up on a position, no new asset can be priced. The activation fee is spent on an asset that can never move.',
        },
        {
          kind: 'p',
          text: 'This is exactly the activate-then-configure flow Predictulator uses to create a question, which is why it is the finding we care about most. The engine’s scope-locality invariant (INV-074) and the program README both describe oracle configuration as per-asset; the gate should read the target asset’s own state, not a global counter. The one existing test for this path passes only because it asserts pnl_pos_tot == 0 before reconfiguring.',
        },
        {kind: 'h', text: 'Fix'},
        {
          kind: 'p',
          text: 'Drop the four market-wide counters (pnl_pos_tot, stale_certificate_count, b_stale_account_count, negative_pnl_account_count) from this gate, keeping the asset-local emptiness check and the recovery and stress flags. The engine helper that writes the global accrual clock can keep its stricter rule and simply advance the clock monotonically rather than refusing to configure an empty asset.',
        },
      ],
    },
    {
      id: '3',
      severity: 'low',
      status: 'Reported.',
      title: 'A batch trade drops an oracle-profile write on authority-mark assets',
      blocks: [
        {
          kind: 'p',
          text: 'On authority-mark assets, the batch no-CPI trade path runs an inline funding accrual that mutates the asset’s oracle profile, then skips writing it back because a later condition short-circuits the loop before the only write:',
        },
        {
          kind: 'code',
          title: 'program / handle_batch_execute_zero_copy (leg loop)',
          code: `if !profile_updates_mark_from_trade_view(oracle_profile, batch_now_slot) {
    continue;   // AuthMark + non-stale Hybrid take this branch
}
// ... mark/target updates ...
write_oracle_profile_to_view(&mut group, *asset_index, oracle_profile)?;  // skipped`,
        },
        {
          kind: 'p',
          text: 'The single-trade path writes the profile unconditionally. No value is created or destroyed; the effect is that a batched set of fills leaves a slightly different price trajectory than the same fills sent one at a time, which contradicts their equivalent-route property (INV-047). Moving the write above the early return closes it.',
        },
      ],
    },
  ] as Finding[],
  reviewed:
    'Token custody, asset lifecycle, force-close and crank, resolved payouts, trades and the matcher CPI boundary, and the oracle paths were all reviewed with no further findings. Everything was traced through source rather than executed, and each finding was sent with the regression test that should reproduce it in the V16CuEnv harness.',
};
