import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Predictulator, type QuestionState, type SignedQuestion } from "@predictulator/sdk";
import type { AppConfig } from "./config";
import { useClient, useMarket, usePortfolios, useQuestions, useQuotes, useSlot } from "./hooks";
import { QuestionList } from "./components/QuestionList";
import { QuestionPage } from "./components/QuestionPage";
import { PortfolioPanel } from "./components/PortfolioPanel";
import { MarketStrip } from "./components/MarketStrip";

export interface QuestionView {
  signed: SignedQuestion;
  state: QuestionState | null;
}

export function App({ config }: { config: AppConfig }): JSX.Element {
  const client = useClient(config);
  const market = useMarket(client);
  const questions = useQuestions(config.resolverUrl);
  const quotes = useQuotes(config.makerUrl);
  const wallet = useWallet();
  const portfolios = usePortfolios(client, wallet.publicKey);
  const slot = useSlot(client.connection);
  const [selected, setSelected] = useState<string | null>(null);

  const views: QuestionView[] = (questions.data ?? []).map((signed) => {
    const asset = market.data?.assets[signed.manifest.assetIndex];
    const state =
      asset && asset.marketId === BigInt(signed.manifest.marketId) ? Predictulator.questionState(asset) : null;
    return { signed, state };
  });
  const current = views.find((v) => `${v.signed.manifest.assetIndex}-${v.signed.manifest.marketId}` === selected) ?? null;

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand" onClick={() => setSelected(null)} type="button">
          Predictulator
        </button>
        <span className="tag">devnet</span>
        <div className="grow" />
        <WalletMultiButton />
      </header>

      <MarketStrip market={market.data} error={market.error} slot={slot} />

      <main className="layout">
        <section className="content">
          {current ? (
            <QuestionPage
              view={current}
              quote={quotes.data?.[current.signed.manifest.assetIndex] ?? null}
              client={client}
              config={config}
              market={market.data}
              portfolios={portfolios.data ?? []}
              onBack={() => setSelected(null)}
              onTraded={() => {
                market.refresh();
                portfolios.refresh();
                quotes.refresh();
              }}
            />
          ) : (
            <QuestionList
              views={views}
              quotes={quotes.data ?? {}}
              loading={questions.data === null && questions.error === null}
              error={questions.error}
              onSelect={(k) => setSelected(k)}
            />
          )}
        </section>
        <aside className="side">
          <PortfolioPanel
            client={client}
            config={config}
            market={market.data}
            portfolios={portfolios.data ?? []}
            questions={views}
            onChanged={() => {
              portfolios.refresh();
              market.refresh();
            }}
          />
        </aside>
      </main>

      <footer className="foot">
        <span>Educational devnet deployment. Test tokens only. Not audited.</span>
        <a href="https://github.com/aeyakovenko/percolator" rel="noreferrer" target="_blank">
          Engine: Percolator
        </a>
      </footer>
    </div>
  );
}
