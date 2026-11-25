import {useMemo, useState} from 'react';
import {sha256} from '@noble/hashes/sha256';
import {Window} from './Window';

/**
 * Create a question: the manifest is canonicalized, hashed, and the hash is
 * what the activation transaction commits in its memo. Type and watch the
 * hash change. This is the real canonicalization and the real hash.
 */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function CreateMock() {
  const [title, setTitle] = useState('Will SOL close above $300 on Dec 31, 2026?');
  const [criteria, setCriteria] = useState('YES if the SOL/USD daily close on Coinbase for 2026-12-31 (UTC) is strictly greater than 300.00.');
  const [closesAt, setClosesAt] = useState('2026-12-31T00:00:00.000Z');
  const [p, setP] = useState(0.55);

  const manifest = useMemo(
    () => ({
      version: 1,
      market: '7xKX…examp1e',
      assetIndex: 5,
      marketId: '6',
      title,
      description: '',
      resolutionCriteria: criteria,
      closesAt,
      resolvesBy: '2027-01-02T00:00:00.000Z',
      resolver: 'ResoLver…examp1e',
      creator: 'Creator…examp1e',
      tags: ['crypto'],
      createdAt: '2026-11-10T00:00:00.000Z',
    }),
    [title, criteria, closesAt],
  );
  const json = useMemo(() => canonical(manifest), [manifest]);
  const hash = useMemo(() => hex(sha256(new TextEncoder().encode(json))), [json]);

  return (
    <Window title="predictulator · create a question" tag="mockup · real hash">
      <div className="grid md:grid-cols-2">
        <div className="border-b border-ink p-4 md:border-r md:border-b-0">
          <label className="field !mt-0">
            <span>title</span>
            <input className="border border-rule bg-page px-2 py-1.5 text-body" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>resolution criteria</span>
            <textarea className="min-h-[88px] border border-rule bg-page px-2 py-1.5 text-body" value={criteria} onChange={(e) => setCriteria(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span>closes at</span>
              <input className="border border-rule bg-page px-2 py-1.5 text-body" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </label>
            <label className="field">
              <span>initial probability {Math.round(p * 100)}%</span>
              <input type="range" min={0.05} max={0.95} step={0.01} value={p} onChange={(e) => setP(Number(e.target.value))} />
            </label>
          </div>
          <dl className="kv compact mt-2">
            <dt>creation fee</dt>
            <dd>1.000000 → asset-0 insurance</dd>
            <dt>new slot rent</dt>
            <dd>1,813 bytes, paid by creator</dd>
            <dt>initial mark</dt>
            <dd>{Math.round(p * 1_000_000).toLocaleString()} e6</dd>
          </dl>
          <button type="button" className="mt-3 w-full bg-ink py-2 text-ui text-page" disabled title="Mockup: no live market">
            Sign manifest and activate slot
          </button>
        </div>
        <div className="min-w-0 p-4">
          <div className="text-tiny uppercase text-mute">one transaction</div>
          <ol className="mt-2 space-y-1 text-tiny">
            <li>
              <span className="text-mute">1</span> SystemProgram.transfer · rent for the new slot
            </li>
            <li>
              <span className="text-mute">2</span> Memo · <code className="break-all">predictulator:q:v1:{hash.slice(0, 16)}…</code>
            </li>
            <li>
              <span className="text-mute">3</span> UpdateAssetLifecycle(ACTIVATE) · fee accounts · oracle = resolver
            </li>
          </ol>
          <div className="mt-4 text-tiny uppercase text-mute">sha256(canonical manifest)</div>
          <code className="mt-1 block break-all text-[12px]">{hash}</code>
          <div className="mt-4 text-tiny uppercase text-mute">canonical manifest</div>
          <pre className="code mt-1 max-h-[180px] overflow-auto text-[11px] text-mute" style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>
            {json}
          </pre>
        </div>
      </div>
    </Window>
  );
}
