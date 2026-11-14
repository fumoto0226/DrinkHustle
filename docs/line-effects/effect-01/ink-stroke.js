// Rules for turning a plain SVG path into a hand-drawn ink contour.
// Expensive geometric analysis (getPointAtLength, curvature, gaussian smooth)
// runs ONCE per distinct path string and is cached. Each bottle calls
// window.inkPaths(outline, seed) at startup; the result is a frozen string.
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const BASE_WIDTH = 2.0;
  const SWELL = 2.1;
  const JITTER_AMP = .4;
  const BIAS_GAIN = 6;
  const BEND_GAIN = 6;
  const BIAS_SWAY_OFFSET = .37;

  const analysisCache = new Map();

  function analyse(d) {
    const cached = analysisCache.get(d);
    if (cached) return cached;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    const length = path.getTotalLength();
    const closed = /z\s*$/i.test(d);
    const step = .5;
    const count = Math.max(16, Math.ceil(length / step));
    const n = count + 1;

    // One getPointAtLength call per sample. Tangents reuse neighbouring samples
    // instead of making extra calls — the arm distance (~2 units) matches the
    // original "probe=2" tangent probe.
    const points = new Array(n);
    for (let j = 0; j < n; j++) {
      const distance = j * length / count;
      points[j] = path.getPointAtLength(closed
        ? (distance % length + length) % length
        : Math.max(0, Math.min(length, distance)));
    }
    // Tangent arm matches the original "probe=2 distance" measurement.
    // Curvature arm is a shorter ±3-sample window (= 1.5 distance), the
    // same as the original hand-coded ±3 — keeps corner peaks compact.
    const tangentArm = Math.max(1, Math.round(2 / step));
    const curvArm = 3;
    const tangent = new Array(n);
    const nx = new Float32Array(n), ny = new Float32Array(n);
    const idxArm = (j, k) => closed ? (j + k + n) % n : Math.max(0, Math.min(n - 1, j + k));
    for (let j = 0; j < n; j++) {
      const a = points[idxArm(j, -tangentArm)], b = points[idxArm(j, tangentArm)];
      const dx = b.x - a.x, dy = b.y - a.y;
      const norm = Math.hypot(dx, dy) || 1;
      tangent[j] = [dx / norm, dy / norm];
      nx[j] = -dy / norm; ny[j] = dx / norm;
    }
    const curvature = new Float32Array(n);
    const turnSign = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      const a = tangent[idxArm(j, -curvArm)], b = tangent[idxArm(j, curvArm)];
      curvature[j] = Math.max(0, 1 - (a[0] * b[0] + a[1] * b[1]));
      turnSign[j] = Math.sign(a[0] * b[1] - a[1] * b[0]);
    }
    // Wide gaussian smoothing so corner ink pools taper outward across the
    // neighbouring straight — matches the original radius=20, sigma=7.
    const radius = 20, sigma = 7;
    const kernel = new Float32Array(radius * 2 + 1);
    let kernelSum = 0;
    for (let k = -radius; k <= radius; k++) {
      kernel[k + radius] = Math.exp(-(k * k) / (2 * sigma * sigma));
      kernelSum += kernel[k + radius];
    }
    const smooth = new Float32Array(n), bias = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      let s = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        const w = kernel[k + radius], idx = idxArm(j, k);
        s += curvature[idx] * w;
        b += turnSign[idx] * curvature[idx] * w;
      }
      smooth[j] = s / kernelSum;
      bias[j] = b / kernelSum;
    }
    const result = {closed, count, length, points, nx, ny, smooth, bias};
    analysisCache.set(d, result);
    return result;
  }

  function inkStroke(d, seed, widthScale = 1) {
    const {closed, count, length, points, nx, ny, smooth, bias} = analyse(d);
    let state = (seed + 1) * 7919 >>> 0;
    const rand = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    // Original jitter density: knots roughly every 22 path units.
    const jitterKnots = Math.max(4, Math.round(length / 22));
    const jitter = new Float32Array(jitterKnots + 1);
    for (let k = 0; k <= jitterKnots; k++) jitter[k] = rand() * rand();
    if (closed) jitter[jitterKnots] = jitter[0];
    const jitterAt = t => {
      const s = t * jitterKnots, k = Math.floor(s), f = s - k;
      const b = f * f * (3 - 2 * f);
      return jitter[k] * (1 - b) + jitter[Math.min(jitterKnots, k + 1)] * b;
    };
    const leftX = new Float32Array(count + 1), leftY = new Float32Array(count + 1);
    const rightX = new Float32Array(count + 1), rightY = new Float32Array(count + 1);
    for (let j = 0; j <= count; j++) {
      const t = j / count, p = points[j];
      const bend = Math.min(1, smooth[j] * BEND_GAIN);
      const noise = jitterAt(t) * JITTER_AMP;
      let symmetric = BASE_WIDTH + noise, swell = bend * SWELL;
      if (!closed) {
        const taper = Math.min(1, .4 + t * 5, .4 + (1 - t) * 5);
        symmetric = (BASE_WIDTH + noise) * taper + BASE_WIDTH * (1 - taper) * .6;
        swell *= taper;
      }
      const sway = jitterAt((t + BIAS_SWAY_OFFSET) % 1) * 2 - .3;
      const side = Math.max(-1, Math.min(1, bias[j] * BIAS_GAIN)) * sway;
      const inner = (symmetric / 2 + swell * (.5 + .35 * side)) * widthScale;
      const outer = (symmetric / 2 + swell * (.5 - .35 * side)) * widthScale;
      leftX[j] = p.x + nx[j] * inner;  leftY[j] = p.y + ny[j] * inner;
      rightX[j] = p.x - nx[j] * outer; rightY[j] = p.y - ny[j] * outer;
    }
    let out = 'M' + leftX[0].toFixed(2) + ' ' + leftY[0].toFixed(2);
    for (let j = 1; j <= count; j++) out += 'L' + leftX[j].toFixed(2) + ' ' + leftY[j].toFixed(2);
    for (let j = count; j >= 0; j--) out += 'L' + rightX[j].toFixed(2) + ' ' + rightY[j].toFixed(2);
    return `<path d="${out}Z" fill="black"/>`;
  }

  window.inkPaths = (outline, seedBase, options = {}) =>
    outline.map((d, j) => inkStroke(d, seedBase * 11 + j * 3, options.widthScale ?? 1)).join('');
})();
