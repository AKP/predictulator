import React from "react";
import { createRoot } from "react-dom/client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";
import { App } from "./App";
import { loadConfig } from "./config";
import { Unconfigured } from "./components/Unconfigured";

const { config, missing } = loadConfig();

function Root(): JSX.Element {
  if (!config) return <Unconfigured missing={missing} />;
  return (
    <ConnectionProvider endpoint={config.rpcUrl} config={{ commitment: "confirmed" }}>
      {/* Empty wallet list: adapters are discovered through the Wallet Standard (Phantom, Solflare, Backpack, ...). */}
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <App config={config} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
