# Roadmap

In rough priority order. Items marked **Rust** need a toolchain this repo was
built without.

1. **Exercise everything on devnet.** Deploy upstream `percolator-prog`, run the
   ops bootstrap, create a question, trade it, resolve it, retire the slot.
   Fix whatever that shakes out. Until this is done the status table in the
   README stays where it is.
2. **On-chain matcher** (**Rust**). An LMSR or constant-product matcher for
   binary outcomes behind `TradeCpi`, so fills do not need the maker's live
   signature and liquidity can be pooled. The fixture matcher in fivebar-perps
   is the starting point. The SDK already derives the matcher delegate PDA.
3. **Multiple resolvers.** The manifest already names a resolver per question.
   Let creators choose among registered resolvers, each with its own key and
   track record, and show that on the page.
4. **Bounded-outcome margin** (**Rust**, engine change). Post
   `max(p, 1 - p)` per share so shorts at low probabilities are fully
   collateralized. This would let the market run at exactly Polymarket's risk
   profile with Percolator's cross-margin on top.
5. **Categorical questions.** N mutually exclusive outcomes as N slots with a
   shared manifest, plus a resolver rule that exactly one resolves YES.
