/**
 * High-level client. Reads market and portfolio state and builds the
 * multi-instruction transactions that the lifecycle needs. Signing is left to
 * the caller so this works with wallets, keypairs, and co-signing services.
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Commitment,
} from "@solana/web3.js";
import {
  decodeMarketGroup,
  decodePortfolio,
  type MarketAsset,
  type MarketGroup,
  type Portfolio,
} from "./accounts.js";
import {
  AccountKind,
  AssetAction,
  AssetLifecycle,
  DEFAULT_PROGRAM_ID,
  HEADER_LEN,
  MAGIC,
  MarketMode,
  OracleMode,
  WRAPPER_VERSION,
} from "./constants.js";
import * as ixb from "./instructions.js";
import {
  PORTFOLIO_ACCOUNT_LEN,
  PORTFOLIO_STATE,
  fieldOffset,
  marketAccountLenForCapacity,
} from "./layout.js";
import { deriveVaultAuthority } from "./pda.js";
import { MARK_NO, MARK_YES, type Outcome } from "./probability.js";
import { manifestMemo, type QuestionManifest } from "./question.js";

export interface PredictulatorConfig {
  connection: Connection;
  market: PublicKey;
  programId?: PublicKey;
  commitment?: Commitment;
}

export interface QuestionState {
  asset: MarketAsset;
  /** Current probability mark the engine is using (effective price). */
  probabilityE6: bigint;
  /** Where the oracle is steering the mark (raw target). */
  targetE6: bigint;
  /** Engine has caught up to the oracle target. */
  converged: boolean;
  phase: "open" | "resolving" | "resolved" | "retired" | "inactive";
  outcome: Outcome | null;
  /** 0..1, how much of YES-side profit the engine will currently honor. */
  yesRealizable: number;
  noRealizable: number;
  openInterestYesShares: number;
  openInterestNoShares: number;
}

export class Predictulator {
  readonly connection: Connection;
  readonly market: PublicKey;
  readonly programId: PublicKey;
  readonly commitment: Commitment;

  constructor(cfg: PredictulatorConfig) {
    this.connection = cfg.connection;
    this.market = cfg.market;
    this.programId = cfg.programId ?? DEFAULT_PROGRAM_ID;
    this.commitment = cfg.commitment ?? "confirmed";
  }

  get vaultAuthority(): PublicKey {
    return deriveVaultAuthority(this.market, this.programId)[0];
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async fetchMarket(): Promise<MarketGroup> {
    const info = await this.connection.getAccountInfo(this.market, this.commitment);
    if (!info) throw new Error(`market account ${this.market.toBase58()} not found`);
    if (!info.owner.equals(this.programId)) {
      throw new Error(`market account is owned by ${info.owner.toBase58()}, expected the Percolator program`);
    }
    return decodeMarketGroup(new Uint8Array(info.data), this.market);
  }

  async fetchPortfolio(address: PublicKey): Promise<Portfolio | null> {
    const info = await this.connection.getAccountInfo(address, this.commitment);
    if (!info) return null;
    return decodePortfolio(new Uint8Array(info.data), address);
  }

  /** All portfolios in this market owned by `owner` (getProgramAccounts, memcmp on the owner field). */
  async findPortfolios(owner: PublicKey): Promise<Portfolio[]> {
    const ownerOff = HEADER_LEN + fieldOffset(PORTFOLIO_STATE, "owner");
    const marketOff = HEADER_LEN + fieldOffset(PORTFOLIO_STATE, "provenance_header");
    const kindOff = 10;
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      commitment: this.commitment,
      filters: [
        { dataSize: PORTFOLIO_ACCOUNT_LEN },
        { memcmp: { offset: kindOff, bytes: Buffer.from([AccountKind.Portfolio]).toString("base64"), encoding: "base64" } },
        { memcmp: { offset: marketOff, bytes: this.market.toBase58() } },
        { memcmp: { offset: ownerOff, bytes: owner.toBase58() } },
      ],
    });
    return accounts.map((a) => decodePortfolio(new Uint8Array(a.account.data), a.pubkey));
  }

  /** Every portfolio in the market. Keepers use this to find crank targets. */
  async listPortfolios(): Promise<Portfolio[]> {
    const marketOff = HEADER_LEN + fieldOffset(PORTFOLIO_STATE, "provenance_header");
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      commitment: this.commitment,
      filters: [
        { dataSize: PORTFOLIO_ACCOUNT_LEN },
        { memcmp: { offset: marketOff, bytes: this.market.toBase58() } },
      ],
    });
    return accounts.map((a) => decodePortfolio(new Uint8Array(a.account.data), a.pubkey));
  }

  // -------------------------------------------------------------------------
  // Question state
  // -------------------------------------------------------------------------

  static questionState(asset: MarketAsset): QuestionState {
    const converged = asset.effectivePrice === asset.rawOracleTargetPrice;
    let phase: QuestionState["phase"];
    let outcome: Outcome | null = null;
    switch (asset.lifecycle) {
      case AssetLifecycle.Active:
      case AssetLifecycle.DrainOnly:
        phase = "open";
        break;
      case AssetLifecycle.Recovery:
        phase = asset.oiEffLongQ === 0n && asset.oiEffShortQ === 0n ? "resolved" : "resolving";
        if (asset.effectivePrice === MARK_YES) outcome = "YES";
        else if (asset.effectivePrice === MARK_NO) outcome = "NO";
        break;
      case AssetLifecycle.Retired:
        phase = "retired";
        break;
      default:
        phase = "inactive";
    }
    return {
      asset,
      probabilityE6: asset.effectivePrice,
      targetE6: asset.rawOracleTargetPrice,
      converged,
      phase,
      outcome,
      yesRealizable: Number(asset.sourceCreditShort.creditRateNum) / 1e12,
      noRealizable: Number(asset.sourceCreditLong.creditRateNum) / 1e12,
      openInterestYesShares: Number(asset.oiEffLongQ) / 1e6,
      openInterestNoShares: Number(asset.oiEffShortQ) / 1e6,
    };
  }

  /** Questions are every slot except asset 0, which Percolator reserves as the base asset. */
  static questions(market: MarketGroup): QuestionState[] {
    return market.assets.filter((a) => a.index !== 0).map((a) => Predictulator.questionState(a));
  }

  // -------------------------------------------------------------------------
  // Transaction builders
  // -------------------------------------------------------------------------

  /**
   * Create and initialize a portfolio. The caller supplies a fresh keypair for
   * the account and signs with both it and the owner.
   */
  async buildCreatePortfolio(owner: PublicKey, portfolio: PublicKey): Promise<Transaction> {
    const lamports = await this.connection.getMinimumBalanceForRentExemption(PORTFOLIO_ACCOUNT_LEN);
    return new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: portfolio,
        lamports,
        space: PORTFOLIO_ACCOUNT_LEN,
        programId: this.programId,
      }),
      ixb.initPortfolio({ owner, market: this.market, portfolio }, { programId: this.programId }),
    );
  }

  async buildDeposit(
    owner: PublicKey,
    portfolio: Portfolio,
    sourceToken: PublicKey,
    vaultToken: PublicKey,
    amount: bigint,
  ): Promise<Transaction> {
    return new Transaction().add(
      ixb.deposit(
        { owner, market: this.market, portfolio: this.addrOf(portfolio), sourceToken, vaultToken },
        { portfolioId: portfolio.portfolioId, expectedSequence: portfolio.matcherSequence, amount },
        { programId: this.programId },
      ),
    );
  }

  async buildWithdraw(
    owner: PublicKey,
    portfolio: Portfolio,
    destToken: PublicKey,
    vaultToken: PublicKey,
    amount: bigint,
  ): Promise<Transaction> {
    return new Transaction().add(
      ixb.withdraw(
        {
          owner,
          market: this.market,
          portfolio: this.addrOf(portfolio),
          destToken,
          vaultToken,
          vaultAuthority: this.vaultAuthority,
        },
        { portfolioId: portfolio.portfolioId, expectedSequence: portfolio.matcherSequence, amount },
        { programId: this.programId },
      ),
    );
  }

  /**
   * Activate a new question slot and commit the manifest hash in the same
   * transaction. Appends at `max_market_slots`; if the market has a free
   * retired slot the program requires reuse instead, which `buildCreateQuestion`
   * handles by targeting the first retired slot.
   *
   * The market account grows by one slot, so the creator funds the extra rent
   * with a system transfer first (the program does not).
   */
  async buildCreateQuestion(
    market: MarketGroup,
    manifest: QuestionManifest,
    opts: {
      creator: PublicKey;
      feeSourceToken: PublicKey;
      vaultToken: PublicKey;
      initialProbabilityE6: bigint;
      nowSlot: bigint;
      /** Defaults to the resolver for every role; a production deployment should split these. */
      insuranceAuthority?: PublicKey;
      insuranceOperator?: PublicKey;
      backingBucketAuthority?: PublicKey;
    },
  ): Promise<{ transaction: Transaction; assetIndex: number; marketId: bigint }> {
    if (market.mode !== MarketMode.Live) throw new Error("market is not live");
    const fee = market.wrapper.permissionlessMarketInitFee;
    const isMarketauth = market.wrapper.marketauth.equals(opts.creator);
    if (fee === 0n && !isMarketauth) {
      throw new Error("question creation is not permissionless on this market (init fee is zero)");
    }
    const resolver = new PublicKey(manifest.resolver);
    const retired = market.assets.find((a) => a.lifecycle === AssetLifecycle.Retired);
    const reuse = !isMarketauth && market.wrapper.freeMarketSlotCount !== 0 && retired !== undefined;
    const assetIndex = reuse ? retired.index : market.config.maxMarketSlots;
    const marketId = market.nextMarketId;
    if (manifest.assetIndex !== assetIndex || BigInt(manifest.marketId) !== marketId) {
      throw new Error(
        `manifest targets slot ${manifest.assetIndex} gen ${manifest.marketId}; market will assign slot ${assetIndex} gen ${marketId}`,
      );
    }
    if (!new PublicKey(manifest.market).equals(this.market)) throw new Error("manifest.market mismatch");

    const tx = new Transaction();
    if (!reuse && assetIndex >= market.physicalSlotCapacity) {
      const newLen = marketAccountLenForCapacity(assetIndex + 1);
      const needed = await this.connection.getMinimumBalanceForRentExemption(newLen);
      const have = (await this.connection.getBalance(this.market, this.commitment)) ?? 0;
      if (needed > have) {
        tx.add(
          SystemProgram.transfer({
            fromPubkey: opts.creator,
            toPubkey: this.market,
            lamports: needed - have,
          }),
        );
      }
    }
    tx.add(ixb.memo(manifestMemo(manifest), [opts.creator]));
    tx.add(
      ixb.updateAssetLifecycle(
        {
          authority: opts.creator,
          market: this.market,
          ...(fee > 0n ? { feeSourceToken: opts.feeSourceToken, vaultToken: opts.vaultToken } : {}),
        },
        {
          action: AssetAction.Activate,
          assetIndex,
          marketId,
          authorityEpoch: isMarketauth ? market.assets[0]!.control.authorityEpoch : 0n,
          nowSlot: opts.nowSlot,
          initialPrice: opts.initialProbabilityE6,
          maxInitFee: fee,
          insuranceAuthority: opts.insuranceAuthority ?? resolver,
          insuranceOperator: opts.insuranceOperator ?? resolver,
          backingBucketAuthority: opts.backingBucketAuthority ?? resolver,
          oracleAuthority: resolver,
        },
        { programId: this.programId },
      ),
    );
    return { transaction: tx, assetIndex, marketId };
  }

  /** Resolver: put a freshly activated question into AuthMark mode. */
  buildConfigureAuthMark(asset: MarketAsset, resolver: PublicKey, nowSlot: bigint, initialMarkE6: bigint): TransactionInstruction {
    return ixb.configureAuthMark(
      { authority: resolver, market: this.market },
      {
        assetIndex: asset.index,
        marketId: asset.marketId,
        nowSlot,
        markE6: initialMarkE6,
        observationSequence: asset.control.oracleObservation + 1n,
        authorityEpoch: asset.control.authorityEpoch,
      },
      { programId: this.programId },
    );
  }

  /** Resolver: steer the probability mark. */
  buildPushMark(asset: MarketAsset, resolver: PublicKey, nowSlot: bigint, markE6: bigint): TransactionInstruction {
    if (asset.oracle.oracleMode !== OracleMode.AuthMark) {
      throw new Error(`asset ${asset.index} is not in AuthMark mode`);
    }
    return ixb.pushAuthMark(
      { authority: resolver, market: this.market },
      {
        assetIndex: asset.index,
        marketId: asset.marketId,
        nowSlot,
        markE6,
        observationSequence: asset.control.oracleObservation + 1n,
        authorityEpoch: asset.control.authorityEpoch,
      },
      { programId: this.programId },
    );
  }

  /**
   * Resolver: freeze the question at its current effective mark. Call only
   * after the final YES/NO mark has converged (see `QuestionState.converged`).
   * `authority` is marketauth (epoch of asset 0) or the asset admin (its own epoch).
   */
  buildShutdown(market: MarketGroup, asset: MarketAsset, authority: PublicKey, nowSlot: bigint): TransactionInstruction {
    const isMarketauth = market.wrapper.marketauth.equals(authority);
    const epoch = isMarketauth ? market.assets[0]!.control.authorityEpoch : asset.control.authorityEpoch;
    return ixb.shutdownAsset(
      { authority, market: this.market },
      { assetIndex: asset.index, marketId: asset.marketId, authorityEpoch: epoch, nowSlot },
      { programId: this.programId },
    );
  }

  /** Keeper: net one long against one short at the frozen mark. */
  buildForceClose(
    cranker: PublicKey,
    asset: MarketAsset,
    portfolioA: PublicKey,
    portfolioB: PublicKey,
    closeQ: bigint,
    nowSlot: bigint,
  ): TransactionInstruction {
    return ixb.forceCloseAbandonedAsset(
      { cranker, market: this.market, portfolioA, portfolioB },
      { assetIndex: asset.index, nowSlot, closeQ },
      { programId: this.programId },
    );
  }

  /** Keeper: bounded progress on one portfolio. */
  buildCrank(caller: PublicKey, portfolio: PublicKey, nowSlot: bigint, hints: ixb.CrankObservationHint[] = [], rewardPortfolio?: PublicKey): TransactionInstruction {
    return ixb.permissionlessCrank(
      { caller, market: this.market, portfolio, ...(rewardPortfolio ? { rewardPortfolio } : {}) },
      { nowSlot, hints },
      { programId: this.programId },
    );
  }

  private addrOf(p: Portfolio): PublicKey {
    if (!p.address) throw new Error("portfolio has no address; fetch it through the client");
    return p.address;
  }
}

/** Sanity check that an account is a Percolator market of the expected program. */
export function looksLikeMarket(data: Uint8Array): boolean {
  if (data.length < HEADER_LEN) return false;
  const magic = new DataView(data.buffer, data.byteOffset, 8).getBigUint64(0, true);
  return magic === MAGIC && data[8]! === (WRAPPER_VERSION & 0xff) && data[10] === AccountKind.Market;
}
