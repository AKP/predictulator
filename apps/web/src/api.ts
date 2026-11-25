import { SignedQuestionSchema, verifySignedQuestion, type SignedQuestion } from "@predictulator/sdk";

export interface PublishedQuote {
  assetIndex: number;
  marketId: string;
  askE6: string;
  bidE6: string;
  maxBuyShares: number;
  maxSellShares: number;
  fairE6: string;
  skewE6: string;
  makerPortfolio: string;
  makerOwner: string;
  makerPortfolioId: string;
  makerPositionEpoch: string;
  feeBps: string;
  inventoryShares: number;
}

export async function fetchQuestions(resolverUrl: string): Promise<SignedQuestion[]> {
  const res = await fetch(new URL("/questions", resolverUrl));
  if (!res.ok) throw new Error(`resolver ${res.status}`);
  const raw = (await res.json()) as unknown[];
  const out: SignedQuestion[] = [];
  for (const r of raw) {
    const q = SignedQuestionSchema.parse(r);
    verifySignedQuestion(q);
    out.push(q);
  }
  return out;
}

export async function fetchQuotes(makerUrl: string): Promise<Record<number, PublishedQuote>> {
  const res = await fetch(new URL("/quotes", makerUrl));
  if (!res.ok) throw new Error(`maker ${res.status}`);
  return (await res.json()) as Record<number, PublishedQuote>;
}

export async function postFill(makerUrl: string, transactionBase64: string): Promise<string> {
  const res = await fetch(new URL("/fill", makerUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transaction: transactionBase64 }),
  });
  const body = (await res.json()) as { signature?: string; error?: string };
  if (!res.ok || !body.signature) throw new Error(body.error ?? `maker ${res.status}`);
  return body.signature;
}
