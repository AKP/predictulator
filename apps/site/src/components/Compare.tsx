import {useState} from 'react';
import {Section} from './Section';

const ROWS: Array<[string, string, string, string]> = [
  ['Cross-margin across questions', 'no', 'yes', 'yes'],
  ['Leverage', 'no', 'yes', 'yes, with a per-slot price brake'],
  ['Capital for a YES share at p', 'p, locked 1:1', 'p × margin', 'p × margin'],
  ['Wrong oracle on one market can drain the vault', 'no', 'yes', 'no: bounded by that market’s reserved backing'],
  ['Winners paid from other users’ collateral', 'never', 'possible via socialized loss', 'never across questions'],
  ['Permissionless market creation', 'varies', 'rare', 'yes, fee funds insurance'],
  ['Settlement', 'redeem 1:1', 'oracle print, cash settle', 'converge, freeze, net pairs at the frozen mark'],
  ['On-chain program', 'custom', 'custom', 'stock Percolator, zero lines changed'],
];

const FAQ: Array<[string, string]> = [
  [
    'Is this fully collateralized like Polymarket?',
    'No. Margin is a share of notional. A long YES at 100% initial margin is exactly covered; a short at a low probability posts the price but can lose one minus the price. That gap is handled the way every perp handles it, plus the realizable-credit cap. A bounded-outcome margin rule would close it and is the first roadmap item that needs an engine change.',
  ],
  [
    'Who decides the outcome?',
    'The question’s resolver, named in the signed manifest and set as the slot’s oracle authority on chain. You pick questions by picking resolvers. Percolator bounds what a wrong or malicious resolver can take to the reserved collateral of that question’s losing side.',
  ],
  [
    'Why both signatures on a trade?',
    'The bilateral TradeNoCpi path requires both portfolio owners to sign. The maker co-signs after validating every field against a fresh quote. The TradeCpi path, where an LP opts into a matcher program once, is where an on-chain AMM would go.',
  ],
  [
    'What stops a resolver from freezing the wrong price?',
    'Shutdown freezes the effective price, which can only move toward the pushed target by the per-slot cap. The resolver service refuses to shut down until effective equals target. After shutdown, marks cannot be pushed to that slot at all.',
  ],
  [
    'Can anyone create a question?',
    'Yes, when the market’s creation fee is nonzero. The fee lands in asset-0 insurance, the creator pays the new slot’s rent, and the manifest hash goes on chain in the same transaction.',
  ],
  [
    'Is any of this live?',
    'Not yet. The SDK, services, and pages are written and unit-tested; the program has not been deployed from this environment. The status table in the repo README says exactly what has and has not run.',
  ],
];

export function Compare() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="compare" index="07" title="Where it sits, and what people ask" kicker="comparison and questions">
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>property</th>
              <th>fully collateralized CLOB</th>
              <th>perp DEX listing</th>
              <th>Predictulator</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r[0]}>
                <td>{r[0]}</td>
                <td className="text-mute">{r[1]}</td>
                <td className="text-mute">{r[2]}</td>
                <td>{r[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-12 grid gap-px bg-rule">
        {FAQ.map(([q, a], i) => (
          <div key={q} className="bg-page">
            <button
              type="button"
              className="flex w-full items-baseline justify-between gap-4 px-1 py-4 text-left"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
            >
              <span className="text-body">{q}</span>
              <span className="pixel text-ui">{open === i ? '−' : '+'}</span>
            </button>
            {open === i && <p className="max-w-[72ch] px-1 pb-5 text-body text-mute">{a}</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}
