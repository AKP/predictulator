import { readFileSync } from "node:fs";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  Predictulator,
  QuestionManifestSchema,
  deriveVaultAuthority,
  formatAtoms,
  formatProb,
  instructions as ix,
  marketAccountLenForCapacity,
  probToMark,
  signManifest,
  type QuestionManifest,
} from "@predictulator/sdk";
import { arg, client, ctxFromEnv, flag, json, loadKeypair, requireArg, send, type Ctx } from "./common.js";
import { PREDICTION_MARKET_PARAMS, PREDICTION_MARKET_POLICY } from "./params.js";

// ---------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------

export async function show(): Promise<void> {
  const ctx = ctxFromEnv();
  const c = client(ctx);
  const m = await c.fetchMarket();
  console.log(
    json({
      market: ctx.market,
      marketauth: m.wrapper.marketauth,
      collateralMint: m.wrapper.collateralMint,
      vaultAuthority: c.vaultAuthority,
      mode: m.mode,
      vault: formatAtoms(m.vault),
      insurance: formatAtoms(m.insurance),
      capital: formatAtoms(m.cTot),
      portfolios: m.materializedPortfolioCount,
      questionCreationFee: formatAtoms(m.wrapper.permissionlessMarketInitFee),
      forceCloseDelaySlots: m.wrapper.forceCloseDelaySlots,
      nextMarketId: m.nextMarketId,
      configuredSlots: m.config.maxMarketSlots,
      physicalSlots: m.physicalSlotCapacity,
      asset0AuthorityEpoch: m.assets[0]?.control.authorityEpoch,
    }),
  );
  for (const q of Predictulator.questions(m)) {
    console.log(
      `slot ${q.asset.index} gen ${q.asset.marketId}: ${q.phase} ${formatProb(q.probabilityE6)}${q.converged ? "" : ` -> ${formatProb(q.targetE6)}`} ` +
        `OI ${q.openInterestYesShares} YES / ${q.openInterestNoShares} NO ` +
        `realizable YES ${(q.yesRealizable * 100).toFixed(0)}% NO ${(q.noRealizable * 100).toFixed(0)}% ` +
        `oracle ${q.asset.oracle.oracleAuthority.toBase58()} mode ${q.asset.oracle.oracleMode}`,
    );
  }
}

// ---------------------------------------------------------------------------
// mint-test-tokens (devnet collateral)
// ---------------------------------------------------------------------------

export async function mintTestTokens(args: string[]): Promise<void> {
  const ctx = ctxFromEnv(false);
  const payer = loadKeypair(requireArg(args, "payer"));
  const amount = BigInt(arg(args, "amount") ?? "1000000000"); // 1,000 units at 6 decimals
  const existing = arg(args, "mint");
  const recipient = new PublicKey(arg(args, "to") ?? payer.publicKey.toBase58());
  let mint: PublicKey;
  const instructions = [];
  let mintKp: Keypair | null = null;
  if (existing) {
    mint = new PublicKey(existing);
  } else {
    mintKp = Keypair.generate();
    mint = mintKp.publicKey;
    const lamports = await ctx.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    instructions.push(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint,
        lamports,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(mint, 6, payer.publicKey, null),
    );
  }
  const ata = getAssociatedTokenAddressSync(mint, recipient, true);
  instructions.push(
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, recipient, mint),
    createMintToInstruction(mint, ata, payer.publicKey, amount),
  );
  await send(ctx, instructions, mintKp ? [payer, mintKp] : [payer], "mint test tokens");
  console.log(json({ mint, recipient, tokenAccount: ata, amount: formatAtoms(amount) }));
}

// ---------------------------------------------------------------------------
// init-market
// ---------------------------------------------------------------------------

export async function initMarket(args: string[]): Promise<void> {
  const ctx = ctxFromEnv(false);
  const admin = loadKeypair(requireArg(args, "admin"));
  const mint = new PublicKey(requireArg(args, "mint"));
  const marketKp = Keypair.generate();
  const market = marketKp.publicKey;
  const space = marketAccountLenForCapacity(1);
  const lamports = await ctx.connection.getMinimumBalanceForRentExemption(space);
  const [vaultAuthority] = deriveVaultAuthority(market, ctx.programId);
  const vault = getAssociatedTokenAddressSync(mint, vaultAuthority, true);

  await send(
    ctx,
    [
      SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: market,
        lamports,
        space,
        programId: ctx.programId,
      }),
      createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, vault, vaultAuthority, mint),
      ix.initMarket({ admin: admin.publicKey, market, mint }, PREDICTION_MARKET_PARAMS, { programId: ctx.programId }),
    ],
    [admin, marketKp],
    "InitMarket",
  );

  // Policies: every lane starts at sequence 0, authority epoch 0.
  const a = { admin: admin.publicKey, market };
  const o = { programId: ctx.programId };
  const c = new Predictulator({ connection: ctx.connection, market, programId: ctx.programId });
  const m = await c.fetchMarket();
  const epoch = m.assets[0]!.control.authorityEpoch;
  await send(
    ctx,
    [
      ix.configurePermissionlessResolve(
        a,
        {
          assetGenerationFrontier: m.nextMarketId,
          staleSlots: PREDICTION_MARKET_POLICY.permissionlessResolveStaleSlots,
          forceCloseDelaySlots: PREDICTION_MARKET_POLICY.forceCloseDelaySlots,
          policySequence: 1n,
          authorityEpoch: epoch,
        },
        o,
      ),
      ix.updateMarketInitFeePolicy(
        a,
        { minInitFee: PREDICTION_MARKET_POLICY.questionCreationFeeAtoms, policySequence: 1n, authorityEpoch: epoch },
        o,
      ),
      ix.updateLiquidationFeePolicy(
        a,
        { crankerShareBps: PREDICTION_MARKET_POLICY.liquidationCrankerShareBps, policySequence: 1n, authorityEpoch: epoch },
        o,
      ),
    ],
    [admin],
    "configure policies",
  );
  console.log(json({ market, vault, vaultAuthority, marketauth: admin.publicKey, mint }));
  console.log("\nExport this for every service and the web app:\n  MARKET=" + market.toBase58());
}

// ---------------------------------------------------------------------------
// create-question
// ---------------------------------------------------------------------------

export async function createQuestion(args: string[]): Promise<void> {
  const ctx = ctxFromEnv();
  const c = client(ctx);
  const creator = loadKeypair(requireArg(args, "creator"));
  const draft = JSON.parse(readFileSync(requireArg(args, "manifest"), "utf8")) as Partial<QuestionManifest>;
  const resolverUrl = arg(args, "resolver-url");
  const initial = Number(arg(args, "initial-probability") ?? "0.5");

  const m = await c.fetchMarket();
  const resolver = new PublicKey(draft.resolver ?? requireArg(args, "resolver"));
  const retired = m.assets.find((x) => x.lifecycle === 4);
  const isMarketauth = m.wrapper.marketauth.equals(creator.publicKey);
  const assetIndex = !isMarketauth && m.wrapper.freeMarketSlotCount !== 0 && retired ? retired.index : m.config.maxMarketSlots;
  const manifest: QuestionManifest = QuestionManifestSchema.parse({
    version: 1,
    tags: [],
    createdAt: new Date().toISOString(),
    ...draft,
    market: ctx.market!.toBase58(),
    assetIndex,
    marketId: m.nextMarketId.toString(),
    resolver: resolver.toBase58(),
    creator: creator.publicKey.toBase58(),
  });
  const signed = signManifest(manifest, creator.secretKey);

  const mint = m.wrapper.collateralMint;
  const feeSource = getAssociatedTokenAddressSync(mint, creator.publicKey);
  const vault = getAssociatedTokenAddressSync(mint, c.vaultAuthority, true);
  const slot = BigInt(await ctx.connection.getSlot("confirmed"));
  const { transaction } = await c.buildCreateQuestion(m, manifest, {
    creator: creator.publicKey,
    feeSourceToken: feeSource,
    vaultToken: vault,
    initialProbabilityE6: probToMark(initial),
    nowSlot: slot,
  });
  if (flag(args, "dry-run")) {
    console.log(json({ manifest, hash: signed.hash, instructions: transaction.instructions.length }));
    return;
  }
  await send(ctx, transaction.instructions, [creator], `activate slot ${assetIndex} gen ${manifest.marketId}`);
  console.log(json(signed));
  if (resolverUrl) {
    const res = await fetch(new URL("/questions", resolverUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signed),
    });
    console.log(`registered with resolver: ${res.status} ${await res.text()}`);
  } else {
    console.log("Not registered with a resolver (pass --resolver-url). Save the JSON above and POST it to /questions.");
  }
}

// ---------------------------------------------------------------------------
// portfolio
// ---------------------------------------------------------------------------

export async function portfolio(args: string[]): Promise<void> {
  const ctx = ctxFromEnv();
  const c = client(ctx);
  const owner = loadKeypair(requireArg(args, "owner"));
  const sub = args[0];
  if (sub === "create") {
    const kp = Keypair.generate();
    const tx = await c.buildCreatePortfolio(owner.publicKey, kp.publicKey);
    await send(ctx, tx.instructions, [owner, kp], "InitPortfolio");
    console.log(json({ portfolio: kp.publicKey, owner: owner.publicKey }));
    return;
  }
  const list = await c.findPortfolios(owner.publicKey);
  if (sub === "list" || sub === undefined) {
    for (const p of list) {
      console.log(
        json({
          address: p.address,
          id: p.portfolioId,
          capital: formatAtoms(p.capital),
          pnl: formatAtoms(p.pnl),
          positionEpoch: p.positionEpoch,
          sequence: p.matcherSequence,
          legs: p.legs.filter((l) => l.active).map((l) => ({ asset: l.assetIndex, gen: l.marketId, side: l.side === 0 ? "YES" : "NO", q: l.basisPosQ })),
        }),
      );
    }
    return;
  }
  const p = list[0];
  if (!p) throw new Error("no portfolio for this owner; run `portfolio create` first");
  const m = await c.fetchMarket();
  const mint = m.wrapper.collateralMint;
  const user = getAssociatedTokenAddressSync(mint, owner.publicKey);
  const vault = getAssociatedTokenAddressSync(mint, c.vaultAuthority, true);
  const atoms = BigInt(Math.round(Number(requireArg(args, "amount")) * 1_000_000));
  if (sub === "deposit") {
    const tx = await c.buildDeposit(owner.publicKey, p, user, vault, atoms);
    await send(ctx, tx.instructions, [owner], `deposit ${formatAtoms(atoms)}`);
  } else if (sub === "withdraw") {
    const tx = await c.buildWithdraw(owner.publicKey, p, user, vault, atoms);
    await send(ctx, tx.instructions, [owner], `withdraw ${formatAtoms(atoms)}`);
  } else {
    throw new Error(`unknown portfolio subcommand ${sub}`);
  }
}

// ---------------------------------------------------------------------------
// resolve (convenience wrapper over the resolver API)
// ---------------------------------------------------------------------------

export async function resolve(args: string[]): Promise<void> {
  const url = requireArg(args, "resolver-url");
  const token = process.env["RESOLVER_ADMIN_TOKEN"];
  if (!token) throw new Error("RESOLVER_ADMIN_TOKEN is not set");
  const assetIndex = requireArg(args, "asset");
  const marketId = requireArg(args, "gen");
  const outcome = requireArg(args, "outcome");
  const res = await fetch(new URL(`/questions/${assetIndex}/${marketId}/resolve`, url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-resolver-token": token },
    body: JSON.stringify({ outcome, note: arg(args, "note") }),
  });
  console.log(res.status, await res.text());
}

export { type Ctx };
