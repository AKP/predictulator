import {useState} from 'react';
import {fmtProb, fmtUnits, postedPerShare, worstCasePerShare} from '../../lib/protocol';
import {Control} from './Convergence';
import {LineChart} from './LineChart';

/**
 * The honest chart: margin is a share of notional, so a short at a low
 * probability posts less than it can lose. This is what the per-slot cap,
 * liquidation, insurance, and realizable credit exist to cover.
 */
export function MarginGap() {
  const [marginBps, setMarginBps] = useState(10_000);
  const ps = Array.from({length: 99}, (_, i) => (i + 1) * 10_000);
  const posted = ps.map((p) => ({x: p / 1_000_000, y: postedPerShare(p, marginBps)}));
  const worstShort = ps.map((p) => ({x: p / 1_000_000, y: worstCasePerShare('NO', p)}));
  const worstLong = ps.map((p) => ({x: p / 1_000_000, y: worstCasePerShare('YES', p)}));

  return (
    <div className="box p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="pixel text-ui">Posted margin against worst case</h3>
        <span className="text-tiny text-mute">initial margin {marginBps / 100}% of notional</span>
      </div>
      <div className="mt-3 grid gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <p className="max-w-[60ch] text-body">
            At 100% initial margin a long is exactly covered. A short at a low probability is not: it posts the price
            but can lose one minus the price. Percolator treats that the way every perp does, and adds one thing no
            perp has: the winners of that question can only realize what its losers actually reserved.
          </p>
          <p className="mt-3 max-w-[60ch] text-body text-mute">
            A bounded-outcome margin rule, posting max(p, 1 − p) per share, would close the gap. It needs an engine
            change and sits on the roadmap.
          </p>
          <div className="mt-6 max-w-[320px]">
            <Control label={`initial margin ${marginBps / 100}%`}>
              <input type="range" min={1000} max={10000} step={500} value={marginBps} onChange={(e) => setMarginBps(Number(e.target.value))} />
            </Control>
          </div>
        </div>
        <LineChart
          series={[
            {name: 'posted (either side)', points: posted},
            {name: 'worst case, NO', points: worstShort, dash: '5 4'},
            {name: 'worst case, YES', points: worstLong, dash: '1 3'},
          ]}
          xLabel="entry price"
          yLabel="collateral per share"
          xDomain={[0, 1]}
          yDomain={[0, 1]}
          formatX={(x) => fmtProb(x * 1_000_000, 0)}
          formatY={(y) => fmtUnits(y, 2)}
          tableCaption="Collateral posted versus the maximum loss, per share, by entry price."
          endLabels={false}
        />
      </div>
    </div>
  );
}
