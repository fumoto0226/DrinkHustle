(() => {
  'use strict';
  const COLORS = ['#E6FF28', '#FC78DD', '#4BEDB2', '#748EFF', '#FFB56B'];
  const NS = 'http://www.w3.org/2000/svg';
  const game = document.querySelector('#game'), row = document.querySelector('#bottles');
  const stream = document.querySelector('#stream path');
  const STYLES = window.BOTTLE_ARTS;
  const Rules = window.HeapRules;
  const levelNumber = Number(sessionStorage.getItem('bottle-level') || 1);
  const level = Rules.level(levelNumber);
  const initial = Rules.initial(level);
  const water = initial.water, slots = initial.slots, pile = new Set(initial.pile);
  const picking = new Set(), clearing = new Set(), clearedColors = [];
  const location = water.map((_,id)=>id<2?'hand':'pile');
  const STYLE_INDEX = level.bottles.map(b=>b.style);
  let selected = -1, active = null, settledMoves = 0;
  let autoOn=false,autoBusy=false,draining=false;
  const queue = [];
  const feedbackAnimations=new Map();
  let blockedFeedback=null;
  const status = document.querySelector('#status');
  document.querySelector('#level-number').textContent = String(levelNumber).padStart(2,'0');
  let noticeTimer;
  function message(text) {
    clearTimeout(noticeTimer);
    status.textContent=text;
    noticeTimer=setTimeout(updateStatus,1800);
  }
  function updateStatus() {
    const state={water,slots,pile:[...pile]};
    const idle=!picking.size&&!active&&!queue.length&&!autoBusy&&!draining;
    const win=idle&&Rules.won(state),lost=idle&&Rules.lost(state);
    document.querySelector('#result').hidden=!win&&!lost;
    game.dataset.mode=win?'won':lost?'lost':'playing';
    document.querySelector('#result h1').textContent=lost?'再试一次':'归色完成';
    document.querySelector('#next').firstChild.textContent=lost?'重新开始 ':'再玩一关 ';
    status.textContent=win?'归色完成':lost?'位置已满，手中的颜色不足以凑齐一瓶':pile.size?'点取未被遮挡的瓶子':'点选瓶子，再点另一瓶倒水';
  }
  let pileBoard;
  function boardMetrics() {
    const width=game.clientWidth,h=game.clientHeight,w=width*.126;
    const handTop=h*.86-REF_BOTTOM_PER_CELLW*w;
    const zoom=Math.min(width,Math.max(180,(handTop-108)/.87));
    return {zoom,centerX:width/2,centerY:(76+handTop-34)/2};
  }
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
    button.dataset.id=i;
    // --bw: svg width as % of the grid cell. --by: padding-top of the wrapper
    // div, which also uses % of the grid cell (containing block = button).
    button.style.setProperty('--bw', `${(align.bw * 100).toFixed(3)}%`);
    button.style.setProperty('--by', `${(align.shiftCellW * 100).toFixed(3)}%`);
    // Rotation pivot = this style's lip, mapped onto the padded+scaled svg.
    const buttonHeightInCellW = align.shiftCellW + align.bw * vbH / vbW;
    const pivotXPct = ((1 - align.bw) / 2 + style.centerX * align.bw / vbW) * 100;
    const pivotYPct = ((align.shiftCellW + style.pivotY * align.bw / vbW) / buttonHeightInCellW) * 100;
    button.style.transformOrigin = `${pivotXPct.toFixed(3)}% ${pivotYPct.toFixed(3)}%`;
    button.innerHTML = `<div class="bottle-align"><svg viewBox="${style.viewBox}" aria-hidden="true"><defs><filter id="ink-${i}" filterUnits="userSpaceOnUse" x="-6" y="-6" width="${vbW + 12}" height="${vbH + 12}" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="${17+i*7}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G"/></filter><clipPath id="inside-${i}"><path d="${style.mask}"/></clipPath></defs><clipPath id="lip-${i}"><rect x="0" y="${style.pivotY}" width="${vbW}" height="${vbH - style.pivotY}"/></clipPath>${style.outline.map(d=>`<path d="${d}" fill="white"/>`).join('')}<g clip-path="url(#lip-${i})"><g clip-path="url(#inside-${i})"><g class="liquid"></g></g></g><g class="ink-outline" filter="url(#ink-${i})">${inkHtml}</g>${style.outline.map(d=>`<path class="bottle-hit" d="${d}" fill="transparent"/>`).join('')}</svg></div>`;
    button.addEventListener('click', () => choose(i));
    row.append(button);
    return {button, svg: button.querySelector('svg'), liquid: button.querySelector('.liquid'), style, styleIdx, geom: GEOMS[styleIdx], vbW, vbH, bw: align.bw, shiftCellW: align.shiftCellW};
  });
  function draw(i, layers = water[i].map(color => ({color, amount: 1})), angle = 0, motion = {}) {
    const node = nodes[i], liquid = node.liquid, style = node.style, geom = node.geom;
    node.button.dataset.location=location[i];
    liquid.replaceChildren();
    const waterAngle=motion.waterAngle ?? (location[i]==='pile'?0:angle);
    const poly = geom.rotated(waterAngle);
    const boundary = n => geom.level(n, waterAngle, poly);
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
    liquid.setAttribute('transform', `rotate(${-waterAngle} ${style.centerX} ${style.pivotY})`);
    const available=location[i]!=='pile'||Rules.available([...pile],level.bottles,i);
    nodes[i].button.setAttribute('aria-label', `瓶子 ${i+1}，${water[i].length} 层水${location[i]==='pile'?(available?'，可以拿取':'，被压住'):''}`);
    // Covered bottles remain interactive so their exposed parts can explain
    // the obstruction through motion, without allowing an actual pickup.
    nodes[i].button.setAttribute('aria-disabled',String(clearing.has(i)));
    nodes[i].button.classList.toggle('covered',!available);
    nodes[i].button.setAttribute('aria-pressed', String(selected === i || queue.some(move => move.from === i)));
  }
  function pose(i, x=0, y=0, angle=0, scale=1) {
    nodes[i].button.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${scale})`;
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
  const amount=Rules.amount;
  function stopFeedback(id) {
    const animation=feedbackAnimations.get(id);
    if(animation) {
      feedbackAnimations.delete(id);
      animation.cancel();
      delete nodes[id].button.dataset.feedback;
    }
    if(!feedbackAnimations.size)blockedFeedback=null;
  }
  function shakeBlocked(id) {
    const above=Rules.blockers([...pile],level.bottles,id);
    // Every bottle follows the same screen-space tug, at diminishing strength.
    const angle=nodes[id].restAngle*Math.PI/180;
    const distance=reduced?1.4:4.8;
    const vx=Math.sin(angle)*distance,vy=-Math.cos(angle)*distance-1;
    const participants=[{id,strength:1},...above.map(b=>({id:b.id,strength:.26+.18*Math.sqrt(b.fraction)}))];
    participants.forEach(p=>stopFeedback(p.id));
    blockedFeedback={source:id,blockers:above.map(b=>b.id)};
    participants.forEach(({id:other,strength},index)=>{
      if(location[other]!=='pile')return;
      const node=nodes[other],a=node.restAngle*Math.PI/180;
      const dx=(vx*Math.cos(a)+vy*Math.sin(a))*strength;
      const dy=(-vx*Math.sin(a)+vy*Math.cos(a))*strength;
      const twist=(index?-.65:1.05)*(reduced?.3:1);
      const frames=[[0,0,0],[.18,1,-1],[.34,.40,.7],[.53,.72,-.45],[.73,.13,.2],[1,0,0]]
        .map(([offset,p,r])=>({offset,transform:`translate(${dx*p}px,${dy*p}px) rotate(${twist*r}deg)`}));
      node.button.dataset.feedback=index?'blocker':'source';
      const animation=node.button.querySelector('.bottle-align').animate(frames,{
        duration:reduced?220:index?390:450,delay:index?24:0,easing:'ease-in-out',fill:'none',
      });
      feedbackAnimations.set(other,animation);
      animation.onfinish=()=>{
        if(feedbackAnimations.get(other)!==animation)return;
        feedbackAnimations.delete(other);delete node.button.dataset.feedback;
        if(!feedbackAnimations.size)blockedFeedback=null;
      };
    });
  }
  const ghosts=Array.from({length:5},(_,slot)=>{
    const ghost=document.createElement('div');
    ghost.className='slot-ghost';ghost.setAttribute('aria-hidden','true');
    ghost.innerHTML=`<svg viewBox="${REF_STYLE.viewBox}">${REF_STYLE.outline.map(d=>`<path d="${d}"/>`).join('')}</svg>`;
    document.querySelector('#slots').append(ghost);return ghost;
  });
  function placeNode(i) {
    const width=game.clientWidth,h=game.clientHeight,node=nodes[i],slot=slots.indexOf(i);
    const inPile=location[i]==='pile',place=level.bottles[i].pose;
    const w=inPile?place.size*pileBoard.zoom:width*.126;
    node.button.style.width=`${w}px`;
    if(inPile) {
      const svgHeight=w*node.bw*node.vbH/node.vbW;
      node.button.style.left=`${pileBoard.centerX+(place.x-.5)*pileBoard.zoom-w/2}px`;
      node.button.style.top=`${pileBoard.centerY+place.y*pileBoard.zoom-svgHeight/2-node.shiftCellW*w}px`;
      node.button.style.transformOrigin=`50% ${node.shiftCellW*w+svgHeight/2}px`;
    } else {
      node.button.style.left=`${(.1+.2*Math.max(0,slot))*width-w/2}px`;
      node.button.style.top=`${h*.86-REF_BOTTOM_PER_CELLW*w}px`;
      node.button.style.transformOrigin=node.handOrigin;
    }
    node.button.style.zIndex=inPile?place.z:60;
    node.button.style.visibility=location[i]==='cleared'?'hidden':'visible';
    node.button.inert=location[i]==='cleared';
    node.restAngle=inPile?place.angle:0;
  }
  function layout() {
    [...feedbackAnimations.keys()].forEach(stopFeedback);
    pileBoard=boardMetrics();
    nodes.forEach((node,i)=>{if(!active&&!picking.has(i)){placeNode(i);pose(i,0,0,node.restAngle);draw(i,undefined,node.restAngle);}});
    const width=game.clientWidth,h=game.clientHeight,w=width*.126;
    ghosts.forEach((ghost,slot)=>{
      ghost.style.width=`${w}px`;
      ghost.style.left=`${(.1+.2*slot)*width-w/2}px`;
      ghost.style.top=`${h*.86-REF_BOTTOM_PER_CELLW*w}px`;
      ghost.hidden=slots[slot]!==null;
    });
  }
  nodes.forEach(node=>{node.handOrigin=node.button.style.transformOrigin;});
  function plannedState() {
    const result=water.map(a=>[...a]), removed=new Set(clearing);
    const moves=[...(active&&!active.committed?[active]:[]),...queue];
    for(const move of moves) {
      if(removed.has(move.from)||removed.has(move.to))continue;
      const count=amount(result[move.from],result[move.to]);
      if(count)result[move.to].push(...result[move.from].splice(-count));
      for(const id of [move.from,move.to])if(Rules.complete(result[id]))removed.add(id);
    }
    return {water:result,removed};
  }
  function syncWaiting() {
    game.dataset.queueLength=queue.length;
    game.dataset.active=active?`${active.from},${active.to}`:'';
    nodes.forEach((node,i)=>{
      if(picking.has(i)||clearing.has(i)||(active&&(active.from===i||active.to===i)))return;
      const lifted=selected===i||queue.some(move=>move.from===i);
      pose(i,0,lifted?-18:0,node.restAngle);
      draw(i,undefined,node.restAngle);
    });
    ghosts.forEach((ghost,slot)=>ghost.hidden=slots[slot]!==null);
    updateStatus();
  }
  async function pick(i) {
    if(!Rules.available([...pile],level.bottles,i)){shakeBlocked(i);message('先拿走压在它上面的瓶子');return;}
    const slot=slots.indexOf(null);
    if(slot<0){message('手里没有空位了，先凑满一瓶同色水');return;}
    stopFeedback(i);
    const node=nodes[i], before=node.svg.getBoundingClientRect(), startAngle=node.restAngle;
    const startScale=parseFloat(node.button.style.width)/(game.clientWidth*.126);
    const beforeCenter={x:before.x+before.width/2,y:before.y+before.height/2};
    picking.add(i);pile.delete(i);slots[slot]=i;location[i]='hand';
    placeNode(i);pose(i,0,0,startAngle,startScale);
    const after=node.svg.getBoundingClientRect();
    const dx=beforeCenter.x-after.x-after.width/2,dy=beforeCenter.y-after.y-after.height/2;
    node.button.style.zIndex=80;
    pose(i,dx,dy,startAngle,startScale);syncWaiting();
    await animate(360,t=>{const p=1-ease(t);pose(i,dx*p,dy*p-12*Math.sin(Math.PI*t),startAngle*p,1-(1-startScale)*p);draw(i,undefined,startAngle*p,{waterAngle:0});});
    picking.delete(i);placeNode(i);pose(i);draw(i);settledMoves++;
    syncWaiting();void drainQueue();
  }
  function choose(i) {
    if(autoBusy)return;
    if(location[i]==='cleared'||clearing.has(i))return;
    if(location[i]==='pile'){void pick(i);return;}
    // A waiting source stays lifted, but it can still be the recipient of
    // a later queued move when another bottle is already selected.
    if(selected<0&&queue.some(move=>move.from===i))return;
    if(selected===i){selected=-1;syncWaiting();return;}
    const planned=plannedState();
    if(planned.removed.has(i)){message('这瓶已凑齐同色，即将收走');return;}
    if(selected<0){if(planned.water[i].length)selected=i;syncWaiting();return;}
    const from=selected;
    if(!amount(planned.water[from],planned.water[i])){
      message(planned.water[i].length===4?'这瓶已满，选一个有空位的瓶子':'先选一瓶有水的瓶子');
      return;
    }
    queue.push({from,to:i});selected=-1;syncWaiting();void drainQueue();
  }
  function clearEffects(id) {
    const node=nodes[id],style=node.style;
    const group=document.createElementNS(NS,'g');
    group.classList.add('clear-highlight');
    group.setAttribute('clip-path',`url(#inside-${id})`);
    const veil=document.createElementNS(NS,'rect');
    Object.entries({x:-10,y:style.top-2,width:node.vbW+20,height:style.bottom-style.top+4,fill:'white',opacity:0}).forEach(([k,v])=>veil.setAttribute(k,v));
    const sweep=document.createElementNS(NS,'path');
    Object.entries({fill:'none',stroke:'white','stroke-width':node.vbW*.16,opacity:0}).forEach(([k,v])=>sweep.setAttribute(k,v));
    group.append(veil,sweep);node.svg.insertBefore(group,node.svg.querySelector('.ink-outline'));
    const board=game.getBoundingClientRect(),matrix=node.svg.getScreenCTM();
    const center=new DOMPoint(style.centerX,(style.top+style.bottom)/2).matrixTransform(matrix);
    const width=node.svg.getBoundingClientRect().width;
    const stars=document.createElementNS(NS,'g');
    const specs=[[-.65,-.25,6.9], [.67,-.05,5.3], [.28,-.7,4.0]];
    const items=specs.map(([dx,dy,r])=>{
      const star=document.createElementNS(NS,'path');
      star.setAttribute('d',`M 0 ${-r} Q .5 -.5 ${r} 0 Q .5 .5 0 ${r} Q -.5 .5 ${-r} 0 Q -.5 -.5 0 ${-r} Z`);
      star.setAttribute('fill','#FFD23F');
      star.setAttribute('stroke','none');
      stars.append(star);return {star,x:center.x-board.left+dx*width,y:center.y-board.top+dy*width,dx,dy};
    });
    stars.setAttribute('opacity','0');document.querySelector('#clear-fx').append(stars);
    return {
      step(t) {
        const pulse=Math.sin(Math.PI*Math.min(1,t/.7));
        veil.setAttribute('opacity',String(pulse*.78));
        const x=-node.vbW+t*node.vbW*3;
        sweep.setAttribute('d',`M ${x+15} ${style.top-6} L ${x-15} ${style.bottom+6}`);
        sweep.setAttribute('opacity',String(pulse*.8));
        const u=Math.max(0,(t-.12)/.88),alpha=Math.sin(Math.PI*u);
        stars.setAttribute('opacity',String(alpha));
        items.forEach(({star,x,y,dx,dy})=>star.setAttribute('transform',`translate(${x+dx*u*12} ${y+dy*u*12}) rotate(${u*18}) scale(${.45+.55*Math.sin(Math.PI*u)})`));
      },
      remove(){group.remove();stars.remove();},
    };
  }
  async function clearCompleted(ids) {
    const completed=ids.filter(id=>location[id]==='hand'&&Rules.complete(water[id]));
    if(!completed.length)return;
    completed.forEach(id=>{clearing.add(id);if(selected===id)selected=-1;});
    const effects=new Map(completed.map(id=>[id,clearEffects(id)]));
    await animate(800,t=>completed.forEach(id=>{
      effects.get(id).step(t);
      const fade=ease(Math.max(0,(t-.38)/.62));
      nodes[id].button.style.opacity=String(1-fade);pose(id,0,-10*ease(t),0,1-.08*ease(t));
    }));
    completed.forEach(id=>{
      effects.get(id).remove();
      clearedColors.push(water[id][0]);water[id]=[];slots[slots.indexOf(id)]=null;location[id]='cleared';
      clearing.delete(id);nodes[id].button.style.opacity='1';placeNode(id);
    });
  }
  async function runAutoClear() {
    if(!autoOn||autoBusy||active||picking.size||queue.length)return;
    autoBusy=true;
    try {
      let plan;
      while(autoOn&&!picking.size&&(plan=Rules.autoClear({water,slots,pile:[...pile]}))) {
        selected=-1;
        const ids=slots.filter(id=>id!==null),taken=new Set(plan.take.map(t=>`${t.id}:${t.index}`));
        const morphs=ids.map(id=>({id,layers:[
          ...water[id].map((color,index)=>({color,from:1,to:id===plan.elim?(color===plan.color?1:0):(taken.has(`${id}:${index}`)?0:1)})),
          ...(id===plan.elim?plan.take.map(()=>({color:plan.color,from:0,to:1})):plan.moveOut.filter(m=>m.to===id).map(m=>({color:m.color,from:0,to:1}))),
        ]}));
        syncWaiting();
        await animate(310,t=>{
          const p=ease(t);
          morphs.forEach(({id,layers})=>draw(id,layers.map(u=>({color:u.color,amount:u.from+(u.to-u.from)*p}))));
        });
        ids.forEach(id=>{water[id]=id===plan.elim?Array(4).fill(plan.color):[...plan.state.water[id]];draw(id);});
        await clearCompleted([plan.elim]);
        settledMoves++;syncWaiting();
      }
    } finally {
      autoBusy=false;syncWaiting();
    }
  }
  async function drainQueue() {
    if(active||picking.size||autoBusy||draining)return;
    draining=true;
    try {
      while(queue.length) {
        const move=queue.shift();
        if(location[move.from]!=='hand'||location[move.to]!=='hand')continue;
        const count=amount(water[move.from],water[move.to]);
        if(!count){syncWaiting();continue;}
        active={...move,committed:false};syncWaiting();
        await playPour(move.from,move.to,count);
        await clearCompleted([move.from,move.to]);
        active=null;settledMoves++;syncWaiting();
        if(picking.size)return;
      }
      if(autoOn)await runAutoClear();
    } finally {
      draining=false;syncWaiting();
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
    // Approach on the source side: right → left keeps the body on the right.
    const direction = srcPivot.x>dstMouth.x?-1:1;
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
    source.style.zIndex=100;
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
    pose(from);source.style.zIndex=60;draw(from);
  }
  layout();syncWaiting();
  let resizeTimer;
  window.addEventListener('resize',()=>{
    clearTimeout(resizeTimer);
    const refresh=()=>{if(active||picking.size||autoBusy){resizeTimer=setTimeout(refresh,100);return;}layout();syncWaiting();};
    resizeTimer=setTimeout(refresh,80);
  });
  window.render_game_to_text=()=>JSON.stringify({
    coordinates:'screen pixels, x right / y down; water arrays bottom to top',
    mode:game.dataset.mode,level,water,slots,pile:[...pile],
    available:[...pile].filter(id=>Rules.available([...pile],level.bottles,id)),
    selected,active,queue,autoOn,autoBusy,draining,pileBoard,feedback:blockedFeedback,coverage:Object.fromEntries(Rules.exposure([...pile],level.bottles).coverage),picking:[...picking],clearing:[...clearing],cleared:[...clearedColors],moves:settledMoves,
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&selected>=0){selected=-1;syncWaiting();}});
  document.querySelector('#restart').onclick=()=>window.location.reload();
  document.querySelector('#auto').onclick=()=>{
    autoOn=!autoOn;document.querySelector('#auto').setAttribute('aria-checked',String(autoOn));
    if(autoOn)void drainQueue();
  };
  document.querySelector('#next').onclick=()=>{if(game.dataset.mode!=='lost')sessionStorage.setItem('bottle-level',levelNumber+1);window.location.reload();};
})();
