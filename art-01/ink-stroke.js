// 效果二：依据 Billybutton.brush 参数模拟的密集叠印矢量笔刷。
// Alpine_Shape.png is bundled inside Procreate, not in the exported brush.
// This local polygon nib approximates it; it is not the original brush engine.
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const geometryCache = new Map();
  const strokeCache = new Map();
  const SETTINGS = Object.freeze({
    baseWidth: 3.55,
    detailScale: 2.4,
    cornerBreakProbability: .22,
    spacing: .0715088695,
    spacingJitter: .4776262045,
    lateralJitter: .0727313533,
    linearJitter: .1099295318,
    sizeJitter: .2112026513,
    roundnessJitter: .1350364685,
    roundnessXJitter: .0842589661,
  });
  // Rounded, slightly irregular solid nib; no transparent grain (grainDepth=0).
  const NIB = [
    [1,0],[.87,.38],[.61,.76],[.19,.94],[-.22,.91],[-.62,.71],
    [-.91,.34],[-.96,-.09],[-.79,-.51],[-.43,-.84],
    [.02,-.97],[.43,-.85],[.77,-.53],[.94,-.23],
  ];
  function geometry(d) {
    if (geometryCache.has(d)) return geometryCache.get(d);
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    const length = path.getTotalLength(), closed = /z\s*$/i.test(d);
    // Native SVG length queries are expensive. Sample each distinct source once,
    // then interpolate for all bottle seeds, corners and nib placements.
    const count = Math.max(1, Math.ceil(length / .12));
    const xs = new Float64Array(count + 1), ys = new Float64Array(count + 1);
    for (let j = 0; j <= count; j++) {
      const p = path.getPointAtLength(j * length / count);
      xs[j] = p.x; ys[j] = p.y;
    }
    const at = distance => {
      const normalized = closed ? (distance % length + length) % length : Math.max(0, Math.min(length, distance));
      const t = length ? normalized * count / length : 0;
      const j = Math.min(count - 1, Math.floor(t)), f = t - j;
      return {x: xs[j] + (xs[j + 1] - xs[j]) * f, y: ys[j] + (ys[j + 1] - ys[j]) * f};
    };
    const candidates = [];
    for (let s = 0; s < length; s += .4) {
      if (!closed && (s < 2 || s > length - 2)) continue;
      const a = at(s - 1.6), b = at(s), c = at(s + 1.6);
      const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
      const turn = 1 - (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
      if (turn > .32) candidates.push({s, turn});
    }
    const corners = [];
    for (const candidate of candidates.sort((a, b) => b.turn - a.turn)) {
      if (corners.every(c => {
        const d = Math.abs(c - candidate.s);
        return (closed ? Math.min(d, length - d) : d) > 5;
      })) corners.push(candidate.s);
    }
    const result = {at, length, closed, corners};
    geometryCache.set(d, result);
    return result;
  }
  function inkStroke(d, seed, scale, cornerBreaks) {
    if (!(scale > 0) || !Number.isFinite(scale)) return '';
    const key = JSON.stringify([d, seed, scale, cornerBreaks]);
    if (strokeCache.has(key)) return strokeCache.get(key);
    const {at, length, closed, corners} = geometry(d);
    if (!(length > 0)) return '';
    let state = ((seed + 1) * 7919) >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const signed = () => random() * 2 - 1;
    const width = SETTINGS.baseWidth * scale;
    const gaps = cornerBreaks ? corners.filter(() => random() < SETTINGS.cornerBreakProbability)
      .map(center => ({center: center + signed() * .3, half: width * (.07 + random() * .05)})) : [];
    const gapDistance = s => gaps.reduce((nearest, gap) => {
      let delta = Math.abs(s - gap.center) % length;
      if (closed) delta = Math.min(delta, length - delta);
      return Math.min(nearest, delta - gap.half);
    }, Infinity);
    // Correlate nib size over a visible distance so dense overlap doesn't erase it.
    const phase = random() * Math.PI * 2;
    const sizeAt = s => 1 + .07 * Math.sin(s / (width * 1.3) + phase)
      + .035 * Math.sin(s / (width * .53) + phase * 2);
    const stamps = [];
    let minY = Infinity, maxY = -Infinity;
    let distance = 0;
    function stamp(s) {
      const position = s + signed() * width * SETTINGS.linearJitter * SETTINGS.detailScale;
      const clearance = gapDistance(position);
      if (clearance <= 0) return;
      const p = at(position);
      const a = at(s - .35), b = at(s + .35);
      const norm = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / norm, ny = (b.x - a.x) / norm;
      const lateral = signed() * width * SETTINGS.lateralJitter * 1.65;
      const cx = p.x + nx * lateral, cy = p.y + ny * lateral;
      const taper = Math.min(1, clearance / (width * .35));
      const radius = Math.min(width * .5 * sizeAt(s) * (1 + signed() * SETTINGS.sizeJitter) * taper, clearance * .9);
      const rx = radius * (1 - random() * SETTINGS.roundnessXJitter);
      const ry = radius * (1 - random() * SETTINGS.roundnessJitter);
      const angle = random() * Math.PI * 2;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const flipX = random() < .5 ? -1 : 1, flipY = random() < .5 ? -1 : 1;
      // Keep all subpaths wound alike: nonzero fill merges overlapping stamps.
      const nib = flipX * flipY < 0 ? [...NIB].reverse() : NIB;
      const points = nib.map(([x, y]) => {
        const px = x * rx * flipX, py = y * ry * flipY;
        const outX = (cx + px * cos - py * sin).toFixed(3);
        const outY = (cy + px * sin + py * cos).toFixed(3);
        minY = Math.min(minY, +outY); maxY = Math.max(maxY, +outY);
        return `${outX} ${outY}`;
      });
      stamps.push(`M${points.join('L')}Z`);
    }
    while (distance < length) {
      stamp(distance);
      distance += width * SETTINGS.spacing * SETTINGS.detailScale * (1 + signed() * SETTINGS.spacingJitter);
    }
    if (!closed) stamp(length);
    const result = `<path d="${stamps.join('')}" fill="black" fill-rule="nonzero" data-ink-top="${minY}" data-ink-bottom="${maxY}" data-ink-effect="2-billybutton" data-ink-breaks="${gaps.length}"/>`;
    strokeCache.set(key, result);
    return result;
  }
  // Lightweight solid water edges: fixed geometry noise, no nib stamping per frame.
  window.inkWaterRoughness = (distance, seed) =>
    .18 * Math.sin(distance * 2.7 + seed * 1.37) +
    .11 * Math.sin(distance * 5.3 + seed * 2.13) +
    .07 * Math.sin(distance * 9.1 + seed * .73);
  window.inkWaterPath = (d, seed) => {
    const {at, length} = geometry(d), points = [];
    const count = Math.max(16, Math.ceil(length / .3));
    for (let j = 0; j < count; j++) {
      const s = j * length / count, p = at(s), a = at(s - .3), b = at(s + .3);
      const norm = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      // Integer harmonics make the closed seam periodic.
      const t = j / count * Math.PI * 2;
      const offset = .22 * Math.sin(t * Math.round(length / 2.3) + seed)
        + .12 * Math.sin(t * Math.round(length / .9) + seed * 1.7);
      points.push(`${(p.x - (b.y - a.y) / norm * offset).toFixed(3)} ${(p.y + (b.x - a.x) / norm * offset).toFixed(3)}`);
    }
    return `M${points.join('L')}Z`;
  };
  window.inkPaths = (paths, seed, options = {}) => paths.map((d, j) =>
    inkStroke(d, seed * 11 + j * 3, options.widthScale ?? 1, options.cornerBreaks ?? true)).join('');
})();
