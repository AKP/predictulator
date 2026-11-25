import {useEffect, useRef, useState} from 'react';
import {Window} from './Window';

/**
 * The three services, as a log. Lines use the real action names and
 * instruction names; the timestamps and ids are illustrative.
 */
const LINES: Array<[string, string]> = [
  ['resolver', 'tick slot 312,004 · 4 questions · mark source http://maker:8788/fair'],
  ['resolver', 'slot 1 gen 2: push_mark 621_000 (fair) · obs seq 418 · sig 3vXk…9Qa'],
  ['resolver', 'slot 2 gen 3: none (mark within tolerance)'],
  ['maker', 'GET /quotes · 4 quoted · inventory q1 +140 q2 −60 q3 +25 q4 0'],
  ['maker', 'POST /fill · slot 1 · taker buys 25 YES @ 0.63 · validateFill ok · co-signed · sig 8Hd2…cL1'],
  ['keeper', 'crankTargets: 3 · [liquidatable] 7kQ…mZ · [stale legs on assets 1,3] 2 portfolios'],
  ['keeper', 'PermissionlessCrank 7kQ…mZ hints=[1] reward→ keeper portfolio · sig 5Rt…p9X'],
  ['resolver', 'slot 2 gen 3: decision YES recorded (note: FOMC statement 2026-12-16)'],
  ['resolver', 'slot 2 gen 3: push_mark 1_000_000 (final) · obs seq 419'],
  ['resolver', 'slot 2 gen 3: await_convergence target 1_000_000 effective 743_210'],
  ['keeper', 'PermissionlessCrank ×9 · effective 743_210 → 1_000_000'],
  ['resolver', 'slot 2 gen 3: shutdown (converged) · UpdateAssetLifecycle(SHUTDOWN) · sig 9aB…T2e'],
  ['resolver', 'slot 2 gen 3: await_force_close remainingYes 9,950 remainingNo 9,950'],
  ['keeper', 'forceClosePairs slot 2: 6 pairs · largest-against-largest'],
  ['keeper', 'ForceCloseAbandonedAsset slot 2 · 4,120 shares · Ab3…9k ⇄ Xc7…2m · sig 1Qz…m4D'],
  ['keeper', 'ForceCloseAbandonedAsset slot 2 · 2,900 shares · Ab3…9k ⇄ Pq9…8f · sig 7Hn…r2V'],
  ['resolver', 'slot 2 gen 3: retire · UpdateAssetLifecycle(RETIRE) · slot reusable, next gen 6'],
];

export function TerminalMock() {
  const [shown, setShown] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !started.current) {
        started.current = true;
        let i = 0;
        const t = setInterval(() => {
          i++;
          setShown(i);
          if (i >= LINES.length) clearInterval(t);
        }, 420);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Window title="services · resolver, maker, keeper" tag="mockup · simulated log">
      <div ref={host} className="code min-h-[320px] p-4 text-[12px]" style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>
        {LINES.slice(0, shown).map(([who, line], i) => (
          <div key={i} className="flex gap-3">
            <span className="w-[7ch] shrink-0 text-mute">{who}</span>
            <span className={who === 'resolver' ? 'tk-kw' : ''}>{line}</span>
          </div>
        ))}
        <span className="inline-block h-[1.1em] w-[0.6em] animate-pulse bg-ink align-text-bottom" aria-hidden />
      </div>
    </Window>
  );
}
