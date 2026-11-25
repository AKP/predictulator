/**
 * Mark sources: where the resolver gets a fair probability to steer the
 * engine's mark before resolution. The mark only affects margin,
 * liquidation, and the realizable-credit calculation; trades execute at the
 * price both parties agree on.
 */
import { readFile } from "node:fs/promises";
import { probToMark, type SignedQuestion } from "@predictulator/sdk";

export interface MarkSource {
  /** Fair P(YES) in e6, or null if this source has no opinion. */
  fairMarkE6(q: SignedQuestion): Promise<bigint | null>;
}

/** Reads `{ "<assetIndex>-<marketId>": 0.62, ... }` from a JSON file on every call. */
export class FileMarkSource implements MarkSource {
  constructor(readonly path: string) {}
  async fairMarkE6(q: SignedQuestion): Promise<bigint | null> {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(await readFile(this.path, "utf8")) as Record<string, unknown>;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
    const v = raw[`${q.manifest.assetIndex}-${q.manifest.marketId}`];
    if (typeof v !== "number") return null;
    return probToMark(v);
  }
}

/**
 * GET `${base}/fair?market=..&assetIndex=..&marketId=..` expecting
 * `{ "probability": 0.62 }`. Typically served by the maker from its own mid.
 */
export class HttpMarkSource implements MarkSource {
  constructor(readonly base: string, readonly fetchImpl: typeof fetch = fetch) {}
  async fairMarkE6(q: SignedQuestion): Promise<bigint | null> {
    const url = new URL("/fair", this.base);
    url.searchParams.set("market", q.manifest.market);
    url.searchParams.set("assetIndex", String(q.manifest.assetIndex));
    url.searchParams.set("marketId", q.manifest.marketId);
    const res = await this.fetchImpl(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`mark source ${res.status}`);
    const body = (await res.json()) as { probability?: unknown };
    if (typeof body.probability !== "number") return null;
    return probToMark(body.probability);
  }
}

export class NullMarkSource implements MarkSource {
  async fairMarkE6(): Promise<bigint | null> {
    return null;
  }
}
