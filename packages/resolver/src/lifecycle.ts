/**
 * Question lifecycle as a pure decision function.
 *
 * Chain facts come from `QuestionState` (decoded market account), human facts
 * from the manifest and the resolver's own decision log. The output is the
 * single next action the resolver should take for that question, or none.
 *
 * On-chain path for one question:
 *
 *   Active/Manual  --ConfigureAuthMark-->  Active/AuthMark
 *   Active/AuthMark --PushAuthMark(p)-->   (engine converges effective -> target)
 *   closesAt reached, decision recorded --PushAuthMark(1.0 or 0.000001)-->
 *   converged --UpdateAssetLifecycle(SHUTDOWN)--> Recovery, mark frozen
 *   Recovery + force_close_delay elapsed --ForceCloseAbandonedAsset x N (keeper)--> OI zero
 *   OI zero --UpdateAssetLifecycle(RETIRE) (marketauth)--> Retired, slot reusable
 */
import { OracleMode, type Outcome, type QuestionManifest, type QuestionState } from "@predictulator/sdk";

export interface Decision {
  outcome: Outcome;
  decidedAt: string;
  note?: string;
}

export interface LifecycleInput {
  state: QuestionState;
  manifest: QuestionManifest;
  decision: Decision | null;
  /** Latest fair probability the mark source reports, if any. */
  fairProbabilityE6: bigint | null;
  nowMs: number;
  nowSlot: bigint;
  /** Minimum mark change (e6) worth a transaction. */
  minMarkDeltaE6: bigint;
  /** Resolver may retire slots (holds marketauth). */
  canRetire: boolean;
}

export type Action =
  | { kind: "configure_authmark"; initialMarkE6: bigint }
  | { kind: "push_mark"; markE6: bigint; reason: "fair" | "final" }
  | { kind: "await_convergence"; targetE6: bigint; effectiveE6: bigint }
  | { kind: "shutdown" }
  | { kind: "await_force_close"; remainingYes: number; remainingNo: number }
  | { kind: "retire" }
  | { kind: "done" }
  | { kind: "none"; why: string };

export function nextAction(i: LifecycleInput): Action {
  const { state, manifest, decision } = i;
  const closed = i.nowMs >= Date.parse(manifest.closesAt);

  switch (state.phase) {
    case "inactive":
      return { kind: "none", why: `asset ${state.asset.index} is ${state.asset.lifecycleName}` };

    case "retired":
      return { kind: "done" };

    case "resolved":
      return i.canRetire ? { kind: "retire" } : { kind: "done" };

    case "resolving":
      return {
        kind: "await_force_close",
        remainingYes: state.openInterestYesShares,
        remainingNo: state.openInterestNoShares,
      };

    case "open":
      break;
  }

  // Open. First make sure we are the oracle in the mode we can drive.
  if (state.asset.oracle.oracleMode !== OracleMode.AuthMark) {
    return { kind: "configure_authmark", initialMarkE6: state.probabilityE6 };
  }

  if (decision) {
    const finalMark = decision.outcome === "YES" ? 1_000_000n : 1n;
    if (state.targetE6 !== finalMark) {
      return { kind: "push_mark", markE6: finalMark, reason: "final" };
    }
    if (!state.converged) {
      return { kind: "await_convergence", targetE6: state.targetE6, effectiveE6: state.probabilityE6 };
    }
    return { kind: "shutdown" };
  }

  if (closed) {
    return { kind: "none", why: "closed, awaiting resolver decision" };
  }

  if (i.fairProbabilityE6 === null) {
    return { kind: "none", why: "no mark source" };
  }
  const delta = i.fairProbabilityE6 - state.targetE6;
  const abs = delta < 0n ? -delta : delta;
  if (abs < i.minMarkDeltaE6) {
    return { kind: "none", why: "mark within tolerance" };
  }
  return { kind: "push_mark", markE6: i.fairProbabilityE6, reason: "fair" };
}

/**
 * Slots the engine needs to move the effective price from `from` to `to`
 * under the per-slot cap, assuming cranks land every slot. Used for logging
 * and for the `await_convergence` backoff.
 */
export function convergenceSlots(fromE6: bigint, toE6: bigint, maxMoveBpsPerSlot: bigint): number {
  if (maxMoveBpsPerSlot === 0n) return Number.POSITIVE_INFINITY;
  let price = fromE6;
  let slots = 0;
  while (price !== toE6 && slots < 100_000) {
    const step = (price * maxMoveBpsPerSlot) / 10_000n || 1n;
    if (price < toE6) price = price + step > toE6 ? toE6 : price + step;
    else price = price - step < toE6 ? toE6 : price - step;
    slots++;
  }
  return slots;
}
