import {useState} from 'react';
import {creditRate, fmtUnits} from '../lib/protocol';
import {Control} from './charts/Convergence';
import {Section} from './Section';

/**
 * The containment rule, as an instrument. Drag the losing side's reserved
 * backing below the winners' claims and watch the credit rate fall: that is
 * the fraction of paper profit the engine will let the winners realize.
 */
export function Containment() {
  const [claims, setClaims] = useState(10_000);
  const [backing, setBacking] = useState(10_000);
  const rate = creditRate(backing, claims);
  const realizable = Math.min(backing, claims);
  const stranded = Math.max(0, claims - backing);
  const pct = Math.round(rate * 100);

  return (
    <Section id="containment" index="03" title="The blast radius is one question" kicker="realizable credit">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <p className="text-body">
            Percolator&rsquo;s core invariant, from the spec:
          </p>
          <pre className="code box my-4 p-4">
{`usable_positive_credit_from_source_domain
    <= realizable_counterparty_backing_reserved_for_that_domain`}
          </pre>
          <p className="text-body">
            For a question, the source domain of YES profit is the NO side of that same slot, and vice versa. Profit
            is paper until the losing side has reserved collateral against it. A dishonest resolver, a manipulated
            thin question, or a cascade of liquidations on one question can reduce that side&rsquo;s reserved backing
            to zero. What it cannot do is reach the vault, other questions, or other people&rsquo;s capital.
          </p>
          <p className="mt-4 text-body">
            The engine publishes this per side as <code>credit_rate_num</code>. The SDK surfaces it as{' '}
            <code>yesRealizable</code> and <code>noRealizable</code>, and the trading page shows it next to the
            probability.
          </p>
        </div>

        <div className="box p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="pixel text-ui">credit_rate = min(1, backing / claims)</h3>
            <span className="text-tiny text-mute">one source domain</span>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <Control label={`winners' claims ${fmtUnits(claims, 0)}`}>
              <input type="range" min={0} max={20_000} step={250} value={claims} onChange={(e) => setClaims(Number(e.target.value))} />
            </Control>
            <Control label={`losers' reserved backing ${fmtUnits(backing, 0)}`}>
              <input type="range" min={0} max={20_000} step={250} value={backing} onChange={(e) => setBacking(Number(e.target.value))} />
            </Control>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4">
            <Tile label="credit rate" value={`${pct}%`} big />
            <Tile label="realizable now" value={fmtUnits(realizable, 0)} />
            <Tile label="waiting on losers" value={fmtUnits(stranded, 0)} />
          </div>

          {/* A single bar: claims as the frame, backing as the fill. Two quantities, one axis. */}
          <div className="mt-8">
            <div className="mb-2 flex justify-between text-tiny text-mute">
              <span>0</span>
              <span>claims {fmtUnits(claims, 0)}</span>
            </div>
            <div className="relative h-[18px] border border-ink">
              <div className="h-full bg-ink" style={{width: `${claims === 0 ? 100 : Math.min(100, (backing / claims) * 100)}%`}} />
              {stranded > 0 && (
                <div
                  className="absolute inset-y-0 right-0 border-l border-ink"
                  style={{
                    width: `${(stranded / claims) * 100}%`,
                    backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 3px, var(--mute) 3px 4px)',
                  }}
                />
              )}
            </div>
            <div className="mt-2 flex gap-5 text-tiny text-mute">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-[8px] w-[14px] bg-ink" /> backed
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-[8px] w-[14px] border border-mute"
                  style={{backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 2px, var(--mute) 2px 3px)'}}
                />{' '}
                unbacked
              </span>
            </div>
          </div>

          <p className="mt-6 text-tiny text-mute">
            {pct === 100
              ? 'Fully backed: profit on this question behaves like cash across the whole portfolio.'
              : `Winners can withdraw or margin ${pct}% of their profit. The rest is a claim on collateral that does not exist yet. Nobody else is charged for it.`}
          </p>
        </div>
      </div>
    </Section>
  );
}

function Tile({label, value, big = false}: {label: string; value: string; big?: boolean}) {
  return (
    <div>
      <div className={`pixel leading-none ${big ? 'text-[clamp(28px,3.2vw,48px)]' : 'text-[clamp(18px,1.8vw,26px)]'}`}>{value}</div>
      <div className="mt-2 text-tiny uppercase text-mute">{label}</div>
    </div>
  );
}
