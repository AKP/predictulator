#!/usr/bin/env node
/**
 * predictulator-mcp — stdio MCP server.
 *
 * Environment: RPC_URL (default devnet), PROGRAM_ID, MARKET, RESOLVER_URL, MAKER_URL
 *
 * Claude Desktop / Claude Code config:
 *   { "mcpServers": { "predictulator": { "command": "npx", "args": ["predictulator-mcp"],
 *     "env": { "MARKET": "...", "PROGRAM_ID": "...", "RESOLVER_URL": "http://localhost:8787", "MAKER_URL": "http://localhost:8788" } } } }
 */
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {Connection, PublicKey} from "@solana/web3.js";
import {DEFAULT_PROGRAM_ID} from "@predictulator/sdk";
import {createServer} from "./server.js";

async function main(): Promise<void> {
  const env = process.env;
  if (!env["MARKET"]) throw new Error("MARKET is not set");
  const server = createServer({
    connection: new Connection(env["RPC_URL"] ?? "https://api.devnet.solana.com", "confirmed"),
    programId: env["PROGRAM_ID"] ? new PublicKey(env["PROGRAM_ID"]) : DEFAULT_PROGRAM_ID,
    market: new PublicKey(env["MARKET"]),
    ...(env["RESOLVER_URL"] ? {resolverUrl: env["RESOLVER_URL"]} : {}),
    ...(env["MAKER_URL"] ? {makerUrl: env["MAKER_URL"]} : {}),
  });
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
