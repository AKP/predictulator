import { formatAtoms, type MarketGroup } from "@predictulator/sdk";

export function MarketStrip({
  market,
  error,
  slot,
}: {
  market: MarketGroup | null;
  error: string | null;
  slot: number | null;
}): JSX.Element {
  if (error && !market) {
    return (
      <div className="strip warn">
        <span>Market unreachable: {error}</span>
      </div>
    );
  }
  if (!market) {
    return (
      <div className="strip">
        <span>Loading market</span>
      </div>
    );
  }
  const questions = market.assets.filter((a) => a.index !== 0).length;
  const mode = market.mode === 0 ? "Live" : market.mode === 1 ? "Resolved" : "Recovery";
  return (
    <div className="strip">
      <Stat label="Vault" value={formatAtoms(market.vault)} />
      <Stat label="Insurance" value={formatAtoms(market.insurance)} />
      <Stat label="Capital" value={formatAtoms(market.cTot)} />
      <Stat label="Questions" value={String(questions)} />
      <Stat label="Portfolios" value={market.materializedPortfolioCount.toString()} />
      <Stat label="Mode" value={mode} />
      <Stat label="Slot" value={slot === null ? "—" : slot.toLocaleString()} />
      {market.lossStaleActive || market.bankruptcyHlockActive || market.thresholdStressActive ? (
        <span className="pill warn">
          {[
            market.lossStaleActive ? "loss-stale" : null,
            market.bankruptcyHlockActive ? "h-lock" : null,
            market.thresholdStressActive ? "stress" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <span className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </span>
  );
}
