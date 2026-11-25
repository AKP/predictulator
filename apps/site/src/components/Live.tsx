import {useEffect, useState} from 'react';
import {Connection, PublicKey} from '@solana/web3.js';
import {Predictulator, formatAtoms, formatProb, type MarketGroup, type QuestionState} from '@predictulator/sdk';
import {Section} from './Section';

interface Live {
  market: MarketGroup;
  questions: QuestionState[];
  slot: number;
  at: number;
}

function config() {
  const env = import.meta.env;
  try {
    if (!env.VITE_PROGRAM_ID || !env.VITE_MARKET) return null;
    return {
      rpc: (env.VITE_RPC_URL as string | undefined) ?? 'https://api.devnet.solana.com',
      programId: new PublicKey(env.VITE_PROGRAM_ID as string),
      market: new PublicKey(env.VITE_MARKET as string),
    };
  } catch {
    return null;
  }
}

/**
 * Reads a deployed market straight from RPC when one is configured. When
 * none is, says so. There is no sample data in this section by design.
 */
export function LiveMarket() {
  const cfg = config();
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cfg) return;
    let alive = true;
    const connection = new Connection(cfg.rpc, 'confirmed');
    const client = new Predictulator({connection, market: cfg.market, programId: cfg.programId});
    const load = async () => {
      try {
        const [market, slot] = await Promise.all([client.fetchMarket(), connection.getSlot('confirmed')]);
        if (!alive) return;
        setLive({market, questions: Predictulator.questions(market), slot, at: Date.now()});
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.rpc, cfg?.market.toBase58(), cfg?.programId.toBase58()]);

  return (
    <Section id="live" index="09" title="Live from devnet, or honestly empty" kicker={cfg ? cfg.market.toBase58() : 'no market configured'}>
      {!cfg && (
        <div className="box max-w-[72ch] p-5">
          <p className="text-body">
            This section reads a deployed market straight from RPC: vault, insurance, every question&rsquo;s mark,
            open interest, and realizable credit per side. No market is configured for this build, so it shows nothing
            rather than something made up.
          </p>
          <pre className="code mt-4 text-mute">{`# apps/site/.env
VITE_PROGRAM_ID=<deployed percolator-prog>
VITE_MARKET=<market group account>

# then, from the repo root
npm run ops -- init-market --admin keys/admin.json --mint <mint>
npm run ops -- create-question --creator keys/admin.json --manifest my-question.json ...`}</pre>
        </div>
      )}

      {cfg && error && !live && (
        <div className="box max-w-[72ch] p-5">
          <p className="text-body">Could not read the market.</p>
          <pre className="code mt-3 text-mute">{error}</pre>
        </div>
      )}

      {live && (
        <div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-5">
            <Stat label="vault" value={formatAtoms(live.market.vault)} />
            <Stat label="insurance" value={formatAtoms(live.market.insurance)} />
            <Stat label="capital" value={formatAtoms(live.market.cTot)} />
            <Stat label="portfolios" value={live.market.materializedPortfolioCount.toString()} />
            <Stat label="slot" value={live.slot.toLocaleString()} />
          </div>
          <div className="mt-8 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>slot / gen</th>
                  <th>phase</th>
                  <th>P(YES)</th>
                  <th>OI YES</th>
                  <th>OI NO</th>
                  <th>YES realizable</th>
                  <th>NO realizable</th>
                  <th>oracle</th>
                </tr>
              </thead>
              <tbody>
                {live.questions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-mute">
                      No questions on this market yet.
                    </td>
                  </tr>
                )}
                {live.questions.map((q) => (
                  <tr key={`${q.asset.index}-${q.asset.marketId}`}>
                    <td>
                      {q.asset.index} / {q.asset.marketId.toString()}
                    </td>
                    <td>{q.phase}{q.outcome ? ` ${q.outcome}` : ''}</td>
                    <td>
                      {formatProb(q.probabilityE6)}
                      {!q.converged && <span className="text-mute"> → {formatProb(q.targetE6)}</span>}
                    </td>
                    <td>{q.openInterestYesShares.toLocaleString()}</td>
                    <td>{q.openInterestNoShares.toLocaleString()}</td>
                    <td>{Math.round(q.yesRealizable * 100)}%</td>
                    <td>{Math.round(q.noRealizable * 100)}%</td>
                    <td className="text-tiny text-mute">{q.asset.oracle.oracleAuthority.toBase58().slice(0, 8)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-tiny text-mute">
            Decoded client-side from the market account at {new Date(live.at).toLocaleTimeString()}; refreshes every 10 s.
            {error ? ` Last refresh failed: ${error}` : ''}
          </p>
        </div>
      )}
    </Section>
  );
}

function Stat({label, value}: {label: string; value: string}) {
  return (
    <div>
      <div className="pixel text-[clamp(20px,2.2vw,32px)] leading-none">{value}</div>
      <div className="mt-2 text-tiny uppercase text-mute">{label}</div>
    </div>
  );
}
