import {useMemo, useState} from 'react';
import {creditRate, fmtUnits} from '../../lib/protocol';
import {EXAMPLES} from './questions';
import {Window} from './Window';

/**
 * Cross-margin portfolio with containment made visible. Three positions on
 * three questions share one collateral balance. Drag the slider to collapse
 * the NO side's backing on one question: only that position's realizable
 * profit falls. The other two, and the capital, are untouched.
 */
interface Pos {
  slot: number;
  side: 'YES' | 'NO';
  shares: number;
  entry: number; // YES price at entry
}

const POSITIONS: Pos[] = [
  {slot: 1, side: 'YES', shares: 120, entry: 0.55},
  {slot: 2, side: 'NO', shares: 80, entry: 0.46},
  {slot: 3, side: 'YES', shares: 50, entry: 0.7},
];
const CAPITAL = 500;
const MAINT_BPS = 2_500;

export function PortfolioMock() {
  const [backing, setBacking] = useState(1); // Q2 NO-side backing as a fraction of YES claims
  const rows = useMemo(
    () =>
      POSITIONS.map((p) => {
        const q = EXAMPLES.find((x) => x.slot === p.slot)!;
        const mark = q.p;
        const pnl = p.side === 'YES' ? p.shares * (mark - p.entry) : p.shares * (p.entry - mark);
        // Containment applies to positive PnL only; the stressed domain here is question 2's NO side,
        // which backs YES profit. Our position on Q2 is NO, so we stress Q1 instead for the demo? No:
        // keep the demo literal. The slider weakens the side that backs each winning position on Q1.
        const rate = p.slot === 1 && pnl > 0 ? creditRate(backing, 1) : 1;
        const realizable = pnl > 0 ? pnl * rate : pnl;
        const notional = p.shares * mark;
        return {...p, q, mark, pnl, rate, realizable, notional};
      }),
    [backing],
  );
  const paperPnl = rows.reduce((a, r) => a + r.pnl, 0);
  const realizablePnl = rows.reduce((a, r) => a + r.realizable, 0);
  const equity = CAPITAL + realizablePnl;
  const maintenance = rows.reduce((a, r) => a + (r.notional * MAINT_BPS) / 10_000, 0);
  const health = Math.max(0, Math.min(1, (equity - maintenance) / equity));

  return (
    <Window title="predictulator · portfolio">
      <div className="grid gap-0 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0 p-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="capital" value={fmtUnits(CAPITAL, 2)} />
            <Stat label="equity" value={fmtUnits(equity, 2)} />
            <Stat label="maintenance" value={fmtUnits(maintenance, 2)} />
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-tiny text-mute">
              <span>health</span>
              <span>{Math.round(health * 100)}% above maintenance</span>
            </div>
            <div className="mt-1 h-[8px] border border-ink">
              <div className="h-full bg-ink" style={{width: `${health * 100}%`}} />
            </div>
          </div>

          <table className="tbl mt-4">
            <thead>
              <tr>
                <th>position</th>
                <th>mark</th>
                <th>paper</th>
                <th>realizable</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.slot}>
                  <td>
                    <span className={`pill ${r.side.toLowerCase()}`}>{r.side}</span>{' '}
                    <span className="text-tiny">{r.shares} sh</span>
                    <div className="mt-1 text-tiny text-mute">{r.q.title}</div>
                  </td>
                  <td className="whitespace-nowrap">{Math.round(r.mark * 100)}%</td>
                  <td className={`whitespace-nowrap ${r.pnl < 0 ? 'neg' : 'pos'}`}>{fmtUnits(r.pnl, 2)}</td>
                  <td className="whitespace-nowrap">
                    {fmtUnits(r.realizable, 2)}
                    {r.rate < 1 && <span className="ml-1 text-tiny text-mute">({Math.round(r.rate * 100)}%)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="text-mute" colSpan={2}>
                  total
                </td>
                <td className={paperPnl < 0 ? 'neg' : 'pos'}>{fmtUnits(paperPnl, 2)}</td>
                <td>{fmtUnits(realizablePnl, 2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="border-t border-ink p-4 md:border-t-0 md:border-l">
          <div className="pixel text-ui">Stress one question</div>
          <p className="mt-2 text-tiny text-mute">
            Collapse the NO side&rsquo;s reserved backing on question 1. The engine lowers that domain&rsquo;s credit
            rate; the YES position&rsquo;s profit becomes partly unrealizable. Nothing else moves.
          </p>
          <label className="field mt-4">
            <span>Q1 NO-side backing: {Math.round(backing * 100)}% of YES claims</span>
            <input type="range" min={0} max={1} step={0.05} value={backing} onChange={(e) => setBacking(Number(e.target.value))} />
          </label>
          <dl className="kv compact mt-3">
            <dt>Q1 credit rate</dt>
            <dd>{Math.round(creditRate(backing, 1) * 100)}%</dd>
            <dt>Q1 profit waiting</dt>
            <dd>{fmtUnits(rows[0]!.pnl - rows[0]!.realizable, 2)}</dd>
            <dt>Q2, Q3 affected</dt>
            <dd>no</dd>
            <dt>capital affected</dt>
            <dd>no</dd>
          </dl>
          <p className="mt-4 text-tiny text-mute">
            On a perp DEX with socialized loss, the same event is paid by every account in the vault. Here it is a
            claim on collateral that does not exist yet, owed by question 1&rsquo;s shorts and nobody else.
          </p>
        </div>
      </div>
    </Window>
  );
}

function Stat({label, value}: {label: string; value: string}) {
  return (
    <div>
      <div className="pixel text-[clamp(16px,1.6vw,22px)] leading-none">{value}</div>
      <div className="mt-1 text-tiny uppercase text-mute">{label}</div>
    </div>
  );
}
