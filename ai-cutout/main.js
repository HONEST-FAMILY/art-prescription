(() => {
  const SW = 2586, SH = 1390;
  const PARTS = [
    { id: 'bg', file: '01_bg.webp', b: [0, 0, 2586, 1390], d: -0.22, z: 0, n: '01', name: '배경(벽·책상·라이트박스)', a: [2150, 230] },
    { id: 'tail', file: '02_tail.webp', b: [10, 463, 497, 939], d: 0.36, z: 1, n: '02', name: '꼬리', a: [260, 180] },
    { id: 'head', file: '03_head.webp', b: [594, 33, 716, 880], d: 0.45, z: 2, n: '03', name: '머리 · 눈 뜬 것', a: [560, 170] },
    { id: 'blink', file: '04_head_closed.webp', b: [596, 34, 712, 846], d: 0.45, z: 3, n: '04', name: '머리 · 눈 감은 것', a: [560, 170] },
    { id: 'body', file: '05_body.webp', b: [356, 561, 933, 836], d: 0.45, z: 4, n: '05', name: '몸통', a: [420, 520] },
    { id: 'under', file: '06_paper.webp', b: [1433, 547, 770, 581], d: 0.45, z: 5 },
    { id: 'paper', file: '06_paper.webp', b: [1433, 547, 770, 581], d: 0.45, z: 5, n: '06', name: '넘기는 원화 종이', a: [640, 230] },
    { id: 'ink', d: 0.45, z: 6, n: '코드', name: '매 순간 그리는 연필 선', a: [560, 340], code: true },
    { id: 'pen', file: '07_arm_pencil.webp', b: [1006, 491, 643, 436], d: 0.45, z: 7, n: '07', name: '연필 든 팔', a: [470, 40] },
    { id: 'rest', file: '08_arm_rest.webp', b: [656, 692, 928, 488], d: 0.45, z: 8, n: '08', name: '종이 누르는 팔', a: [860, 300] },
    { id: 'mug', file: '09_mug.webp', b: [513, 1164, 370, 232], d: 1, z: 9, n: '09', name: '머그잔', a: [190, 60] },
    { id: 'cup', file: '10_cup.webp', b: [2223, 909, 297, 487], d: 1, z: 10, n: '10', name: '연필꽂이', a: [150, 120] }
  ];
  const BODY_P = [766, 1362], HEAD_P = [906, 690], REST_P = [786, 820], PEN_P = [1046, 822], TAIL_P = [380, 1350];
  const TIP = [1646, 833];
  const QUAD = [[1830, 553], [2196, 747], [1743, 1121], [1438, 861]];
  const CW = 800, CH = 600;
  const HIT = [[640, 60, 1300, 760], [420, 600, 1250, 1390], [1006, 491, 1660, 930], [700, 820, 1590, 1180]];

  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const T = (x, y) => [1, 0, 0, 1, x, y];
  const R = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; };
  const Sc = (x, y) => [x, 0, 0, y, 0, 0];
  const about = (p, m) => mul(T(p[0], p[1]), mul(m, T(-p[0], -p[1])));
  const inv = (m) => { const det = m[0] * m[3] - m[1] * m[2]; return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]; };
  const ap = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
  const css = (m) => `matrix(${m[0].toFixed(5)},${m[1].toFixed(5)},${m[2].toFixed(5)},${m[3].toFixed(5)},${m[4].toFixed(2)},${m[5].toFixed(2)})`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = (x) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const easeInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  function homog(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [X, Y] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
    }
    for (let i = 0; i < 8; i++) {
      let p = i;
      for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let r = 0; r < 8; r++) {
        if (r === i) continue;
        const f = A[r][i] / A[i][i];
        for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    return b.map((v, i) => v / A[i][i]).concat([1]);
  }
  const Hm = homog([[0, 0], [CW, 0], [CW, CH], [0, CH]], QUAD);
  const Hi = homog(QUAD, [[0, 0], [CW, 0], [CW, CH], [0, CH]]);
  const hap = (h, p) => { const w = h[6] * p[0] + h[7] * p[1] + 1; return [(h[0] * p[0] + h[1] * p[1] + h[2]) / w, (h[3] * p[0] + h[4] * p[1] + h[5]) / w]; };
  const css3 = (m, h) => {
    const r00 = m[0] * h[0] + m[2] * h[3] + m[4] * h[6], r01 = m[0] * h[1] + m[2] * h[4] + m[4] * h[7], r03 = m[0] * h[2] + m[2] * h[5] + m[4];
    const r10 = m[1] * h[0] + m[3] * h[3] + m[5] * h[6], r11 = m[1] * h[1] + m[3] * h[4] + m[5] * h[7], r13 = m[1] * h[2] + m[3] * h[5] + m[5];
    return `matrix3d(${r00},${r10},0,${h[6]},${r01},${r11},0,${h[7]},0,0,1,0,${r03},${r13},0,1)`;
  };

  const panel = document.getElementById('panel');
  const scene = document.getElementById('scene');
  const callouts = document.getElementById('callouts');
  const labels = document.getElementById('labels');
  const btn = document.getElementById('explode');
  const NS = 'http://www.w3.org/2000/svg';
  const NOHOVER = matchMedia('(hover: none)');

  const el = {};
  for (const p of PARTS) {
    let node;
    if (p.id === 'ink') {
      node = document.createElement('canvas');
      node.width = CW; node.height = CH;
      node.style.width = CW + 'px'; node.style.height = CH + 'px';
    } else {
      node = document.createElement('img');
      node.src = 'parts/' + p.file;
      node.alt = '';
      node.draggable = false;
      node.decoding = 'async';
      node.width = p.b[2]; node.height = p.b[3];
    }
    node.style.opacity = '0';
    scene.appendChild(node);
    el[p.id] = node;
    if (p.n) {
      const anc = document.createElement('div');
      anc.className = 'anc';
      scene.appendChild(anc);
      p.anc = anc;
      const lb = document.createElement('div');
      lb.className = 'lb' + (p.code ? ' code' : '');
      lb.innerHTML = p.code ? `<strong>코드</strong><em> 가 </em>${p.name}` : `<em>AI가 그린 부품 </em><strong>${p.n}</strong><em> · </em>${p.name}`;
      labels.appendChild(lb);
      p.lb = lb;
      const line = document.createElementNS(NS, 'polyline');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', p.code ? '#2b5fd9' : '#1f1d1a');
      line.setAttribute('stroke-width', '1.2');
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', '3.2');
      dot.setAttribute('fill', p.code ? '#2b5fd9' : '#1f1d1a');
      callouts.appendChild(line); callouts.appendChild(dot);
      p.line = line; p.dot = dot;
    }
    p.el = node;
  }
  const fx = document.createElementNS(NS, 'svg');
  fx.setAttribute('id', 'fx');
  fx.setAttribute('width', SW); fx.setAttribute('height', SH);
  fx.setAttribute('viewBox', `0 0 ${SW} ${SH}`);
  scene.appendChild(fx);
  const marks = [];
  for (let i = 0; i < 3; i++) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('stroke', '#1f1d1a'); l.setAttribute('stroke-width', '11'); l.setAttribute('stroke-linecap', 'round');
    l.setAttribute('opacity', '0');
    fx.appendChild(l); marks.push(l);
  }

  const ink = el.ink.getContext('2d');
  const ghost = document.createElement('canvas');
  ghost.width = CW; ghost.height = CH;
  const gctx = ghost.getContext('2d');

  const P = {};
  for (const p of PARTS) P[p.id] = p;

  const st = {
    t0: performance.now(), last: performance.now(), t: 0,
    s: 1, tx: 0, ty: 0, portrait: false, w: 0, h: 0,
    mx: 0, my: 0, tmx: 0, tmy: 0, lastInput: -10, tilt: false,
    react: 0, look: 0, lookT: 0, hold: 0, holding: false,
    blinkAt: 2.2, blinkEnd: 0, happyEnd: 0,
    flip: 0, flipV: 0, flipTarget: 0, dragging: false, dragFrom: null, flipAway: false,
    explode: 0, explodeTarget: 0, exStart: 0, exFrom: 0,
    sheet: 0, mode: 'draw', modeT: 0, prevTip: null,
    path: null, seg: 0, segPos: 0, penDown: false
  };

  function fit() {
    const r = panel.getBoundingClientRect();
    st.w = r.width - 6; st.h = r.height - 6;
    st.portrait = st.w / st.h < 1.05;
    if (st.portrait) {
      st.s = Math.max(st.w / 1340, st.h / SH) * 1.04;
      const fxp = 1230, fyp = 700;
      st.tx = clamp(st.w / 2 - fxp * st.s, st.w - SW * st.s, 0);
      st.ty = clamp(st.h / 2 - fyp * st.s, st.h - SH * st.s, 0);
    } else {
      st.s = Math.max(st.w / SW, st.h / SH) * 1.035;
      st.tx = (st.w - SW * st.s) / 2;
      st.ty = (st.h - SH * st.s) / 2;
    }
  }
  fit();
  addEventListener('resize', fit);

  function buildSheet(k) {
    const c = hap(Hi, TIP);
    const ph = (k % 5) / 4;
    const strokes = [];
    const baseY = c[1] + 50, ox = c[0] - 70;
    const arc = [];
    for (let i = 0; i <= 26; i++) {
      const u = i / 26;
      arc.push([ox + u * 150, baseY - 150 * 4 * u * (1 - u) * 0.62]);
    }
    strokes.push(arc);
    const bx = ox + ph * 150, by = baseY - 150 * 4 * ph * (1 - ph) * 0.62 - 16;
    const sq = ph > 0.85 || ph < 0.08 ? 1.35 : 0.9;
    const rx = 17 * sq, ry = 17 / sq;
    const circ = [];
    for (let i = 0; i <= 30; i++) {
      const a = -Math.PI / 2 + i / 30 * Math.PI * 2.08;
      circ.push([bx + Math.cos(a) * rx, by + Math.sin(a) * ry]);
    }
    strokes.push(circ);
    for (let j = 0; j < 3; j++) {
      const yy = by - 10 + j * 10;
      strokes.push([[bx - rx - 10 - j * 4, yy], [bx - rx - 34 - j * 6, yy + 3]]);
    }
    const line = [];
    for (let i = 0; i <= 10; i++) line.push([ox - 10 + i * 17, baseY + 22 + Math.sin(i * 1.7) * 1.2]);
    strokes.push(line);
    return strokes.map((s) => {
      const out = [s[0]];
      for (let i = 1; i < s.length; i++) {
        const a = s[i - 1], b = s[i];
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
        for (let j = 1; j <= n; j++) out.push([lerp(a[0], b[0], j / n), lerp(a[1], b[1], j / n)]);
      }
      return out;
    });
  }

  function startSheet() {
    st.path = buildSheet(st.sheet);
    st.seg = 0; st.segPos = 0; st.penDown = false; st.prevTip = null;
    st.mode = 'draw'; st.modeT = 0;
    st.cursor = hap(Hi, TIP);
  }

  function resetSheet() {
    gctx.clearRect(0, 0, CW, CH);
    gctx.globalAlpha = 0.22;
    gctx.drawImage(el.ink, 0, 0);
    gctx.globalAlpha = 1;
    ink.clearRect(0, 0, CW, CH);
    ink.drawImage(ghost, 0, 0);
    st.sheet++;
    st.flip = 0; st.flipV = 0; st.flipTarget = 0; st.flipAway = false;
    startSheet();
  }
  startSheet();

  function advanceCursor(dt) {
    if (st.mode !== 'draw' || !st.path) return;
    const speed = (st.holding ? 520 : 230) * dt;
    let budget = speed;
    while (budget > 0 && st.seg < st.path.length) {
      const s = st.path[st.seg];
      if (!st.penDown) {
        const tgt = s[0];
        const d = Math.hypot(tgt[0] - st.cursor[0], tgt[1] - st.cursor[1]);
        const mv = Math.min(d, budget * 1.6);
        if (d > 0.01) { st.cursor = [st.cursor[0] + (tgt[0] - st.cursor[0]) / d * mv, st.cursor[1] + (tgt[1] - st.cursor[1]) / d * mv]; }
        budget -= mv / 1.6;
        if (d - mv < 0.5) { st.penDown = true; st.segPos = 0; st.prevTip = null; }
        else break;
      } else {
        const i = Math.floor(st.segPos);
        if (i >= s.length - 1) { st.penDown = false; st.seg++; continue; }
        const a = s[i], b = s[i + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.001;
        const step = Math.min(budget, L * (1 - (st.segPos - i)));
        st.segPos += step / L;
        budget -= step;
        const f = st.segPos - Math.floor(st.segPos);
        const j = Math.floor(st.segPos);
        const p0 = s[Math.min(j, s.length - 1)], p1 = s[Math.min(j + 1, s.length - 1)];
        st.cursor = [lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f)];
      }
    }
    if (st.seg >= st.path.length) { st.mode = 'check'; st.modeT = 0; st.penDown = false; }
  }

  function setOpacity(id, v) {
    const e = el[id];
    const s = v.toFixed(3);
    if (e._o !== s) { e.style.opacity = s; e._o = s; }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - st.last) / 1000);
    st.last = now;
    const t = (now - st.t0) / 1000;
    st.t = t;

    if (st.explodeTarget !== st.exFrom || st.explode !== st.explodeTarget) {
      const k = clamp((now - st.exStart) / 950, 0, 1);
      st.explode = lerp(st.exFrom, st.explodeTarget, easeInOut(k));
      if (k >= 1) { st.explode = st.explodeTarget; st.exFrom = st.explodeTarget; }
    }
    const E = st.explode;
    const amp = 1 - E;

    if (!st.tilt && t - st.lastInput > 3.5 && NOHOVER.matches) {
      st.tmx = Math.sin(t * 0.45) * 0.55; st.tmy = Math.sin(t * 0.33) * 0.35;
    }
    st.mx = lerp(st.mx, st.tmx, 1 - Math.pow(0.001, dt));
    st.my = lerp(st.my, st.tmy, 1 - Math.pow(0.001, dt));

    if (st.holding) st.hold = Math.min(1, st.hold + dt * 2.2); else st.hold = Math.max(0, st.hold - dt * 1.8);
    st.react = Math.max(0, st.react - dt / 1.5);
    if (t > st.lookT) st.look = lerp(st.look, 0, 1 - Math.pow(0.02, dt));

    if (!st.dragging) {
      if (st.mode === 'check') {
        st.modeT += dt;
        if (st.modeT > 1.5 && E < 0.01) { st.mode = 'flip'; st.flipTarget = Math.PI; st.flipAway = true; }
      }
      const k = 70, c = 11;
      st.flipV += (-(st.flip - st.flipTarget) * k - st.flipV * c) * dt;
      st.flip += st.flipV * dt;
      if (st.flipAway && st.flip > 2.95) resetSheet();
    }
    if (E < 0.01 && !st.dragging && st.mode === 'draw' && t > 1.4) advanceCursor(dt * (st.react > 0.5 ? 0.15 : 1));

    const breath = Math.sin(t * Math.PI * 2 / 3.6);
    const hop = -Math.sin(Math.min(1, (1.5 - st.react * 1.5) / 0.45) * Math.PI) * (st.react > 0.7 ? 26 : 0);
    const lean = amp * (0.006 * Math.sin(t * 0.63) + st.hold * 0.035);
    let B = about(BODY_P, mul(R(lean), Sc(1 - 0.0035 * breath * amp, 1 + 0.012 * breath * amp)));
    B = mul(T(0, hop * amp), B);
    const Bi = inv(B);

    const checking = st.mode === 'check' ? Math.sin(Math.min(1, st.modeT / 1.2) * Math.PI) : 0;
    const watch = st.dragging || st.mode === 'flip' ? 1 : 0;
    st.watchS = lerp(st.watchS || 0, watch, 1 - Math.pow(0.01, dt));
    const reactLook = st.react > 0 ? Math.sin(Math.min(1, (1.5 - st.react * 1.5) / 1.2) * Math.PI) : 0;
    const headAng = amp * (0.03 * Math.sin(t * 0.83) + 0.012 * Math.sin(t * 2.1) - 0.09 * checking + 0.12 * reactLook + 0.06 * st.hold + 0.05 * st.watchS + st.look);
    const headDrop = amp * (st.hold * 14 + reactLook * 10);
    const Hd = mul(B, mul(T(st.hold * 10 * amp, headDrop), about(HEAD_P, R(headAng))));

    const restA = amp * (0.007 * Math.sin(t * 1.05 + 1) - st.watchS * 0.01);
    const REST = mul(B, about(REST_P, R(restA)));

    let tgt = hap(Hm, st.cursor);
    if (!st.penDown || st.mode !== 'draw') tgt = [tgt[0] - 4, tgt[1] - 14];
    if (st.dragging || st.mode === 'flip' || st.mode === 'check') tgt = [tgt[0] - 26 * (st.watchS + checking), tgt[1] - 34 * (st.watchS + checking)];
    const tl = ap(Bi, tgt);
    const v0 = [TIP[0] - PEN_P[0], TIP[1] - PEN_P[1]];
    const v1 = [tl[0] - PEN_P[0], tl[1] - PEN_P[1]];
    const a0 = Math.atan2(v0[1], v0[0]), a1 = Math.atan2(v1[1], v1[0]);
    const ext = clamp(Math.hypot(v1[0], v1[1]) - Math.hypot(v0[0], v0[1]), -26, 26);
    const jit = st.penDown ? Math.sin(t * 41) * 0.0012 : 0;
    const L = mul(T(ext * Math.cos(a1) * amp, ext * Math.sin(a1) * amp), about(PEN_P, R((a1 - a0 + jit) * amp)));
    const PEN = mul(B, L);

    if (st.penDown && st.mode === 'draw' && E < 0.01 && st.flip < 0.05) {
      const tipS = ap(PEN, TIP);
      const c = hap(Hi, tipS);
      if (st.prevTip) {
        ink.strokeStyle = 'rgba(43,95,217,0.9)';
        ink.lineCap = 'round'; ink.lineJoin = 'round';
        ink.lineWidth = 3.4 + Math.sin(t * 7) * 0.5;
        ink.beginPath(); ink.moveTo(st.prevTip[0], st.prevTip[1]); ink.lineTo(c[0], c[1]); ink.stroke();
      }
      st.prevTip = c;
    } else st.prevTip = null;

    const TAIL = about(TAIL_P, R(amp * (0.045 * Math.sin(t * 1.25) + 0.018 * Math.sin(t * 2.9 + 0.7) + st.react * 0.06 * Math.sin(t * 9))));

    const th = clamp(st.flip, 0, Math.PI);
    const dvec = [QUAD[1][0] - QUAD[0][0], QUAD[1][1] - QUAD[0][1]];
    const dl = Math.hypot(dvec[0], dvec[1]);
    const d = [dvec[0] / dl, dvec[1] / dl], nrm = [-d[1], d[0]];
    const es = [nrm[0] * Math.cos(th), nrm[1] * Math.cos(th) - 0.42 * Math.sin(th)];
    const M2 = [d[0] * d[0] + es[0] * nrm[0], d[1] * d[0] + es[1] * nrm[0], d[0] * d[1] + es[0] * nrm[1], d[1] * d[1] + es[1] * nrm[1], 0, 0];
    const FLIP = about(QUAD[0], M2);

    const ex = st.portrait ? { rx: 50, rz: -18, k: 0.4, gap: 120, cx: 1250, cy: 700, sx: -0.04, sy: 0.07 } : { rx: 48, rz: -20, k: 0.5, gap: 115, cx: 1290, cy: 700, sx: -0.13, sy: 0.05 };
    const cz = E * 5 * ex.gap;
    const sc = `translate(${(st.tx + E * ex.sx * st.w).toFixed(2)}px,${(st.ty + E * ex.sy * st.h).toFixed(2)}px) scale(${st.s.toFixed(5)})` + (E > 0.0005 ? ` translate3d(${ex.cx}px,${ex.cy}px,${cz}px) rotateX(${(ex.rx * E).toFixed(3)}deg) rotateZ(${(ex.rz * E).toFixed(3)}deg) scale(${(1 - (1 - ex.k) * E).toFixed(4)}) translate3d(${-ex.cx}px,${-ex.cy}px,${-cz}px)` : '');
    scene.style.transform = sc;
    const want3d = E > 0.0005;
    if (want3d !== scene._d3) { scene.classList.toggle('d3', want3d); scene._d3 = want3d; }

    const intro = (i) => { const p = clamp((t - 0.05 - i * 0.075) / 0.6, 0, 1); return p; };
    const mats = {
      bg: [1, 0, 0, 1, 0, 0], tail: TAIL, head: Hd, blink: Hd, body: B,
      under: [1, 0, 0, 1, 0, 0], paper: FLIP, ink: FLIP, pen: PEN, rest: REST,
      mug: [1, 0, 0, 1, 0, 0], cup: [1, 0, 0, 1, 0, 0]
    };
    const blinking = t < st.blinkEnd || t < st.happyEnd || st.hold > 0.6;
    if (t > st.blinkAt) { st.blinkEnd = t + 0.13; st.blinkAt = t + 2.2 + Math.random() * 3.2; if (Math.random() < 0.25) st.blinkAt = t + 0.3; }
    const pxs = st.portrait ? 30 : 34, pys = st.portrait ? 22 : 20;

    PARTS.forEach((p, i) => {
      const ip = intro(p.z);
      const e = easeOutBack(ip);
      const par = T(p.d * st.mx * pxs * amp, p.d * st.my * pys * amp);
      let m = mul(par, mats[p.id]);
      if (p.id !== 'bg' && ip < 1) m = mul(T(0, (1 - e) * 110), m);
      const z = E * p.z * ex.gap;
      let tf;
      if (p.id === 'ink') tf = `translate3d(0,0,${z.toFixed(1)}px) ` + css3(m, Hm);
      else {
        const mm = mul(m, T(p.b[0], p.b[1]));
        tf = `translate3d(0,0,${z.toFixed(1)}px) ` + css(mm);
        p.mm = mm;
      }
      if (p.id === 'bg' && ip < 1) tf += ` translate(${SW / 2}px,${SH / 2}px) scale(${(1.04 - 0.04 * easeInOut(ip)).toFixed(4)}) translate(${-SW / 2}px,${-SH / 2}px)`;
      p.el.style.transform = tf;
      p.tf = tf;
      let o = Math.min(1, ip * 1.7);
      if (p.id === 'blink') o *= E > 0.02 ? 1 : (blinking ? 1 : 0);
      if (p.id === 'head') o *= E > 0.02 ? 1 : (blinking ? 0 : 1);
      if (p.id === 'under') o *= 1 - E;
      if (p.id === 'ink') o *= st.flip > Math.PI / 2 ? 0.25 : 1;
      if (p.id === 'paper' && st.flip > 2.2) o *= clamp((2.95 - st.flip) / 0.75, 0, 1);
      if (p.id === 'ink' && st.flip > 2.2) o *= clamp((2.95 - st.flip) / 0.75, 0, 1);
      setOpacity(p.id, o);
    });

    const mk = st.react > 0.35 ? 1 : 0;
    const mp = 1 - st.react;
    const hc = ap(Hd, [1250, 140]);
    marks.forEach((l, i) => {
      const a = -1.2 + i * 0.55;
      const r0 = 40 + mp * 50, r1 = 95 + mp * 70;
      l.setAttribute('x1', (hc[0] + Math.cos(a) * r0).toFixed(1)); l.setAttribute('y1', (hc[1] + Math.sin(a) * r0).toFixed(1));
      l.setAttribute('x2', (hc[0] + Math.cos(a) * r1).toFixed(1)); l.setAttribute('y2', (hc[1] + Math.sin(a) * r1).toFixed(1));
      l.setAttribute('opacity', (mk * amp * clamp(st.react * 2.2, 0, 1)).toFixed(2));
    });
    fx.style.transform = `translate3d(0,0,${(E * 11 * ex.gap).toFixed(1)}px)`;

    layoutLabels(E);
    requestAnimationFrame(frame);
  }

  function layoutLabels(E) {
    const show = clamp((E - 0.55) / 0.4, 0, 1);
    if (show <= 0) {
      if (callouts._on) { for (const p of PARTS) if (p.lb) { p.lb.style.opacity = '0'; p.line.setAttribute('opacity', '0'); p.dot.setAttribute('opacity', '0'); } callouts._on = false; }
      return;
    }
    callouts._on = true;
    const pr = panel.getBoundingClientRect();
    const items = [];
    for (const p of PARTS) {
      if (!p.lb) continue;
      p.anc.style.transform = p.tf + ` translate(${p.a[0]}px,${p.a[1]}px)`;
      const r = p.anc.getBoundingClientRect();
      items.push({ p, x: r.left - pr.left - 3, y: r.top - pr.top - 3 });
    }
    const W = pr.width - 6, Hh = pr.height - 6;
    const gapY = st.portrait ? 30 : 31;
    items.sort((a, b) => a.y - b.y);
    const n = items.length;
    const top = 14, bottom = Hh - 14;
    const span = Math.max(gapY * (n - 1), 0);
    let ys = items.map((it) => it.y);
    for (let i = 0; i < n; i++) ys[i] = Math.max(ys[i], i ? ys[i - 1] + gapY : top);
    if (ys[n - 1] > bottom) { ys[n - 1] = bottom; for (let i = n - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gapY); }
    if (ys[0] < top) { const sh = top - ys[0]; ys = ys.map((y) => y + sh); }
    items.forEach((it, i) => {
      const lb = it.p.lb;
      const lw = lb._w || (lb._w = lb.offsetWidth);
      const lx = W - lw - 12;
      const ly = ys[i];
      lb.style.transform = `translate(${lx.toFixed(1)}px,${(ly - 12).toFixed(1)}px)`;
      lb.style.opacity = show.toFixed(3);
      const kx = Math.min(lx - 14, Math.max(it.x + 20, lx - 60));
      it.p.line.setAttribute('points', `${it.x.toFixed(1)},${it.y.toFixed(1)} ${kx.toFixed(1)},${ly.toFixed(1)} ${(lx - 2).toFixed(1)},${ly.toFixed(1)}`);
      it.p.line.setAttribute('opacity', show.toFixed(3));
      it.p.dot.setAttribute('cx', it.x.toFixed(1)); it.p.dot.setAttribute('cy', it.y.toFixed(1));
      it.p.dot.setAttribute('opacity', show.toFixed(3));
    });
  }

  function toScene(cx, cy) {
    const r = panel.getBoundingClientRect();
    return [(cx - r.left - 3 - st.tx) / st.s, (cy - r.top - 3 - st.ty) / st.s];
  }
  const onChar = (p) => HIT.some((b) => p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3]);

  let down = null, holdTimer = 0;
  panel.addEventListener('pointerdown', (e) => {
    if (st.explode > 0.02 || st.explodeTarget) return;
    panel.setPointerCapture(e.pointerId);
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: false };
    st.lastInput = st.t;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { if (down && !down.moved) { st.holding = true; } }, 380);
  });
  panel.addEventListener('pointermove', (e) => {
    const r = panel.getBoundingClientRect();
    if (e.pointerType === 'mouse' || down) {
      st.tmx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
      st.tmy = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
      st.lastInput = st.t;
    }
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    const dist = Math.hypot(dx, dy);
    if (!down.moved && dist > 9) {
      down.moved = true; st.dragging = true; st.holding = false; clearTimeout(holdTimer);
      panel.classList.add('grab');
      if (st.mode === 'draw') st.penDown = false;
    }
    if (st.dragging) {
      const ds = dist / st.s;
      st.flip = clamp(ds / 520 * Math.PI, 0, Math.PI * 0.94);
      st.flipV = 0;
    }
  });
  const end = (e) => {
    if (!down || (e && e.pointerId !== down.id)) return;
    clearTimeout(holdTimer);
    const dur = performance.now() - down.t;
    if (st.dragging) {
      st.dragging = false;
      panel.classList.remove('grab');
      if (st.flip > 0.9) { st.flipTarget = Math.PI; st.flipAway = true; st.flipV = 3; st.mode = 'flip'; }
      else { st.flipTarget = 0; st.flipV = -1; }
    } else if (!st.holding && dur < 380) {
      const sp = toScene(down.x, down.y);
      if (onChar(sp)) { st.react = 1; st.happyEnd = st.t + 0.75; }
      else {
        st.look = clamp(Math.atan2(sp[1] - HEAD_P[1], sp[0] - HEAD_P[0] + 400) * 0.35, -0.14, 0.14);
        st.lookT = st.t + 1.1;
      }
    }
    st.holding = false;
    down = null;
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);
  panel.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !down) { st.tmx = 0; st.tmy = 0; } });

  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    st.tilt = true;
    st.tmx = clamp(e.gamma / 22, -1, 1);
    st.tmy = clamp((e.beta - 40) / 22, -1, 1);
  });

  btn.addEventListener('click', () => {
    const on = !st.explodeTarget;
    st.exFrom = st.explode;
    st.explodeTarget = on ? 1 : 0;
    st.exStart = performance.now();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? '다시 모으기' : '부품 보기';
    if (on) { st.dragging = false; st.holding = false; down = null; panel.classList.remove('grab'); }
  });

  requestAnimationFrame(frame);
})();
