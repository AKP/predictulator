import {useState} from 'react';
import {instructionRows, makerEndpoints, resolverEndpoints, snippets, type Endpoint} from '../content';
import {Code} from './Code';
import {Section} from './Section';

export function Api() {
  const [active, setActive] = useState(snippets[0]!.id);
  const s = snippets.find((x) => x.id === active) ?? snippets[0]!;

  return (
    <Section id="api" index="05" title="One SDK, three services, stock program" kicker="typescript, apache-2.0">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div>
          <ul className="flex flex-row flex-wrap gap-px bg-rule lg:flex-col">
            {snippets.map((x) => (
              <li key={x.id} className="flex-1 lg:flex-none">
                <button
                  type="button"
                  className={`w-full px-4 py-3 text-left text-ui ${x.id === active ? 'bg-ink text-page' : 'bg-page hover:bg-well'}`}
                  onClick={() => setActive(x.id)}
                  aria-pressed={x.id === active}
                >
                  {x.label}
                </button>
              </li>
            ))}
          </ul>
          <h3 className="pixel mt-6 text-[clamp(16px,1.4vw,20px)]">{s.title}</h3>
          <p className="mt-3 text-body">{s.blurb}</p>
          <pre className="code mt-5 text-mute">npm install @predictulator/sdk @solana/web3.js</pre>
        </div>
        <div className="min-w-0">
          <Code code={s.code} title={`${s.id}.ts`} />
        </div>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        <EndpointTable title="Resolver API" base=":8787" rows={resolverEndpoints} />
        <EndpointTable title="Maker API" base=":8788" rows={makerEndpoints} />
      </div>

      <div className="mt-14">
        <h3 className="pixel mb-2 text-ui">Program instructions the system uses</h3>
        <p className="mb-4 max-w-[62ch] text-body">
          Tags and account orders transcribed from <code>Instruction::decode</code> and each handler in{' '}
          <code>percolator-prog</code>. Every builder in the SDK produces exactly these bytes and metas; the test
          suite pins them.
        </p>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>tag</th>
                <th>instruction</th>
                <th>accounts (s = signer, w = writable)</th>
                <th>sent by</th>
              </tr>
            </thead>
            <tbody>
              {instructionRows.map((r) => (
                <tr key={r.tag}>
                  <td className="text-mute">{r.tag}</td>
                  <td>
                    <code>{r.name}</code>
                  </td>
                  <td className="text-mute">{r.accounts}</td>
                  <td className="whitespace-nowrap">{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

function EndpointTable({title, base, rows}: {title: string; base: string; rows: Endpoint[]}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="pixel text-ui">{title}</h3>
        <span className="text-tiny text-mute">default {base}, JSON, no framework</span>
      </div>
      <table className="tbl mt-3">
        <tbody>
          {rows.map((r) => (
            <tr key={r.method + r.path}>
              <td className="w-[1%] whitespace-nowrap">
                <span className={`inline-block px-1.5 py-0.5 text-tiny ${r.method === 'POST' ? 'bg-ink text-page' : 'border border-ink'}`}>
                  {r.method}
                </span>
              </td>
              <td className="w-[1%] whitespace-nowrap">
                <code>{r.path}</code>
              </td>
              <td className="text-mute">{r.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
