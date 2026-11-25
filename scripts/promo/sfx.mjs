// Synthesizes the promo's sound effects from the event list the page exports.
// No samples, no music: short clicks, ticks, blips, sweeps, and thuds built
// from noise and sine waves. Usage: node sfx.mjs events.json out.wav <durationSeconds>
import {readFileSync, writeFileSync} from 'node:fs';

const [evPath, outPath, durArg] = process.argv.slice(2);
const SR = 48000;
const events = JSON.parse(readFileSync(evPath, 'utf8'));
const DUR = Number(durArg ?? (events.at(-1)?.t ?? 30) + 1);
const buf = new Float32Array(Math.ceil(DUR * SR));

function mulberry32(a) { return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(99);
const add = (i, v) => { if (i >= 0 && i < buf.length) buf[i] += v; };

/** Exponentially decaying noise burst: keyboard click. */
function noise(t, dur, amp, hp = 0.7) {
  const n = Math.floor(dur * SR); const s0 = Math.floor(t * SR); let last = 0;
  for (let i = 0; i < n; i++) { const x = rnd() * 2 - 1; const y = x - last * hp; last = x; add(s0 + i, y * amp * Math.exp(-i / (n / 5))); }
}
/** Sine with a short attack and exponential decay. */
function tone(t, dur, f, amp, decay = 6, shape = 'sine') {
  const n = Math.floor(dur * SR); const s0 = Math.floor(t * SR);
  for (let i = 0; i < n; i++) {
    const ph = (2 * Math.PI * f * i) / SR;
    const w = shape === 'square' ? Math.sign(Math.sin(ph)) * 0.6 : shape === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph);
    const env = Math.min(1, i / (0.004 * SR)) * Math.exp((-decay * i) / n);
    add(s0 + i, w * amp * env);
  }
}
/** Linear-in-log chirp, low amplitude, with a soft envelope. */
function sweep(t, dur, f0, f1, amp) {
  const n = Math.floor(dur * SR); const s0 = Math.floor(t * SR); let ph = 0;
  for (let i = 0; i < n; i++) {
    const k = i / n; const f = f0 * Math.pow(f1 / f0, k); ph += (2 * Math.PI * f) / SR;
    const env = Math.sin(Math.PI * k) ** 0.5;
    add(s0 + i, (Math.sin(ph) * 0.7 + Math.sin(ph * 2) * 0.15) * amp * env);
  }
}

for (const e of events) {
  switch (e.kind) {
    case 'key': noise(e.t, 0.035, 0.35); tone(e.t, 0.03, 1800 + rnd() * 400, 0.06, 10); break;
    case 'tick': tone(e.t, 0.025, e.f ?? 900, 0.14, 8, 'square'); break;
    case 'click': noise(e.t, 0.02, 0.4); tone(e.t, 0.06, 420, 0.25, 9, 'tri'); break;
    case 'blip': tone(e.t, 0.12, e.f ?? 880, 0.18, 5); tone(e.t, 0.12, (e.f ?? 880) * 1.5, 0.06, 5); break;
    case 'thunk': tone(e.t, 0.18, 160, 0.4, 7, 'tri'); noise(e.t, 0.03, 0.25); break;
    case 'thud': tone(e.t, 0.5, 60, 0.6, 5); tone(e.t, 0.3, 120, 0.2, 7); break;
    case 'stamp': noise(e.t, 0.05, 0.5, 0.2); tone(e.t, 0.25, 110, 0.5, 6, 'tri'); break;
    case 'wipe': sweep(e.t, 0.28, 1400, 300, 0.12); noise(e.t, 0.28, 0.08, 0.95); break;
    case 'sweep': sweep(e.t, e.dur, e.f0, e.f1, 0.16); break;
  }
}

// Soft limiter and 16-bit PCM WAV.
let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v));
const gain = peak > 0.9 ? 0.9 / peak : 1;
const pcm = new Int16Array(buf.length);
for (let i = 0; i < buf.length; i++) { const v = Math.tanh(buf[i] * gain * 1.2); pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767))); }
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length * 2, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(pcm.length * 2, 40);
writeFileSync(outPath, Buffer.concat([header, Buffer.from(pcm.buffer)]));
console.log(`wrote ${outPath}: ${events.length} cues, ${DUR.toFixed(1)}s, peak ${peak.toFixed(2)}`);
