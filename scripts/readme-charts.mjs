// Generates the SVG charts embedded in README.md from protocol math.
// Every curve is computed from the same rules the engine and SDK apply;
// nothing is sampled from a market. Run: node scripts/readme-charts.mjs
import {mkdirSync, writeFileSync} from 'node:fs';

const OUT = new URL('../docs/img/', import.meta.url);
mkdirSync(OUT, {recursive: true});

const PAGE = '#f0f1ee', INK = '#0b0b0b', MUTE = '#6f726d', RULE = '#d9dbd5';
const W = 760, H = 360, PAD = {l: 64, r: 24, t: 40, b: 78};
const FONT = `font-family="ui-monospace, 'Geist Mono', Menlo, Consolas, monospace"`;

// --- protocol math (mirrors packages/sdk/src/probability.ts and apps/site/src/lib/protocol.ts)
const E6 = 1_000_000;
function convergencePath(fromE6, toE6, capBps, max = 400) {
  const out = [fromE6];
  let p = fromE6;
  for (let i = 0; i < max && p !== toE6; i++) {
    const step = Math.max(1, Math.floor((p * capBps) / 10_000));
    p = p < toE6 ? Math.min(toE6, p + step) : Math.max(toE6, p - step);
    out.push(p);
  }
  return out;
}
const pnlPerShare = (side, entry, mark) => (side === 'YES' ? mark - entry : entry - mark) / E6;
const creditRate = (avail, claim) => (claim <= 0 ? 1 : Math.min(1, avail / claim));

// --- tiny svg chart
function chart({title, subtitle, xLabel, yLabel, xDomain, yDomain, series, fmtX, fmtY, refs = [], xTicks = 5, yTicks = 4, note}) {
  const sx = (x) => PAD.l + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * (W - PAD.l - PAD.r);
  const sy = (y) => H - PAD.b - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * (H - PAD.t - PAD.b);
  const el = [];
  el.push(`<rect width="${W}" height="${H}" fill="${PAGE}"/>`);
  el.push(`<text x="${PAD.l}" y="18" font-size="12" font-weight="700" fill="${INK}" ${FONT} letter-spacing="0.06em">${esc(title.toUpperCase())}</text>`);
  if (subtitle) el.push(`<text x="${W - PAD.r}" y="18" font-size="11" fill="${MUTE}" ${FONT} text-anchor="end">${esc(subtitle)}</text>`);
  for (let i = 0; i <= yTicks; i++) {
    const v = yDomain[0] + ((yDomain[1] - yDomain[0]) * i) / yTicks;
    el.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="${RULE}" stroke-width="1"/>`);
    el.push(`<text x="${PAD.l - 8}" y="${sy(v) + 4}" font-size="11" fill="${MUTE}" ${FONT} text-anchor="end">${esc(fmtY(v))}</text>`);
  }
  for (let i = 0; i <= xTicks; i++) {
    const v = xDomain[0] + ((xDomain[1] - xDomain[0]) * i) / xTicks;
    el.push(`<text x="${sx(v)}" y="${H - PAD.b + 18}" font-size="11" fill="${MUTE}" ${FONT} text-anchor="middle">${esc(fmtX(v))}</text>`);
  }
  el.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${H - PAD.b}" y2="${H - PAD.b}" stroke="${INK}" stroke-width="1"/>`);
  el.push(`<text x="${W - PAD.r}" y="${H - PAD.b + 34}" font-size="11" fill="${MUTE}" ${FONT} text-anchor="end">${esc(xLabel)}</text>`);
  el.push(`<text x="${PAD.l}" y="${PAD.t - 8}" font-size="11" fill="${MUTE}" ${FONT}>${esc(yLabel)}</text>`);
  for (const r of refs) {
    el.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(r.y)}" y2="${sy(r.y)}" stroke="${MUTE}" stroke-width="1" stroke-dasharray="2 4"/>`);
    el.push(`<text x="${PAD.l + 6}" y="${sy(r.y) + (sy(r.y) < PAD.t + 16 ? 13 : -5)}" font-size="11" fill="${MUTE}" ${FONT}>${esc(r.label)}</text>`);
  }
  series.forEach((s, i) => {
    const d = s.points.map((p, j) => `${j ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    if (s.area) {
      const last = s.points[s.points.length - 1], first = s.points[0];
      el.push(`<path d="${d} L${sx(last.x).toFixed(1)},${sy(yDomain[0])} L${sx(first.x).toFixed(1)},${sy(yDomain[0])} Z" fill="${INK}" fill-opacity="0.06"/>`);
    }
    el.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`);
    if (s.endMarker) {
      const last = s.points[s.points.length - 1];
      el.push(`<rect x="${sx(last.x) - 4}" y="${sy(last.y) - 4}" width="8" height="8" fill="${INK}"/>`);
    }
    if (s.label !== false) {
      const last = s.points[s.points.length - 1];
      const nearTop = sy(last.y) < PAD.t + 20;
      const x = Math.min(W - PAD.r, sx(last.x) + 8);
      const anchor = sx(last.x) > W - 110 ? 'end' : 'start';
      el.push(`<text x="${x}" y="${sy(last.y) + (i === 0 ? (nearTop ? 16 : -8) : 14)}" font-size="11" fill="${INK}" ${FONT} text-anchor="${anchor}">${esc(s.name)}</text>`);
    }
  });
  if (series.length > 1) {
    let lx = PAD.l;
    const ly = H - PAD.b + 34;
    for (const s of series) {
      el.push(`<line x1="${lx}" x2="${lx + 22}" y1="${ly - 4}" y2="${ly - 4}" stroke="${INK}" stroke-width="2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`);
      el.push(`<text x="${lx + 28}" y="${ly}" font-size="11" fill="${MUTE}" ${FONT}>${esc(s.name)}</text>`);
      lx += 28 + s.name.length * 6.8 + 22;
    }
  }
  if (note) el.push(`<text x="${PAD.l}" y="${H - 12}" font-size="10.5" fill="${MUTE}" ${FONT}>${esc(note)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${el.join('')}</svg>\n`;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (v) => `${Math.round(v * 100)}%`;

// 1. Convergence to YES and to NO from 0.50 at 300 bps per slot.
const yesFull = convergencePath(500_000, 1_000_000, 300);
const noFull = convergencePath(500_000, 1, 300);
const SHOW = 60;
const yes = yesFull.map((p, i) => ({x: i, y: p / E6}));
const no = noFull.slice(0, SHOW + 1).map((p, i) => ({x: i, y: p / E6}));
writeFileSync(new URL('convergence.svg', OUT), chart({
  title: 'Convergence under the per-slot cap',
  subtitle: `start 50%, cap 300 bps/slot: YES in ${yesFull.length - 1} slots, NO in ${noFull.length - 1}`,
  xLabel: 'cranked slots (first 60 shown)', yLabel: 'effective P(YES)',
  xDomain: [0, SHOW], yDomain: [0, 1],
  series: [
    {name: `YES, converged at slot ${yesFull.length - 1}`, points: yes, area: true, endMarker: true},
    {name: `NO, ${pct(noFull[SHOW] / E6)} at slot ${SHOW}, floor at ${noFull.length - 1}`, points: no, dash: '5 4'},
  ],
  fmtX: (x) => String(Math.round(x)), fmtY: pct,
  refs: [{y: 1, label: 'target 1.000000'}, {y: 0, label: 'target 0.000001'}],
  xTicks: 6,
  note: 'step = max(1 atom, floor(price * cap / 10000)); the step shrinks with the price, so NO takes longer.',
}));

// 2. Payoff per share at entry 0.62.
const entry = 620_000;
const marks = Array.from({length: 101}, (_, i) => Math.max(1, Math.round((i / 100) * E6)));
writeFileSync(new URL('payoff.svg', OUT), chart({
  title: 'Payoff per share, entry 62%',
  subtitle: 'YES pays 0.38 if right, loses 0.619999 if wrong',
  xLabel: 'final mark', yLabel: 'profit per share (collateral units)',
  xDomain: [0, 1], yDomain: [-1, 1],
  series: [
    {name: 'YES at 0.62', points: marks.map((m) => ({x: m / E6, y: pnlPerShare('YES', entry, m)}))},
    {name: 'NO at 0.62', points: marks.map((m) => ({x: m / E6, y: pnlPerShare('NO', entry, m)})), dash: '5 4'},
  ],
  fmtX: pct, fmtY: (v) => v.toFixed(2),
  refs: [{y: 0, label: 'break even'}],
}));

// 3. Posted margin vs worst case at 100% initial margin.
const ps = Array.from({length: 99}, (_, i) => (i + 1) * 10_000);
writeFileSync(new URL('margin-gap.svg', OUT), chart({
  title: 'Posted margin against worst case',
  subtitle: 'initial margin 100% of notional',
  xLabel: 'entry price', yLabel: 'collateral per share',
  xDomain: [0, 1], yDomain: [0, 1],
  series: [
    {name: 'posted, either side', points: ps.map((p) => ({x: p / E6, y: p / E6})), label: false},
    {name: 'worst case, NO', points: ps.map((p) => ({x: p / E6, y: (E6 - p) / E6})), dash: '5 4', label: false},
    {name: 'worst case, YES', points: ps.map((p) => ({x: p / E6, y: (p - 1) / E6})), dash: '1 3', label: false},
  ],
  fmtX: pct, fmtY: (v) => v.toFixed(2),
  note: 'A short at p posts p but can lose 1 - p. Covered by the cap, liquidation, per-question insurance, and realizable credit.',
}));

// 4. Credit rate as the losing side's backing falls below the winners' claims.
const ratio = Array.from({length: 101}, (_, i) => i / 50); // backing / claims from 0 to 2
writeFileSync(new URL('credit-rate.svg', OUT), chart({
  title: 'Credit rate = min(1, backing / claims)',
  subtitle: 'the share of winners’ profit the engine honors',
  xLabel: 'available backing as a multiple of the claim bound', yLabel: 'credit rate',
  xDomain: [0, 2], yDomain: [0, 1],
  series: [{name: 'credit_rate_num / 1e12', points: ratio.map((r) => ({x: r, y: creditRate(r, 1)})), area: true}],
  fmtX: (v) => `${v.toFixed(1)}x`, fmtY: pct,
  xTicks: 4,
  note: 'Below 1x, winners are waiting on the losers’ reserved collateral. Nobody else is charged.',
}));

console.log('wrote convergence.svg payoff.svg margin-gap.svg credit-rate.svg to docs/img/');
