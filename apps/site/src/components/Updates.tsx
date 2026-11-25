import {Section, Eyebrow} from './Section';
import {Code} from './Code';
import {updates} from '../content';

const VERIFY = `$ npm run verify:layouts
engine 4db11a8c · program 5cb331dd
consts: V16_MAX_PORTFOLIO_ASSETS_N=16  PORTFOLIO_SOURCE_DOMAIN_CAP=32  ORACLE_LEG_CAP=3
ok       EngineAssetSlotV16Account        1301  13 fields
ok       MarketGroupV16HeaderAccount       726  39 fields
ok       PortfolioAccountV16Account       9419  25 fields
ok       WrapperConfigV16                  448  43 fields
...
21 structs match, 0 mismatch`;

const MCP = `{
  "mcpServers": {
    "predictulator": {
      "command": "npx",
      "args": ["predictulator-mcp"],
      "env": {
        "MARKET": "<market>",
        "RESOLVER_URL": "http://localhost:8787",
        "MAKER_URL": "http://localhost:8788"
      }
    }
  }
}

// then, from any MCP client:
// > list_questions
// > explain_credit_rate { assetIndex: 3 }
// > preview_trade { assetIndex: 3, side: "YES", shares: 25 }
// > build_trade { owner, assetIndex: 3, side: "YES", shares: 25 }
//   -> base64 to sign with your own wallet; the server holds no keys`;

export function Updates() {
  return (
    <Section id="updates" index="08" title="What changed in v0.2" kicker="november 2026">
      <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol className="grid min-w-0 gap-px bg-rule">
          {updates.map((u) => (
            <li key={u.title} className="min-w-0 bg-page py-5 pr-4">
              <div className="flex items-baseline gap-4">
                <span className="pixel text-ui">{u.n}</span>
                <div className="min-w-0">
                  <div className="text-body">{u.title}</div>
                  <p className="mt-1 max-w-[62ch] text-body text-mute">{u.what}</p>
                  <div className="mt-2 text-tiny uppercase text-mute">{u.where}</div>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="grid min-w-0 content-start gap-8">
          <div>
            <Eyebrow>layouts, checked against the pinned Rust</Eyebrow>
            <Code code={VERIFY} title="verify-layouts" />
            <p className="mt-3 max-w-[62ch] text-body text-mute">
              The first run caught a real drift: the engine’s master branch had grown the asset slot by 32 bytes that the pinned commit does not have. The SDK now matches the commit it says it matches.
            </p>
          </div>
          <div>
            <Eyebrow>an agent can read, price, and build a trade</Eyebrow>
            <Code code={MCP} title="claude_desktop_config.json" />
          </div>
        </div>
      </div>
    </Section>
  );
}
