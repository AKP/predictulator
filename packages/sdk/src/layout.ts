/**
 * Declarative Pod layouts.
 *
 * Every on-chain struct we read is `#[repr(C)]` with byte-array integer
 * wrappers (engine) or naturally aligned primitives that happen to pack
 * without padding (wrapper; bytemuck's Pod derive refuses padded structs).
 * Either way the layout is the field list in order, so we describe the
 * field list once and compute sizes and offsets from it.
 */

export type Prim = "u8" | "u16" | "u32" | "u64" | "u128" | "i64" | "i128";

export type FieldType =
  | Prim
  | { bytes: number }
  | { struct: Struct }
  | { array: FieldType; len: number };

export interface Field {
  name: string;
  type: FieldType;
}

export interface Struct {
  name: string;
  fields: Field[];
}

export const PRIM_SIZE: Record<Prim, number> = {
  u8: 1,
  u16: 2,
  u32: 4,
  u64: 8,
  u128: 16,
  i64: 8,
  i128: 16,
};

export function sizeOf(t: FieldType): number {
  if (typeof t === "string") return PRIM_SIZE[t];
  if ("bytes" in t) return t.bytes;
  if ("array" in t) return sizeOf(t.array) * t.len;
  return structSize(t.struct);
}

const sizeCache = new WeakMap<Struct, number>();
export function structSize(s: Struct): number {
  const hit = sizeCache.get(s);
  if (hit !== undefined) return hit;
  let n = 0;
  for (const f of s.fields) n += sizeOf(f.type);
  sizeCache.set(s, n);
  return n;
}

export interface FieldInfo {
  offset: number;
  size: number;
  type: FieldType;
}

const offsetCache = new WeakMap<Struct, Record<string, FieldInfo>>();
export function offsetsOf(s: Struct): Record<string, FieldInfo> {
  const hit = offsetCache.get(s);
  if (hit) return hit;
  const out: Record<string, FieldInfo> = {};
  let o = 0;
  for (const f of s.fields) {
    const size = sizeOf(f.type);
    out[f.name] = { offset: o, size, type: f.type };
    o += size;
  }
  offsetCache.set(s, out);
  return out;
}

export function fieldOffset(s: Struct, name: string): number {
  const info = offsetsOf(s)[name];
  if (!info) throw new Error(`${s.name} has no field ${name}`);
  return info.offset;
}

// ---------------------------------------------------------------------------
// Engine structs (percolator/src/v16.rs)
// ---------------------------------------------------------------------------

import {
  ORACLE_LEG_CAP,
  PORTFOLIO_SOURCE_DOMAIN_CAP,
  V16_ACTIVE_BITMAP_WORDS,
  V16_MAX_PORTFOLIO_ASSETS_N,
} from "./constants.js";

const B32: FieldType = { bytes: 32 };

export const PROVENANCE_HEADER: Struct = {
  name: "ProvenanceHeaderV16Account",
  fields: [
    { name: "market_group_id", type: B32 },
    { name: "portfolio_account_id", type: B32 },
    { name: "owner", type: B32 },
    { name: "version", type: "u16" },
    { name: "layout_discriminator", type: "u16" },
  ],
};

export const PORTFOLIO_LEG: Struct = {
  name: "PortfolioLegV16Account",
  fields: [
    { name: "active", type: "u8" },
    { name: "asset_index", type: "u32" },
    { name: "market_id", type: "u64" },
    { name: "side", type: "u8" },
    { name: "basis_pos_q", type: "i128" },
    { name: "a_basis", type: "u128" },
    { name: "k_snap", type: "i128" },
    { name: "f_snap", type: "i128" },
    { name: "kf_epoch_snap", type: "u64" },
    { name: "epoch_snap", type: "u64" },
    { name: "loss_weight", type: "u128" },
    { name: "b_snap", type: "u128" },
    { name: "b_rem", type: "u128" },
    { name: "b_epoch_snap", type: "u64" },
    { name: "b_stale", type: "u8" },
    { name: "stale", type: "u8" },
  ],
};

export const PORTFOLIO_SOURCE_DOMAIN: Struct = {
  name: "PortfolioSourceDomainV16Account",
  fields: [
    { name: "domain", type: "u32" },
    { name: "source_claim_market_id", type: "u64" },
    { name: "source_claim_bound_num", type: "u128" },
    { name: "source_claim_liened_num", type: "u128" },
    { name: "source_claim_counterparty_liened_num", type: "u128" },
    { name: "source_claim_insurance_liened_num", type: "u128" },
    { name: "source_lien_effective_reserved", type: "u128" },
    { name: "source_lien_counterparty_backing_num", type: "u128" },
    { name: "source_lien_insurance_backing_num", type: "u128" },
    { name: "source_lien_fee_last_slot", type: "u64" },
    { name: "source_claim_impaired_num", type: "u128" },
    { name: "source_lien_impaired_effective_reserved", type: "u128" },
    { name: "source_lien_capital_at_risk_fee_revenue", type: "u128" },
    { name: "source_lien_impaired_capital_at_risk_fee_revenue", type: "u128" },
  ],
};

export const HEALTH_CERT: Struct = {
  name: "HealthCertV16Account",
  fields: [
    { name: "certified_equity", type: "i128" },
    { name: "certified_initial_req", type: "u128" },
    { name: "certified_maintenance_req", type: "u128" },
    { name: "certified_liq_deficit", type: "u128" },
    { name: "certified_worst_case_loss", type: "u128" },
    { name: "cert_oracle_epoch", type: "u64" },
    { name: "cert_funding_epoch", type: "u64" },
    { name: "cert_risk_epoch", type: "u64" },
    { name: "cert_asset_set_epoch", type: "u64" },
    { name: "active_bitmap_at_cert", type: { array: "u64", len: V16_ACTIVE_BITMAP_WORDS } },
    { name: "valid", type: "u8" },
  ],
};

export const CLOSE_PROGRESS_LEDGER: Struct = {
  name: "CloseProgressLedgerV16Account",
  fields: [
    { name: "active", type: "u8" },
    { name: "finalized", type: "u8" },
    { name: "canceled", type: "u8" },
    { name: "close_id", type: "u64" },
    { name: "asset_index", type: "u32" },
    { name: "market_id", type: "u64" },
    { name: "domain_side", type: "u8" },
    { name: "gross_loss_at_close_start", type: "u128" },
    { name: "drift_reference_slot", type: "u64" },
    { name: "max_close_slot", type: "u64" },
    { name: "support_consumed", type: "u128" },
    { name: "junior_face_burned", type: "u128" },
    { name: "insurance_spent", type: "u128" },
    { name: "b_loss_booked", type: "u128" },
    { name: "explicit_loss_assigned", type: "u128" },
    { name: "quantity_adl_applied_q", type: "u128" },
    { name: "drift_consumed", type: "u128" },
    { name: "residual_remaining", type: "u128" },
  ],
};

export const RESOLVED_PAYOUT_LEDGER: Struct = {
  name: "ResolvedPayoutLedgerV16Account",
  fields: [
    { name: "snapshot_residual", type: "u128" },
    { name: "terminal_claim_exact_receipts_num", type: "u128" },
    { name: "terminal_claim_bound_unreceipted_num", type: "u128" },
    { name: "current_payout_rate_num", type: "u128" },
    { name: "current_payout_rate_den", type: "u128" },
    { name: "snapshot_slot", type: "u64" },
    { name: "payout_halted", type: "u8" },
    { name: "finalized", type: "u8" },
  ],
};

export const RESOLVED_PAYOUT_RECEIPT: Struct = {
  name: "ResolvedPayoutReceiptV16Account",
  fields: [
    { name: "prior_bound_contribution_num", type: "u128" },
    { name: "live_released_face_at_receipt", type: "u128" },
    { name: "terminal_positive_claim_face", type: "u128" },
    { name: "paid_effective", type: "u128" },
    { name: "present", type: "u8" },
    { name: "finalized", type: "u8" },
  ],
};

export const PORTFOLIO_STATE: Struct = {
  name: "PortfolioAccountV16Account",
  fields: [
    { name: "provenance_header", type: { struct: PROVENANCE_HEADER } },
    { name: "owner", type: B32 },
    { name: "capital", type: "u128" },
    { name: "pnl", type: "i128" },
    { name: "reserved_pnl", type: "u128" },
    { name: "residual_crystallized_loss_atoms_total", type: "u128" },
    { name: "residual_spent_principal_atoms_total", type: "u128" },
    { name: "residual_received_atoms_total", type: "u128" },
    { name: "funding_long_paid_atoms_total", type: "u128" },
    { name: "funding_long_received_atoms_total", type: "u128" },
    { name: "funding_short_paid_atoms_total", type: "u128" },
    { name: "funding_short_received_atoms_total", type: "u128" },
    { name: "fee_credits", type: "i128" },
    { name: "cancel_deposit_escrow", type: "u128" },
    { name: "last_fee_slot", type: "u64" },
    { name: "active_bitmap", type: { array: "u64", len: V16_ACTIVE_BITMAP_WORDS } },
    { name: "legs", type: { array: { struct: PORTFOLIO_LEG }, len: V16_MAX_PORTFOLIO_ASSETS_N } },
    {
      name: "source_domains",
      type: { array: { struct: PORTFOLIO_SOURCE_DOMAIN }, len: PORTFOLIO_SOURCE_DOMAIN_CAP },
    },
    { name: "health_cert", type: { struct: HEALTH_CERT } },
    { name: "stale_state", type: "u8" },
    { name: "b_stale_state", type: "u8" },
    { name: "rebalance_lock", type: "u8" },
    { name: "liquidation_lock", type: "u8" },
    { name: "close_progress", type: { struct: CLOSE_PROGRESS_LEDGER } },
    { name: "resolved_payout_receipt", type: { struct: RESOLVED_PAYOUT_RECEIPT } },
  ],
};

export const V16_CONFIG: Struct = {
  name: "V16ConfigAccount",
  fields: [
    { name: "max_portfolio_assets", type: "u16" },
    { name: "max_market_slots", type: "u32" },
    { name: "min_nonzero_mm_req", type: "u128" },
    { name: "min_nonzero_im_req", type: "u128" },
    { name: "h_min", type: "u64" },
    { name: "h_max", type: "u64" },
    { name: "maintenance_margin_bps", type: "u64" },
    { name: "initial_margin_bps", type: "u64" },
    { name: "max_trading_fee_bps", type: "u64" },
    { name: "liquidation_fee_bps", type: "u64" },
    { name: "liquidation_fee_cap", type: "u128" },
    { name: "min_liquidation_abs", type: "u128" },
    { name: "max_accrual_dt_slots", type: "u64" },
    { name: "max_abs_funding_e9_per_slot", type: "u64" },
    { name: "min_funding_lifetime_slots", type: "u64" },
    { name: "max_price_move_bps_per_slot", type: "u64" },
    { name: "max_account_b_settlement_chunks", type: "u64" },
    { name: "max_bankrupt_close_chunks", type: "u64" },
    { name: "max_bankrupt_close_lifetime_slots", type: "u64" },
    { name: "asset_activation_cooldown_slots", type: "u64" },
    { name: "public_b_chunk_atoms", type: "u128" },
    { name: "max_recovery_fallback_deviation_bps", type: "u64" },
    { name: "backing_fee_base_rate_e9_per_slot", type: "u64" },
    { name: "backing_fee_kink_util_bps", type: "u64" },
    { name: "backing_fee_slope_at_kink_e9_per_slot", type: "u64" },
    { name: "backing_fee_slope_above_kink_e9_per_slot", type: "u64" },
    { name: "backing_freshness_buckets", type: "u8" },
    { name: "margin_mode_realizable_full_shared_cross_margin", type: "u8" },
    { name: "source_credit_lien_required", type: "u8" },
    { name: "insurance_credit_reservation_required", type: "u8" },
    { name: "permissionless_recovery_enabled", type: "u8" },
    { name: "recovery_fallback_price_enabled", type: "u8" },
    { name: "recovery_fallback_envelope_enabled", type: "u8" },
    { name: "credit_lien_revalidation_required", type: "u8" },
    { name: "stale_certificate_penalty_enabled", type: "u8" },
    { name: "full_refresh_required_for_favorable_actions", type: "u8" },
    { name: "public_liveness_profile_crank_forward", type: "u8" },
  ],
};

export const OPTIONAL_RECOVERY_REASON: Struct = {
  name: "V16OptionalRecoveryReasonAccount",
  fields: [
    { name: "present", type: "u8" },
    { name: "value", type: "u8" },
  ],
};

export const MARKET_GROUP_HEADER: Struct = {
  name: "MarketGroupV16HeaderAccount",
  fields: [
    { name: "market_group_id", type: B32 },
    { name: "config", type: { struct: V16_CONFIG } },
    { name: "asset_slot_capacity", type: "u32" },
    { name: "vault", type: "u128" },
    { name: "insurance", type: "u128" },
    { name: "c_tot", type: "u128" },
    { name: "pnl_pos_tot", type: "u128" },
    { name: "pnl_pos_bound_tot_num", type: "u128" },
    { name: "pnl_pos_bound_tot", type: "u128" },
    { name: "pnl_matured_pos_tot", type: "u128" },
    { name: "backing_provider_earnings_total", type: "u128" },
    { name: "source_claim_bound_total_num", type: "u128" },
    { name: "source_fresh_backing_total_num", type: "u128" },
    { name: "source_insurance_credit_reserved_total_atoms", type: "u128" },
    { name: "insurance_domain_budget_remaining_total", type: "u128" },
    { name: "resolved_payout_blocker_count", type: "u64" },
    { name: "materialized_portfolio_count", type: "u64" },
    { name: "stale_certificate_count", type: "u64" },
    { name: "b_stale_account_count", type: "u64" },
    { name: "negative_pnl_account_count", type: "u64" },
    { name: "risk_epoch", type: "u64" },
    { name: "asset_set_epoch", type: "u64" },
    { name: "asset_activation_count", type: "u64" },
    { name: "last_asset_activation_slot", type: "u64" },
    { name: "next_market_id", type: "u64" },
    { name: "oracle_epoch", type: "u64" },
    { name: "funding_epoch", type: "u64" },
    { name: "slot_last", type: "u64" },
    { name: "current_slot", type: "u64" },
    { name: "bankruptcy_hlock_active", type: "u8" },
    { name: "threshold_stress_active", type: "u8" },
    { name: "loss_stale_active", type: "u8" },
    { name: "recovery_reason", type: { struct: OPTIONAL_RECOVERY_REASON } },
    { name: "mode", type: "u8" },
    { name: "resolved_slot", type: "u64" },
    { name: "payout_snapshot", type: "u128" },
    { name: "payout_snapshot_pnl_pos_tot", type: "u128" },
    { name: "payout_snapshot_captured", type: "u8" },
    { name: "resolved_payout_ledger", type: { struct: RESOLVED_PAYOUT_LEDGER } },
  ],
};

export const SOURCE_CREDIT_STATE: Struct = {
  name: "SourceCreditStateV16Account",
  fields: [
    { name: "positive_claim_bound_num", type: "u128" },
    { name: "exact_positive_claim_num", type: "u128" },
    { name: "fresh_reserved_backing_num", type: "u128" },
    { name: "spent_backing_num", type: "u128" },
    { name: "provider_receivable_num", type: "u128" },
    { name: "valid_liened_backing_num", type: "u128" },
    { name: "impaired_liened_backing_num", type: "u128" },
    { name: "insurance_credit_reserved_num", type: "u128" },
    { name: "valid_liened_insurance_num", type: "u128" },
    { name: "impaired_liened_insurance_num", type: "u128" },
    { name: "credit_rate_num", type: "u128" },
    { name: "credit_epoch", type: "u64" },
  ],
};

export const BACKING_BUCKET: Struct = {
  name: "BackingBucketV16Account",
  fields: [
    { name: "market_id", type: "u64" },
    { name: "fresh_unliened_backing_num", type: "u128" },
    { name: "valid_liened_backing_num", type: "u128" },
    { name: "consumed_liened_backing_num", type: "u128" },
    { name: "impaired_liened_backing_num", type: "u128" },
    { name: "utilization_fee_earnings", type: "u128" },
    { name: "expiry_slot", type: "u64" },
    { name: "status", type: "u8" },
  ],
};

export const INSURANCE_CREDIT_RESERVATION: Struct = {
  name: "InsuranceCreditReservationV16Account",
  fields: [
    { name: "insurance_credit_reserved_num", type: "u128" },
    { name: "valid_liened_insurance_num", type: "u128" },
    { name: "impaired_liened_insurance_num", type: "u128" },
    { name: "consumed_insurance_num", type: "u128" },
    { name: "source_credit_epoch", type: "u64" },
  ],
};

export const ASSET_STATE: Struct = {
  name: "AssetStateV16Account",
  fields: [
    { name: "market_id", type: "u64" },
    { name: "retired_slot", type: "u64" },
    { name: "lifecycle", type: "u8" },
    { name: "raw_oracle_target_price", type: "u64" },
    { name: "effective_price", type: "u64" },
    { name: "fund_px_last", type: "u64" },
    { name: "slot_last", type: "u64" },
    { name: "a_long", type: "u128" },
    { name: "a_short", type: "u128" },
    { name: "k_long", type: "i128" },
    { name: "k_short", type: "i128" },
    { name: "f_long_num", type: "i128" },
    { name: "f_short_num", type: "i128" },
    { name: "kf_epoch_long", type: "u64" },
    { name: "kf_epoch_short", type: "u64" },
    { name: "k_epoch_start_long", type: "i128" },
    { name: "k_epoch_start_short", type: "i128" },
    { name: "f_epoch_start_long_num", type: "i128" },
    { name: "f_epoch_start_short_num", type: "i128" },
    { name: "b_long_num", type: "u128" },
    { name: "b_short_num", type: "u128" },
    { name: "b_epoch_start_long_num", type: "u128" },
    { name: "b_epoch_start_short_num", type: "u128" },
    { name: "oi_eff_long_q", type: "u128" },
    { name: "oi_eff_short_q", type: "u128" },
    { name: "stored_pos_count_long", type: "u64" },
    { name: "stored_pos_count_short", type: "u64" },
    { name: "stale_account_count_long", type: "u64" },
    { name: "stale_account_count_short", type: "u64" },
    { name: "pending_obligation_count_long", type: "u64" },
    { name: "pending_obligation_count_short", type: "u64" },
    { name: "loss_weight_sum_long", type: "u128" },
    { name: "loss_weight_sum_short", type: "u128" },
    { name: "social_loss_remainder_long_num", type: "u128" },
    { name: "social_loss_remainder_short_num", type: "u128" },
    { name: "social_loss_dust_long_num", type: "u128" },
    { name: "social_loss_dust_short_num", type: "u128" },
    { name: "explicit_unallocated_loss_long", type: "u128" },
    { name: "explicit_unallocated_loss_short", type: "u128" },
    { name: "epoch_long", type: "u64" },
    { name: "epoch_short", type: "u64" },
    { name: "mode_long", type: "u8" },
    { name: "mode_short", type: "u8" },
  ],
};

export const ENGINE_ASSET_SLOT: Struct = {
  name: "EngineAssetSlotV16Account",
  fields: [
    { name: "asset", type: { struct: ASSET_STATE } },
    { name: "insurance_domain_budget_long", type: "u128" },
    { name: "insurance_domain_budget_short", type: "u128" },
    { name: "insurance_domain_spent_long", type: "u128" },
    { name: "insurance_domain_spent_short", type: "u128" },
    { name: "pending_domain_loss_barrier_long", type: "u64" },
    { name: "pending_domain_loss_barrier_short", type: "u64" },
    { name: "source_credit_long", type: { struct: SOURCE_CREDIT_STATE } },
    { name: "source_credit_short", type: { struct: SOURCE_CREDIT_STATE } },
    { name: "backing_long", type: { struct: BACKING_BUCKET } },
    { name: "backing_short", type: { struct: BACKING_BUCKET } },
    { name: "insurance_reservation_long", type: { struct: INSURANCE_CREDIT_RESERVATION } },
    { name: "insurance_reservation_short", type: { struct: INSURANCE_CREDIT_RESERVATION } },
    // The engine's master branch later added provider_principal_{long,short}_num here.
    // The pinned commit (see constants.ts) does not have them; scripts/verify-layouts.mjs
    // checks this file against that commit.
  ],
};

// ---------------------------------------------------------------------------
// Wrapper structs (percolator-prog/src/v16_program.rs `state`)
// ---------------------------------------------------------------------------

export const WRAPPER_CONFIG: Struct = {
  name: "WrapperConfigV16",
  fields: [
    { name: "marketauth", type: B32 },
    { name: "collateral_mint", type: B32 },
    { name: "secondary_collateral_mint", type: B32 },
    { name: "maintenance_fee_per_slot", type: "u128" },
    { name: "permissionless_market_init_fee", type: "u128" },
    { name: "trade_fee_base_bps", type: "u64" },
    { name: "permissionless_resolve_stale_slots", type: "u64" },
    { name: "force_close_delay_slots", type: "u64" },
    { name: "last_good_oracle_slot", type: "u64" },
    { name: "terminal_slab_scan_progress", type: "u128" },
    { name: "_reserved_insurance_withdraw_max_bps", type: "u16" },
    { name: "liquidation_cranker_fee_share_bps", type: "u16" },
    { name: "maintenance_cranker_fee_share_bps", type: "u16" },
    { name: "backing_trade_fee_bps_long", type: "u16" },
    { name: "unit_scale", type: "u32" },
    { name: "conf_filter_bps", type: "u16" },
    { name: "backing_trade_fee_bps_short", type: "u16" },
    { name: "_reserved_insurance_withdraw_deposits_only", type: "u8" },
    { name: "oracle_mode", type: "u8" },
    { name: "oracle_leg_count", type: "u8" },
    { name: "oracle_leg_flags", type: "u8" },
    { name: "invert", type: "u8" },
    { name: "_padding0", type: "u8" },
    { name: "free_market_slot_count", type: "u16" },
    { name: "_reserved_insurance_withdraw_cooldown_slots", type: "u64" },
    { name: "_reserved_last_insurance_withdraw_slot", type: "u64" },
    { name: "max_staleness_secs", type: "u64" },
    { name: "hybrid_soft_stale_slots", type: "u64" },
    { name: "mark_ewma_e6", type: "u64" },
    { name: "mark_ewma_last_slot", type: "u64" },
    { name: "mark_ewma_halflife_slots", type: "u64" },
    { name: "mark_min_fee", type: "u64" },
    { name: "oracle_target_price_e6", type: "u64" },
    { name: "oracle_target_publish_time", type: "i64" },
    { name: "oracle_leg_feeds", type: { array: B32, len: ORACLE_LEG_CAP } },
    { name: "oracle_leg_prices_e6", type: { array: "u64", len: ORACLE_LEG_CAP } },
    { name: "oracle_leg_publish_times", type: { array: "i64", len: ORACLE_LEG_CAP } },
    { name: "backing_trade_fee_policy_count", type: "u16" },
    { name: "backing_trade_fee_insurance_share_bps_long", type: "u16" },
    { name: "backing_trade_fee_insurance_share_bps_short", type: "u16" },
    { name: "fee_redirect_to_market_0_bps", type: "u16" },
    { name: "matcher_req_seq", type: "u64" },
    { name: "next_portfolio_id", type: "u64" },
  ],
};

export const ASSET_ORACLE_PROFILE: Struct = {
  name: "AssetOracleProfileV16",
  fields: [
    { name: "oracle_mode", type: "u8" },
    { name: "oracle_leg_count", type: "u8" },
    { name: "oracle_leg_flags", type: "u8" },
    { name: "invert", type: "u8" },
    { name: "unit_scale", type: "u32" },
    { name: "conf_filter_bps", type: "u16" },
    { name: "backing_trade_fee_bps_long", type: "u16" },
    { name: "backing_trade_fee_bps_short", type: "u16" },
    { name: "backing_trade_fee_insurance_share_bps_long", type: "u16" },
    { name: "backing_trade_fee_insurance_share_bps_short", type: "u16" },
    { name: "price_move_remainder_bps_num", type: "u16" },
    { name: "effective_price_provenance", type: "u8" },
    { name: "_padding0", type: { bytes: 3 } },
    { name: "insurance_authority", type: B32 },
    { name: "insurance_operator", type: B32 },
    { name: "backing_bucket_authority", type: B32 },
    { name: "oracle_authority", type: B32 },
    { name: "max_staleness_secs", type: "u64" },
    { name: "hybrid_soft_stale_slots", type: "u64" },
    { name: "mark_ewma_e6", type: "u64" },
    { name: "mark_ewma_last_slot", type: "u64" },
    { name: "mark_ewma_halflife_slots", type: "u64" },
    { name: "mark_min_fee", type: "u64" },
    { name: "oracle_target_price_e6", type: "u64" },
    { name: "oracle_target_publish_time", type: "i64" },
    { name: "last_good_oracle_slot", type: "u64" },
    { name: "oracle_leg_feeds", type: { array: B32, len: ORACLE_LEG_CAP } },
    { name: "oracle_leg_prices_e6", type: { array: "u64", len: ORACLE_LEG_CAP } },
    { name: "oracle_leg_publish_times", type: { array: "i64", len: ORACLE_LEG_CAP } },
    { name: "asset_admin", type: B32 },
    { name: "funding_mark_e6", type: "u64" },
    { name: "funding_mark_pending_e6", type: "u64" },
    { name: "funding_mark_pending_slot", type: "u64" },
  ],
};

export const ASSET_CONTROL_SEQUENCES: Struct = {
  name: "AssetControlSequencesV16",
  fields: [
    { name: "oracle_observation", type: "u64" },
    { name: "backing_fee", type: "u64" },
    { name: "authority_epoch", type: "u64" },
    { name: "trade_fee", type: "u64" },
    { name: "liquidation_fee", type: "u64" },
    { name: "maintenance_fee", type: "u64" },
    { name: "fee_redirect", type: "u64" },
    { name: "market_init_fee", type: "u64" },
    { name: "permissionless_resolve", type: "u64" },
    { name: "insurance_top_up", type: "u64" },
    { name: "backing_top_up", type: "u64" },
  ],
};

/** One asset slot as stored in the market account: 512-byte wrapper lane + engine slot. */
export const MARKET_ASSET_SLOT: Struct = {
  name: "Market<AssetOracleStorageV16>",
  fields: [
    { name: "oracle_profile", type: { struct: ASSET_ORACLE_PROFILE } },
    { name: "control_sequences", type: { struct: ASSET_CONTROL_SEQUENCES } },
    { name: "engine", type: { struct: ENGINE_ASSET_SLOT } },
  ],
};

export const PORTFOLIO_MATCHER_CONFIG: Struct = {
  name: "PortfolioMatcherConfigV16",
  fields: [
    { name: "matcher_program", type: B32 },
    { name: "matcher_context", type: B32 },
    { name: "matcher_delegate", type: B32 },
    { name: "control", type: "u64" },
  ],
};

export const BACKING_DOMAIN_LEDGER: Struct = {
  name: "BackingDomainLedgerAccountV16",
  fields: [
    { name: "market_group", type: B32 },
    { name: "authority", type: B32 },
    { name: "total_principal_atoms", type: "u128" },
    { name: "total_deposited_atoms", type: "u128" },
    { name: "total_principal_withdrawn_atoms", type: "u128" },
    { name: "total_earnings_atoms", type: "u128" },
    { name: "total_earnings_withdrawn_atoms", type: "u128" },
    { name: "last_observed_bucket_earnings_atoms", type: "u128" },
    { name: "cumulative_loss_atoms", type: "u128" },
    { name: "cumulative_recovery_atoms", type: "u128" },
    { name: "last_observed_unavailable_principal_atoms", type: "u128" },
    { name: "domain", type: "u16" },
    { name: "_padding", type: { bytes: 14 } },
  ],
};

// ---------------------------------------------------------------------------
// Derived sizes and offsets
// ---------------------------------------------------------------------------

import {
  HEADER_LEN,
  MARKET_GROUP_OFF,
  PORTFOLIO_MATCHER_CONFIG_LEN,
} from "./constants.js";

export const PORTFOLIO_STATE_LEN = structSize(PORTFOLIO_STATE);
export const MARKET_GROUP_LEN = structSize(MARKET_GROUP_HEADER);
export const MARKET_ASSET_SLOT_LEN = structSize(MARKET_ASSET_SLOT);
export const ENGINE_ASSET_SLOT_LEN = structSize(ENGINE_ASSET_SLOT);

export const PORTFOLIO_ENGINE_ACCOUNT_LEN = HEADER_LEN + PORTFOLIO_STATE_LEN;
export const PORTFOLIO_MATCHER_CONFIG_OFF = PORTFOLIO_ENGINE_ACCOUNT_LEN;
export const PORTFOLIO_MATCHER_CONTROL_OFF = PORTFOLIO_MATCHER_CONFIG_OFF + 96;
export const PORTFOLIO_ID_OFF = PORTFOLIO_MATCHER_CONFIG_OFF + PORTFOLIO_MATCHER_CONFIG_LEN;
export const PORTFOLIO_MATCHER_SEQUENCE_OFF = PORTFOLIO_ID_OFF + 8;
export const PORTFOLIO_LEGACY_ACCOUNT_LEN = PORTFOLIO_MATCHER_SEQUENCE_OFF;
export const PORTFOLIO_MATCHER_EXPIRY_OFF = PORTFOLIO_MATCHER_SEQUENCE_OFF + 8;
export const PORTFOLIO_PRE_EXPIRY_ACCOUNT_LEN = PORTFOLIO_MATCHER_EXPIRY_OFF;
/** Full portfolio account size the program expects (`PORTFOLIO_ACCOUNT_LEN`). */
export const PORTFOLIO_ACCOUNT_LEN = PORTFOLIO_MATCHER_EXPIRY_OFF + 8;

export const MIN_MARKET_ACCOUNT_LEN = MARKET_GROUP_OFF + MARKET_GROUP_LEN;

export function marketAccountLenForCapacity(capacity: number): number {
  return MARKET_GROUP_OFF + MARKET_GROUP_LEN + capacity * MARKET_ASSET_SLOT_LEN;
}

export function marketAssetSlotOffset(assetIndex: number): number {
  return MARKET_GROUP_OFF + MARKET_GROUP_LEN + assetIndex * MARKET_ASSET_SLOT_LEN;
}

export function marketSlotCapacityFromLen(accountLen: number): number {
  if (accountLen < MIN_MARKET_ACCOUNT_LEN) {
    throw new RangeError(`market account too short: ${accountLen}`);
  }
  const trailing = accountLen - MIN_MARKET_ACCOUNT_LEN;
  if (trailing % MARKET_ASSET_SLOT_LEN !== 0) {
    throw new RangeError(
      `market account length ${accountLen} is not header + N * ${MARKET_ASSET_SLOT_LEN}; layout mismatch with deployed program`,
    );
  }
  return trailing / MARKET_ASSET_SLOT_LEN;
}

// ---------------------------------------------------------------------------
// Generic decode
// ---------------------------------------------------------------------------

import {
  readBytes,
  readI128,
  readI64,
  readU128,
  readU16,
  readU32,
  readU64,
  readU8,
} from "./bytes.js";

export type Decoded = { [k: string]: DecodedValue };
export type DecodedValue = number | bigint | Uint8Array | Decoded | DecodedValue[];

export function decodeValue(t: FieldType, b: Uint8Array, offset: number): DecodedValue {
  if (typeof t === "string") {
    switch (t) {
      case "u8":
        return readU8(b, offset);
      case "u16":
        return readU16(b, offset);
      case "u32":
        return readU32(b, offset);
      case "u64":
        return readU64(b, offset);
      case "u128":
        return readU128(b, offset);
      case "i64":
        return readI64(b, offset);
      case "i128":
        return readI128(b, offset);
    }
  }
  if ("bytes" in t) return readBytes(b, offset, t.bytes);
  if ("array" in t) {
    const out: DecodedValue[] = [];
    const stride = sizeOf(t.array);
    for (let i = 0; i < t.len; i++) out.push(decodeValue(t.array, b, offset + i * stride));
    return out;
  }
  return decodeStruct(t.struct, b, offset);
}

export function decodeStruct(s: Struct, b: Uint8Array, base = 0): Decoded {
  const out: Decoded = {};
  const offs = offsetsOf(s);
  for (const f of s.fields) {
    out[f.name] = decodeValue(f.type, b, base + offs[f.name]!.offset);
  }
  return out;
}
