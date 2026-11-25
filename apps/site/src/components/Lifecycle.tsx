import {lifecycle} from '../content';
import {Section} from './Section';

export function Lifecycle() {
  return (
    <Section id="lifecycle" index="02" title="How a question lives and dies" kicker="eight steps, five instructions">
      <p className="mb-8 max-w-[62ch] text-body">
        The chain only ever sees an asset slot, a generation id, and a probability mark. Everything below is a
        choreography of stock Percolator instructions: nothing on chain was modified or added.
      </p>
      <ol className="grid grid-cols-1 gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
        {lifecycle.map((s) => (
          <li key={s.n} className="flex flex-col bg-page p-5">
            <div className="flex items-baseline justify-between">
              <span className="pixel text-ui">{s.n}</span>
              <span className="text-tiny uppercase text-mute">{s.who}</span>
            </div>
            <h3 className="pixel mt-4 text-[clamp(16px,1.4vw,20px)]">{s.title}</h3>
            <p className="mt-3 flex-1 text-body">{s.what}</p>
            <code className="mt-4 block border-t border-rule pt-3 text-tiny text-mute">{s.ix}</code>
          </li>
        ))}
      </ol>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <Note title="Why convergence matters">
          PushAuthMark sets the raw target. The engine moves the effective price toward it by at most the per-slot cap.
          Shutdown freezes the effective price. Shut down one slot too early and the question settles at a lagged
          price. The resolver waits for <code>effective == target</code> before it sends SHUTDOWN.
        </Note>
        <Note title="Why the NO floor is 0.000001">
          The engine rejects a zero price. NO resolves to one atom per share rather than zero. At any realistic size the
          residue is dust, and the SDK&rsquo;s payoff math accounts for it exactly.
        </Note>
        <Note title="Why generations">
          Slots are reused. Each activation gets a new <code>market_id</code>; every leg, trade, and manifest binds the
          pair. A stale signed intent from a retired question cannot touch its successor.
        </Note>
      </div>
    </Section>
  );
}

function Note({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <div className="box p-5">
      <div className="pixel text-ui">{title}</div>
      <p className="mt-3 text-body">{children}</p>
    </div>
  );
}
