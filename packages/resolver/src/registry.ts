/**
 * File-backed question registry.
 *
 * One JSON file per question under `dir/questions/<assetIndex>-<marketId>.json`
 * holding a `SignedQuestion`, plus `dir/decisions/<same>.json` holding the
 * resolver's YES/NO decision once made. Plain files so the whole registry can
 * be committed, diffed, and audited.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  SignedQuestionSchema,
  questionKey,
  verifySignedQuestion,
  type SignedQuestion,
} from "@predictulator/sdk";
import type { Decision } from "./lifecycle.js";

const DecisionSchema = z.object({
  outcome: z.enum(["YES", "NO"]),
  decidedAt: z.string().datetime(),
  note: z.string().max(2000).optional(),
});

export class Registry {
  constructor(readonly dir: string) {}

  private qdir(): string {
    return join(this.dir, "questions");
  }
  private ddir(): string {
    return join(this.dir, "decisions");
  }
  private file(assetIndex: number, marketId: string): string {
    return `${assetIndex}-${marketId}.json`;
  }

  async init(): Promise<void> {
    await mkdir(this.qdir(), { recursive: true });
    await mkdir(this.ddir(), { recursive: true });
  }

  async list(): Promise<SignedQuestion[]> {
    await this.init();
    const names = (await readdir(this.qdir())).filter((n) => n.endsWith(".json"));
    const out: SignedQuestion[] = [];
    for (const n of names) {
      const raw = JSON.parse(await readFile(join(this.qdir(), n), "utf8"));
      const q = SignedQuestionSchema.parse(raw);
      verifySignedQuestion(q);
      out.push(q);
    }
    return out.sort((a, b) => a.manifest.assetIndex - b.manifest.assetIndex);
  }

  async get(assetIndex: number, marketId: string): Promise<SignedQuestion | null> {
    try {
      const raw = JSON.parse(await readFile(join(this.qdir(), this.file(assetIndex, marketId)), "utf8"));
      const q = SignedQuestionSchema.parse(raw);
      verifySignedQuestion(q);
      return q;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async put(q: SignedQuestion): Promise<void> {
    verifySignedQuestion(q);
    await this.init();
    await writeFile(
      join(this.qdir(), this.file(q.manifest.assetIndex, q.manifest.marketId)),
      JSON.stringify(q, null, 2) + "\n",
      "utf8",
    );
  }

  async getDecision(assetIndex: number, marketId: string): Promise<Decision | null> {
    try {
      const raw = JSON.parse(await readFile(join(this.ddir(), this.file(assetIndex, marketId)), "utf8"));
      const d = DecisionSchema.parse(raw);
      return { outcome: d.outcome, decidedAt: d.decidedAt, ...(d.note !== undefined ? { note: d.note } : {}) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async putDecision(assetIndex: number, marketId: string, d: Decision): Promise<void> {
    await this.init();
    const existing = await this.getDecision(assetIndex, marketId);
    if (existing && existing.outcome !== d.outcome) {
      throw new Error(`decision for ${assetIndex}-${marketId} already recorded as ${existing.outcome}`);
    }
    await writeFile(
      join(this.ddir(), this.file(assetIndex, marketId)),
      JSON.stringify(DecisionSchema.parse(d), null, 2) + "\n",
      "utf8",
    );
  }

  static key(q: SignedQuestion): string {
    return questionKey(q.manifest);
  }
}
