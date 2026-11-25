import {useEffect, useRef, useState} from 'react';

/**
 * A scanline probability chart, drawn live in WebGL.
 *
 * The source is not a video but a canvas drawn every tick: a probability
 * path that drifts, then resolves to YES or NO under the same per-slot cap
 * the engine uses, then starts over. The shader cuts the frame into cells,
 * one row per scanline; dark cells become rules of varying thickness, the
 * line itself becomes solid blocks, and a blurred ghost of the chart shows
 * through the gaps. Everything steps at 12 fps for a sampled feel.
 */

const STEP_MS = 1000 / 12;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uSize;    // canvas size, device px
uniform float uRow;    // scanline pitch = cell height, device px
uniform float uCellW;  // cell width
uniform float uLine;   // thin rule thickness, device px
uniform float uBlur;   // ghost blur radius, device px
uniform float uSeed;
uniform vec3 uPage;
uniform vec3 uInk;

const float WHITE = 0.965;
const float BLACK = 0.12;
const float T_THIN = 0.10;
const float T_THICK = 0.42;
const float T_BLOCK = 0.66;

float lum(vec2 px) {
  vec2 uv = clamp(px / uSize, 0.0, 1.0);
  return dot(texture2D(uTex, uv).rgb, vec3(0.299, 0.587, 0.114));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec2 size = vec2(uCellW, uRow);
  vec2 cell = floor(px / size);
  vec2 c = (cell + 0.5) * size;

  vec2 q = size * 0.25;
  float L = 0.25 * (lum(c - q) + lum(c + vec2(q.x, -q.y)) + lum(c + vec2(-q.x, q.y)) + lum(c + q));
  float s = clamp((WHITE - L) / (WHITE - BLACK), 0.0, 1.0);
  s += (hash(cell + uSeed) - 0.5) * 0.04 + (hash(vec2(cell.y, uSeed * 1.7)) - 0.5) * 0.05;

  float th = s > T_BLOCK ? uRow : s > T_THICK ? uLine * 2.0 : s > T_THIN ? uLine : 0.0;
  float y = px.y - cell.y * uRow;
  float top = floor((uRow - th) * 0.5);
  float on = th > 0.0 ? step(top, y) * step(y, top + th) : 0.0;

  float g = lum(px);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    g += lum(px + vec2(cos(a), sin(a)) * uBlur);
  }
  g /= 9.0;
  vec3 ghost = clamp(uPage + (g - WHITE) * 0.55, 0.0, 1.0);

  gl_FragColor = vec4(mix(ghost, uInk, on), 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

function link(gl: WebGLRenderingContext) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const;
};

/** Deterministic pseudo-random so the scene is the same on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAP_BPS = 300;
const POINTS = 160;

/**
 * The scene: a probability path in [0.02, 0.98] that drifts, and every so
 * often is resolved. Resolution moves the price toward 1 or 0 by at most
 * CAP_BPS per step, exactly as the engine clamps the effective price.
 */
class Scene {
  private rnd: () => number;
  private path: number[] = [];
  private target: number | null = null;
  private holdTicks = 0;
  private drift = 0;
  tick = 0;

  constructor(start = 0.42, seed = 7, private readonly resolves = true, private readonly showLabel = true) {
    this.rnd = mulberry32(seed);
    let p = start;
    for (let i = 0; i < POINTS; i++) {
      p = this.walk(p);
      this.path.push(p);
    }
    // Pull the tail back toward the requested start so the readout matches the question.
    const last = this.path[this.path.length - 1]!;
    const shift = start - last;
    for (let i = 0; i < this.path.length; i++) {
      const w = i / (this.path.length - 1);
      this.path[i] = Math.min(0.98, Math.max(0.02, this.path[i]! + shift * w));
    }
  }

  private walk(p: number): number {
    this.drift = this.drift * 0.9 + (this.rnd() - 0.5) * 0.02;
    const next = p + this.drift + (this.rnd() - 0.5) * 0.012;
    return Math.min(0.98, Math.max(0.02, next));
  }

  step(): void {
    this.tick++;
    const last = this.path[this.path.length - 1]!;
    let next: number;
    if (this.target !== null) {
      const stepSize = Math.max(1e-6, (last * CAP_BPS) / 10_000);
      next = last < this.target ? Math.min(this.target, last + stepSize) : Math.max(this.target, last - stepSize);
      if (next === this.target) {
        this.holdTicks++;
        if (this.holdTicks > 30) {
          this.target = null;
          this.holdTicks = 0;
          next = 0.3 + this.rnd() * 0.4;
          this.drift = 0;
        }
      }
    } else {
      next = this.walk(last);
      if (this.resolves && this.tick % 220 === 0) this.target = last >= 0.5 ? 1 : 1e-6;
    }
    this.path.push(next);
    if (this.path.length > POINTS) this.path.shift();
  }

  get resolving(): boolean {
    return this.target !== null;
  }

  get current(): number {
    return this.path[this.path.length - 1]!;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#f6f6f4';
    ctx.fillRect(0, 0, w, h);

    const padX = w * 0.06;
    const top = h * 0.16;
    const bottom = h * 0.9;
    const x = (i: number) => padX + ((w - padX * 1.4) * i) / (POINTS - 1);
    const y = (p: number) => bottom - (bottom - top) * p;

    // Faint horizontal guides at 0, 0.5, 1.
    ctx.strokeStyle = '#d2d3cf';
    ctx.lineWidth = Math.max(1, h / 300);
    for (const p of [0, 0.5, 1]) {
      ctx.beginPath();
      ctx.moveTo(padX, y(p));
      ctx.lineTo(w - padX * 0.4, y(p));
      ctx.stroke();
    }

    // Area under the path: dark at the line, fading toward the floor.
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, '#5c5e5a');
    grad.addColorStop(0.55, '#a8a9a5');
    grad.addColorStop(1, '#e4e5e1');
    ctx.beginPath();
    ctx.moveTo(x(0), y(this.path[0]!));
    for (let i = 1; i < this.path.length; i++) ctx.lineTo(x(i), y(this.path[i]!));
    ctx.lineTo(x(this.path.length - 1), bottom);
    ctx.lineTo(x(0), bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // The line itself.
    ctx.beginPath();
    ctx.moveTo(x(0), y(this.path[0]!));
    for (let i = 1; i < this.path.length; i++) ctx.lineTo(x(i), y(this.path[i]!));
    ctx.strokeStyle = '#0b0b0b';
    ctx.lineWidth = Math.max(3, h / 70);
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Current mark: a solid square at the head of the path.
    const hx = x(this.path.length - 1);
    const hy = y(this.current);
    const sq = Math.max(6, h / 34);
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(hx - sq / 2, hy - sq / 2, sq, sq);

    // Big probability readout, mid grey so it renders as thick rules.
    if (this.showLabel) {
      const label = this.resolving && (this.current > 0.999 || this.current < 0.001)
        ? this.current > 0.5 ? 'YES' : 'NO'
        : `${Math.round(this.current * 100)}%`;
      ctx.fillStyle = '#7d7f7b';
      ctx.font = `700 ${Math.round(h * 0.17)}px Silkscreen, monospace`;
      ctx.textBaseline = 'top';
      ctx.fillText(label, padX, h * 0.03);
    }

    // Resolution target as a dotted level while converging.
    if (this.resolving) {
      const ty = y(this.target! > 0.5 ? 1 : 0);
      ctx.setLineDash([sq, sq]);
      ctx.strokeStyle = '#5c5e5a';
      ctx.lineWidth = Math.max(2, h / 150);
      ctx.beginPath();
      ctx.moveTo(padX, ty);
      ctx.lineTo(w - padX * 0.4, ty);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

interface Props {
  page?: string;
  ink?: string;
  className?: string;
  /** Starting probability for the path. */
  start?: number;
  seed?: number;
  /** Periodically resolve to YES/NO and restart. */
  resolves?: boolean;
  /** Draw the big probability readout. */
  showLabel?: boolean;
  /** Scanlines across the stage height. */
  lines?: number;
}

export function ScanField({
  page = '#f0f1ee',
  ink = '#0b0b0b',
  className = '',
  start = 0.42,
  seed = 7,
  resolves = true,
  showLabel = true,
  lines = 110,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    const gl = canvas.getContext('webgl', {alpha: false, antialias: false, depth: false, stencil: false});
    const prog = gl && link(gl);
    if (!gl || !prog) {
      setFailed(true);
      return;
    }

    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uni = {size: u('uSize'), row: u('uRow'), cellW: u('uCellW'), line: u('uLine'), blur: u('uBlur'), seed: u('uSeed')};
    gl.uniform1i(u('uTex'), 0);
    gl.uniform3fv(u('uPage'), hexToRgb(page));
    gl.uniform3fv(u('uInk'), hexToRgb(ink));

    // The source canvas is drawn at a bounded resolution and stretched to the stage.
    const src = document.createElement('canvas');
    const ctx = src.getContext('2d')!;
    const scene = new Scene(start, seed, resolves, showLabel);

    let W = 1;
    let H = 1;
    let attached = false;
    let disposed = false;

    const layout = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width * dpr));
      H = Math.max(1, Math.round(r.height * dpr));
      canvas.width = W;
      canvas.height = H;
      gl.viewport(0, 0, W, H);
      const k = Math.min(1, 1200 / Math.max(W, H));
      src.width = Math.max(2, Math.round(W * k));
      src.height = Math.max(2, Math.round(H * k));
      const row = Math.max(3, Math.round(Math.max(3.5, r.height / lines) * dpr));
      gl.uniform2f(uni.size, W, H);
      gl.uniform1f(uni.row, row);
      gl.uniform1f(uni.cellW, Math.round(row * 1.5));
      gl.uniform1f(uni.line, Math.max(1, Math.round(row * 0.38)));
      gl.uniform1f(uni.blur, row * 1.6);
    };

    let flicker = 0;
    const render = () => {
      if (disposed) return;
      scene.draw(ctx, src.width, src.height);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
      gl.uniform1f(uni.seed, flicker);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!attached) {
        attached = true;
        el.appendChild(canvas);
      }
    };

    const onLost = (e: Event) => {
      e.preventDefault();
      canvas.remove();
      setFailed(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);

    layout();
    render();
    const ro = new ResizeObserver(() => {
      layout();
      render();
    });
    ro.observe(el);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry!.isIntersecting;
    });
    io.observe(el);

    let raf = 0;
    let last = -Infinity;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || t - last < STEP_MS) return;
      last = t;
      scene.step();
      flicker = (flicker + 1) % 509;
      render();
    };
    if (!reduced) raf = requestAnimationFrame(tick);
    document.fonts?.ready.then(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.remove();
    };
  }, [page, ink, start, seed, resolves, showLabel, lines]);

  return (
    <div ref={host} className={`relative overflow-hidden ${className}`} aria-hidden>
      {failed && (
        <div className="absolute inset-0 flex items-end p-6">
          <span className="pixel text-[clamp(28px,4vw,56px)] text-mute">P(YES)</span>
        </div>
      )}
    </div>
  );
}
