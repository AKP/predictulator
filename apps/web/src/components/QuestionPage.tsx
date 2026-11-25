import { formatProb, type MarketGroup, type Portfolio, type Predictulator } from "@predictulator/sdk";
import type { QuestionView } from "../App";
import type { PublishedQuote } from "../api";
import type { AppConfig } from "../config";
import { TradeTicket } from "./TradeTicket";
import { phaseLabel } from "./QuestionList";

export function QuestionPage({
  view,
  quote,
  client,
  config,
  market,
  portfolios,
  onBack,
  onTraded,
}: {
  view: QuestionView;
  quote: PublishedQuote | null;
  client: Predictulator;
  config: AppConfig;
  market: MarketGroup | null;
  portfolios: Portfolio[];
  onBack: () => void;
  onTraded: () => void;
}): JSX.Element {
  const m = view.signed.manifest;
  const s = view.state;
  const mine = portfolios[0]?.legs.find(
    (l) => l.active && l.assetIndex === m.assetIndex && l.marketId === BigInt(m.marketId),
  );
  const mineShares = mine ? Number(mine.basisPosQ < 0n ? -mine.basisPosQ : mine.basisPosQ) / 1e6 : 0;
  const minePays = mine && s ? (mine.side === 0 ? s.yesRealizable : s.noRealizable) : 0;
  return (
    <div>
      <button className="link" onClick={onBack} type="button">
        All questions
      </button>
      <div className="card-head">
        <span className={`pill ${s?.phase ?? "unknown"}`}>{phaseLabel(view)}</span>
        <span className="muted small">
          slot {m.assetIndex} · generation {m.marketId}
        </span>
      </div>
      <h1>{m.title}</h1>
      {m.description ? <p>{m.description}</p> : null}

      <div className="two-col">
        <div>
          <h3>Resolution</h3>
          <p>{m.resolutionCriteria}</p>
          {m.resolutionSource ? (
            <p className="small">
              Source: <a href={m.resolutionSource} rel="noreferrer" target="_blank">{m.resolutionSource}</a>
            </p>
          ) : null}
          <dl className="kv">
            <dt>Closes</dt>
            <dd>{new Date(m.closesAt).toLocaleString()}</dd>
            <dt>Resolves by</dt>
            <dd>{new Date(m.resolvesBy).toLocaleString()}</dd>
            <dt>Resolver</dt>
            <dd className="mono">{m.resolver}</dd>
            <dt>Creator</dt>
            <dd className="mono">{m.creator}</dd>
            <dt>Manifest hash</dt>
            <dd className="mono">{view.signed.hash}</dd>
          </dl>
        </div>
        <div>
          <h3>On chain</h3>
          {s ? (
            <dl className="kv">
              <dt>Probability</dt>
              <dd>
                <span className="prob">{formatProb(s.probabilityE6)}</span>
                {!s.converged ? <span className="muted small"> converging to {formatProb(s.targetE6)}</span> : null}
              </dd>
              <dt>Open interest</dt>
              <dd>
                {s.openInterestYesShares.toLocaleString()} YES · {s.openInterestNoShares.toLocaleString()} NO
              </dd>
              <dt>YES profit realizable</dt>
              <dd>{(s.yesRealizable * 100).toFixed(0)}%</dd>
              <dt>NO profit realizable</dt>
              <dd>{(s.noRealizable * 100).toFixed(0)}%</dd>
              <dt>Lifecycle</dt>
              <dd>{s.asset.lifecycleName}</dd>
            </dl>
          ) : (
            <p className="muted">This question is registered but its slot does not match on chain.</p>
          )}
          <p className="small muted">
            Realizable means how much of a winning side's paper profit the engine will let it withdraw or use as
            margin right now, based on collateral the losing side has actually reserved. Below 100% the winners are
            waiting on the losers' margin, not on the protocol.
          </p>
          {mine ? (
            <>
              <h3>Your position</h3>
              <dl className="kv">
                <dt>Side</dt>
                <dd>
                  <span className={`pill ${mine.side === 0 ? "yes" : "no"}`}>{mine.side === 0 ? "YES" : "NO"}</span>
                </dd>
                <dt>Shares</dt>
                <dd>{mineShares.toLocaleString()}</dd>
                <dt>Pays if right</dt>
                <dd>{mineShares.toLocaleString()} collateral units</dd>
                <dt>Profit realizable now</dt>
                <dd>{(minePays * 100).toFixed(0)}%</dd>
                {mine.stale ? (
                  <>
                    <dt>Mark</dt>
                    <dd className="muted">stale, awaiting crank</dd>
                  </>
                ) : null}
              </dl>
              <p className="small muted">Close it from the portfolio panel. The engine reduces at its effective price.</p>
            </>
          ) : null}
        </div>
      </div>

      {s?.phase === "open" && market ? (
        <TradeTicket
          view={view}
          quote={quote}
          client={client}
          config={config}
          market={market}
          portfolios={portfolios}
          onTraded={onTraded}
        />
      ) : null}
    </div>
  );
}
