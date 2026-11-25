#!/usr/bin/env node
/**
 * Verifies the SDK's Pod layouts against the Rust structs they were transcribed from.
 *
 * Fetches `src/v16.rs` (engine) and `src/v16_program.rs` (program) at the commits
 * recorded in packages/sdk/src/constants.ts, parses every `#[repr(C)]` struct,
 * resolves the array-length constants, and diffs field names, field types, and
 * total byte sizes against the schemas exported by the built SDK.
 *
 *   node scripts/verify-layouts.mjs                 # fetch pinned sources (cached in scripts/.cache)
 *   node scripts/verify-layouts.mjs --engine path/to/v16.rs --program path/to/v16_program.rs
 *
 * Exit code 1 on any mismatch. Requires `npm run build -w @predictulator/sdk` first.
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i === -1 ? null : args[i + 1]; };

// ---------------------------------------------------------------- sources
const constants = readFileSync(join(root, 'packages/sdk/src/constants.ts'), 'utf8');
const engineCommit = /engineCommit:\s*"([0-9a-f]{40})"/.exec(constants)?.[1];
const programCommit = /programCommit:\s*"([0-9a-f]{40})"/.exec(constants)?.[1];
if (!engineCommit || !programCommit) throw new Error('could not read pinned commits from constants.ts');

const cacheDir = join(root, 'scripts', '.cache');
async function source(kind, commit, url, override) {
  if (override) return readFileSync(override, 'utf8');
  mkdirSync(cacheDir, {recursive: true});
  // Key the cache by commit: bumping a pin in an existing checkout must re-fetch,
  // not reuse the old source, or the check silently compares against stale Rust.
  const f = join(cacheDir, `${kind}-${commit}.rs`);
  if (existsSync(f)) return readFileSync(f, 'utf8');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(f, text);
  return text;
}
const engine = await source('engine', engineCommit, `https://raw.githubusercontent.com/aeyakovenko/percolator/${engineCommit}/src/v16.rs`, argOf('--engine'));
const program = await source('program', programCommit, `https://raw.githubusercontent.com/aeyakovenko/percolator-prog/${programCommit}/src/v16_program.rs`, argOf('--program'));

// ---------------------------------------------------------------- rust parsing
/** `pub const NAME: usize = <expr>;` with simple integer arithmetic; non-kani variants win. */
function parseConsts(src) {
  const out = {};
  const re = /(?:#\[cfg\(([^)]*)\)\]\s*)?(?:pub(?:\(crate\))? )?const ([A-Z0-9_]+): usize = ([^;]+);/g;
  let m;
  while ((m = re.exec(src))) {
    const [, cfg, name, expr] = m;
    if (cfg && cfg.trim() === 'kani') continue;
    out[name] = expr.trim();
  }
  return out;
}
function evalConst(name, consts, seen = new Set()) {
  if (/^\d+$/.test(name)) return Number(name);
  if (!(name in consts)) throw new Error(`unknown const ${name}`);
  if (seen.has(name)) throw new Error(`cyclic const ${name}`);
  seen.add(name);
  const toks = consts[name].match(/\d+|[A-Z_][A-Z0-9_]*|[()+\-*/]/g);
  const vals = toks.map((t) => (/^\d+$/.test(t) ? Number(t) : /^[A-Z_]/.test(t) ? evalConst(t, consts, new Set(seen)) : t));
  let i = 0;
  const peek = () => vals[i];
  const next = () => vals[i++];
  function factor() { const v = next(); if (v === '(') { const r = sum(); next(); return r; } return v; }
  function term() { let v = factor(); while (peek() === '*' || peek() === '/') { const op = next(); const r = factor(); v = op === '*' ? v * r : Math.floor(v / r); } return v; }
  function sum() { let v = term(); while (peek() === '+' || peek() === '-') { const op = next(); const r = term(); v = op === '+' ? v + r : v - r; } return v; }
  return sum();
}

/** Every `#[repr(C)] ... pub struct Name { pub field: Type, ... }`. */
function parseStructs(src) {
  const structs = {};
  // Body ends at the first line that is only whitespace and `}` (structs may be indented inside a module).
  const re = /#\[repr\(C\)\][^{]*?pub struct ([A-Za-z0-9_]+)(?:<[^>]*>)?\s*\{([\s\S]*?)\n[ \t]*\}/g;
  let m;
  while ((m = re.exec(src))) {
    const [, name, body] = m;
    const fields = [];
    for (const raw of body.split('\n')) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      const f = /^pub ([A-Za-z0-9_]+): (.+?),?$/.exec(line);
      if (f) fields.push({name: f[1], type: f[2].trim()});
    }
    structs[name] = fields;
  }
  return structs;
}

const PRIM = {u8: 'u8', u16: 'u16', u32: 'u32', u64: 'u64', u128: 'u128', i64: 'i64', i128: 'i128',
  V16PodU16: 'u16', V16PodU32: 'u32', V16PodU64: 'u64', V16PodU128: 'u128', V16PodI128: 'i128'};
function normalize(type, consts) {
  if (type in PRIM) return PRIM[type];
  const arr = /^\[(.+); ([A-Za-z0-9_]+)\]$/.exec(type);
  if (arr) {
    const len = evalConst(arr[2], consts);
    const inner = normalize(arr[1], consts);
    if (inner === 'u8') return {bytes: len};
    return {array: inner, len};
  }
  return {struct: type};
}
const PRIM_SIZE = {u8: 1, u16: 2, u32: 4, u64: 8, u128: 16, i64: 8, i128: 16};
const sizeOf = (t, defs) => typeof t === 'string' ? PRIM_SIZE[t] : 'bytes' in t ? t.bytes : 'array' in t ? sizeOf(t.array, defs) * t.len : structSize(t.struct, defs);
function structSize(name, defs) { const s = defs[name]; if (!s) throw new Error(`no Rust struct ${name}`); return s.reduce((a, f) => a + sizeOf(f.type, defs), 0); }

const consts = {...parseConsts(engine), ...parseConsts(program)};
const rust = {};
const unresolved = [];
for (const [name, fields] of Object.entries({...parseStructs(engine), ...parseStructs(program)})) {
  try {
    rust[name] = fields.map((f) => ({name: f.name, type: normalize(f.type, consts)}));
  } catch (e) {
    unresolved.push(`${name} (${e.message})`); // only matters if the SDK compares against it
  }
}

// ---------------------------------------------------------------- sdk schemas
const sdkPath = join(root, 'packages/sdk/dist/layout.js');
if (!existsSync(sdkPath)) { console.error('build the SDK first: npm run build -w @predictulator/sdk'); process.exit(2); }
const sdk = await import(pathToFileURL(sdkPath).href);
const sdkStructs = Object.values(sdk).filter((v) => v && typeof v === 'object' && Array.isArray(v.fields) && typeof v.name === 'string');

const sdkKey = (t) => typeof t === 'string' ? t : 'bytes' in t ? `[u8;${t.bytes}]` : 'array' in t ? `[${sdkKey(t.array)};${t.len}]` : t.struct.name;
const rustKey = (t) => typeof t === 'string' ? t : 'bytes' in t ? `[u8;${t.bytes}]` : 'array' in t ? `[${rustKey(t.array)};${t.len}]` : t.struct;

let ok = 0, bad = 0;
const rows = [];
for (const s of sdkStructs) {
  if (s.name.startsWith('Market<')) continue; // composite of verified parts
  const r = rust[s.name];
  if (!r) { bad++; rows.push([s.name, 'MISSING', '', unresolved.find((u) => u.startsWith(s.name + ' ')) ?? 'not found in Rust sources']); continue; }
  const problems = [];
  const n = Math.max(s.fields.length, r.length);
  for (let i = 0; i < n; i++) {
    const a = s.fields[i], b = r[i];
    if (!a) { problems.push(`rust has extra ${b.name}: ${rustKey(b.type)}`); continue; }
    if (!b) { problems.push(`sdk has extra ${a.name}: ${sdkKey(a.type)}`); continue; }
    if (a.name !== b.name) problems.push(`#${i} name sdk=${a.name} rust=${b.name}`);
    else if (sdkKey(a.type) !== rustKey(b.type)) problems.push(`${a.name}: sdk=${sdkKey(a.type)} rust=${rustKey(b.type)}`);
  }
  const sdkSize = sdk.structSize(s);
  const rustSize = structSize(s.name, rust);
  if (sdkSize !== rustSize) problems.push(`size sdk=${sdkSize} rust=${rustSize}`);
  if (problems.length) { bad++; rows.push([s.name, 'MISMATCH', `${sdkSize}/${rustSize}`, problems.join('; ')]); }
  else { ok++; rows.push([s.name, 'ok', String(sdkSize), `${s.fields.length} fields`]); }
}

console.log(`engine ${engineCommit.slice(0, 8)} · program ${programCommit.slice(0, 8)}`);
const show = ['V16_MAX_PORTFOLIO_ASSETS_N', 'PORTFOLIO_SOURCE_DOMAIN_CAP', 'V16_ACTIVE_BITMAP_WORDS', 'ORACLE_LEG_CAP'].filter((k) => k in consts);
console.log(`consts: ${show.map((k) => `${k}=${evalConst(k, consts)}`).join('  ')}`);
const w = Math.max(...rows.map((r) => r[0].length));
for (const [name, status, size, note] of rows) console.log(`${status.padEnd(9)}${name.padEnd(w)} ${size.padStart(10)}  ${note}`);
console.log(`\n${ok} structs match, ${bad} mismatch`);
process.exit(bad ? 1 : 0);
