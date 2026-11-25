// All copy and reference data for the site. Every number here is a fact
// about the repo or the protocol, not a projection.

export const brand = 'Predictulator';

export const links = {
  github: 'https://github.com/AKP/predictulator',
  twitter: 'https://x.com/DoranLabs',
  builder: 'https://x.com/DEXWatch',
  repo: 'https://github.com/aeyakovenko/percolator',
  program: 'https://github.com/aeyakovenko/percolator-prog',
  docs: '#api',
};

export const nav = [
  {label: 'Product', href: '#product'},
  {label: 'Lifecycle', href: '#lifecycle'},
  {label: 'Containment', href: '#containment'},
  {label: 'Charts', href: '#charts'},
  {label: 'API', href: '#api'},
  {label: 'Updates', href: '#updates'},
  {label: 'Live', href: '#live'},
];

export const headline = ['Predict', 'ulator'];

export const lede =
  'Prediction markets on Solana where a wrong resolution can only hurt the people who bet on that question. Every question is an asset inside the Percolator risk engine: cross-margined, leveraged, permissionless, and boxed.';

export const media = {
  // Clean white-cat loop from the template; the scanline look is drawn live by ScanCat's shader.
  video: '/media/cat-loop.mp4',
  poster: '/media/cat-poster.jpg',
};

export const ctas = {
  primary: {label: 'Read the API', href: '#api'},
  secondary: {label: 'See the product', href: '#product'},
};

/** Verifiable facts about this checkout. */
export const stats = [
  {value: '0', label: 'upstream lines modified', note: 'the on-chain program is stock percolator-prog'},
  {value: '9,419', label: 'byte portfolio layout', note: 'transcribed, matches the engine assertion'},
  {value: '67', label: 'unit tests', note: 'layouts, encoders, lifecycle, pairing, fills, indexer, agent'},
  {value: '14', label: 'positions per portfolio', note: 'cross-margined under one balance'},
];

export interface Step {
  n: string;
  title: string;
  who: string;
  what: string;
  ix: string;
}

export const lifecycle: Step[] = [
  {
    n: '01',
    title: 'Create',
    who: 'anyone',
    what: 'Append an asset slot. The creation fee lands in insurance. An SPL Memo in the same transaction commits the manifest hash.',
    ix: 'UpdateAssetLifecycle(ACTIVATE)',
  },
  {
    n: '02',
    title: 'Register',
    who: 'creator, resolver',
    what: 'The signed manifest (title, criteria, dates, resolver) is posted to the resolver, which countersigns and serves it.',
    ix: 'POST /questions',
  },
  {
    n: '03',
    title: 'Open',
    who: 'resolver',
    what: 'The slot switches to AuthMark mode. The resolver steers the mark toward the maker’s fair probability.',
    ix: 'ConfigureAuthMark, PushAuthMark',
  },
  {
    n: '04',
    title: 'Trade',
    who: 'taker, maker',
    what: 'A taker signs a bilateral trade against the maker’s portfolio. The maker co-signs only if price and size still match its quote.',
    ix: 'TradeNoCpi',
  },
  {
    n: '05',
    title: 'Close',
    who: 'resolver',
    what: 'Trading stops at closesAt. The resolver records YES or NO in its decision log.',
    ix: 'POST /questions/:i/:gen/resolve',
  },
  {
    n: '06',
    title: 'Resolve',
    who: 'resolver',
    what: 'The final mark is pushed: 1.000000 for YES, 0.000001 for NO. The engine converges under the per-slot cap, then the slot is shut down at the frozen mark.',
    ix: 'PushAuthMark, UpdateAssetLifecycle(SHUTDOWN)',
  },
  {
    n: '07',
    title: 'Settle',
    who: 'anyone',
    what: 'After the exit window a keeper nets longs against shorts at the frozen mark until open interest is zero, and is paid for it.',
    ix: 'ForceCloseAbandonedAsset',
  },
  {
    n: '08',
    title: 'Reuse',
    who: 'marketauth',
    what: 'The slot is retired. The next question gets a fresh generation id that old positions and old signed intents can never bind to.',
    ix: 'UpdateAssetLifecycle(RETIRE)',
  },
];

export interface Snippet {
  id: string;
  label: string;
  title: string;
  blurb: string;
  code: string;
}

export const snippets: Snippet[] = [
  {
    id: 'read',
    label: 'Read',
    title: 'Read every question on a market',
    blurb:
      'The client decodes the market account directly from RPC. No indexer, no API. The credit rate per side is the containment guarantee as a number.',
    code: `import { Connection, PublicKey } from "@solana/web3.js";
import { Predictulator, formatProb } from "@predictulator/sdk";

const client = new Predictulator({
  connection: new Connection("https://api.devnet.solana.com"),
  market: new PublicKey(process.env.MARKET!),
  programId: new PublicKey(process.env.PROGRAM_ID!),
});

const market = await client.fetchMarket();

for (const q of Predictulator.questions(market)) {
  console.log(
    \`slot \${q.asset.index} gen \${q.asset.marketId}\`,
    q.phase,                          // open | resolving | resolved | retired
    formatProb(q.probabilityE6),      // "62.0%"
    q.converged ? "" : \`-> \${formatProb(q.targetE6)}\`,
    \`YES realizable \${(q.yesRealizable * 100).toFixed(0)}%\`,
  );
}`,
  },
  {
    id: 'create',
    label: 'Create',
    title: 'Create a question',
    blurb:
      'The manifest is canonicalized, hashed, and signed by the creator. The activation transaction carries the hash in a memo, the rent for the new slot, and the creation fee.',
    code: `import { signManifest, probToMark } from "@predictulator/sdk";

const market = await client.fetchMarket();

const manifest = {
  version: 1 as const,
  market: client.market.toBase58(),
  assetIndex: market.config.maxMarketSlots,   // next slot
  marketId: market.nextMarketId.toString(),   // its generation
  title: "Will SOL close above $300 on 2026-12-31?",
  description: "Coinbase daily close, UTC.",
  resolutionCriteria: "YES if the SOL/USD daily close on Coinbase for 2026-12-31 is strictly greater than 300.00.",
  closesAt: "2026-12-31T00:00:00.000Z",
  resolvesBy: "2027-01-02T00:00:00.000Z",
  resolver: RESOLVER.toBase58(),
  creator: creator.publicKey.toBase58(),
  tags: ["crypto"],
  createdAt: new Date().toISOString(),
};

const signed = signManifest(manifest, creator.secretKey);

const { transaction } = await client.buildCreateQuestion(market, manifest, {
  creator: creator.publicKey,
  feeSourceToken: creatorUsdc,
  vaultToken: vault,
  initialProbabilityE6: probToMark(0.55),
  nowSlot: BigInt(await client.connection.getSlot()),
});
// sign with \`creator\`, send, then POST \`signed\` to the resolver.`,
  },
  {
    id: 'trade',
    label: 'Trade',
    title: 'Buy YES through the maker',
    blurb:
      'Both portfolio owners must sign a bilateral trade. The taker builds and signs; the maker validates every field against a fresh quote, co-signs, and submits. Nothing is custodied.',
    code: `import { instructions as ix, signedSizeQ } from "@predictulator/sdk";

const quote = await fetch(\`\${MAKER}/quotes/\${assetIndex}\`).then(r => r.json());
const me = (await client.findPortfolios(wallet.publicKey))[0]!;

const tx = new Transaction().add(
  ix.tradeNoCpi(
    {
      signerA: wallet.publicKey,
      signerB: new PublicKey(quote.makerOwner),
      market: client.market,
      portfolioA: me.address!,
      portfolioB: new PublicKey(quote.makerPortfolio),
    },
    {
      accountAPortfolioId: me.portfolioId,
      accountAPositionEpoch: me.positionEpoch,
      accountBPortfolioId: BigInt(quote.makerPortfolioId),
      accountBPositionEpoch: BigInt(quote.makerPositionEpoch),
      assetIndex,
      marketId: BigInt(quote.marketId),
      sizeQ: signedSizeQ("YES", 25),          // 25 shares, long
      execPrice: BigInt(quote.askE6),         // maker's ask, e6
      feeBps: BigInt(quote.feeBps),
      backingFeeCapBps: 0,
    },
  ),
);
tx.feePayer = wallet.publicKey;
tx.recentBlockhash = (await client.connection.getLatestBlockhash()).blockhash;

const signed = await wallet.signTransaction(tx);
const { signature } = await fetch(\`\${MAKER}/fill\`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ transaction: signed.serialize({ requireAllSignatures: false }).toString("base64") }),
}).then(r => r.json());`,
  },
  {
    id: 'resolve',
    label: 'Resolve',
    title: 'Resolve, then let the engine do the rest',
    blurb:
      'One authenticated call records the decision. The resolver service pushes the final mark, waits for the effective price to converge, and shuts the slot down at the frozen mark. The keeper nets positions.',
    code: `// Resolver API (needs x-resolver-token). Refuses before closesAt.
await fetch(\`\${RESOLVER}/questions/\${assetIndex}/\${marketId}/resolve\`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-resolver-token": TOKEN },
  body: JSON.stringify({ outcome: "YES", note: "Coinbase close 312.40" }),
});

// What the service does on its next ticks, as a pure decision function:
import { nextAction } from "@predictulator/resolver";

nextAction({ state, manifest, decision: { outcome: "YES", decidedAt }, ... });
// -> { kind: "push_mark", markE6: 1_000_000n, reason: "final" }
// -> { kind: "await_convergence", targetE6: 1_000_000n, effectiveE6: 740_000n }
// -> { kind: "shutdown" }
// -> { kind: "await_force_close", remainingYes: 120, remainingNo: 120 }
// -> { kind: "retire" }`,
  },
  {
    id: 'keeper',
    label: 'Keeper',
    title: 'Earn by settling',
    blurb:
      'Everything the keeper sends is permissionless. Pairing is largest-against-largest so each transaction nets as much as it can; the liquidation cranker share is paid into the keeper’s own portfolio.',
    code: `import { crankTargets, forceClosePairs } from "@predictulator/keeper";

const market = await client.fetchMarket();
const portfolios = await client.listPortfolios();
const slot = BigInt(await client.connection.getSlot());

for (const t of crankTargets(market, portfolios)) {
  // reasons: "liquidatable" | "bankrupt close in progress" | "stale legs on assets 3" | ...
  const hints = t.staleAssets.map(assetIndex => ({ assetIndex, oracleAccounts: 0 }));
  send(client.buildCrank(keeper.publicKey, t.portfolio.address!, slot, hints, myPortfolio));
}

for (const p of forceClosePairs(market, portfolios, slot)) {
  send(client.buildForceClose(keeper.publicKey, p.asset,
    p.longPortfolio.address!, p.shortPortfolio.address!, p.closeQ, slot));
}`,
  },
  {
    id: 'decode',
    label: 'Decode',
    title: 'Decode a raw account',
    blurb:
      'Layouts are declarative: the field list of each Pod struct, with sizes and offsets computed from it. The portfolio struct computes to 9,419 bytes, the number the engine asserts at compile time.',
    code: `import {
  decodePortfolio, PORTFOLIO_STATE, PORTFOLIO_LEG,
  fieldOffset, structSize, PORTFOLIO_STATE_LEN,
} from "@predictulator/sdk";

PORTFOLIO_STATE_LEN;                        // 9419
fieldOffset(PORTFOLIO_STATE, "capital");   // 132
structSize(PORTFOLIO_LEG);                  // 152

const info = await connection.getAccountInfo(portfolioAddress);
const p = decodePortfolio(new Uint8Array(info!.data), portfolioAddress);

p.capital;            // 25_000_000n  (25.000000 collateral)
p.pnl;                // -1_250n
p.positionEpoch;      // 17n   bound by every trade
p.matcherSequence;    // 5n    bound by every deposit / withdrawal
p.legs.filter(l => l.active);
// [{ slot: 2, assetIndex: 3, marketId: 9n, side: 1, basisPosQ: -4_000_000n, ... }]`,
  },
];

export interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  what: string;
}

export const resolverEndpoints: Endpoint[] = [
  {method: 'GET', path: '/health', what: 'Resolver pubkey and the market it serves.'},
  {method: 'GET', path: '/questions', what: 'Every registered question as a SignedQuestion, verified before serving.'},
  {method: 'GET', path: '/questions/:asset/:gen', what: 'One question by slot and generation.'},
  {method: 'POST', path: '/questions', what: 'Register a creator-signed manifest. The resolver countersigns.'},
  {method: 'POST', path: '/questions/:asset/:gen/resolve', what: 'Record YES or NO. Token-gated; refuses before closesAt; never flips a prior decision.'},
  {method: 'GET', path: '/decisions/:asset/:gen', what: 'The decision log entry, once made.'},
];

export const makerEndpoints: Endpoint[] = [
  {method: 'GET', path: '/health', what: 'Maker pubkey and portfolio.'},
  {method: 'GET', path: '/quotes', what: 'Bid, ask, size caps, fee, and epoch bindings for every quoted question.'},
  {method: 'GET', path: '/quotes/:asset', what: 'One quote.'},
  {method: 'GET', path: '/fair?assetIndex=&marketId=', what: 'The maker’s skewed mid as a probability; the resolver’s default mark source.'},
  {method: 'POST', path: '/fill', what: 'A taker-signed TradeNoCpi, base64. Validated, co-signed, submitted. Returns the signature.'},
];

export interface IxRow {
  tag: number;
  name: string;
  accounts: string;
  role: string;
}

export const instructionRows: IxRow[] = [
  {tag: 0, name: 'InitMarket', accounts: 'admin s, market w, mint', role: 'operator'},
  {tag: 1, name: 'InitPortfolio', accounts: 'owner s, market w, portfolio w', role: 'anyone'},
  {tag: 3, name: 'Deposit', accounts: 'owner s, market w, portfolio w, source w, vault w, token', role: 'owner'},
  {tag: 4, name: 'Withdraw', accounts: 'owner s, market w, portfolio w, dest w, vault w, vault auth, token', role: 'owner'},
  {tag: 5, name: 'PermissionlessCrank', accounts: 'caller, market w, portfolio w, …oracles, reward w?', role: 'keeper'},
  {tag: 6, name: 'TradeNoCpi', accounts: 'A s, B s, market w, portfolio A w, portfolio B w', role: 'taker + maker'},
  {tag: 40, name: 'UpdateAssetLifecycle', accounts: 'authority s, market w, (fee source w, vault w, token)?', role: 'creator / resolver'},
  {tag: 62, name: 'ConfigureAuthMark', accounts: 'oracle s, market w', role: 'resolver'},
  {tag: 63, name: 'PushAuthMark', accounts: 'oracle s, market w', role: 'resolver'},
  {tag: 64, name: 'ForceCloseAbandonedAsset', accounts: 'cranker s, market w, long w, short w', role: 'keeper'},
  {tag: 65, name: 'UpdateAssetAuthority', accounts: 'current s, new (s), market w', role: 'asset admin'},
  {tag: 38, name: 'ConfigurePermissionlessResolve', accounts: 'marketauth s, market w', role: 'operator'},
  {tag: 59, name: 'UpdateMarketInitFeePolicy', accounts: 'marketauth s, market w', role: 'operator'},
];

export const params = [
  {k: 'initial_margin_bps', v: '10,000', why: 'buying YES is fully collateralized: cost equals max loss'},
  {k: 'maintenance_margin_bps', v: '2,500', why: 'above the 12% per-accrual loss budget plus the liquidation fee'},
  {k: 'max_price_move_bps_per_slot', v: '300', why: '0.50 to 1.00 converges in about fourteen cranked slots'},
  {k: 'max_accrual_dt_slots', v: '4', why: 'caps how many slots of movement one accrual can book'},
  {k: 'max_abs_funding_e9_per_slot', v: '0', why: 'no basis to fund on a binary outcome'},
  {k: 'trade_fee_base_bps', v: '20', why: '0.2% of notional'},
  {k: 'permissionless_market_init_fee', v: '1.000000', why: 'nonzero makes creation permissionless; funds asset-0 insurance'},
  {k: 'force_close_delay_slots', v: '1,500', why: 'about ten minutes to exit before anyone can net you'},
  {k: 'permissionless_resolve_stale_slots', v: '648,000', why: 'about three days of oracle silence resolves the market'},
];

export interface Update {
  n: string;
  title: string;
  what: string;
  where: string;
}

/** v0.2, November 2026. Each line is something in the tree, not a plan. */
export const updates: Update[] = [
  {
    n: '01',
    title: 'Layouts verified against the pinned Rust',
    what: 'A script fetches the engine and program at the pinned commits, parses every repr(C) struct, resolves the array-length constants, and diffs names, types, and sizes against the SDK. 21 structs, 0 mismatches. Its first run found a 32-byte drift in the asset slot and the SDK was fixed.',
    where: 'npm run verify:layouts',
  },
  {
    n: '02',
    title: 'Questions discovered from chain, not from an API',
    what: 'An indexer pairs the manifest-hash memo with the ACTIVATE instruction in each activation transaction, so the question list can be rebuilt from transaction history alone and a resolver’s registry can be audited against it: verified, hash-mismatch, unregistered, not-on-chain.',
    where: 'packages/indexer · predictulator-indexer scan | verify',
  },
  {
    n: '03',
    title: 'An MCP server over the SDK',
    what: 'Eight tools let an agent read the market, list and explain questions, see a wallet’s portfolio and health, price a trade, and build an unsigned TradeNoCpi for the wallet to sign. The server holds no keys and can only do what the trading page can do.',
    where: 'packages/mcp · predictulator-mcp',
  },
  {
    n: '04',
    title: 'Close a position, convert backed profit',
    what: 'The trading page gained close on every open leg (RebalanceReduce at the engine’s effective price) and Convert PnL (ConvertReleasedPnl), which moves realizable profit into capital so it can be withdrawn. Both are owner-signed and go through the same encoders as everything else.',
    where: 'apps/web · PortfolioPanel',
  },
  {
    n: '05',
    title: 'Explain the credit rate in numbers',
    what: 'One tool call states, for a question, how much of each side’s profit is currently backed by the other side’s reserved collateral, the claim bound, the available backing, and the rule that produced the number.',
    where: 'mcp · explain_credit_rate',
  },
];

export interface DevLogEntry {
  date: string; // ISO date, used for ordering and display
  title: string;
  body: string[]; // paragraphs
  tag?: string; // short label, e.g. "build", "security", "site"
}

/**
 * Dev log. Newest entry first. Each entry is something that actually happened
 * in the tree on that day. Append a new object at the TOP of this array.
 */
export const devlog: DevLogEntry[] = [
  {
    date: '2026-11-25',
    tag: 'build',
    title: 'Mithril: fills that cannot be sandwiched',
    body: [
      'A prediction-market fill is just a Solana transaction, so between the moment you sign it and the moment it lands it can be reordered, front-run, or sandwiched. The quote you agreed to is not always the one you get. So I built Mithril: a sidecar that takes the co-signed TradeNoCpi and hands it to a separated block builder like Harmonic as an atomic bundle. It lands whole, in order, or not at all. No sandwich, no front-run, the price you signed is the price that lands.',
      'It is builder-agnostic by design, so the same submission path points at Harmonic, Jito, or your own. This is groundwork, not live yet, and it only earns its keep once trades run on mainnet. The package and its tests are in the repo.',
      'Also this week, someone reading the layout verifier caught a real bug: the source cache was keyed by filename, not by commit, so bumping a pinned commit in an existing checkout would quietly reuse the old Rust and compare against stale source. Fixed to key by commit, so changing a pin re-fetches. Exactly the kind of read that building in the open is for.',
    ],
  },
  {
    date: '2026-11-11',
    tag: 'security',
    title: 'Read the engine end to end',
    body: [
      'Predictulator is a client over an engine I did not write, so before trusting it with anything I spent a couple of days reading Percolator and percolator-prog the whole way through: the instruction handlers, the risk kernels they call, the invariant charter, and a few hundred of their own attack tests.',
      'It held up almost everywhere. That codebase has Kani proofs and a large LiteSVM suite, and most of what looks wrong at first turns out to be covered. Three things were not. All three went to the maintainer first; he asked for them in full, so the whole review, code and sequences and fixes, is up under Security.',
      'The one that matters for us: a freshly created permissionless asset cannot be given a live oracle while anyone else in the market is holding unrealized profit, because that check is market-wide when it should be per asset. That is exactly the create-question path, so it needs an upstream fix before a devnet run means anything.',
    ],
  },
  {
    date: '2026-11-10',
    tag: 'build',
    title: 'v0.2: a verifier, an indexer, an agent',
    body: [
      'Shipped the layout verifier. It pulls the engine and program at the pinned commits, parses every repr(C) struct, and diffs field names, types and sizes against the SDK. 21 structs. The first run caught a real drift: the asset slot was 32 bytes too long because I had transcribed it from master, not the pin. Fixed.',
      'Added an indexer that rebuilds the question list from on-chain activation memos and audits a resolver registry against the chain, and an MCP server that lets an agent read a market, price a trade and build an unsigned transaction to sign. The trading page can now close a leg and convert backed profit.',
    ],
  },
];

