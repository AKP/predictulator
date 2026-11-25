import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  formatAtoms,
  formatProb,
  instructions as ix,
  notionalAtoms,
  signedSizeQ,
  worstCaseLossAtoms,
  type MarketGroup,
  type Portfolio,
  type Predictulator,
} from "@predictulator/sdk";
import type { QuestionView } from "../App";
import { postFill, type PublishedQuote } from "../api";
import type { AppConfig } from "../config";

export function TradeTicket({
  view,
  quote,
  client,
  config,
  market,
  portfolios,
  onTraded,
}: {
  view: QuestionView;
  quote: PublishedQuote | null;
  client: Predictulator;
  config: AppConfig;
  market: MarketGroup;
  portfolios: Portfolio[];
  onTraded: () => void;
}): JSX.Element {
  const wallet = useWallet();
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [shares, setShares] = useState(10);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const portfolio = portfolios[0] ?? null;

  const priceE6 = useMemo(() => {
    if (!quote) return null;
    return side === "YES" ? BigInt(quote.askE6) : BigInt(quote.bidE6);
  }, [quote, side]);
  const maxShares = quote ? (side === "YES" ? quote.maxBuyShares : quote.maxSellShares) : 0;
  const sizeQ = signedSizeQ(side, Math.max(0, Math.floor(shares)));
  const cost = priceE6 !== null ? notionalAtoms(sizeQ, priceE6) : null;
  const maxLoss = priceE6 !== null ? worstCaseLossAtoms(side, sizeQ, priceE6) : null;
  const payout = sizeQ < 0n ? -sizeQ : sizeQ; // 1.000000 per share if right

  async function submit(): Promise<void> {
    if (!wallet.publicKey || !wallet.signTransaction || !quote || priceE6 === null || !portfolio?.address) return;
    setBusy(true);
    setMsg(null);
    try {
      const asset = view.state!.asset;
      const tx = new Transaction().add(
        ix.tradeNoCpi(
          {
            signerA: wallet.publicKey,
            signerB: new PublicKey(quote.makerOwner),
            market: config.market,
            portfolioA: portfolio.address,
            portfolioB: new PublicKey(quote.makerPortfolio),
          },
          {
            accountAPortfolioId: portfolio.portfolioId,
            accountAPositionEpoch: portfolio.positionEpoch,
            accountBPortfolioId: BigInt(quote.makerPortfolioId),
            accountBPositionEpoch: BigInt(quote.makerPositionEpoch),
            assetIndex: asset.index,
            marketId: asset.marketId,
            sizeQ,
            execPrice: priceE6,
            feeBps: BigInt(quote.feeBps),
            backingFeeCapBps: 0,
          },
          { programId: config.programId },
        ),
      );
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await client.connection.getLatestBlockhash("confirmed")).blockhash;
      const signed = await wallet.signTransaction(tx);
      const sig = await postFill(config.makerUrl, signed.serialize({ requireAllSignatures: false }).toString("base64"));
      setMsg(`Filled. Signature ${sig}`);
      onTraded();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const disabled =
    busy || !wallet.publicKey || !quote || priceE6 === null || !portfolio || shares <= 0 || shares > maxShares;

  return (
    <div className="ticket">
      <h3>Trade</h3>
      {!quote ? <p className="muted">The maker is not quoting this question right now.</p> : null}
      <div className="seg">
        <button className={side === "YES" ? "on" : ""} onClick={() => setSide("YES")} type="button">
          YES {quote ? formatProb(BigInt(quote.askE6)) : ""}
        </button>
        <button className={side === "NO" ? "on" : ""} onClick={() => setSide("NO")} type="button">
          NO {quote ? formatProb(1_000_000n - BigInt(quote.bidE6)) : ""}
        </button>
      </div>
      <label className="field">
        <span>Shares (max {maxShares})</span>
        <input
          min={1}
          max={maxShares || 1}
          onChange={(e) => setShares(Number(e.target.value))}
          step={1}
          type="number"
          value={shares}
        />
      </label>
      {cost !== null && maxLoss !== null ? (
        <dl className="kv compact">
          <dt>Price</dt>
          <dd>{side === "YES" ? formatProb(priceE6!) : formatProb(1_000_000n - priceE6!)} per share</dd>
          <dt>Cost now</dt>
          <dd>{formatAtoms(side === "YES" ? cost : notionalAtoms(sizeQ, 1_000_000n - priceE6!))}</dd>
          <dt>Pays if right</dt>
          <dd>{formatAtoms(payout)}</dd>
          <dt>Max loss</dt>
          <dd>{formatAtoms(maxLoss)}</dd>
          <dt>Fee</dt>
          <dd>{quote?.feeBps ?? "—"} bps of notional</dd>
          <dt>Initial margin</dt>
          <dd>{(Number(market.config.initialMarginBps) / 100).toFixed(0)}% of notional</dd>
        </dl>
      ) : null}
      {!wallet.publicKey ? <p className="muted small">Connect a wallet to trade.</p> : null}
      {wallet.publicKey && !portfolio ? (
        <p className="muted small">Create and fund a portfolio in the side panel first.</p>
      ) : null}
      <button className="primary" disabled={disabled} onClick={() => void submit()} type="button">
        {busy ? "Sending to maker" : `Buy ${side}`}
      </button>
      {msg ? <p className="small mono wrap">{msg}</p> : null}
      <p className="small muted">
        Your wallet signs a bilateral trade against the maker's portfolio; the maker co-signs if the price and
        size still match its quote, then submits it. Nothing is custodied by the maker.
      </p>
    </div>
  );
}
