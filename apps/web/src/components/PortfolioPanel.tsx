import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Keypair } from "@solana/web3.js";
import {
  deriveAssociatedTokenAddress,
  deriveVaultTokenAccount,
  formatAtoms,
  formatProb,
  instructions as ix,
  type MarketGroup,
  type Portfolio,
  type Predictulator,
} from "@predictulator/sdk";
import type { QuestionView } from "../App";
import type { AppConfig } from "../config";

export function PortfolioPanel({
  client,
  config,
  market,
  portfolios,
  questions,
  onChanged,
}: {
  client: Predictulator;
  config: AppConfig;
  market: MarketGroup | null;
  portfolios: Portfolio[];
  questions: QuestionView[];
  onChanged: () => void;
}): JSX.Element {
  const wallet = useWallet();
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<string>): Promise<void> {
    setBusy(label);
    setMsg(null);
    try {
      const sig = await fn();
      setMsg(`${label}: ${sig}`);
      onChanged();
    } catch (e) {
      setMsg(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function createPortfolio(): Promise<string> {
    if (!wallet.publicKey || !wallet.signTransaction) throw new Error("wallet not connected");
    const kp = Keypair.generate();
    const tx = await client.buildCreatePortfolio(wallet.publicKey, kp.publicKey);
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await client.connection.getLatestBlockhash("confirmed")).blockhash;
    tx.partialSign(kp);
    const signed = await wallet.signTransaction(tx);
    const sig = await client.connection.sendRawTransaction(signed.serialize());
    await client.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  async function signAndSend(tx: import("@solana/web3.js").Transaction): Promise<string> {
    if (!wallet.publicKey || !wallet.signTransaction) throw new Error("wallet not connected");
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await client.connection.getLatestBlockhash("confirmed")).blockhash;
    const signed = await wallet.signTransaction(tx);
    const sig = await client.connection.sendRawTransaction(signed.serialize());
    await client.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  /** Owner-signed risk reduction at the engine's effective price: closes the whole leg. */
  async function closePosition(leg: Portfolio["legs"][number]): Promise<string> {
    const p = portfolios[0];
    if (!p?.address || !wallet.publicKey) throw new Error("no portfolio");
    const abs = leg.basisPosQ < 0n ? -leg.basisPosQ : leg.basisPosQ;
    const tx = new (await import("@solana/web3.js")).Transaction().add(
      ix.rebalanceReduce(
        {owner: wallet.publicKey, market: config.market, portfolio: p.address},
        {portfolioId: p.portfolioId, positionEpoch: p.positionEpoch, assetIndex: leg.assetIndex, reduceQ: abs},
        {programId: config.programId},
      ),
    );
    return signAndSend(tx);
  }

  /** Moves realizable positive PnL into capital so it can be withdrawn. */
  async function convertPnl(): Promise<string> {
    const p = portfolios[0];
    if (!p?.address || !wallet.publicKey) throw new Error("no portfolio");
    const atoms = BigInt(Math.round(Number(amount) * 1_000_000));
    if (atoms <= 0n) throw new Error("amount must be positive");
    const tx = new (await import("@solana/web3.js")).Transaction().add(
      ix.convertReleasedPnl(
        {owner: wallet.publicKey, market: config.market, portfolio: p.address},
        {portfolioId: p.portfolioId, positionEpoch: p.positionEpoch, amount: atoms},
        {programId: config.programId},
      ),
    );
    return signAndSend(tx);
  }

  async function move(direction: "deposit" | "withdraw"): Promise<string> {
    if (!wallet.publicKey || !wallet.signTransaction || !market) throw new Error("wallet not connected");
    const p = portfolios[0];
    if (!p) throw new Error("no portfolio");
    const atoms = BigInt(Math.round(Number(amount) * 1_000_000));
    if (atoms <= 0n) throw new Error("amount must be positive");
    const mint = market.wrapper.collateralMint;
    const userToken = deriveAssociatedTokenAddress(wallet.publicKey, mint);
    const vaultToken = deriveVaultTokenAccount(config.market, mint, config.programId);
    const tx =
      direction === "deposit"
        ? await client.buildDeposit(wallet.publicKey, p, userToken, vaultToken, atoms)
        : await client.buildWithdraw(wallet.publicKey, p, userToken, vaultToken, atoms);
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await client.connection.getLatestBlockhash("confirmed")).blockhash;
    const signed = await wallet.signTransaction(tx);
    const sig = await client.connection.sendRawTransaction(signed.serialize());
    await client.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  const titleFor = (assetIndex: number, marketId: bigint): string =>
    questions.find((q) => q.signed.manifest.assetIndex === assetIndex && BigInt(q.signed.manifest.marketId) === marketId)
      ?.signed.manifest.title ?? `slot ${assetIndex} gen ${marketId}`;

  if (!wallet.publicKey) {
    return (
      <div className="panel">
        <h3>Portfolio</h3>
        <p className="muted small">Connect a wallet to see or create a portfolio.</p>
        <WalletMultiButton />
      </div>
    );
  }

  const p = portfolios[0] ?? null;
  return (
    <div className="panel">
      <h3>Portfolio</h3>
      {!p ? (
        <>
          <p className="muted small">
            A portfolio is your margin account on this market: one on-chain account that holds collateral and
            every open position.
          </p>
          <button className="primary" disabled={busy !== null} onClick={() => void run("Create portfolio", createPortfolio)} type="button">
            {busy === "Create portfolio" ? "Creating" : "Create portfolio"}
          </button>
        </>
      ) : (
        <>
          <dl className="kv compact">
            <dt>Account</dt>
            <dd className="mono small">{p.address?.toBase58()}</dd>
            <dt>Capital</dt>
            <dd>{formatAtoms(p.capital)}</dd>
            <dt>Unrealized PnL</dt>
            <dd className={p.pnl < 0n ? "neg" : p.pnl > 0n ? "pos" : ""}>{formatAtoms(p.pnl)}</dd>
            <dt>Health</dt>
            <dd>
              {p.healthCert.valid
                ? `equity ${formatAtoms(p.healthCert.certifiedEquity)} / maintenance ${formatAtoms(p.healthCert.certifiedMaintenanceReq)}`
                : "awaiting crank"}
            </dd>
          </dl>
          <h4>Positions</h4>
          {p.legs.filter((l) => l.active).length === 0 ? (
            <p className="muted small">No open positions.</p>
          ) : (
            <ul className="plain">
              {p.legs
                .filter((l) => l.active)
                .map((l) => {
                  const asset = market?.assets[l.assetIndex];
                  const shares = Number(l.basisPosQ < 0n ? -l.basisPosQ : l.basisPosQ) / 1e6;
                  return (
                    <li key={l.slot} className="pos-row">
                      <span className={`pill ${l.side === 0 ? "yes" : "no"}`}>{l.side === 0 ? "YES" : "NO"}</span>
                      <span className="grow">{titleFor(l.assetIndex, l.marketId)}</span>
                      <span>{shares.toLocaleString()} sh</span>
                      {asset ? <span className="muted small">{formatProb(asset.effectivePrice)}</span> : null}
                      {l.stale ? <span className="muted small">stale</span> : null}
                      <button
                        className="link small"
                        disabled={busy !== null}
                        onClick={() => void run(`Close ${l.side === 0 ? "YES" : "NO"} on slot ${l.assetIndex}`, () => closePosition(l))}
                        title="Reduce the whole leg at the engine's effective price (RebalanceReduce)"
                        type="button"
                      >
                        close
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
          <h4>Collateral</h4>
          <label className="field">
            <span>Amount ({market ? "collateral units" : ""})</span>
            <input onChange={(e) => setAmount(e.target.value)} type="text" value={amount} />
          </label>
          <div className="row">
            <button disabled={busy !== null} onClick={() => void run("Deposit", () => move("deposit"))} type="button">
              Deposit
            </button>
            <button disabled={busy !== null} onClick={() => void run("Withdraw", () => move("withdraw"))} type="button">
              Withdraw
            </button>
            <button
              disabled={busy !== null || p.pnl <= 0n}
              onClick={() => void run("Convert PnL", convertPnl)}
              title="Move realizable positive PnL into capital (ConvertReleasedPnl)"
              type="button"
            >
              Convert PnL
            </button>
          </div>
          <p className="small muted">
            Deposits come from your associated token account for the market's collateral mint. Withdrawals are
            limited to realizable equity. Convert moves backed profit into capital; the engine rejects any amount
            the losing side has not reserved for.
          </p>
        </>
      )}
      {msg ? <p className="small mono wrap">{msg}</p> : null}
    </div>
  );
}
