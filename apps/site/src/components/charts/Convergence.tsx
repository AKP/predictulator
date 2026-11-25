import {useState} from 'react';
import {convergencePath, convergenceSlots, fmtProb} from '../../lib/protocol';
import {LineChart} from './LineChart';

/** The per-slot price cap, as the engine applies it. */
export function Convergence() {
  const [from, setFrom] = useState(0.5);
  const [cap, setCap] = useState(300);
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const target = outcome === 'YES' ? 1_000_000 : 1;
  const path = convergencePath(Math.round(from * 1_000_000), target, cap);
  const slots = convergenceSlots(Math.round(from * 1_000_000), target, cap);

  return (
    <div className="box p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="pixel text-ui">Convergence under the per-slot cap</h3>
        <span className="text-tiny text-mute">
          {slots} slots, about {(slots * 0.4).toFixed(1)} s at 400 ms
        </span>
      </div>
      <p className="mt-3 mb-4 max-w-[60ch] text-body">
        A pushed mark is a target, not a price. Each cranked slot moves the effective price by at most{' '}
        <code>max_price_move_bps_per_slot</code> of its current value. Resolution to NO takes longer than to YES
        because the step shrinks with the price.
      </p>
      <LineChart
        series={[{name: 'effective price', points: path.map((p, i) => ({x: i, y: p / 1_000_000})), area: true, endMarker: true}]}
        xLabel="slot"
        yLabel="P(YES)"
        yDomain={[0, 1]}
        xDomain={[0, Math.max(10, path.length - 1)]}
        formatX={(x) => String(Math.round(x))}
        formatY={(y) => fmtProb(y * 1_000_000, 0)}
        references={[{y: target / 1_000_000, label: `target ${outcome}`}]}
        tableCaption="Effective price by slot, computed by the engine's clamp rule."
      />
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <Control label={`start ${fmtProb(from * 1_000_000, 0)}`}>
          <input type="range" min={0.02} max={0.98} step={0.01} value={from} onChange={(e) => setFrom(Number(e.target.value))} />
        </Control>
        <Control label={`cap ${cap} bps / slot`}>
          <input type="range" min={25} max={2000} step={25} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
        </Control>
        <Control label="resolves to">
          <div className="flex border border-ink">
            {(['YES', 'NO'] as const).map((o) => (
              <button
                key={o}
                type="button"
                className={`flex-1 py-1 text-ui ${outcome === o ? 'bg-ink text-page' : ''}`}
                onClick={() => setOutcome(o)}
              >
                {o}
              </button>
            ))}
          </div>
        </Control>
      </div>
    </div>
  );
}

export function Control({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <label className="block">
      <span className="mb-2 block text-tiny uppercase text-mute">{label}</span>
      {children}
    </label>
  );
}
