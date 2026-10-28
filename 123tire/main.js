(() => {
  const TAU = Math.PI * 2;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const root = document.documentElement;
  const body = document.body;
  const canvas = $('#scene');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fine) root.classList.add('fine');

  const SIZE = { width: 235, aspect: 60, rim: 18, dot: '4026' };
  const rimMM = SIZE.rim * 25.4 / 2;
  const sideMM = SIZE.width * SIZE.aspect / 100;
  const RIM = rimMM / (rimMM + sideMM);
  const PITCH = [1, 1.17, 1.34];
  const PSEQ = [0, 1, 2, 1, 0, 2, 2, 1, 0, 0, 1, 2, 1, 1, 0, 2, 1, 0, 2, 0, 1, 2];
  const NBLOCK = 66;
  const REVEAL = 1.1;
  const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
  const gray = (v) => { const c = Math.round(clamp(v, 0, 1) * 255); return `rgb(${c},${c},${c})`; };

  let W = 0, H = 0, dpr = 1, cw = 0, ch = 0, wide = true, G = null;
  let gl = null, isGL2 = false, halfOK = false, depScale = 1;
  let progStamp = null, progComp = null, depTex = null, depFbo = null, reliefTex = null, softTex = null, vbo = null, triBuf = null;
  const MAXST = 3000;
  const stampData = new Float32Array(MAXST * 48);
  let stampCount = 0;
  const CORN = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];

  const grid = { cell: 6, w: 0, h: 0, relief: null, cov: null, groups: {}, raised: [] };
  const off = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  const light = { x: 0, y: 0, tx: 0, ty: 0 };
  const hintU = { x: 0, y: 0, a: 0 };
  const pressU = { x: 0, y: 0, r: 40, a: 0 };
  const pointers = new Map();
  const mouse = { x: -999, y: -999, inside: false, t: -99 };
  let tilt = null;
  let T = 0, lastInput = -99, userRubbed = 0, ghostCount = 0, ghost = null, peel = null;
  let sweepX = -1e5, introDone = false;
  let lastPct = -1, pctTimer = 0;
  const shown = {};

  function polar(a, rf) { return { x: G.cx + Math.cos(a) * G.R * rf, y: G.cy + Math.sin(a) * G.R * rf }; }

  function computeGeom() {
    wide = W >= 700 && W / H > 1.05;
    let R, cx, cy;
    if (wide) {
      R = Math.min(H * 0.455, W * 0.3);
      cx = W - R - Math.max(40, W * 0.06);
      cy = H * 0.5;
    } else {
      const footTop = $('.bottom').getBoundingClientRect().top;
      const topY = 122;
      const botY = footTop - 66;
      R = Math.max(90, Math.min(W * 0.68, (botY - topY) / 2 - 4));
      cx = W * 0.5;
      cy = (topY + botY) / 2;
    }
    const d = Math.PI / 180;
    return {
      cx, cy, R,
      aSize: -90 * d, aBrand: 90 * d,
      aDot: (wide ? 148 : 140) * d,
      aTread: (wide ? -150 : 52) * d,
      aTube: -148 * d, aRadial: -32 * d,
    };
  }

  function arcText(ctx, text, cx, cy, r, ca, size, weight, outward, spacing) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const chars = [...text];
    const ws = chars.map((c) => ctx.measureText(c).width);
    const total = ws.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    const span = total / r;
    let a = outward ? ca - span / 2 : ca + span / 2;
    chars.forEach((c, i) => {
      const half = ws[i] / 2 / r;
      const ac = outward ? a + half : a - half;
      ctx.save();
      ctx.translate(cx + r * Math.cos(ac), cy + r * Math.sin(ac));
      ctx.rotate(outward ? ac + Math.PI / 2 : ac - Math.PI / 2);
      ctx.fillText(c, 0, 0);
      ctx.restore();
      const step = (ws[i] + spacing) / r;
      a = outward ? a + step : a - step;
    });
    return span;
  }

  function drawTire(ctx, only) {
    const { cx, cy, R } = G;
    const F = !only;
    const ring = (r0, r1, v) => { ctx.beginPath(); ctx.arc(cx, cy, r1, 0, TAU); ctx.arc(cx, cy, r0, TAU, 0, true); ctx.fillStyle = gray(v); ctx.fill(); };
    const disc = (r, v, x = cx, y = cy) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = gray(v); ctx.fill(); };

    if (F) {
      disc(R, 0.42);
      ring(R * 0.94, R, 0.07);
    }
    if (F || only === 'tread') {
      const raw = Array.from({ length: NBLOCK }, (_, i) => PITCH[PSEQ[i % PSEQ.length]]);
      const sum = raw.reduce((a, b) => a + b, 0);
      let a = -Math.PI / 2 + 0.011;
      const r0 = R * 0.94, r1 = R * 1.0, skew = 0.024;
      for (const L of raw) {
        const da = L / sum * TAU;
        const gap = da * 0.2;
        const a0 = a + gap / 2, a1 = a + da - gap / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r1, a0, a1);
        ctx.arc(cx, cy, r0, a1 + skew, a0 + skew, true);
        ctx.closePath();
        ctx.fillStyle = gray(F ? 0.96 : 1);
        ctx.fill();
        if (F) {
          const am = (a0 + a1) / 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(am + skew * 0.8) * R * 0.952, cy + Math.sin(am + skew * 0.8) * R * 0.952);
          ctx.lineTo(cx + Math.cos(am + skew * 0.1) * R * 0.99, cy + Math.sin(am + skew * 0.1) * R * 0.99);
          ctx.strokeStyle = gray(0.3);
          ctx.lineWidth = Math.max(1, R * 0.0045);
          ctx.stroke();
        }
        a += da;
      }
    }
    if (F) {
      ring(R * 0.925, R * 0.94, 0.16);
      ring(R * 0.885, R * 0.925, 0.5);
      const n = Math.round(TAU * R * 0.905 / 4.2);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const q = i / n * TAU, c = Math.cos(q), s = Math.sin(q);
        ctx.moveTo(cx + c * R * 0.888, cy + s * R * 0.888);
        ctx.lineTo(cx + c * R * 0.922, cy + s * R * 0.922);
      }
      ctx.strokeStyle = gray(0.76);
      ctx.lineWidth = Math.max(0.8, R * 0.0032);
      ctx.stroke();
      ring(R * 0.872, R * 0.881, 0.86);
      ctx.fillStyle = gray(0.95);
      for (let k = 0; k < 6; k++) {
        const q = -Math.PI / 2 + Math.PI / 6 + k * TAU / 6;
        const tip = polar(q, 0.924), b1 = polar(q - 0.022, 0.888), b2 = polar(q + 0.022, 0.888);
        ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.closePath(); ctx.fill();
      }
      ring(R * 0.689, R * 0.695, 0.8);
    }

    ctx.fillStyle = gray(1);
    if (F || only === 'size') arcText(ctx, `${SIZE.width}/${SIZE.aspect}R${SIZE.rim}`, cx, cy, R * 0.787, G.aSize, R * 0.118, 800, true, R * 0.006);
    if (F) {
      arcText(ctx, '123TIRE', cx, cy, R * 0.787, G.aBrand, R * 0.135, 900, false, R * 0.012);
      arcText(ctx, 'TUBELESS', cx, cy, R * 0.787, G.aTube, R * 0.042, 700, true, R * 0.013);
      arcText(ctx, 'RADIAL', cx, cy, R * 0.787, G.aRadial, R * 0.042, 700, true, R * 0.013);
    }
    if (F || only === 'dot') {
      const r = R * 0.787, a = G.aDot;
      const s1 = R * 0.04, s2 = R * 0.056, gp = R * 0.028, pad = R * 0.02;
      ctx.font = `700 ${s1}px ${FONT}`;
      const w1 = ctx.measureText('DOT').width + s1 * 0.24;
      ctx.font = `800 ${s2}px ${FONT}`;
      const w2 = ctx.measureText(SIZE.dot).width + s2 * 0.24;
      const total = w1 + gp + pad * 2 + w2;
      const outward = Math.sin(a) < 0;
      const dir = outward ? 1 : -1;
      const start = a - dir * total / 2 / r;
      ctx.fillStyle = gray(1);
      arcText(ctx, 'DOT', cx, cy, r, start + dir * (w1 / 2) / r, s1, 700, outward, s1 * 0.12);
      const b0 = start + dir * (w1 + gp) / r, b1 = start + dir * (w1 + gp + pad * 2 + w2) / r;
      ctx.fillStyle = gray(1);
      arcText(ctx, SIZE.dot, cx, cy, r, (b0 + b1) / 2, s2, 800, outward, s2 * 0.08);
      const hh = s2 * 0.62 + pad * 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, r + hh, Math.min(b0, b1), Math.max(b0, b1));
      ctx.arc(cx, cy, r - hh, Math.max(b0, b1), Math.min(b0, b1), true);
      ctx.closePath();
      ctx.lineWidth = Math.max(1, R * 0.007);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = gray(1);
      ctx.stroke();
    }
    if (!F) return;

    ring(R * 0.64, R * 0.668, 0.62);
    ring(R * 0.655, R * 0.661, 0.84);
    ring(R * (RIM - 0.02), R * 0.64, 0.9);
    ring(R * (RIM - 0.006), R * (RIM + 0.0), 0.72);
    disc(R * (RIM - 0.02), 0.05);
    ring(R * (RIM - 0.043), R * (RIM - 0.02), 0.5);
    ctx.fillStyle = gray(0.82);
    for (let i = 0; i < 5; i++) {
      const base = -Math.PI / 2 + i * TAU / 5;
      for (const s of [-1, 1]) {
        const a0 = base + s * 0.1, a1 = base + s * 0.19;
        const r0 = R * 0.18, r1 = R * (RIM - 0.01);
        const w0 = R * 0.034, w1 = R * 0.024;
        const p = (r, q, o) => [cx + r * Math.cos(q) - o * Math.sin(q), cy + r * Math.sin(q) + o * Math.cos(q)];
        const A = p(r0, a0, -w0), B = p(r1, a1, -w1), C = p(r1, a1, w1), D = p(r0, a0, w0);
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(D[0], D[1]); ctx.closePath(); ctx.fill();
      }
    }
    disc(R * 0.207, 0.9);
    disc(R * 0.199, 0.74);
    for (let i = 0; i < 5; i++) {
      const q = -Math.PI / 2 + TAU / 10 + i * TAU / 5;
      const c = polar(q, 0.125);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const t = k / 6 * TAU + q;
        const x = c.x + Math.cos(t) * R * 0.031, y = c.y + Math.sin(t) * R * 0.031;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = gray(1);
      ctx.fill();
      disc(R * 0.012, 0.25, c.x, c.y);
    }
    disc(R * 0.071, 0.3);
    disc(R * 0.064, 0.88);
    ctx.font = `900 ${R * 0.042}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = gray(1);
    ctx.fillText('123', cx, cy + R * 0.002);
  }

  function buildRelief() {
    const base = document.createElement('canvas');
    base.width = cw; base.height = ch;
    const b = base.getContext('2d');
    b.fillStyle = gray(0.1);
    b.fillRect(0, 0, cw, ch);
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTire(b, null);
    const sharp = document.createElement('canvas');
    sharp.width = cw; sharp.height = ch;
    const s = sharp.getContext('2d');
    s.filter = `blur(${(0.6 * dpr).toFixed(2)}px)`;
    s.drawImage(base, 0, 0);
    const soft = document.createElement('canvas');
    soft.width = Math.max(1, Math.round(cw / 2)); soft.height = Math.max(1, Math.round(ch / 2));
    const so = soft.getContext('2d');
    so.filter = `blur(${(1.6 * dpr).toFixed(2)}px)`;
    so.drawImage(base, 0, 0, soft.width, soft.height);
    return { base, sharp, soft };
  }

  function buildGrid() {
    const c = grid.cell;
    grid.w = Math.ceil(W / c); grid.h = Math.ceil(H / c);
    const cv = document.createElement('canvas');
    cv.width = grid.w; cv.height = grid.h;
    const x = cv.getContext('2d', { willReadFrequently: true });
    const read = (only) => {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.fillStyle = only ? '#000' : gray(0.1);
      x.fillRect(0, 0, grid.w, grid.h);
      x.setTransform(1 / c, 0, 0, 1 / c, 0, 0);
      drawTire(x, only);
      const d = x.getImageData(0, 0, grid.w, grid.h).data;
      const out = new Float32Array(grid.w * grid.h);
      for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
      return out;
    };
    grid.relief = read(null);
    grid.cov = new Float32Array(grid.w * grid.h);
    for (const k of ['size', 'dot', 'tread']) {
      const m = read(k);
      let idx = [];
      for (let i = 0; i < m.length; i++) if (m[i] > 0.35) idx.push(i);
      if (k === 'tread') {
        idx = idx.filter((i) => {
          const x = (i % grid.w + 0.5) * c, y = (Math.floor(i / grid.w) + 0.5) * c;
          let da = Math.atan2(y - G.cy, x - G.cx) - G.aTread;
          while (da > Math.PI) da -= TAU;
          while (da < -Math.PI) da += TAU;
          return Math.abs(da) < (wide ? 0.5 : 0.32);
        });
      }
      grid.groups[k] = idx;
    }
    grid.raised = [];
    for (let i = 0; i < grid.relief.length; i++) if (grid.relief[i] > 0.7) grid.raised.push(i);
  }

  function covStamp(x, y, r, amt, pres) {
    const c = grid.cell, rr = r * 0.8;
    const x0 = Math.max(0, Math.floor((x - rr) / c)), x1 = Math.min(grid.w - 1, Math.floor((x + rr) / c));
    const y0 = Math.max(0, Math.floor((y - rr) / c)), y1 = Math.min(grid.h - 1, Math.floor((y + rr) / c));
    const gam = 4.0 + (2.2 - 4.0) * pres;
    const a = amt * 0.62;
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const dx = (i + 0.5) * c - x, dy = (j + 0.5) * c - y;
        if (dx * dx + dy * dy > rr * rr) continue;
        const k = j * grid.w + i;
        grid.cov[k] += a * Math.pow(grid.relief[k], gam);
      }
    }
  }

  function revealSoft(list) {
    if (!list || !list.length) return 0;
    let n = 0;
    for (const i of list) n += Math.min(1, grid.cov[i] / REVEAL);
    return n / list.length;
  }

  function reveal(list) {
    if (!list || !list.length) return 0;
    let n = 0;
    for (const i of list) if (grid.cov[i] > REVEAL) n++;
    return n / list.length;
  }

  const VS_STAMP = `
attribute vec2 aCorner;
attribute vec2 aCenter;
attribute vec4 aP;
uniform vec2 uRes;
varying vec2 vPos;
varying vec2 vC;
varying vec4 vP;
void main(){
  float r = max(aP.x, 1.0) * 1.2;
  vec2 pos = aCenter + aCorner * r;
  vPos = pos; vC = aCenter; vP = aP;
  gl_Position = vec4(pos / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;

  const NOISE = `
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y); }`;

  const FS_STAMP = `
precision highp float;
uniform sampler2D uRelief;
uniform vec2 uRes;
uniform vec2 uOff;
uniform float uDpr;
uniform float uScale;
varying vec2 vPos;
varying vec2 vC;
varying vec4 vP;
${NOISE}
void main(){
  vec2 d = vPos - vC;
  float r = vP.x;
  if (vP.w < 0.0) {
    float m = smoothstep(r, r * 0.2, length(d));
    gl_FragColor = vec4(vP.z * m / uScale, 0.0, 0.0, 0.0);
    return;
  }
  vec2 dir = vec2(cos(vP.y), sin(vP.y));
  vec2 nr = vec2(-dir.y, dir.x);
  float u = dot(d, dir);
  float v = dot(d, nr);
  float m = smoothstep(r, r * 0.62, abs(v)) * smoothstep(r * 0.55, r * 0.16, abs(u));
  if (m <= 0.001) discard;
  float press = clamp(vP.w, 0.0, 1.0);
  float h = max(texture2D(uRelief, (vPos + uOff) / uRes).r, 0.0001);
  float resp = pow(h, mix(4.0, 2.2, press));
  vec2 q = vPos / uDpr;
  float tooth = vn(q * 0.9) * 0.6 + vn(q * 2.4 + 3.1) * 0.4;
  vec2 sp = vec2(dot(q, dir) * 0.022, dot(q, nr) * 0.36);
  float streak = vn(sp) * 0.65 + vn(sp * 2.3 + 7.0) * 0.35;
  float g = smoothstep(0.55 - press * 0.45, 0.85 - press * 0.25, tooth * 0.3 + streak * 0.7);
  float dep = vP.z * m * resp * (0.16 + 0.84 * g);
  gl_FragColor = vec4(dep / uScale, 0.0, 0.0, 0.0);
}`;

  const VS_COMP = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FS_COMP = `
precision highp float;
uniform sampler2D uDep;
uniform sampler2D uSoft;
uniform vec2 uRes;
uniform vec2 uOff;
uniform float uDpr;
uniform float uScale;
uniform vec3 uLight;
uniform vec4 uHint;
uniform vec4 uPress;
uniform float uSweep;
uniform vec2 uPeel;
uniform vec3 uInk;
uniform vec3 uSheen;
uniform float uFaint;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 pp = fc - uOff + vec2(0.0, -uPeel.x);
  float D = texture2D(uDep, pp / uRes).r * uScale * uPeel.y;
  vec2 q = pp / uDpr;
  float tooth = vn(q * 0.9) * 0.6 + vn(q * 2.4 + 3.1) * 0.4;
  float cover = (1.0 - exp(-D * 1.9)) * (0.86 + 0.14 * tooth);
  vec2 e = vec2(2.5 * uDpr) / uRes;
  float hl = texture2D(uSoft, vUv - vec2(e.x, 0.0)).r;
  float hr = texture2D(uSoft, vUv + vec2(e.x, 0.0)).r;
  float hd = texture2D(uSoft, vUv - vec2(0.0, e.y)).r;
  float hu = texture2D(uSoft, vUv + vec2(0.0, e.y)).r;
  vec3 N = normalize(vec3((hl - hr) * 5.0, (hd - hu) * 5.0, 1.0));
  vec3 L = normalize(vec3(uLight.xy - fc, uLight.z));
  float lam = dot(N, L) - L.z;
  float dh = length(fc - uHint.xy) / uHint.z;
  float hint = exp(-dh * dh * 2.2) * uHint.w;
  float sw = uSweep > -9000.0 ? exp(-pow((fc.x - uSweep) / (260.0 * uDpr), 2.0)) : 0.0;
  float dp = length(fc - uPress.xy) / max(uPress.z, 1.0);
  float pr = exp(-dp * dp * 2.5) * uPress.w;
  float emb = lam * (uFaint + hint * 0.24 + sw * 0.62 + pr * 0.75);
  float fib = vn(q * vec2(0.35, 1.6)) * 0.5 + vn(q * 1.3 + 9.0) * 0.5;
  vec3 paper = vec3(0.984 + fib * 0.016);
  paper *= 1.0 + emb;
  paper -= pr * 0.025;
  vec3 col = mix(paper, uInk, clamp(cover, 0.0, 0.94));
  vec3 Hh = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(N, Hh), 0.0), 28.0);
  col += uSheen * spec * cover * 0.2;
  gl_FragColor = vec4(col, 1.0);
}`;

  function compile(vs, fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    const a = {};
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) { const info = gl.getActiveAttrib(p, i); a[info.name] = gl.getAttribLocation(p, info.name); }
    return { p, u, a };
  }

  function initGL() {
    const opts = { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    try {
      gl = canvas.getContext('webgl2', opts);
      isGL2 = !!gl;
      if (!gl) gl = canvas.getContext('webgl', opts);
      if (!gl) return false;
      if (isGL2) halfOK = !!gl.getExtension('EXT_color_buffer_float');
      progStamp = compile(VS_STAMP, FS_STAMP);
      progComp = compile(VS_COMP, FS_COMP);
      vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, stampData.byteLength, gl.DYNAMIC_DRAW);
      triBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      reliefTex = gl.createTexture();
      softTex = gl.createTexture();
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; root.classList.add('nogl'); });
      return true;
    } catch (err) {
      gl = null;
      return false;
    }
  }

  function texParams() {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function upload(tex, src) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    texParams();
  }

  function makeDeposit() {
    if (depFbo) gl.deleteFramebuffer(depFbo);
    if (depTex) gl.deleteTexture(depTex);
    const tryMake = (half) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, cw, ch, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      texParams();
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (!ok) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); gl.deleteTexture(t); return false; }
      depTex = t; depFbo = f; depScale = half ? 1 : 4;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return true;
    };
    if (!(isGL2 && halfOK && tryMake(true))) tryMake(false);
  }

  function clearDeposit() {
    if (!gl) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, depFbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    grid.cov.fill(0);
  }

  function pushStamp(x, y, r, ang, amt, pres) {
    if (!gl) return;
    if (stampCount >= MAXST) flush();
    const gx = (x - off.x) * dpr, gy = (H - (y - off.y)) * dpr, rr = r * dpr, a = -ang;
    let o = stampCount * 48;
    for (let k = 0; k < 6; k++) {
      stampData[o++] = CORN[k * 2]; stampData[o++] = CORN[k * 2 + 1];
      stampData[o++] = gx; stampData[o++] = gy;
      stampData[o++] = rr; stampData[o++] = a; stampData[o++] = amt; stampData[o++] = pres;
    }
    stampCount++;
    if (pres >= 0) covStamp(x, y, r, amt, pres);
  }

  function flush() {
    if (!gl || !stampCount) return;
    const P = progStamp;
    gl.bindFramebuffer(gl.FRAMEBUFFER, depFbo);
    gl.viewport(0, 0, cw, ch);
    gl.useProgram(P.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, stampData.subarray(0, stampCount * 48));
    const A = [['aCorner', 2, 0], ['aCenter', 2, 8], ['aP', 4, 16]];
    for (const [n, s, o] of A) { const l = P.a[n]; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, s, gl.FLOAT, false, 32, o); }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, reliefTex);
    gl.uniform1i(P.u.uRelief, 0);
    gl.uniform2f(P.u.uRes, cw, ch);
    gl.uniform2f(P.u.uOff, off.x * dpr, -off.y * dpr);
    gl.uniform1f(P.u.uDpr, dpr);
    gl.uniform1f(P.u.uScale, depScale);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, stampCount * 6);
    gl.disable(gl.BLEND);
    for (const [n] of A) gl.disableVertexAttribArray(P.a[n]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    stampCount = 0;
  }

  function render() {
    if (!gl) return;
    flush();
    const P = progComp;
    gl.viewport(0, 0, cw, ch);
    gl.useProgram(P.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
    const l = P.a.aPos;
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, depTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, softTex);
    gl.uniform1i(P.u.uDep, 1);
    gl.uniform1i(P.u.uSoft, 2);
    gl.uniform2f(P.u.uRes, cw, ch);
    gl.uniform2f(P.u.uOff, off.x * dpr, -off.y * dpr);
    gl.uniform1f(P.u.uDpr, dpr);
    gl.uniform1f(P.u.uScale, depScale);
    gl.uniform3f(P.u.uLight, light.x * dpr, (H - light.y) * dpr, 280 * dpr);
    gl.uniform4f(P.u.uHint, hintU.x * dpr, (H - hintU.y) * dpr, 190 * dpr, hintU.a);
    gl.uniform4f(P.u.uPress, pressU.x * dpr, (H - pressU.y) * dpr, pressU.r * dpr, pressU.a);
    gl.uniform1f(P.u.uSweep, sweepX < -9000 ? -1e5 : sweepX * dpr);
    gl.uniform2f(P.u.uPeel, peel ? peel.shift * dpr : 0, peel ? peel.alpha : 1);
    gl.uniform3f(P.u.uInk, 12 / 255, 54 / 255, 47 / 255);
    gl.uniform3f(P.u.uSheen, 0.62, 0.8, 0.75);
    gl.uniform1f(P.u.uFaint, 0.014);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(l);
  }

  function brushR() { return wide ? clamp(G.R * 0.055, 16, 26) : clamp(G.R * 0.085, 15, 22); }

  function rubSegment(x0, y0, x1, y1, r, ang, A, pres) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const sp = Math.max(1, r * 0.25);
    const n = Math.max(1, Math.ceil(len / sp));
    const step = Math.max(len / n, 0.8);
    const amt = A * step / r;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      pushStamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, ang, amt, pres);
    }
  }

  function dust(x, y, r, speed) {
    const k = Math.min(4, Math.floor(speed * 1.2));
    for (let i = 0; i < k; i++) {
      const a = Math.random() * TAU, d = r * (0.9 + Math.random() * 1.1);
      pushStamp(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.6 + Math.random() * 1.1, 0, 0.45 + Math.random() * 0.5, -1);
    }
  }

  let lastBuzz = 0;
  function buzz(ms) {
    const ua = navigator.userActivation;
    if (!navigator.vibrate || !ua || !ua.hasBeenActive) return;
    const now = performance.now();
    if (now - lastBuzz < 45) return;
    lastBuzz = now;
    try { navigator.vibrate(ms); } catch (e) { lastBuzz = now; }
  }

  function reliefAt(x, y) {
    const i = Math.floor(x / grid.cell), j = Math.floor(y / grid.cell);
    if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) return 0;
    return grid.relief[j * grid.w + i];
  }

  function moveTo(p, x, y, t) {
    const dx = x - p.x, dy = y - p.y;
    const d = Math.hypot(dx, dy);
    const dt = Math.max(1, t - p.t);
    const v = d / dt;
    p.speed = p.speed * 0.6 + v * 0.4;
    if (d > 0.6) {
      const na = Math.atan2(dy, dx);
      let da = na - p.ang;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      p.ang += da * 0.55;
    }
    const r0 = brushR();
    if (p.down) {
      const pres = clamp(p.base + Math.min(0.3, p.speed * 0.1) + Math.min(0.25, p.hold * 0.3), 0, 1);
      const r = r0 * (1 + Math.min(0.55, p.speed * 0.16));
      rubSegment(p.x, p.y, x, y, r, p.ang, 1.3, pres);
      if (p.speed > 1.4) dust(x, y, r, p.speed);
      p.dist += d;
      userRubbed += d;
      if (p.speed > 0.9 && !reduce) {
        const k = Math.min(5, (p.speed - 0.9) * 3.2);
        off.tx = Math.cos(p.ang) * k;
        off.ty = Math.sin(p.ang) * k;
      }
      const h = reliefAt(x, y);
      if (p.type === 'touch' && Math.abs(h - p.lastH) > 0.35) buzz(7);
      p.lastH = h;
      if (d > 2) p.hold = Math.max(0, p.hold - 0.05);
    } else if (p.type === 'mouse' && d > 0) {
      rubSegment(p.x, p.y, x, y, r0 * 0.9, p.ang, 0.2, 0.16);
      userRubbed += d * 0.15;
    }
    p.x = x; p.y = y; p.t = t;
  }

  function getP(e) {
    let p = pointers.get(e.pointerId);
    if (!p) {
      p = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, t: performance.now(), down: false, ang: 0, speed: 0, hold: 0, t0: 0, dist: 0, base: 0.6, lastH: 0 };
      pointers.set(e.pointerId, p);
    }
    return p;
  }

  function basePressure(e) {
    if (e.pointerType === 'pen' && e.pressure > 0) return clamp(0.3 + e.pressure * 0.7, 0.3, 1);
    return e.pointerType === 'touch' ? 0.64 : 0.6;
  }

  function onDown(e) {
    if (body.classList.contains('sheet-open')) return;
    const p = getP(e);
    p.x = e.clientX; p.y = e.clientY; p.t = performance.now();
    p.down = true; p.t0 = p.t; p.dist = 0; p.hold = 0; p.speed = 0; p.base = basePressure(e); p.lastH = reliefAt(p.x, p.y);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { p.down = true; }
    lastInput = T;
    ghost = null;
    pushStamp(p.x, p.y, brushR(), p.ang, 0.05, p.base);
    cursorEl.classList.add('down');
  }

  function onMove(e) {
    const p = getP(e);
    if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true; mouse.t = T; cursor.x = e.clientX; cursor.y = e.clientY; }
    if (body.classList.contains('sheet-open')) { p.x = e.clientX; p.y = e.clientY; return; }
    if (p.type === 'pen' && p.down && e.pressure > 0) p.base = clamp(0.3 + e.pressure * 0.7, 0.3, 1);
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (list && list.length > 1) for (const c of list) moveTo(p, c.clientX, c.clientY, c.timeStamp || performance.now());
    else moveTo(p, e.clientX, e.clientY, e.timeStamp || performance.now());
    lastInput = T;
  }

  function onUp(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const now = performance.now();
    if (p.down && now - p.t0 < 230 && p.dist < 10) tap(p.x, p.y);
    p.down = false; p.hold = 0;
    off.tx = 0; off.ty = 0;
    if (p.type !== 'mouse') pointers.delete(e.pointerId);
    cursorEl.classList.remove('down');
    lastInput = T;
    checkNotes(true);
    if (p.type === 'touch' && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function' && !tilt) {
      try { DeviceOrientationEvent.requestPermission().catch(() => {}); } catch (err) { tilt = null; }
    }
  }

  function tap(x, y) {
    const r = brushR();
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r * 0.55;
      pushStamp(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.9, Math.random() * Math.PI, 0.42, 0.88);
    }
    off.vy += reduce ? 0 : 1.4;
    pressU.x = x; pressU.y = y; pressU.r = r * 2.2; pressU.a = 1;
    buzz(12);
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouse.inside = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { cursor.x = e.clientX; cursor.y = e.clientY; cursor.seen = true; } }, { passive: true });
  window.addEventListener('deviceorientation', (e) => {
    if (e.beta == null || e.gamma == null) return;
    tilt = { x: clamp(e.gamma / 35, -1, 1), y: clamp((e.beta - 40) / 35, -1, 1) };
  });

  function startGhost(kind) {
    let c, tx, len, amp, dur, cyc, pres;
    if (kind === 'intro') {
      c = polar(G.aSize, 0.787);
      tx = 1; len = G.R * 0.5; amp = G.R * 0.045; dur = 1.15; cyc = 6; pres = 0.78;
    } else {
      const order = ['size', 'dot', 'tread'];
      const k = order.find((g) => reveal(grid.groups[g]) < 0.42) || 'size';
      const a = k === 'size' ? G.aSize : k === 'dot' ? G.aDot : G.aTread;
      const rf = k === 'tread' ? 0.965 : 0.787;
      c = polar(a, rf);
      tx = 1; len = G.R * 0.26; amp = G.R * 0.04; dur = 0.85; cyc = 3.5; pres = 0.5;
      const tan = a + Math.PI / 2;
      ghost = { t: 0, dur, c, ux: Math.cos(tan), uy: Math.sin(tan), len, amp, cyc, pres, last: null };
      return;
    }
    ghost = { t: 0, dur, c, ux: tx, uy: 0, len, amp, cyc, pres, last: null };
  }

  function ghostPos(g, t) {
    const s = (t - 0.5) * g.len;
    const w = Math.sin(t * g.cyc * TAU) * g.amp;
    return { x: g.c.x + g.ux * s - g.uy * w, y: g.c.y + g.uy * s + g.ux * w };
  }

  function step(h) {
    off.vx = (off.vx + (off.tx - off.x) * 0.16) * 0.74;
    off.vy = (off.vy + (off.ty - off.y) * 0.16) * 0.74;
    off.x += off.vx; off.y += off.vy;
    off.tx *= 0.9; off.ty *= 0.9;

    let anyDown = null;
    for (const p of pointers.values()) {
      if (!p.down) continue;
      anyDown = p;
      p.speed *= 0.86;
      if (performance.now() - p.t > 90 || p.speed < 0.04) {
        p.hold += h;
        const pres = clamp(p.base + Math.min(0.36, p.hold * 0.42), 0, 1);
        const r = brushR();
        for (let i = 0; i < 2; i++) {
          const jx = (Math.random() - 0.5) * r * 0.5, jy = (Math.random() - 0.5) * r * 0.5;
          pushStamp(p.x + jx, p.y + jy, r * 0.85, Math.random() * Math.PI, 1.2 * h * (0.6 + p.hold), pres);
        }
      }
    }
    if (anyDown) {
      pressU.x += (anyDown.x - pressU.x) * 0.5;
      pressU.y += (anyDown.y - pressU.y) * 0.5;
      pressU.r = brushR() * 2.0;
      pressU.a += (Math.min(1, 0.45 + anyDown.hold * 0.8) - pressU.a) * 0.12;
    } else {
      pressU.a *= 0.9;
    }

    if (ghost) {
      ghost.t += h / ghost.dur;
      const t = Math.min(1, ghost.t);
      const q = ghostPos(ghost, t);
      if (ghost.last) {
        const ang = Math.atan2(q.y - ghost.last.y, q.x - ghost.last.x);
        ghost.ang = ang;
        rubSegment(ghost.last.x, ghost.last.y, q.x, q.y, brushR(), ang, 1.2, ghost.pres);
      }
      ghost.last = q;
      if (ghost.t >= 1) { ghost = null; lastInput = T; checkNotes(true); }
    }

    if (peel) {
      peel.t += h / 0.62;
      const e = Math.min(1, peel.t);
      peel.shift = e * e * H * 1.15;
      peel.alpha = 1 - e * 0.7;
      if (peel.t >= 1) {
        clearDeposit();
        peel = null;
        for (const k in shown) shown[k] = false;
        notesEls.forEach((el) => el.classList.remove('show'));
        leaderGs.forEach((g) => g.classList.remove('show'));
        off.vy -= reduce ? 0 : 2.2;
      }
    }

    if (!reduce && introDone && !ghost && !peel && !body.classList.contains('sheet-open') && T - lastInput > 6.5 && ghostCount < 3 && !anyDown) {
      const k = ['size', 'dot', 'tread'].some((g) => reveal(grid.groups[g]) < 0.42);
      if (k) { ghostCount++; startGhost('idle'); lastInput = T; }
    }
  }

  const cursorEl = $('#cursor');
  const ringEl = cursorEl.querySelector('.ring');
  const labEl = cursorEl.querySelector('.lab');
  const cursor = { x: -200, y: -200, rx: -200, ry: -200, ang: 0, seen: false, mode: '', w: 0, h: 0 };
  const ghostEl = $('#ghost');
  const hintEl = $('#hint');
  const pctEl = $('#pct');
  const notesEls = [...document.querySelectorAll('.note')];
  const leadersSvg = $('#leaders');
  const leaderGs = [];
  const SVGNS = 'http://www.w3.org/2000/svg';
  notesEls.forEach((el) => {
    const g = document.createElementNS(SVGNS, 'g');
    const ln = document.createElementNS(SVGNS, 'line');
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('r', '4');
    g.appendChild(ln); g.appendChild(c);
    g.dataset.k = el.dataset.k;
    leadersSvg.appendChild(g);
    leaderGs.push(g);
  });
  const treadSmall = document.querySelector('.note[data-k="tread"] small');
  if (treadSmall) treadSmall.textContent = `길이 ${PITCH.length}종 블록 ${NBLOCK}개를 섞어 그림 — 소리를 흩뜨리는 배열`;

  const mags = [...document.querySelectorAll('.btns button')].map((el) => ({ el, inner: el.querySelector('span'), x: 0, y: 0, vx: 0, vy: 0 }));

  function layoutNotes() {
    const footTop = $('.bottom').getBoundingClientRect().top;
    const narrowSlots = { size: 'top', dot: 'bl', tread: 'br' };
    notesEls.forEach((el, i) => {
      const k = el.dataset.k;
      const a = k === 'size' ? polar(G.aSize, 0.865) : k === 'dot' ? polar(G.aDot, 0.865) : polar(G.aTread, 0.985);
      const w = el.offsetWidth, h = el.offsetHeight;
      let lx, ly, ex, ey;
      if (wide) {
        ly = clamp(a.y - h / 2, 78, footTop - 16 - h);
        const ym = ly + h / 2, dy = ym - G.cy;
        const tl = Math.abs(dy) < G.R ? G.cx - Math.sqrt(G.R * G.R - dy * dy) : G.cx;
        lx = Math.max(16, Math.min(a.x - 48, tl - 26) - w);
        ex = lx + w; ey = clamp(a.y, ly + 12, ly + h - 12);
        el.style.setProperty('--ox', '100%');
      } else {
        const slot = narrowSlots[k];
        if (slot === 'top') { lx = clamp(a.x - w / 2, 12, W - 12 - w); ly = 66; ex = clamp(a.x, lx + 14, lx + w - 14); ey = ly + h; }
        else {
          lx = slot === 'bl' ? 12 : W - 12 - w;
          ly = Math.min(G.cy + G.R + 8, footTop - 8 - h);
          ex = clamp(a.x, lx + 14, lx + w - 14); ey = ly;
        }
        el.style.setProperty('--ox', '50%');
      }
      el.style.setProperty('--x', `${Math.round(lx)}px`);
      el.style.setProperty('--y', `${Math.round(ly)}px`);
      const g = leaderGs[i];
      const ln = g.firstChild, c = g.lastChild;
      ln.setAttribute('x1', a.x.toFixed(1)); ln.setAttribute('y1', a.y.toFixed(1));
      ln.setAttribute('x2', ex.toFixed(1)); ln.setAttribute('y2', ey.toFixed(1));
      ln.style.setProperty('--len', `${Math.ceil(Math.hypot(ex - a.x, ey - a.y)) + 2}`);
      c.setAttribute('cx', a.x.toFixed(1)); c.setAttribute('cy', a.y.toFixed(1));
    });
  }

  function checkNotes(force) {
    if (!grid.cov) return;
    const anyDown = [...pointers.values()].some((p) => p.down);
    if (anyDown && !force) return;
    notesEls.forEach((el, i) => {
      const k = el.dataset.k;
      if (shown[k]) return;
      if (reveal(grid.groups[k]) > 0.42) {
        shown[k] = true;
        el.classList.add('show');
        leaderGs[i].classList.add('show');
      }
    });
  }

  function ui(dt) {
    const k = 1 - Math.exp(-dt * 15);
    if (fine) {
      const px = cursor.rx, py = cursor.ry;
      cursor.rx += (cursor.x - cursor.rx) * k;
      cursor.ry += (cursor.y - cursor.ry) * k;
      const vx = (cursor.rx - px) / Math.max(dt, 0.001), vy = (cursor.ry - py) / Math.max(dt, 0.001);
      const sp = Math.hypot(vx, vy);
      const target = document.elementFromPoint(cursor.x, cursor.y);
      const overBtn = target && target.closest && target.closest('button');
      const overSheet = target && target.closest && target.closest('.sheet,.scrim');
      const mode = overSheet ? 'off' : overBtn ? 'btn' : 'rub';
      if (mode !== cursor.mode) {
        cursor.mode = mode;
        cursorEl.classList.toggle('btn', mode === 'btn');
        cursorEl.classList.toggle('off', mode === 'off' || !cursor.seen);
        labEl.textContent = mode === 'btn' ? (overBtn.id === 'fresh' ? '새 종이' : '열기') : '문지르기';
      }
      if (cursor.seen) cursorEl.classList.toggle('off', mode === 'off');
      const r = brushR();
      const w = mode === 'btn' ? 44 : r * 1.05, h = mode === 'btn' ? 44 : r * 2;
      if (Math.abs(w - cursor.w) > 0.5 || Math.abs(h - cursor.h) > 0.5) {
        cursor.w = w; cursor.h = h;
        ringEl.style.width = `${w}px`; ringEl.style.height = `${h}px`;
        ringEl.style.marginLeft = `${-w / 2}px`; ringEl.style.marginTop = `${-h / 2}px`;
      }
      if (sp > 30) {
        let da = Math.atan2(vy, vx) - cursor.ang;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        cursor.ang += da * Math.min(1, dt * 12);
      }
      const st = mode === 'btn' ? 1 : 1 + Math.min(0.45, sp / 2600);
      cursorEl.style.transform = `translate3d(${cursor.rx.toFixed(1)}px,${cursor.ry.toFixed(1)}px,0)`;
      ringEl.style.transform = mode === 'btn' ? 'none' : `rotate(${cursor.ang.toFixed(3)}rad) scale(${st.toFixed(3)},1)`;
    }

    let near = null, nd = 1e9;
    for (const m of mags) {
      const rc = m.el.getBoundingClientRect();
      m.cx = rc.left + rc.width / 2 - m.x; m.cy = rc.top + rc.height / 2 - m.y;
      m.rad = Math.max(rc.width, rc.height) / 2 + 48;
      const dd = Math.hypot(cursor.x - m.cx, cursor.y - m.cy);
      if (dd < m.rad && dd < nd) { nd = dd; near = m; }
    }
    for (const m of mags) {
      const inside = fine && m === near && !body.classList.contains('sheet-open');
      const tx = inside ? (cursor.x - m.cx) * 0.3 : 0, ty = inside ? (cursor.y - m.cy) * 0.3 : 0;
      m.vx = (m.vx + (tx - m.x) * 0.16) * 0.74;
      m.vy = (m.vy + (ty - m.y) * 0.16) * 0.74;
      m.x += m.vx; m.y += m.vy;
      if (Math.abs(m.x) > 0.05 || Math.abs(m.y) > 0.05 || inside) {
        m.el.style.transform = `translate3d(${m.x.toFixed(2)}px,${m.y.toFixed(2)}px,0)`;
        m.inner.style.transform = `translate3d(${(m.x * 0.4).toFixed(2)}px,${(m.y * 0.4).toFixed(2)}px,0)`;
      }
    }

    let lt;
    const touchDown = [...pointers.values()].find((p) => p.down && p.type !== 'mouse');
    if (fine && mouse.inside && T - mouse.t < 2.5) lt = { x: mouse.x, y: mouse.y, a: 1 };
    else if (touchDown) lt = { x: touchDown.x, y: touchDown.y, a: 1 };
    else if (tilt) lt = { x: G.cx + tilt.x * G.R * 1.1, y: G.cy + tilt.y * G.R * 1.1, a: 0.7 };
    else lt = { x: G.cx + Math.cos(T * 0.42) * G.R * 1.05, y: G.cy + Math.sin(T * 0.42) * G.R * 0.8, a: 0.55 };
    const kl = 1 - Math.exp(-dt * 6);
    light.x += (lt.x - light.x) * kl; light.y += (lt.y - light.y) * kl;
    hintU.x = light.x; hintU.y = light.y;
    hintU.a += (lt.a - hintU.a) * kl;

    if (ghost && ghost.last) {
      const r = brushR();
      ghostEl.style.opacity = '0.9';
      ghostEl.style.width = `${r * 2.1}px`;
      ghostEl.style.height = `${r * 0.42}px`;
      ghostEl.style.transform = `translate3d(${(ghost.last.x - r * 1.05).toFixed(1)}px,${(ghost.last.y - r * 0.21).toFixed(1)}px,0) rotate(${((ghost.ang || 0) + Math.PI / 2).toFixed(3)}rad)`;
    } else {
      ghostEl.style.opacity = '0';
    }

    const showHint = introDone && !ghost && userRubbed < 380 && !body.classList.contains('sheet-open');
    if (showHint) {
      const hp = polar(G.aSize, 0.6);
      hintEl.style.setProperty('--x', `${hp.x.toFixed(0)}px`);
      hintEl.style.setProperty('--y', `${hp.y.toFixed(0)}px`);
    }
    hintEl.classList.toggle('show', showHint);

    pctTimer -= dt;
    if (pctTimer <= 0 && grid.cov) {
      pctTimer = 0.15;
      const v = Math.round(revealSoft(grid.raised) * 100);
      if (v !== lastPct) { lastPct = v; pctEl.textContent = String(v); }
      if (![...pointers.values()].some((p) => p.down)) checkNotes(false);
    }
  }

  let last = performance.now(), acc = 0, t0 = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    const it = T - t0;
    if (!reduce && it < 1.5) sweepX = -0.2 * W + (it - 0.12) / 1.2 * W * 1.4;
    else sweepX = -1e5;
    if (!introDone && it > 0.55 && !ghost) {
      if (!reduce) startGhost('intro');
      introDone = true;
    }
    acc += dt;
    let n = 0;
    while (acc >= 1 / 60 && n < 3) { step(1 / 60); acc -= 1 / 60; n++; }
    if (n === 3) acc = 0;
    ui(dt);
    render();
  }

  function splitWords() {
    const el = $('#rxline');
    let i = 0;
    const mk = (word, em) => {
      const o = document.createElement('span');
      o.className = 'w';
      const sp = document.createElement('span');
      sp.style.transitionDelay = `${(0.18 + i++ * 0.05).toFixed(3)}s`;
      if (em) { const e = document.createElement('em'); e.textContent = word; sp.appendChild(e); } else sp.textContent = word;
      o.appendChild(sp);
      return o;
    };
    const frag = document.createDocumentFragment();
    [...el.childNodes].forEach((c) => {
      const em = c.nodeType === 1;
      c.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(' '));
        else frag.appendChild(mk(part, em));
      });
    });
    el.textContent = '';
    el.appendChild(frag);
  }

  function sizeAll(first) {
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    let d = Math.min(2, window.devicePixelRatio || 1);
    if (W * H * d * d > 4.4e6) d = Math.sqrt(4.4e6 / (W * H));
    dpr = d;
    cw = Math.max(1, Math.round(W * dpr));
    ch = Math.max(1, Math.round(H * dpr));
    canvas.width = cw; canvas.height = ch;
    G = computeGeom();
    const rel = buildRelief();
    buildGrid();
    if (gl) {
      upload(reliefTex, rel.sharp);
      upload(softTex, rel.soft);
      makeDeposit();
    } else {
      const c2 = canvas.getContext('2d');
      if (c2) {
        c2.fillStyle = '#fff'; c2.fillRect(0, 0, cw, ch);
        c2.globalAlpha = 0.18; c2.drawImage(rel.base, 0, 0);
        c2.globalAlpha = 1;
      }
    }
    for (const k in shown) shown[k] = false;
    notesEls.forEach((el) => el.classList.remove('show'));
    leaderGs.forEach((g) => g.classList.remove('show'));
    layoutNotes();
    light.x = G.cx + G.R; light.y = G.cy;
    pressU.x = G.cx; pressU.y = G.cy;
    if (!first) lastPct = -1;
  }

  let rzTimer = 0, lastW = 0, lastH = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => {
      const w = window.innerWidth, h = window.innerHeight;
      if (w === lastW && Math.abs(h - lastH) < 120) return;
      lastW = w; lastH = h;
      sizeAll(false);
    }, 200);
  });

  const sheet = $('#sheet');
  function openSheet() {
    body.classList.add('sheet-open');
    sheet.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#close').focus({ preventScroll: true }), 60);
  }
  function closeSheet() {
    body.classList.remove('sheet-open');
    sheet.setAttribute('aria-hidden', 'true');
    $('#open').focus({ preventScroll: true });
  }
  $('#open').addEventListener('click', openSheet);
  $('#close').addEventListener('click', closeSheet);
  $('#scrim').addEventListener('click', closeSheet);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && body.classList.contains('sheet-open')) closeSheet(); });
  $('#fresh').addEventListener('click', () => {
    if (peel || !gl) return;
    peel = { t: 0, shift: 0, alpha: 1 };
    notesEls.forEach((el) => el.classList.remove('show'));
    leaderGs.forEach((g) => g.classList.remove('show'));
    userRubbed = 380;
    lastInput = T;
  });

  async function boot() {
    splitWords();
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load(`900 100px "Pretendard Variable"`, '123TIRE235/60R18DOT4026TUBELESSRADIAL'),
          document.fonts.load(`800 100px "Pretendard Variable"`, '235/60R18DOT4026'),
          document.fonts.load(`700 16px "Pretendard Variable"`, '123타이어는 고무에 새겨진 숫자까지 알려 주는 곳입니다'),
        ]),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    } catch (e) {
      lastInput = 0;
    }
    const ok = initGL();
    if (!ok) root.classList.add('nogl');
    lastW = window.innerWidth; lastH = window.innerHeight;
    sizeAll(true);
    requestAnimationFrame(() => {
      body.classList.add('on');
      last = performance.now();
      t0 = T;
      requestAnimationFrame(frame);
    });
  }

  boot();
})();
