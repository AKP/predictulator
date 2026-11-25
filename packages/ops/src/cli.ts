#!/usr/bin/env node
import { createQuestion, initMarket, mintTestTokens, portfolio, resolve, show } from "./commands.js";

const USAGE = `predictulator <command> [options]

Environment: RPC_URL (default devnet), PROGRAM_ID, MARKET

Commands
  show                                        decode the market and every question
  mint-test-tokens --payer <kp> [--mint <pk>] [--to <pk>] [--amount <atoms>]
                                              create a 6-decimal devnet collateral mint and mint to a wallet
  init-market --admin <kp> --mint <pk>        create market account + vault, InitMarket, set policies
  create-question --creator <kp> --manifest <json> [--resolver <pk>] [--resolver-url <url>]
                  [--initial-probability 0.5] [--dry-run]
                                              activate a question slot, commit the manifest hash, register it
  portfolio create|list|deposit|withdraw --owner <kp> [--amount <units>]
  resolve --resolver-url <url> --asset <i> --gen <id> --outcome YES|NO [--note <text>]
                                              needs RESOLVER_ADMIN_TOKEN
`;

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "show":
      return show();
    case "mint-test-tokens":
      return mintTestTokens(args);
    case "init-market":
      return initMarket(args);
    case "create-question":
      return createQuestion(args);
    case "portfolio":
      return portfolio(args);
    case "resolve":
      return resolve(args);
    default:
      console.log(USAGE);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
