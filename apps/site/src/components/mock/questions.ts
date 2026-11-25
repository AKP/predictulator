/**
 * Example questions for the product mockups. Illustrative only: these are
 * not on any chain and the probabilities are starting points for the
 * interactive math, not forecasts.
 */
export interface ExampleQuestion {
  slot: number;
  gen: number;
  title: string;
  criteria: string;
  closesAt: string;
  /** Starting P(YES). */
  p: number;
  /** Open interest in shares, YES and NO. */
  oiYes: number;
  oiNo: number;
  tags: string[];
  seed: number;
}

export const EXAMPLES: ExampleQuestion[] = [
  {
    slot: 1,
    gen: 2,
    title: 'Will SOL close above $300 on Dec 31, 2026?',
    criteria: 'YES if the SOL/USD daily close on Coinbase for 2026-12-31 (UTC) is strictly greater than 300.00.',
    closesAt: '2026-12-31',
    p: 0.62,
    oiYes: 18_400,
    oiNo: 18_400,
    tags: ['crypto', 'sol'],
    seed: 11,
  },
  {
    slot: 2,
    gen: 3,
    title: 'Will the Fed cut rates at the December 2026 meeting?',
    criteria: 'YES if the FOMC statement for the December 2026 meeting announces a reduction in the target range.',
    closesAt: '2026-12-16',
    p: 0.41,
    oiYes: 9_950,
    oiNo: 9_950,
    tags: ['macro'],
    seed: 23,
  },
  {
    slot: 3,
    gen: 4,
    title: 'Will Solana record a day with over 100M non-vote transactions before 2027?',
    criteria: 'YES if any public block explorer reports a UTC day with more than 100,000,000 non-vote transactions on mainnet-beta before 2027-01-01.',
    closesAt: '2026-12-31',
    p: 0.73,
    oiYes: 6_120,
    oiNo: 6_120,
    tags: ['solana', 'network'],
    seed: 37,
  },
  {
    slot: 4,
    gen: 5,
    title: 'Will a spot ETH ETF with staking be approved in the US in 2026?',
    criteria: 'YES if the SEC approves at least one spot Ether ETF whose prospectus permits staking of fund assets, with an effective date in 2026.',
    closesAt: '2026-12-31',
    p: 0.27,
    oiYes: 4_300,
    oiNo: 4_300,
    tags: ['etf', 'eth'],
    seed: 41,
  },
];

export const SPREAD = 0.02;
export const FEE_BPS = 20;
export const INITIAL_MARGIN_BPS = 10_000;
