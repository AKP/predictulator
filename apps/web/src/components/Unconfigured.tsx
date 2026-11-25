export function Unconfigured({ missing }: { missing: string[] }): JSX.Element {
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Predictulator</span>
      </header>
      <main className="layout single">
        <section className="content">
          <h1>Not configured</h1>
          <p>
            This page shows live state from a deployed Predictulator market. No market is configured, so there is
            nothing to show yet.
          </p>
          <p>Set these variables in <code>apps/web/.env</code> and restart the dev server:</p>
          <ul className="plain">
            {missing.map((m) => (
              <li key={m}>
                <code>{m}</code>
              </li>
            ))}
          </ul>
          <p>
            The deployment runbook in <code>docs/OPERATIONS.md</code> walks through creating the market, the
            resolver, the maker, and the first question.
          </p>
        </section>
      </main>
    </div>
  );
}
