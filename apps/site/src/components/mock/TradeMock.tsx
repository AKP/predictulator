import {useMemo, useState} from 'react';
import {fmtUnits} from '../../lib/protocol';
import {ScanField} from '../ScanField';
import {EXAMPLES, FEE_BPS, INITIAL_MARGIN_BPS, SPREAD} from './questions';
import {Window} from './Window';

/**
 * The trading page, as a mockup. The list, the detail, the ticket. Numbers
 * come from the same formulas the real page uses: notional, fee, margin,
 * worst case, payout. The chart is the scanline shader seeded per question.
 */
export function TradeMock() {
  const [slot, setSlot] = useState(EXAMPLES[0]!.slot);
  const [side, setSide] = useState<'YES' | 'NO'>('YES');
  const [shares, setShares] = useState(25);
  const q = EXAMPLES.find((x) => x.slot === slot) ?? EXAMPLES[0]!;

  const ask = Math.min(0.99, q.p + SPREAD / 2);
  const bid = Math.max(0.01, q.p - SPREAD / 2);
  const t = useMemo(() => {
    const price = side === 'YES' ? ask : 1 - bid; // what the taker pays per share
    const cost = shares * price;
    const fee = (shares * (side === 'YES' ? ask : bid) * FEE_BPS) / 10_000;
    const margin = (cost * INITIAL_MARGIN_BPS) / 10_000;
    const maxLoss = side === 'YES' ? shares * (ask - 0.000001) : shares * (1 - bid);
    return {price, cost, fee, margin, payout: shares, maxLoss};
  }, [side, shares, ask, bid]);

  return (
    <Window title="predictulator · trading page">
      <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* list */}
        <ul className="border-b border-ink md:border-r md:border-b-0">
          {EXAMPLES.map((x) => (
            <li key={x.slot}>
              <button
                type="button"
                onClick={() => {
                  setSlot(x.slot);
                  setShares(25);
                }}
                className={`flex w-full items-start gap-3 border-b border-rule px-4 py-3 text-left last:border-b-0 ${x.slot === slot ? 'bg-well' : 'hover:bg-well/60'}`}
                aria-pressed={x.slot === slot}
              >
                <span className="pixel mt-0.5 min-w-[3.2ch] text-[clamp(16px,1.4vw,20px)] leading-none">{Math.round(x.p * 100)}%</span>
                <span className="min-w-0">
                  <span className="block text-body leading-snug">{x.title}</span>
                  <span className="mt-1 block text-tiny text-mute">
                    OI {x.oiYes.toLocaleString()} · closes {x.closesAt} · {x.tags.join(', ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* detail */}
        <div className="min-w-0 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="pill open">open</span>
            <span className="text-tiny text-mute">
              slot {q.slot} · gen {q.gen}
            </span>
          </div>
          <h3 className="mt-2 text-[clamp(15px,1.3vw,18px)] leading-snug">{q.title}</h3>
          <p className="mt-2 text-tiny text-mute">{q.criteria}</p>

          <ScanField
            key={q.slot}
            className="mt-4 h-[160px] w-full"
            start={q.p}
            seed={q.seed}
            resolves={false}
            showLabel={false}
            lines={60}
          />

          <dl className="mt-3 grid grid-cols-3 gap-2 text-tiny">
            <div>
              <dt className="text-mute">YES realizable</dt>
              <dd>100%</dd>
            </div>
            <div>
              <dt className="text-mute">NO realizable</dt>
              <dd>100%</dd>
            </div>
            <div>
              <dt className="text-mute">bid / ask</dt>
              <dd>
                {Math.round(bid * 100)}% / {Math.round(ask * 100)}%
              </dd>
            </div>
          </dl>

          {/* ticket */}
          <div className="mt-4 border-t border-ink pt-3">
            <div className="seg">
              <button type="button" className={side === 'YES' ? 'on' : ''} onClick={() => setSide('YES')}>
                YES {Math.round(ask * 100)}¢
              </button>
              <button type="button" className={side === 'NO' ? 'on' : ''} onClick={() => setSide('NO')}>
                NO {Math.round((1 - bid) * 100)}¢
              </button>
            </div>
            <label className="field">
              <span>shares</span>
              <input type="range" min={1} max={100} step={1} value={shares} onChange={(e) => setShares(Number(e.target.value))} />
            </label>
            <dl className="kv compact">
              <dt>shares</dt>
              <dd>{shares}</dd>
              <dt>price</dt>
              <dd>{fmtUnits(t.price, 2)} per share</dd>
              <dt>cost now</dt>
              <dd>{fmtUnits(t.cost, 2)}</dd>
              <dt>fee</dt>
              <dd>{fmtUnits(t.fee, 4)} ({FEE_BPS} bps)</dd>
              <dt>initial margin</dt>
              <dd>{fmtUnits(t.margin, 2)} ({INITIAL_MARGIN_BPS / 100}%)</dd>
              <dt>pays if right</dt>
              <dd>{fmtUnits(t.payout, 2)}</dd>
              <dt>max loss</dt>
              <dd>{fmtUnits(t.maxLoss, 2)}</dd>
            </dl>
            <button type="button" className="mt-3 w-full bg-ink py-2 text-ui text-page" disabled title="Mockup: no live market">
              Sign and send to maker
            </button>
            <p className="mt-2 text-tiny text-mute">
              Your wallet signs a bilateral trade against the maker&rsquo;s portfolio. The maker co-signs if price and
              size still match its quote. Nothing is custodied.
            </p>
          </div>
        </div>
      </div>
    </Window>
  );
}
