import {params} from '../content';
import {Convergence} from './charts/Convergence';
import {MarginGap} from './charts/MarginGap';
import {Payoff} from './charts/Payoff';
import {Section} from './Section';

export function Charts() {
  return (
    <Section id="charts" index="04" title="The mechanics, drawn from the rules" kicker="no market data, only protocol math">
      <p className="mb-8 max-w-[62ch] text-body">
        There is no live market yet, so nothing here is a price history. Every curve is computed from the engine&rsquo;s
        own rules and the SDK&rsquo;s own functions: the clamp loop, the payoff formula, the margin formula. Drag the
        controls; the numbers are what the chain would do.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        <Convergence />
        <Payoff />
        <div className="xl:col-span-2">
          <MarginGap />
        </div>
      </div>

      <div className="mt-10">
        <h3 className="pixel mb-4 text-ui">Default market parameters</h3>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>parameter</th>
                <th>value</th>
                <th>why</th>
              </tr>
            </thead>
            <tbody>
              {params.map((p) => (
                <tr key={p.k}>
                  <td>
                    <code>{p.k}</code>
                  </td>
                  <td className="whitespace-nowrap">{p.v}</td>
                  <td className="text-mute">{p.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-tiny text-mute">
          The spec&rsquo;s solvency envelope must hold: per-accrual loss budget (cap × accrual slots = 12%) plus the
          liquidation fee must fit inside maintenance margin (25%). It does.
        </p>
      </div>
    </Section>
  );
}
