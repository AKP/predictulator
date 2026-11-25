import {Section} from './Section';

/**
 * Who talks to what. Drawn as a pixel diagram: boxes are services or
 * accounts, solid arrows are transactions, dashed arrows are HTTP.
 */
export function Architecture() {
  return (
    <Section id="architecture" index="06" title="Every arrow is either a transaction or a GET" kicker="nothing custodial off chain">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="box p-4">
          <svg viewBox="0 0 640 360" className="w-full" role="img" aria-labelledby="arch-t">
            <title id="arch-t">Architecture: web app, maker, resolver, keeper, and ops talk to the Percolator program; the program embeds the engine.</title>
            <defs>
              <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0 0L8 4L0 8z" fill="var(--ink)" />
              </marker>
            </defs>

            <Box x={20} y={20} w={150} h={54} title="Trading page" sub="wallet signs" />
            <Box x={245} y={20} w={150} h={54} title="Maker" sub="quotes, co-signs" />
            <Box x={470} y={20} w={150} h={54} title="Resolver" sub="marks, decides" />

            <Box x={20} y={286} w={150} h={54} title="Keeper" sub="cranks, nets" />
            <Box x={470} y={286} w={150} h={54} title="Ops CLI" sub="bootstrap, create" />

            <g>
              <rect x={200} y={140} width={240} height={110} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
              <text x={320} y={166} textAnchor="middle" fontSize={13} fill="var(--ink)" fontFamily="Silkscreen, monospace">
                PERCOLATOR-PROG
              </text>
              <text x={320} y={184} textAnchor="middle" fontSize={11} fill="var(--mute)">
                market group · portfolios · vault
              </text>
              <rect x={222} y={200} width={196} height={36} fill="var(--well)" stroke="var(--ink)" strokeWidth={1} />
              <text x={320} y={222} textAnchor="middle" fontSize={11} fill="var(--ink)">
                risk engine v16 (unmodified)
              </text>
            </g>

            {/* HTTP: page -> maker, page -> resolver, resolver -> maker (/fair) */}
            <path d="M170 47 H245" stroke="var(--mute)" strokeWidth={1.5} strokeDasharray="4 4" markerEnd="url(#arrow)" fill="none" />
            <text x={207} y={41} textAnchor="middle" fontSize={10} fill="var(--mute)">/quotes /fill</text>
            <path d="M95 74 V110 H545 V74" stroke="var(--mute)" strokeWidth={1.5} strokeDasharray="4 4" markerEnd="url(#arrow)" fill="none" />
            <text x={200} y={106} textAnchor="middle" fontSize={10} fill="var(--mute)">/questions</text>
            <path d="M470 55 H395" stroke="var(--mute)" strokeWidth={1.5} strokeDasharray="4 4" markerEnd="url(#arrow)" fill="none" />
            <text x={432} y={68} textAnchor="middle" fontSize={10} fill="var(--mute)">/fair</text>

            {/* Transactions */}
            <path d="M320 74 V140" stroke="var(--ink)" strokeWidth={2} markerEnd="url(#arrow)" fill="none" />
            <text x={328} y={94} fontSize={10} fill="var(--ink)">TradeNoCpi (both sign)</text>
            <path d="M545 74 V124 H430 V140" stroke="var(--ink)" strokeWidth={2} markerEnd="url(#arrow)" fill="none" />
            <text x={540} y={120} fontSize={10} fill="var(--ink)" textAnchor="end">PushAuthMark, Shutdown</text>
            <path d="M95 74 V130 H215 V140" stroke="var(--ink)" strokeWidth={2} markerEnd="url(#arrow)" fill="none" />
            <text x={100} y={127} fontSize={10} fill="var(--ink)">Deposit, Withdraw</text>
            <path d="M95 286 V265 H215 V250" stroke="var(--ink)" strokeWidth={2} markerEnd="url(#arrow)" fill="none" />
            <text x={100} y={279} fontSize={10} fill="var(--ink)">Crank, ForceClose</text>
            <path d="M545 286 V265 H430 V250" stroke="var(--ink)" strokeWidth={2} markerEnd="url(#arrow)" fill="none" />
            <text x={540} y={279} fontSize={10} fill="var(--ink)" textAnchor="end">InitMarket, Activate</text>

            <g fontSize={10} fill="var(--mute)">
              <line x1={240} y1={338} x2={270} y2={338} stroke="var(--ink)" strokeWidth={2} />
              <text x={276} y={342}>transaction</text>
              <line x1={350} y1={338} x2={380} y2={338} stroke="var(--mute)" strokeWidth={1.5} strokeDasharray="4 4" />
              <text x={386} y={342}>HTTP, JSON</text>
            </g>
          </svg>
        </div>
        <div className="grid gap-4 self-start">
          <Who name="Resolver" trust="trusted for its questions">
            Pushes the mark and decides the outcome, like UMA for Polymarket or the house for a sportsbook. What Percolator
            adds is a ceiling: at most the reserved collateral of the losing side of that one question.
          </Who>
          <Who name="Maker" trust="not trusted with funds">
            Co-signs trades against its own portfolio. It can refuse to quote. It cannot take anything, cannot be the fee
            payer, and rejects any transaction with a second instruction.
          </Who>
          <Who name="Keeper" trust="not trusted at all">
            Every instruction it sends is one the program lets anyone send. It is paid a share of liquidation fees into its
            own portfolio.
          </Who>
          <Who name="Creator" trust="pays, then has no power">
            Activates a slot, pays the fee into insurance, becomes the slot&rsquo;s cold admin. Can rotate the slot&rsquo;s
            roles, cannot touch anyone&rsquo;s collateral.
          </Who>
        </div>
      </div>
    </Section>
  );
}

function Box({x, y, w, h, title, sub}: {x: number; y: number; w: number; h: number; title: string; sub: string}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--page)" stroke="var(--ink)" strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 24} textAnchor="middle" fontSize={12} fill="var(--ink)" fontFamily="Silkscreen, monospace">
        {title.toUpperCase()}
      </text>
      <text x={x + w / 2} y={y + 41} textAnchor="middle" fontSize={10.5} fill="var(--mute)">
        {sub}
      </text>
    </g>
  );
}

function Who({name, trust, children}: {name: string; trust: string; children: React.ReactNode}) {
  return (
    <div className="box p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="pixel text-ui">{name}</span>
        <span className="text-tiny uppercase text-mute">{trust}</span>
      </div>
      <p className="mt-2 text-body">{children}</p>
    </div>
  );
}
