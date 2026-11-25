import {useState} from 'react';
import {fmtProb, fmtUnits, pnlPerShare} from '../../lib/protocol';
import {Control} from './Convergence';
import {LineChart} from './LineChart';

/** Per-share profit of YES and NO across every final mark, for one entry price. */
export function Payoff() {
  const [entry, setEntry] = useState(0.62);
  const e6 = Math.round(entry * 1_000_000);
  const marks = Array.from({length: 101}, (_, i) => Math.max(1, Math.round((i / 100) * 1_000_000)));
  const yes = marks.map((m) => ({x: m / 1_000_000, y: pnlPerShare('YES', e6, m)}));
  const no = marks.map((m) => ({x: m / 1_000_000, y: pnlPerShare('NO', e6, m)}));

  return (
    <div className="box p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="pixel text-ui">Payoff per share</h3>
        <span className="text-tiny text-mute">
          YES pays {fmtUnits(1 - entry)} if right, loses {fmtUnits(entry - 0.000001, 6)} if wrong
        </span>
      </div>
      <p className="mt-3 mb-4 max-w-[60ch] text-body">
        One share of YES at <code>p</code> costs <code>p</code> and pays 1.000000 on YES. NO is the short of the same
        asset. The lines cross at the entry price and are mirror images, down to the one-atom floor.
      </p>
      <LineChart
        series={[
          {name: 'YES at entry', points: yes},
          {name: 'NO at entry', points: no, dash: '5 4'},
        ]}
        xLabel="final mark"
        yLabel="profit per share"
        xDomain={[0, 1]}
        yDomain={[-1, 1]}
        formatX={(x) => fmtProb(x * 1_000_000, 0)}
        formatY={(y) => fmtUnits(y, 2)}
        references={[{y: 0, label: 'break even'}]}
        tableCaption="Profit per share at each final mark, from the SDK's pnlAtMark."
      />
      <div className="mt-5 max-w-[320px]">
        <Control label={`entry ${fmtProb(e6, 0)}`}>
          <input type="range" min={0.01} max={0.99} step={0.01} value={entry} onChange={(e) => setEntry(Number(e.target.value))} />
        </Control>
      </div>
    </div>
  );
}
