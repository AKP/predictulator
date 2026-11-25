import {security, type Block, type Finding} from '../securityData';
import {Code} from './Code';
import {Footer} from './Footer';
import {SubHeader} from './SubHeader';

const SEV: Record<Finding['severity'], {label: string; cls: string}> = {
  high: {label: 'High', cls: 'sev-high'},
  medium: {label: 'Medium', cls: 'sev-med'},
  low: {label: 'Low', cls: 'sev-low'},
  info: {label: 'Info', cls: 'sev-info'},
};

function Blocks({blocks}: {blocks: Block[]}) {
  return (
    <div className="grid gap-4">
      {blocks.map((b, i) => {
        if (b.kind === 'h') {
          return (
            <h3 key={i} className="pixel text-ui mt-2">
              {b.text}
            </h3>
          );
        }
        if (b.kind === 'code') {
          return <Code key={i} code={b.code} title={b.title} />;
        }
        if (b.kind === 'list') {
          return (
            <ol key={i} className="grid list-decimal gap-2 pl-5 text-body text-mute marker:text-mute">
              {b.items.map((it, j) => (
                <li key={j} className="max-w-[62ch] pl-1">
                  {it}
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="max-w-[66ch] text-body text-mute">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

function FindingBlock({f}: {f: Finding}) {
  const sev = SEV[f.severity];
  return (
    <article className="bg-page py-[clamp(24px,3.6vh,40px)]">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className={`pill ${sev.cls}`}>{sev.label}</span>
        <span className="pixel text-ui text-mute">#{f.id}</span>
        <span className="text-tiny uppercase text-mute">{f.status}</span>
      </div>
      <h2 className="mb-4 max-w-[52ch] text-body font-medium">{f.title}</h2>
      <Blocks blocks={f.blocks} />
    </article>
  );
}

export function SecurityPage() {
  return (
    <div className="bg-page text-ink">
      <SubHeader here="/security" />
      <main className="mx-auto max-w-[860px] px-[clamp(20px,2.6vw,40px)] py-[clamp(32px,6vh,72px)]">
        <div className="rule mb-[clamp(24px,4vh,40px)] flex items-baseline justify-between pt-3">
          <span className="pixel text-ui">Security</span>
          <span className="text-ui text-mute">engine review</span>
        </div>
        <h1 className="pixel text-section mb-4 max-w-[22ch]">Reviewing the engine we run on</h1>
        <div className="mb-6 grid gap-3">
          {security.intro.map((p, i) => (
            <p key={i} className="max-w-[66ch] text-body text-mute">
              {p}
            </p>
          ))}
        </div>
        <p className="mb-[clamp(28px,5vh,56px)] max-w-[66ch] text-tiny text-mute">Scope: {security.commits}</p>

        <div className="grid gap-px bg-rule">
          {security.findings.map((f) => (
            <FindingBlock key={f.id} f={f} />
          ))}
        </div>

        <div className="rule mt-[clamp(28px,5vh,56px)] pt-5">
          <div className="text-tiny uppercase text-mute">Also reviewed</div>
          <p className="mt-3 max-w-[66ch] text-body text-mute">{security.reviewed}</p>
        </div>

        <p className="mt-6 max-w-[66ch] text-tiny text-mute">
          Disclosed to the maintainer before publishing. Percolator is an unaudited research project, devnet only,
          not slated to go live for roughly a year, and the maintainer is actively soliciting bug reports; it was
          posted in full at his request. Line references and the proposed regressions are in the report sent with it.
        </p>
      </main>
      <Footer />
    </div>
  );
}
