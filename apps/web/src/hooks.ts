import { useEffect, useMemo, useRef, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { Predictulator, type MarketGroup, type Portfolio, type SignedQuestion } from "@predictulator/sdk";
import { fetchQuestions, fetchQuotes, type PublishedQuote } from "./api";
import type { AppConfig } from "./config";

export function useClient(cfg: AppConfig): Predictulator {
  return useMemo(
    () =>
      new Predictulator({
        connection: new Connection(cfg.rpcUrl, "confirmed"),
        market: cfg.market,
        programId: cfg.programId,
      }),
    [cfg.rpcUrl, cfg.market.toBase58(), cfg.programId.toBase58()],
  );
}

interface Polled<T> {
  data: T | null;
  error: string | null;
  refresh: () => void;
  updatedAt: number | null;
}

function usePolled<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[]): Polled<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async (): Promise<void> => {
      try {
        const d = await fn();
        if (!alive.current) return;
        setData(d);
        setError(null);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (!alive.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive.current) timer = setTimeout(run, intervalMs);
      }
    };
    void run();
    return () => {
      alive.current = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { data, error, refresh: () => setNonce((n) => n + 1), updatedAt };
}

export function useMarket(client: Predictulator): Polled<MarketGroup> {
  return usePolled(() => client.fetchMarket(), 8_000, [client]);
}

export function useQuestions(resolverUrl: string): Polled<SignedQuestion[]> {
  return usePolled(() => fetchQuestions(resolverUrl), 30_000, [resolverUrl]);
}

export function useQuotes(makerUrl: string): Polled<Record<number, PublishedQuote>> {
  return usePolled(() => fetchQuotes(makerUrl), 5_000, [makerUrl]);
}

export function usePortfolios(client: Predictulator, owner: PublicKey | null): Polled<Portfolio[]> {
  return usePolled(
    async () => (owner ? client.findPortfolios(owner) : []),
    10_000,
    [client, owner?.toBase58() ?? ""],
  );
}

export function useSlot(connection: Connection): number | null {
  const [slot, setSlot] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      try {
        const s = await connection.getSlot("confirmed");
        if (alive) setSlot(s);
      } catch {
        /* keep last */
      }
    };
    void tick();
    const t = setInterval(tick, 4_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [connection]);
  return slot;
}
