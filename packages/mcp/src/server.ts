/**
 * Predictulator MCP server.
 *
 * Exposes the market to an AI agent as tools: read questions and quotes,
 * inspect a portfolio, build an unsigned trade, and submit a signed one to
 * the maker. The server never holds keys. Everything it can do is the same
 * thing the trading page does.
 */
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {Connection, PublicKey, Transaction} from "@solana/web3.js";
import {z} from "zod";
import {
  Predictulator,
  SignedQuestionSchema,
  formatAtoms,
  formatProb,
  instructions as ix,
  notionalAtoms,
  signedSizeQ,
  worstCaseLossAtoms,
  type MarketGroup,
  type Portfolio,
  type QuestionState,
  type SignedQuestion,
} from "@predictulator/sdk";

export interface McpConfig {
  connection: Connection;
  programId: PublicKey;
  market: PublicKey;
  resolverUrl?: string;
  makerUrl?: string;
}

interface Quote {
  assetIndex: number;
  marketId: string;
  askE6: string;
  bidE6: string;
  maxBuyShares: number;
  maxSellShares: number;
  makerOwner: string;
  makerPortfolio: string;
  makerPortfolioId: string;
  makerPositionEpoch: string;
  feeBps: string;
}

const text = (s: string) => ({content: [{type: "text" as const, text: s}]});
const json = (v: unknown) => text(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2));

export function questionSummary(q: QuestionState, manifest?: SignedQuestion["manifest"], quote?: Quote) {
  return {
    slot: q.asset.index,
    generation: q.asset.marketId.toString(),
    title: manifest?.title ?? null,
    resolutionCriteria: manifest?.resolutionCriteria ?? null,
    closesAt: manifest?.closesAt ?? null,
    resolver: q.asset.oracle.oracleAuthority.toBase58(),
    phase: q.phase,
    outcome: q.outcome,
    probabilityYes: formatProb(q.probabilityE6),
    probabilityYesE6: q.probabilityE6.toString(),
    converging: q.converged ? null : formatProb(q.targetE6),
    openInterestYesShares: q.openInterestYesShares,
    openInterestNoShares: q.openInterestNoShares,
    yesProfitRealizable: `${Math.round(q.yesRealizable * 100)}%`,
    noProfitRealizable: `${Math.round(q.noRealizable * 100)}%`,
    quote: quote
      ? {buyYesAt: formatProb(BigInt(quote.askE6)), buyNoAt: formatProb(1_000_000n - BigInt(quote.bidE6)), maxBuyYesShares: quote.maxBuyShares, maxBuyNoShares: quote.maxSellShares, feeBps: quote.feeBps}
      : null,
  };
}

export function portfolioSummary(p: Portfolio, market: MarketGroup, titles: Map<string, string>) {
  const legs = p.legs.filter((l) => l.active).map((l) => {
    const asset = market.assets[l.assetIndex];
    const abs = l.basisPosQ < 0n ? -l.basisPosQ : l.basisPosQ;
    return {
      slot: l.assetIndex,
      generation: l.marketId.toString(),
      title: titles.get(`${l.assetIndex}/${l.marketId}`) ?? null,
      side: l.side === 0 ? "YES" : "NO",
      shares: Number(abs) / 1e6,
      markYes: asset ? formatProb(asset.effectivePrice) : null,
      stale: l.stale,
    };
  });
  return {
    address: p.address?.toBase58() ?? null,
    owner: p.owner.toBase58(),
    capital: formatAtoms(p.capital),
    unrealizedPnl: formatAtoms(p.pnl),
    health: p.healthCert.valid
      ? {equity: formatAtoms(p.healthCert.certifiedEquity), maintenanceRequired: formatAtoms(p.healthCert.certifiedMaintenanceReq), liquidatable: p.healthCert.certifiedLiqDeficit > 0n}
      : "awaiting crank",
    positionEpoch: p.positionEpoch.toString(),
    positions: legs,
  };
}

export function tradePreview(side: "YES" | "NO", shares: number, quote: Quote, marginBps: bigint) {
  const sizeQ = signedSizeQ(side, shares);
  const priceE6 = side === "YES" ? BigInt(quote.askE6) : BigInt(quote.bidE6);
  const cost = side === "YES" ? notionalAtoms(sizeQ, priceE6) : notionalAtoms(sizeQ, 1_000_000n - priceE6);
  const notional = notionalAtoms(sizeQ, priceE6);
  return {
    side,
    shares,
    pricePerShare: side === "YES" ? formatProb(priceE6) : formatProb(1_000_000n - priceE6),
    costNow: formatAtoms(cost),
    fee: formatAtoms((notional * BigInt(quote.feeBps)) / 10_000n),
    initialMargin: formatAtoms((notional * marginBps + 9_999n) / 10_000n),
    paysIfRight: formatAtoms(sizeQ < 0n ? -sizeQ : sizeQ),
    maxLoss: formatAtoms(worstCaseLossAtoms(side, sizeQ, priceE6)),
    sizeQ,
    priceE6,
  };
}

export function createServer(cfg: McpConfig): McpServer {
  const client = new Predictulator({connection: cfg.connection, market: cfg.market, programId: cfg.programId});
  const server = new McpServer({name: "predictulator", version: "0.2.0"});

  async function registry(): Promise<SignedQuestion[]> {
    if (!cfg.resolverUrl) return [];
    const res = await fetch(new URL("/questions", cfg.resolverUrl));
    if (!res.ok) return [];
    return ((await res.json()) as unknown[]).map((q) => SignedQuestionSchema.parse(q));
  }
  async function quotes(): Promise<Record<number, Quote>> {
    if (!cfg.makerUrl) return {};
    const res = await fetch(new URL("/quotes", cfg.makerUrl));
    if (!res.ok) return {};
    return (await res.json()) as Record<number, Quote>;
  }
  const titleMap = (reg: SignedQuestion[]) => new Map(reg.map((q) => [`${q.manifest.assetIndex}/${q.manifest.marketId}`, q.manifest.title]));

  server.registerTool(
    "market_summary",
    {description: "Vault, insurance, capital, question count, mode, and risk parameters of the Predictulator market.", inputSchema: {}},
    async () => {
      const m = await client.fetchMarket();
      return json({
        market: cfg.market.toBase58(),
        mode: m.mode === 0 ? "Live" : m.mode === 1 ? "Resolved" : "Recovery",
        vault: formatAtoms(m.vault),
        insurance: formatAtoms(m.insurance),
        capital: formatAtoms(m.cTot),
        portfolios: m.materializedPortfolioCount.toString(),
        questions: m.assets.length - 1,
        questionCreationFee: formatAtoms(m.wrapper.permissionlessMarketInitFee),
        forceCloseDelaySlots: m.wrapper.forceCloseDelaySlots.toString(),
        initialMarginBps: m.config.initialMarginBps.toString(),
        maintenanceMarginBps: m.config.maintenanceMarginBps.toString(),
        maxPriceMoveBpsPerSlot: m.config.maxPriceMoveBpsPerSlot.toString(),
        tradeFeeBaseBps: m.wrapper.tradeFeeBaseBps.toString(),
      });
    },
  );

  server.registerTool(
    "list_questions",
    {description: "Every question on the market with probability, phase, open interest, realizable credit per side, and the maker's quote when available.", inputSchema: {}},
    async () => {
      const [m, reg, qs] = await Promise.all([client.fetchMarket(), registry(), quotes()]);
      const byKey = new Map(reg.map((q) => [`${q.manifest.assetIndex}/${q.manifest.marketId}`, q.manifest]));
      return json(Predictulator.questions(m).map((q) => questionSummary(q, byKey.get(`${q.asset.index}/${q.asset.marketId}`), qs[q.asset.index])));
    },
  );

  server.registerTool(
    "get_question",
    {description: "One question by slot index: chain state, manifest text if registered, and the current quote.", inputSchema: {assetIndex: z.number().int().min(1)}},
    async ({assetIndex}) => {
      const [m, reg, qs] = await Promise.all([client.fetchMarket(), registry(), quotes()]);
      const asset = m.assets[assetIndex];
      if (!asset) return text(`no slot ${assetIndex}; the market has ${m.assets.length} slots`);
      const q = Predictulator.questionState(asset);
      const manifest = reg.find((r) => r.manifest.assetIndex === assetIndex && BigInt(r.manifest.marketId) === asset.marketId)?.manifest;
      return json(questionSummary(q, manifest, qs[assetIndex]));
    },
  );

  server.registerTool(
    "explain_credit_rate",
    {description: "Explains, in numbers, how much of each side's profit on a question is currently backed by the other side's reserved collateral and why.", inputSchema: {assetIndex: z.number().int().min(1)}},
    async ({assetIndex}) => {
      const m = await client.fetchMarket();
      const a = m.assets[assetIndex];
      if (!a) return text(`no slot ${assetIndex}`);
      const line = (side: "YES" | "NO") => {
        const sc = side === "YES" ? a.sourceCreditShort : a.sourceCreditLong;
        const rate = Number(sc.creditRateNum) / 1e12;
        const claims = sc.positiveClaimBoundNum;
        const backing = sc.freshReservedBackingNum - sc.validLienedBackingNum - sc.impairedLienedBackingNum + sc.insuranceCreditReservedNum;
        return `${side} profit is ${Math.round(rate * 100)}% realizable. Claims owed to ${side} holders (bound): ${claims.toString()}; collateral the ${side === "YES" ? "NO" : "YES"} side has reserved and not yet liened: ${backing.toString()}. ` +
          (rate >= 1 ? `Fully backed: ${side} profit behaves like cash across the portfolio.` : `The unbacked remainder is a claim on the ${side === "YES" ? "NO" : "YES"} side's future margin; nobody else is charged for it.`);
      };
      return text(`${line("YES")}\n\n${line("NO")}\n\nRule (engine): credit_rate = min(1, available_backing / positive_claim_bound), per source domain, per question.`);
    },
  );

  server.registerTool(
    "get_portfolio",
    {description: "Portfolios owned by a wallet on this market: capital, unrealized PnL, health, and open positions with question titles.", inputSchema: {owner: z.string().describe("base58 wallet address")}},
    async ({owner}) => {
      const [m, reg, ps] = await Promise.all([client.fetchMarket(), registry(), client.findPortfolios(new PublicKey(owner))]);
      if (ps.length === 0) return text(`${owner} has no portfolio on this market. Create one with the trading page or the ops CLI.`);
      return json(ps.map((p) => portfolioSummary(p, m, titleMap(reg))));
    },
  );

  server.registerTool(
    "preview_trade",
    {description: "Price a YES or NO purchase of N shares on a question at the maker's current quote: cost, fee, margin, payout, max loss. Does not build or send anything.", inputSchema: {assetIndex: z.number().int().min(1), side: z.enum(["YES", "NO"]), shares: z.number().int().min(1)}},
    async ({assetIndex, side, shares}) => {
      const [m, qs] = await Promise.all([client.fetchMarket(), quotes()]);
      const q = qs[assetIndex];
      if (!q) return text(`the maker is not quoting slot ${assetIndex}`);
      const cap = side === "YES" ? q.maxBuyShares : q.maxSellShares;
      if (shares > cap) return text(`the maker will fill at most ${cap} ${side} shares right now`);
      const p = tradePreview(side, shares, q, m.config.initialMarginBps);
      return json({...p, sizeQ: p.sizeQ.toString(), priceE6: p.priceE6.toString()});
    },
  );

  server.registerTool(
    "build_trade",
    {
      description: "Build an unsigned TradeNoCpi transaction for the wallet to sign: taker as account A, the maker as account B, at the maker's current quote. Returns base64 to sign, then pass to submit_fill.",
      inputSchema: {owner: z.string().describe("taker wallet, base58"), assetIndex: z.number().int().min(1), side: z.enum(["YES", "NO"]), shares: z.number().int().min(1)},
    },
    async ({owner, assetIndex, side, shares}) => {
      const ownerKey = new PublicKey(owner);
      const [m, qs, ps] = await Promise.all([client.fetchMarket(), quotes(), client.findPortfolios(ownerKey)]);
      const q = qs[assetIndex];
      const asset = m.assets[assetIndex];
      if (!q || !asset) return text(`the maker is not quoting slot ${assetIndex}`);
      const portfolio = ps[0];
      if (!portfolio?.address) return text(`${owner} has no portfolio on this market`);
      const cap = side === "YES" ? q.maxBuyShares : q.maxSellShares;
      if (shares > cap) return text(`the maker will fill at most ${cap} ${side} shares right now`);
      const p = tradePreview(side, shares, q, m.config.initialMarginBps);
      const tx = new Transaction().add(
        ix.tradeNoCpi(
          {signerA: ownerKey, signerB: new PublicKey(q.makerOwner), market: cfg.market, portfolioA: portfolio.address, portfolioB: new PublicKey(q.makerPortfolio)},
          {
            accountAPortfolioId: portfolio.portfolioId,
            accountAPositionEpoch: portfolio.positionEpoch,
            accountBPortfolioId: BigInt(q.makerPortfolioId),
            accountBPositionEpoch: BigInt(q.makerPositionEpoch),
            assetIndex,
            marketId: asset.marketId,
            sizeQ: p.sizeQ,
            execPrice: p.priceE6,
            feeBps: BigInt(q.feeBps),
            backingFeeCapBps: 0,
          },
          {programId: cfg.programId},
        ),
      );
      tx.feePayer = ownerKey;
      tx.recentBlockhash = (await cfg.connection.getLatestBlockhash("confirmed")).blockhash;
      return json({
        preview: {...p, sizeQ: p.sizeQ.toString(), priceE6: p.priceE6.toString()},
        transactionBase64: tx.serialize({requireAllSignatures: false, verifySignatures: false}).toString("base64"),
        next: "Sign with the taker wallet (do not change the fee payer), then call submit_fill with the signed transaction. The maker co-signs only if price and size still match its quote.",
      });
    },
  );

  server.registerTool(
    "submit_fill",
    {description: "Send a taker-signed TradeNoCpi transaction (base64) to the maker for co-signing and submission. Returns the signature or the maker's rejection reason.", inputSchema: {signedTransactionBase64: z.string()}},
    async ({signedTransactionBase64}) => {
      if (!cfg.makerUrl) return text("no maker configured (MAKER_URL)");
      const res = await fetch(new URL("/fill", cfg.makerUrl), {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({transaction: signedTransactionBase64})});
      return json(await res.json());
    },
  );

  return server;
}
