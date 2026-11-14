(() => {
  'use strict';
  const COLORS = ['#E6FF28', '#FC78DD', '#4BEDB2'];
  const NS = 'http://www.w3.org/2000/svg';
  const game = document.querySelector('#game'), row = document.querySelector('#bottles');
  const stream = document.querySelector('#stream path');
  const STYLES = window.BOTTLE_ARTS;
  const STYLE_INDEX = window.BOTTLE_STYLE_INDEX;
  let selected = -1, active = null;
  const queue = [];
  const deck = Array.from({length: 12}, (_, i) => i % 3);
  do {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  } while ([0, 4, 8].some(i => new Set(deck.slice(i, i + 4)).size === 1));
  const water = [[], [], deck.slice(0, 4), deck.slice(4, 8), deck.slice(8, 12)];

  // Logical portions have equal upright HEIGHT, including in tapered/flask
  // shapes. Each portion's actual area can differ; preserve that area on tilt.
  function clipBelow(poly, line) {
    const result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ain = a.y >= line, bin = b.y >= line;
      if (ain) result.push(a);
      if (ain !== bin) {
        const t = (line - a.y) / (b.y - a.y);
        result.push({x: a.x + (b.x - a.x) * t, y: line});
      }
    }
    return result;
  }
  function polyArea(poly) {
    let value = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      value += a.x * b.y - b.x * a.y;
    }
    return Math.abs(value) / 2;
  }
  function buildGeom(style) {
    const geomPath = document.createElementNS(NS, 'path');
    geomPath.setAttribute('d', style.mask);
    const length = geomPath.getTotalLength();
    const steps = Math.ceil(length / .7);
    const polygon = Array.from({length: steps}, (_, j) => {
      const p = geomPath.getPointAtLength(j * length / steps);
      return {x: p.x - style.centerX, y: p.y - style.pivotY};
    });
    const interior = clipBelow(polygon, 0);
    const layerHeight = (style.bottom - style.top) / 4;
    function uprightLevel(units) {
      return style.bottom - Math.max(0, Math.min(4, units)) * layerHeight;
    }
    function areaForUnits(units) {
      if (units <= 0) return 0;
      return polyArea(clipBelow(interior, uprightLevel(units) - style.pivotY));
    }
    function rotated(angle) {
      const r = angle * Math.PI / 180, sin = Math.sin(r), cos = Math.cos(r);
      return interior.map(p => ({x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos}));
    }
    function waterline(poly, volume) {
      let low = Math.min(...poly.map(p => p.y)), high = Math.max(...poly.map(p => p.y));
      for (let k = 0; k < 20; k++) {
        const mid = (low + high) / 2;
        if (polyArea(clipBelow(poly, mid)) > volume) low = mid; else high = mid;
      }
      return (low + high) / 2 + style.pivotY;
    }
    function pourAngle(volume, direction, depth = 0) {
      let low = 0, high = 179.5;
      const targetArea = areaForUnits(volume);
      const lipX = direction < 0 ? style.lipLeftX : style.lipRightX;
      for (let k = 0; k < 19; k++) {
        const mid = (low + high) / 2;
        const lipY = (lipX - style.centerX) * Math.sin(direction * mid * Math.PI / 180);
        const retained = polyArea(clipBelow(rotated(direction * mid), lipY - depth));
        if (retained > targetArea) low = mid; else high = mid;
      }
      return direction * (low + high) / 2;
    }
    function level(units, angle = 0, poly = rotated(angle)) {
      return Math.abs(angle) < .00001 ? uprightLevel(units) : waterline(poly, areaForUnits(units));
    }
    return {polygon, interior, layerHeight, areaForUnits, level, rotated, waterline, pourAngle};
  }
  const GEOMS = STYLES.map(buildGeom);

  // Pull the actual y range of a bottle's ink CONTOUR (not the path midline).
  // The contour is already baked by inkPaths — its vertices sit on the visible
  // outer edge, including swell at corners. Parsing numbers out of the d
  // attribute lets us measure where the bottle really ends on screen.
  function contourExtents(inkHtml) {
    let minY = Infinity, maxY = -Infinity;
    const dAttrs = [...inkHtml.matchAll(/d="([^"]+)"/g)];
    for (const match of dAttrs) {
      const nums = match[1].match(/-?\d+(?:\.\d+)?/g) || [];
      for (let k = 1; k < nums.length; k += 2) {
        const y = parseFloat(nums[k]);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return {top: minY, bottom: maxY};
  }

  // Normalise every bottle so its OUTLINE sits on one shared baseline — all
  // bottles look like they're resting on the same table. Reference = style 0,
  // measured from its ink contour (not the hand-estimated outlineTop/Bottom).
  const REF_STYLE = STYLES[0];
  const REF_VB = REF_STYLE.viewBox.split(/\s+/).map(Number);
  const REF_VBW = REF_VB[2];
  // Measure style 0 at its own seed (0) so REF uses its real contour geometry.
  const REF_INK_HTML = window.inkPaths(REF_STYLE.outline, 0);
  const REF_EXTENTS = contourExtents(REF_INK_HTML);
  const REF_BOTTOM_PER_CELLW = REF_EXTENTS.bottom / REF_VBW;
  const REF_WATER_HEIGHT = REF_STYLE.bottom - REF_STYLE.top;
  function alignmentFor(style, extents) {
    const vb = style.viewBox.split(/\s+/).map(Number);
    const vbW = vb[2], vbH = vb[3];
    // Match visible water height to the original bottle, rather than scaling
    // each silhouette to equal outer height. All four layers then share one
    // screen-space height and stay below each shape's designed full line.
    const bw = REF_WATER_HEIGHT * vbW / ((style.bottom - style.top) * REF_VBW);
    const curBottomPerCellW = extents.bottom * bw / vbW;
    // shiftCellW is in units of cell width — translates directly to padding-top
    // percent on a child whose containing block is the button cell.
    const shiftCellW = REF_BOTTOM_PER_CELLW - curBottomPerCellW;
    return {bw, shiftCellW, vbW, vbH};
  }

  // Ink line rules live in ink-stroke.js (window.inkPaths). Analysis of each
  // outline string is cached; each bottle's HTML is built once here at startup
  // and never regenerated.
  const inkPaths = window.inkPaths;
  const nodes = water.map((_, i) => {
    const styleIdx = STYLE_INDEX[i] ?? 0;
    const style = STYLES[styleIdx];
    // Build this bottle's ink HTML up front, measure its actual contour y
    // range (per-seed, so bottle-to-bottle jitter is accounted for), and use
    // that to compute the width/offset that puts its bottom on the baseline.
    const inkHtml = inkPaths(style.outline, i);
    const extents = i === 0 ? REF_EXTENTS : contourExtents(inkHtml);
    const align = alignmentFor(style, extents);
    const vbW = align.vbW, vbH = align.vbH;
    const button = document.createElement('button');
    button.className = 'bottle';
    // --bw: svg width as % of the grid cell. --by: padding-top of the wrapper
    // div, which also uses % of the grid cell (containing block = button).
    button.style.setProperty('--bw', `${(align.bw * 100).toFixed(3)}%`);
    button.style.setProperty('--by', `${(align.shiftCellW * 100).toFixed(3)}%`);
    // Rotation pivot = this style's lip, mapped onto the padded+scaled svg.
    const buttonHeightInCellW = align.shiftCellW + align.bw * vbH / vbW;
    const pivotXPct = ((1 - align.bw) / 2 + style.centerX * align.bw / vbW) * 100;
    const pivotYPct = ((align.shiftCellW + style.pivotY * align.bw / vbW) / buttonHeightInCellW) * 100;
    button.style.transformOrigin = `${pivotXPct.toFixed(3)}% ${pivotYPct.toFixed(3)}%`;
    button.innerHTML = `<div class="bottle-align"><svg viewBox="${style.viewBox}" aria-hidden="true"><defs><filter id="ink-${i}" filterUnits="userSpaceOnUse" x="-6" y="-6" width="${vbW + 12}" height="${vbH + 12}" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="${17+i*7}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G"/></filter><clipPath id="inside-${i}"><path d="${style.mask}"/></clipPath></defs><clipPath id="lip-${i}"><rect x="0" y="${style.pivotY}" width="${vbW}" height="${vbH - style.pivotY}"/></clipPath><g clip-path="url(#lip-${i})"><g clip-path="url(#inside-${i})"><g class="liquid"></g></g></g><g filter="url(#ink-${i})">${inkHtml}</g></svg></div>`;
    button.addEventListener('click', () => choose(i));
    row.append(button);
    return {button, svg: button.querySelector('svg'), liquid: button.querySelector('.liquid'), style, styleIdx, geom: GEOMS[styleIdx], vbW, vbH, bw: align.bw, shiftCellW: align.shiftCellW};
  });
  function draw(i, layers = water[i].map(color => ({color, amount: 1})), angle = 0, motion = {}) {
    const node = nodes[i], liquid = node.liquid, style = node.style, geom = node.geom;
    liquid.replaceChildren();
    const poly = geom.rotated(angle);
    const boundary = n => geom.level(n, angle, poly);
    // Adjacent portions of the same colour form one uninterrupted water band.
    const bands = [];
    for (const layer of layers) {
      if (layer.amount <= 0) continue;
      if (bands.at(-1)?.color === layer.color) bands.at(-1).amount += layer.amount;
      else bands.push({...layer});
    }
    let sum = 0;
    for (const layer of bands) {
      if (layer.amount <= 0) continue;
      const bottom = sum === 0 ? 300 : boundary(sum);
      sum += layer.amount;
      const top = boundary(sum);
      const isSurface = layer === bands.at(-1);
      if (!isSurface) {
        const rect = document.createElementNS(NS, 'rect');
        Object.entries({x: -250, y: top, width: 600, height: Math.max(0, bottom - top + .06), fill: COLORS[layer.color]}).forEach(([k, v]) => rect.setAttribute(k, v));
        liquid.append(rect);
        continue;
      }
      // Only the free surface moves. The colour boundaries remain quiet.
      const amplitude = Math.min(1, Math.max(0, (bottom - top) / 4));
      const phase = motion.phase || 0, impact = motion.impact || 0;
      const samples = [];
      for (let x = -250; x <= 350; x += 3) {
        const distance = x - (style.lipLeftX + style.lipRightX) / 2;
        const depression = 1.6 * Math.exp(-distance * distance / 20);
        const ripple = .75 * Math.sin(Math.abs(distance) * .38 - phase) * Math.exp(-Math.abs(distance) / 26);
        const sway = (motion.sway || 0) * Math.sin(distance * .055 + phase);
        samples.push([x, top + amplitude * (impact * (depression + ripple) + sway)]);
      }
      const edge = samples.map(([x, y], j) => `${j ? 'L' : 'M'} ${x} ${y}`).join(' ');
      const fill = document.createElementNS(NS, 'path');
      fill.setAttribute('d', `${edge} L 350 ${bottom} L -250 ${bottom} Z`);
      fill.setAttribute('fill', COLORS[layer.color]);
      liquid.append(fill);
      const sheen = document.createElementNS(NS, 'path');
      sheen.setAttribute('d', edge);
      sheen.setAttribute('fill', 'none');
      sheen.setAttribute('stroke', 'white');
      sheen.setAttribute('stroke-opacity', '.22');
      sheen.setAttribute('stroke-width', '.7');
      liquid.append(sheen);
    }
    liquid.setAttribute('transform', `rotate(${-angle} ${style.centerX} ${style.pivotY})`);
    nodes[i].button.setAttribute('aria-label', `瓶子 ${i+1}，${water[i].length} 层水`);
    nodes[i].button.setAttribute('aria-pressed', String(selected === i || queue.some(move => move.from === i)));
  }
  function pose(i, x=0, y=0, angle=0) {
    nodes[i].button.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
  }
  const ease = t => t*t*(3-2*t);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animationTimeScale = .62; // All phases run together, ~22% shorter than the previous version.
  function animate(ms, update) {
    return new Promise(resolve => {
      const start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now-start)/(ms * animationTimeScale * (reduced ? .2 : 1)));
        update(t);
        if (t < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }
  function amount(a,b) {
    if (!a.length || b.length >= 4) return 0;
    let n=1;
    while (n<a.length && a[a.length-1-n] === a.at(-1)) n++;
    return Math.min(n,4-b.length);
  }
  // Predict the state after accepted moves, reserving destination capacity.
  // Rendered water is committed only when its own animation reaches the bottle.
  function plannedWater() {
    const result = water.map(layers => [...layers]);
    const moves = [...(active && !active.committed ? [active] : []), ...queue];
    for (const move of moves) {
      const n = amount(result[move.from], result[move.to]);
      if (n) result[move.to].push(...result[move.from].splice(-n));
    }
    return result;
  }
  function syncWaiting() {
    game.dataset.queueLength = queue.length;
    game.dataset.active = active ? `${active.from},${active.to}` : '';
    nodes.forEach((node,i) => {
      if (active && (active.from === i || active.to === i)) return;
      const lifted = selected === i || queue.some(move => move.from === i);
      pose(i,0,lifted ? -18 : 0);
      draw(i);
    });
  }
  function choose(i) {
    if (queue.some(move => move.from === i)) return;
    if (selected === i) {selected=-1;syncWaiting();return;}
    const planned=plannedWater();
    if (selected<0) {
      if (planned[i].length) selected=i;
      syncWaiting();return;
    }
    const from=selected;
    if (!amount(planned[from],planned[i])) {
      selected=planned[i].length ? i : -1;
      syncWaiting();return;
    }
    queue.push({from,to:i});
    selected=-1;
    syncWaiting();
    void drainQueue();
  }
  async function drainQueue() {
    if (active) return;
    while (queue.length) {
      const move=queue.shift();
      const count=amount(water[move.from],water[move.to]);
      if (!count) {syncWaiting();continue;}
      active={...move,committed:false};
      syncWaiting();
      await playPour(move.from,move.to,count);
      active=null;
      syncWaiting();
    }
  }
  async function playPour(from,i,count) {
    const source=nodes[from].button, dest=nodes[i].button;
    const srcStyle=nodes[from].style, dstStyle=nodes[i].style;
    const srcGeom=nodes[from].geom, dstGeom=nodes[i].geom;
    pose(from);
    pose(i);
    const s=source.getBoundingClientRect(), g=game.getBoundingClientRect();
    // Read the SVG's real transform after layout. Grid stretching, alignment
    // padding, per-style scaling and viewBox offsets are all included here.
    const srcMatrix=nodes[from].svg.getScreenCTM();
    const dstMatrix=nodes[i].svg.getScreenCTM();
    const srcPivot=new DOMPoint(srcStyle.centerX,srcStyle.pivotY).matrixTransform(srcMatrix);
    const inletX=(dstStyle.lipLeftX+dstStyle.lipRightX)/2;
    const dstMouth=new DOMPoint(inletX,dstStyle.pivotY).matrixTransform(dstMatrix);
    source.style.transformOrigin=`${srcPivot.x-s.left}px ${srcPivot.y-s.top}px`;
    pose(from,0,-18);
    const scale=Math.hypot(srcMatrix.a,srcMatrix.b);
    const dy=-Math.min(36, g.height*.075);
    const dx=dstMouth.x-srcPivot.x, targetY=dstMouth.y+dy-srcPivot.y;
    // Point the bottle body toward the roomier side of the screen.
    const direction = i < 2 ? -1 : i > 2 ? 1 : from > i ? -1 : 1;
    const lipX = direction < 0 ? srcStyle.lipLeftX : srcStyle.lipRightX;
    const offset = angle => {
      const r = angle*Math.PI/180;
      return {x:(lipX-srcStyle.centerX)*Math.cos(r)*scale, y:(lipX-srcStyle.centerX)*Math.sin(r)*scale};
    };
    let angle=srcGeom.pourAngle(water[from].length,direction);
    let lip=offset(angle);
    const position = a => {
      const o=offset(a);
      pose(from,dx-o.x,targetY-o.y,a);
    };
    source.style.zIndex=10;
    const original=water[from].map(color=>({color,amount:1}));
    const target=water[i].map(color=>({color,amount:1}));
    const color=water[from].at(-1);
    await animate(420,t=>{const p=ease(t);pose(from,(dx-lip.x)*p,-18+(targetY-lip.y+18)*p,angle*p);draw(from,original,angle*p,{sway:Math.sin(Math.PI*p)*1.2,phase:t*5});});
    stream.setAttribute('stroke','none');
    stream.setAttribute('fill',COLORS[color]);
    const fullWidth = Math.max(2.2,3.5*scale) / scale;
    const duration = 540+count*170, flight = 125;
    const emittedAt = ms => count*ease(Math.max(0,Math.min(1,ms/duration)));
    const x=dstMouth.x-g.left, mouthY=dstMouth.y-g.top+dy;
    await animate(duration+flight,t=>{
      const elapsed=t*(duration+flight);
      const emitted=emittedAt(elapsed), received=emittedAt(elapsed-flight);
      const layers=original.map((l,j)=>({...l,amount:Math.max(0,Math.min(1,original.length-j-emitted))}));
      const flow=Math.min(1,elapsed/85,(count-emitted)/.18);
      const depth=fullWidth*ease(Math.max(0,flow));
      angle=srcGeom.pourAngle(Math.max(.0001,original.length-emitted),direction,depth);
      position(angle);
      draw(from,layers,angle);
      const arriving=Math.min(1,Math.max(0,(elapsed-flight)/65),Math.max(0,(duration+flight-elapsed)/110));
      draw(i,[...target,{color,amount:received}],0,{impact:arriving,phase:elapsed*.022});
      const waterY=dstGeom.level(water[i].length+received)+2.4*arriving;
      const end=new DOMPoint(inletX,waterY).matrixTransform(dstMatrix).y-g.top;
      // A real travel delay: the head reaches the surface before it starts rising.
      const head=Math.min(1,Math.max(0,elapsed/flight));
      const tail=Math.min(1,Math.max(0,(elapsed-duration)/flight));
      const widthAt = ms => {
        if (ms <= 0 || ms >= duration) return 0;
        const strength=Math.min(1,ms/85,(count-emittedAt(ms))/.18);
        return fullWidth*ease(Math.max(0,strength))*scale;
      };
      // Each section remembers the flow when it left the mouth. As emission
      // stops, the thin tail travels downward instead of erasing the whole jet.
      const left=[], right=[];
      for (let k=0;k<=24;k++) {
        const f=tail+(head-tail)*k/24;
        const y=mouthY+(end-mouthY)*f*f;
        const half=widthAt(elapsed-flight*f)*(1-.28*f)/2;
        left.push([x-half,y]); right.push([x+half,y]);
      }
      const width=depth*scale;
      const first=direction>0 ? right : left, second=direction>0 ? left : right;
      const startX=x-direction*width*1.5;
      let ribbon=elapsed<duration
        ? `M ${startX} ${mouthY-width} Q ${x+direction*width/2} ${mouthY-width} ${first[0][0]} ${mouthY}`
        : `M ${first[0][0]} ${first[0][1]}`;
      ribbon+=first.slice(1).map(([px,py])=>` L ${px} ${py}`).join('');
      ribbon+=second.slice().reverse().map(([px,py])=>` L ${px} ${py}`).join('');
      if(elapsed<duration) ribbon+=` Q ${x-direction*width/2} ${mouthY} ${startX} ${mouthY}`;
      stream.setAttribute('d',ribbon+' Z');
      stream.style.opacity='1';
    });
    stream.setAttribute('d','');
    water[i].push(...water[from].splice(-count));
    active.committed=true;
    lip=offset(angle);
    await animate(460,t=>{
      const p=1-ease(t), decay=Math.exp(-5*t);
      pose(from,(dx-lip.x)*p,(targetY-lip.y)*p,angle*p);
      draw(from,undefined,angle*p,{sway:Math.sin(Math.PI*t)*1.4,phase:t*9});
      draw(i,undefined,0,{sway:1.1*decay,phase:t*12});
    });
    draw(i);
    pose(from);source.style.zIndex='';draw(from);
  }
  water.forEach((_,i)=>draw(i));
  window.render_game_to_text = () => JSON.stringify({
    coordinates: 'SVG coordinates; x right, y down; mouth endpoints are inside the rim',
    water, selected, active, queue,
    bottles: nodes.map(({style,styleIdx,geom,svg}) => ({style: styleIdx,
      layerHeightPx: geom.layerHeight * Math.hypot(svg.getScreenCTM().a,svg.getScreenCTM().b),
      levels: Array.from({length:5},(_,n) => geom.level(n)),
      mouth: {left: style.lipLeftX, right: style.lipRightX, y: style.pivotY}})),
  });
  document.addEventListener('keydown', e=>{if(e.key==='Escape'&&selected>=0){selected=-1;syncWaiting();}});
})();
