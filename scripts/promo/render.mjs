// Renders scripts/promo/index.html frame by frame through headless Chrome and
// encodes the result with ffmpeg. Usage: node scripts/promo/render.mjs [out.mp4]
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, '..', '..', 'docs', 'promo', 'predictulator-promo.mp4');
const frames = join(here, 'frames');
mkdirSync(frames, {recursive: true});
mkdirSync(dirname(out), {recursive: true});

const chrome = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';

// Static server so the page and the poster share an origin (canvas stays untainted).
const types = {'.html': 'text/html', '.jpg': 'image/jpeg', '.js': 'text/javascript'};
const server = createServer((req, res) => {
  const p = join(here, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html'));
  if (!existsSync(p)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', types[p.slice(p.lastIndexOf('.'))] ?? 'application/octet-stream');
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4310, r));

const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--hide-scrollbars', '--use-angle=swiftshader', `--user-data-dir=${process.env.TEMP}\\promo-profile`, 'about:blank']);
const wsUrl = await new Promise((res, rej) => { let b = ''; proc.stderr.on('data', (d) => { b += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(b); if (m) res(m[1]); }); proc.on('exit', () => rej(new Error(b))); });
const port = new URL(wsUrl).port;
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {method: 'PUT'})).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({id: i, method, params})); });
const evalJs = async (expr) => (await send('Runtime.evaluate', {expression: expr, returnByValue: true, awaitPromise: true})).result?.result?.value;

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false});
await send('Page.navigate', {url: 'http://127.0.0.1:4310/index.html?capture=1'});
for (let i = 0; i < 100 && !(await evalJs('window.isReady && window.isReady()')); i++) await new Promise((r) => setTimeout(r, 200));
const total = await evalJs('window.TOTAL_FRAMES');

// SAMPLE=1: render a handful of frames spread through the timeline and stop.
if (process.env.SAMPLE) {
  const picks = process.env.SAMPLE.includes(',') ? process.env.SAMPLE.split(',').map(Number) : Array.from({length: 12}, (_, i) => Math.floor(((i + 0.5) / 12) * total));
  for (const f of picks) {
    await evalJs(`window.renderFrame(${f})`);
    const shot = await send('Page.captureScreenshot', {format: 'png'});
    writeFileSync(join(frames, `sample-${String(f).padStart(5, '0')}.png`), Buffer.from(shot.result.data, 'base64'));
  }
  console.log('samples:', picks.join(' '), 'of', total);
  ws.close(); proc.kill(); server.close();
  process.exit(0);
}

console.log(`rendering ${total} frames`);
const t0 = Date.now();
for (let f = 0; f < total; f++) {
  await evalJs(`window.renderFrame(${f})`);
  const shot = await send('Page.captureScreenshot', {format: 'png'});
  writeFileSync(join(frames, `${String(f).padStart(5, '0')}.png`), Buffer.from(shot.result.data, 'base64'));
  if (f % 48 === 0) process.stdout.write(`\r${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log(`\nframes done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const events = await evalJs('JSON.stringify(window.soundEvents ? window.soundEvents() : [])');
writeFileSync(join(here, 'events.json'), events);
ws.close(); proc.kill(); server.close();

const run = (cmd, args) => new Promise((res, rej) => { const p = spawn(cmd, args, {stdio: ['ignore', 'inherit', 'inherit']}); p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exit ${c}`)))); });
const silent = out.replace(/\.mp4$/, '-silent.mp4');
await run(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', '24', '-i', join(frames, '%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', silent]);
const wav = join(here, 'sfx.wav');
await run(process.execPath, [join(here, 'sfx.mjs'), join(here, 'events.json'), wav, String(total / 24)]);
await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out]);
await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', out, '-vf', 'scale=1280:720', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', out.replace(/\.mp4$/, '-720p.mp4')]);
await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', out, '-ss', '00:00:02.5', '-frames:v', '1', join(dirname(out), 'poster.png')]);
console.log('wrote', out, 'and the 720p and poster beside it');
