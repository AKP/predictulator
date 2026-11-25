import {useEffect, useMemo, useRef, useState} from 'react';
import {convergencePath, fmtProb} from '../../lib/protocol';
import {Window} from './Window';

/**
 * A question resolving, played slot by slot. The mark converges under the
 * real cap rule, the slot is shut down only once converged, then open
 * interest is netted pair by pair after the exit window.
 */
const CAP_BPS = 300;
const START = 0.62;
const EXIT_WINDOW = 12; // slots, compressed from 1,500 for the demo
const OI = 18_400;
const PAIRS = [6_200, 4_800, 3_100, 2_250, 1_300, 750];

type Phase = 'open' | 'closed' | 'converging' | 'recovery' | 'netting' | 'retired';

export function LifecycleMock() {
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<number | null>(null);

  const path = useMemo(() => convergencePath(Math.round(START * 1e6), outcome === 'YES' ? 1_000_000 : 1, CAP_BPS), [outcome]);
  // timeline: 0..2 open, 3 closed, 4..4+path converging, then recovery, netting pairs, retired
  const T_CLOSE = 3;
  const T_CONV_END = T_CLOSE + path.length;
  const T_RECOVERY_END = T_CONV_END + EXIT_WINDOW;
  const T_NET_END = T_RECOVERY_END + PAIRS.length;
  const TOTAL = T_NET_END + 4;

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => setStep((s) => (s + 1) % TOTAL), 160);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, TOTAL]);

  let phase: Phase;
  let markE6: number;
  let oi = OI;
  if (step < T_CLOSE) {
    phase = 'open';
    markE6 = path[0]!;
  } else if (step < T_CONV_END) {
    phase = step === T_CLOSE ? 'closed' : 'converging';
    markE6 = path[Math.min(path.length - 1, step - T_CLOSE)]!;
  } else if (step < T_RECOVERY_END) {
    phase = 'recovery';
    markE6 = path[path.length - 1]!;
  } else if (step < T_NET_END) {
    phase = 'netting';
    markE6 = path[path.length - 1]!;
    oi = OI - PAIRS.slice(0, step - T_RECOVERY_END + 1).reduce((a, b) => a + b, 0);
  } else {
    phase = 'retired';
    markE6 = path[path.length - 1]!;
    oi = 0;
  }
  const lifecycle = phase === 'open' || phase === 'closed' || phase === 'converging' ? 'Active' : phase === 'retired' ? 'Retired' : 'Recovery';
  const converged = markE6 === path[path.length - 1];
  const instruction =
    phase === 'open' ? 'PushAuthMark (fair)' :
    phase === 'closed' ? 'decision recorded' :
    phase === 'converging' ? `PushAuthMark(${outcome === 'YES' ? '1_000_000' : '1'}) → cranks` :
    phase === 'recovery' ? 'UpdateAssetLifecycle(SHUTDOWN) · exit window' :
    phase === 'netting' ? 'ForceCloseAbandonedAsset (keeper)' :
    'UpdateAssetLifecycle(RETIRE)';

  const steps: Array<{k: Phase; label: string}> = [
    {k: 'open', label: 'open'},
    {k: 'closed', label: 'closed'},
    {k: 'converging', label: 'converging'},
    {k: 'recovery', label: 'frozen'},
    {k: 'netting', label: 'netting'},
    {k: 'retired', label: 'retired'},
  ];
  const idx = steps.findIndex((s) => s.k === phase);

  return (
    <Window title="predictulator · resolution, slot by slot" tag="mockup · exit window compressed">
      <div className="p-4">
        <ol className="grid grid-cols-6 gap-px bg-rule">
          {steps.map((s, i) => (
            <li key={s.k} className={`px-2 py-2 text-center text-tiny uppercase ${i === idx ? 'bg-ink text-page' : i < idx ? 'bg-well' : 'bg-page text-mute'}`}>
              {s.label}
            </li>
          ))}
        </ol>

        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="pixel text-[clamp(34px,4vw,56px)] leading-none">{fmtProb(markE6, 0)}</div>
            <div className="mt-1 text-tiny text-mute">effective mark{phase === 'converging' && !converged ? ` → ${outcome === 'YES' ? '100%' : '0%'}` : ''}</div>
            <div className="mt-3 h-[10px] border border-ink">
              <div className="h-full bg-ink transition-[width] duration-150" style={{width: `${(markE6 / 1e6) * 100}%`}} />
            </div>
          </div>
          <dl className="kv compact">
            <dt>slot</dt>
            <dd>{step}</dd>
            <dt>lifecycle</dt>
            <dd>{lifecycle}</dd>
            <dt>open interest</dt>
            <dd>{oi.toLocaleString()} YES / {oi.toLocaleString()} NO</dd>
            <dt>instruction</dt>
            <dd className="text-tiny">{instruction}</dd>
          </dl>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="border border-ink px-3 py-1 text-ui" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="border border-ink px-3 py-1 text-ui"
            onClick={() => {
              setStep(0);
              setPlaying(true);
            }}
          >
            Restart
          </button>
          <div className="seg !my-0 w-[140px]">
            {(['YES', 'NO'] as const).map((o) => (
              <button
                key={o}
                type="button"
                className={outcome === o ? 'on' : ''}
                onClick={() => {
                  setOutcome(o);
                  setStep(0);
                }}
              >
                {o}
              </button>
            ))}
          </div>
          <span className="text-tiny text-mute">
            {path.length - 1} slots to converge at {CAP_BPS} bps; shutdown waits for it.
          </span>
        </div>
      </div>
    </Window>
  );
}
