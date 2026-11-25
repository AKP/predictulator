import { formatProb } from "@predictulator/sdk";
import type { QuestionView } from "../App";
import type { PublishedQuote } from "../api";

export function QuestionList({
  views,
  quotes,
  loading,
  error,
  onSelect,
}: {
  views: QuestionView[];
  quotes: Record<number, PublishedQuote>;
  loading: boolean;
  error: string | null;
  onSelect: (key: string) => void;
}): JSX.Element {
  if (loading) return <p className="muted">Loading questions</p>;
  if (error && views.length === 0) return <p className="warn-text">Resolver unreachable: {error}</p>;
  if (views.length === 0) {
    return (
      <div>
        <h1>No questions yet</h1>
        <p className="muted">
          Questions are created on chain as Percolator asset slots and registered with the resolver. See
          <code> docs/OPERATIONS.md</code> for the create-question command.
        </p>
      </div>
    );
  }
  const open = views.filter((v) => v.state?.phase === "open");
  const rest = views.filter((v) => v.state?.phase !== "open");
  return (
    <div>
      <h1>Questions</h1>
      <ul className="cards">
        {[...open, ...rest].map((v) => {
          const m = v.signed.manifest;
          const key = `${m.assetIndex}-${m.marketId}`;
          const q = quotes[m.assetIndex];
          return (
            <li key={key}>
              <button className="card" onClick={() => onSelect(key)} type="button">
                <div className="card-head">
                  <span className={`pill ${v.state?.phase ?? "unknown"}`}>{phaseLabel(v)}</span>
                  <span className="muted small">closes {new Date(m.closesAt).toLocaleDateString()}</span>
                </div>
                <h2>{m.title}</h2>
                <div className="card-foot">
                  <span className="prob">{v.state ? formatProb(v.state.probabilityE6) : "—"}</span>
                  {q ? (
                    <span className="muted small">
                      {formatProb(BigInt(q.bidE6))} / {formatProb(BigInt(q.askE6))}
                    </span>
                  ) : (
                    <span className="muted small">no quote</span>
                  )}
                  {v.state ? (
                    <span className="muted small">
                      OI {v.state.openInterestYesShares.toLocaleString()} YES
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function phaseLabel(v: QuestionView): string {
  if (!v.state) return "not on chain";
  switch (v.state.phase) {
    case "open":
      return "open";
    case "resolving":
      return v.state.outcome ? `resolved ${v.state.outcome}, settling` : "settling";
    case "resolved":
      return v.state.outcome ? `resolved ${v.state.outcome}` : "resolved";
    case "retired":
      return "retired";
    default:
      return "inactive";
  }
}
