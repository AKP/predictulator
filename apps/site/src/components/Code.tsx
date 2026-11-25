import {useState} from 'react';

/**
 * Monochrome syntax highlighting with a tiny tokenizer. Keywords are heavier,
 * strings darker grey, comments and punctuation lighter. No dependency.
 */

const KW = new Set([
  'import', 'from', 'export', 'const', 'let', 'var', 'new', 'await', 'async', 'for', 'of', 'if', 'else',
  'return', 'function', 'as', 'true', 'false', 'null', 'undefined', 'typeof', 'class', 'extends', 'this',
]);

type Tok = {t: 'kw' | 'str' | 'cm' | 'num' | 'fn' | 'pn' | 'id' | 'ws'; v: string};

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === '/' && src[i + 1] === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      out.push({t: 'cm', v: src.slice(i, j)});
      i = j;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        j++;
      }
      out.push({t: 'str', v: src.slice(i, j + 1)});
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9_.n]/.test(src[j]!)) j++;
      out.push({t: 'num', v: src.slice(i, j)});
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j]!)) j++;
      const word = src.slice(i, j);
      const isFn = src[j] === '(';
      out.push({t: KW.has(word) ? 'kw' : isFn ? 'fn' : 'id', v: word});
      i = j;
      continue;
    }
    if (/\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(src[j]!)) j++;
      out.push({t: 'ws', v: src.slice(i, j)});
      i = j;
      continue;
    }
    out.push({t: 'pn', v: c});
    i++;
  }
  return out;
}

export function Code({code, title}: {code: string; title?: string}) {
  const [copied, setCopied] = useState(false);
  const toks = tokenize(code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="box">
      <div className="flex items-center justify-between border-b border-rule px-4 py-2 text-tiny text-mute">
        <span>{title ?? 'typescript'}</span>
        <button type="button" className="underline underline-offset-4" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="code p-4">
        {toks.map((tk, i) =>
          tk.t === 'ws' || tk.t === 'id' ? tk.v : (
            <span key={i} className={`tk-${tk.t}`}>
              {tk.v}
            </span>
          ),
        )}
      </pre>
    </div>
  );
}
