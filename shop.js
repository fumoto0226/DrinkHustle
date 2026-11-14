(() => {
'use strict';
const colors=['#A885FF','#FFE617','#F9392E','#45B4FD'], names=['葡萄','柠檬','苹果','蓝莓'];
const art=BOTTLE_ART, shop=document.querySelector('#shop'), layer=document.querySelector('#cups'), people=document.querySelector('#customers'), hint=document.querySelector('#hint');
const miniCapacity = 2, smallCapacity = 3;
const cupHeight = capacity => capacity === smallCapacity ? 1.23 : 1;
const boxTypes = [
  {name:'小箱', count:9, spread:4, width:1, height:1, capacity:smallCapacity},
  {name:'中箱', count:30, spread:6, width:2, height:1},
  {name:'大箱', count:50, spread:10, width:2, height:2},
  {name:'迷你箱', count:9, spread:4, width:1, height:1}
];
const miniBoxType = boxTypes.length-1;
const boxStride = 512;
const initialBoxSlots = 64;
const boxes = [];
let storedInfluencers = [];
let influencerTutorialSeen = false;
let influencerTutorialPending = false;
const smallBoxType = 0;

function influencerArt({flavor,price,days}) {
  return `<svg viewBox="-3 -2 60 86" preserveAspectRatio="none" aria-hidden="true">
    <path d="M38 25V14" stroke="#222" stroke-width="2"/>
    <circle cx="38" cy="11" r="5" fill="${colors[flavor]}" stroke="#222"/>
    <rect class="cup-silhouette" x="4" y="24" width="46" height="50" rx="6" fill="#ddd" stroke="#222" stroke-width="2"/>
    <rect x="11" y="30" width="32" height="37" rx="3" fill="white" stroke="#222"/>
    <path d="M11 48H43" stroke="#777"/>
    <g text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="bold" fill="#222">
      <text x="27" y="44">${coinText(price)}</text><text x="27" y="62">${days}D</text>
    </g>
  </svg>`;
}

function influencerLabel({flavor,price,days}) {
  return `${names[flavor]}价格影响器 · ${coinText(price)} 金币 · ${days} 天`;
}
const pendingStorageFlights = new Map();
let nextBoxId = 0;
function addBox(type, offerStock = null) {
  const box = {...boxTypes[type], type, id:nextBoxId++, cell:null, opened:false, offerStock};
  boxes.push(box);
  updateInventory();
  return box;
}
let positions = [];
const cartArea = document.querySelector('#cart-area');
const itemCount = document.querySelector('#item-count');
const inventory = document.querySelector('#inventory-menu');
const inventoryStatus = document.querySelector('#inventory-status');
const inventoryGrid = document.querySelector('#inventory-grid');

function remainingInBox(box) {
  return cups.filter(cup => (cup.place === 'table' || cup.place === 'storage') &&
    Math.floor(cup.spot/boxStride) === box.id).length;
}

function setFooterBadge(id, count) {
  const badge = document.getElementById(id);
  badge.textContent = count;
  badge.hidden = count === 0;
}

function updateInventory() {
  const stored = boxes.filter(box => box.cell === null);
  setFooterBadge('inventory-badge',stored.filter(box => !pendingStorageFlights.has(box)).length+storedInfluencers.length);
  inventoryGrid.replaceChildren();
  for (const box of stored) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inventory-box';
    button.dataset.box = box.id;
    const remaining = box.opened ? remainingInBox(box) : null;
    button.setAttribute('aria-label', `展开${box.name} ${box.id+1}号${remaining === null ? '，未开封' : `，剩余 ${remaining} 件`}`);
    button.innerHTML = `<i class="box-icon" aria-hidden="true"></i><span>${box.name}</span>`;
    if (remaining !== null) {
      const badge = document.createElement('b');
      badge.className = 'box-count';
      badge.textContent = remaining;
      button.append(badge);
    }
    button.onclick = () => {
      if (!openBox(box)) return;
      if (influencerTutorialPending) {
        inventory.close();
      } else {
        (inventoryGrid.querySelector('button') ?? document.querySelector('#close-inventory')).focus();
      }
    };
    inventoryGrid.append(button);
  }
  for (const item of storedInfluencers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inventory-box inventory-influencer';
    button.setAttribute('aria-label',influencerLabel(item));
    button.innerHTML = influencerArt(item);
    button.onclick = () => openInfluencer(item);
    inventoryGrid.append(button);
  }
  if (!stored.length && !storedInfluencers.length) {
    const empty = document.createElement('p');
    empty.textContent = '仓库里没有物品';
    inventoryGrid.append(empty);
  }
}

function layoutBoxes() {
  positions = [];
  const open = boxes.filter(box => box.cell !== null).sort((a,b) => b.width-a.width);
  const rows = [];
  for (const box of open) {
    let row = rows.at(-1);
    if (!row || row.reduce((sum,b) => sum+b.width,0)+box.width>2) {
      row = [];
      rows.push(row);
    }
    row.push(box);
  }
  const totalHeight = rows.reduce((sum,row) => sum+row[0].height*21,0);
  let top = 52.5-totalHeight/2;
  for (const row of rows) {
    let left = 50-row.reduce((sum,box)=>sum+box.width*46,0)/2;
    for (const box of row) {
      const width = box.width*46-1, height = box.height*21-1;
      box.el.style.cssText = `left:${left}%;top:${(top-27.5)/72.5*100}%;width:${width}%;height:${height/72.5*100}%`;
      box.bounds = {left,top,width,height};
      box.poses.forEach(([x,y,angle],i) => {
        positions[box.id*boxStride+i] = [left+8+x*(width-16),top+4+y*(height-8),angle];
      });
      left += box.width*46;
    }
    top += row[0].height*21;
  }
  pileGeometry = null;
}

function makeBoxPoses(box) {
  const columns = box.width === 1 ? 3 : 5;
  const rows = box.height*2;
  const cells = columns*rows;
  const poses = [];
  while (poses.length < initialBoxSlots) {
    // Fill a whole layer across the box before stacking the next.
    const groups = [[],[]];
    const parity = Math.floor(Math.random()*2);
    for (let i=0;i<cells;i++) {
      const column = i%columns, row = Math.floor(i/columns);
      const x = clamp((column+.5+(Math.random()-.5)*1.35)/columns);
      const y = clamp((row+.5+(Math.random()-.5)*1.35)/rows);
      groups[(column+row+parity)%2].push([x,y,(Math.random()-.5)*94]);
    }
    // An incomplete top layer is spread across alternating cells as well.
    for (const group of groups) {
      for (let i=group.length-1;i>0;i--) {
        const j = Math.floor(Math.random()*(i+1));
        [group[i],group[j]] = [group[j],group[i]];
      }
      poses.push(...group);
    }
  }
  return poses.slice(0,initialBoxSlots);
}

function makeBoxStock(box) {
  if (box.starter) {
    box.count = 15;
    // Stagger each layer while keeping the opening orders reachable.
    const starterPoses = [
      [.19,.29,32],[.78,.32,-32],[.08,.78,-19],[.91,.94,24],[.50,.54,-28],
      [.03,.30,24],[.92,.15,-26],[.34,.82,-27],[.81,.91,29],
      [.13,.15,-16],[.84,.04,20],[.24,.96,18],[.94,.79,-22],
      [.22,.05,-25],[.79,.23,16]
    ];
    const lowerStock = [[1,2],[0,3],[2,0],[3,1]];
    for (let i=2;i<lowerStock.length;i++) {
      if (Math.random()<.35) {
        const color = i === 2 ? 0 : 1;
        lowerStock[i] = [color,color];
      }
    }
    for (let i=lowerStock.length-1;i>0;i--) {
      const j = Math.floor(Math.random()*(i+1));
      [lowerStock[i],lowerStock[j]] = [lowerStock[j],lowerStock[i]];
    }
    // Keep the first day's three mixing orders achievable in three hand slots.
    const starterStock = [[1,0],[0,1],[2,1],[1,3],[3,2],...lowerStock,[3,2],[2,3],[3,1],[0,3],
      ...firstOrders.slice(0,2).map(color => [color,color])];
    starterStock.forEach((water,i) => {
      box.poses[i] = starterPoses[i];
      add(water,null,box.id*boxStride+i);
    });
    box.opened = true;
    return;
  }
  const stock = box.offerStock ?? generateStock(box);
  box.count = stock.length;
  const influencerSlots = box.type === smallBoxType
    ? [...stock.keys()].filter(() => Math.random() < .05) : [];
  while (influencerSlots.length > 2) {
    influencerSlots.splice(Math.floor(Math.random()*influencerSlots.length),1);
  }
  stock.forEach((water,i) => {
    const item = influencerSlots.includes(i)
      ? {flavor:Math.floor(Math.random()*names.length),price:10+Math.floor(Math.random()*16),days:1+Math.floor(Math.random()*3)}
      : null;
    add(item ? [] : water,null,box.id*boxStride+i,box.capacity ?? miniCapacity,item);
  });
  if (influencerSlots.length && !influencerTutorialSeen) influencerTutorialPending = true;
  box.offerStock = null;
  box.opened = true;
}

function generateStock(type, {uniqueLeader = false} = {}) {
  const count = Math.round(type.count+(Math.random()+Math.random()-1)*type.spread);
  // The second-smallest of six draws peaks at a mild bias and tapers toward both ends.
  const bias = Array.from({length:6}, () => Math.random()).sort((a,b) => a-b)[1];
  const preferredCount = 1+Math.floor(Math.random()*3);
  const ranks = colors.map(() => Math.random());
  const preferredFlavors = ranks.map((_,i) => i)
    .sort((a,b) => ranks[a]-ranks[b]).slice(0,preferredCount);
  const weights = colors.map((_,i) =>
    preferredFlavors.includes(i) ? 1+Math.random() : .025+.15*Math.random());
  const totalWeight = weights.reduce((sum,weight) => sum+weight,0);
  const equalShare = 1/colors.length;
  const quotas = weights.map(weight => {
    const preferredShare = weight/totalWeight;
    return count*(equalShare+bias*(preferredShare-equalShare));
  });
  const pairs = quotas.map(Math.floor);
  const leftovers = count-pairs.reduce((sum,pairCount) => sum+pairCount,0);
  const byRemainder = quotas.map((_,i) => i)
    .sort((a,b) => (quotas[b]-pairs[b])-(quotas[a]-pairs[a]));
  for (const flavor of byRemainder.slice(0,leftovers)) pairs[flavor]++;

  if (uniqueLeader) {
    const most = Math.max(...pairs);
    const tied = ranks.map((_,i) => i)
      .filter(i => pairs[i] === most)
      .sort((a,b) => quotas[b]-quotas[a] || ranks[a]-ranks[b]);
    if (tied.length > 1) {
      pairs[tied[0]]++;
      pairs[tied.at(-1)]--;
    }
  }

  const portions = pairs.flatMap((pairCount,flavor) => Array(pairCount*(type.capacity ?? miniCapacity)).fill(flavor));
  for (let i=portions.length-1;i>0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [portions[i],portions[j]] = [portions[j],portions[i]];
  }
  const capacity = type.capacity ?? miniCapacity;
  return Array.from({length:count},(_,i) => portions.slice(i*capacity,(i+1)*capacity));
}

let audioContext;
const soundNotes = {
  click: [[780,0,.055]],
  box: [[620,0,.09],[1040,.06,.12],[760,.13,.09]],
  serve: [[1460,0,.16],[2240,.025,.10]],
  earn: [[900,0,.08],[1350,.08,.12]],
  spend: [[610,0,.09],[380,.07,.13]],
  upgrade: [[740,0,.11],[990,.09,.12],[1480,.18,.18]]
};
function playSound(name) {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audioContext ??= new Audio();
    if (audioContext.state !== 'running') {
      audioContext.resume().then(() => {
        if (audioContext.state === 'running') playSound(name);
      }).catch(() => {});
      return;
    }
    for (const [frequency,delay,length] of soundNotes[name]) {
      const start = audioContext.currentTime+delay;
      const tone = audioContext.createOscillator();
      const gain = audioContext.createGain();
      tone.type = name === 'box' ? 'triangle' : 'sine';
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(.001,start);
      gain.gain.exponentialRampToValueAtTime(name === 'click' ? .045 : .08,start+.008);
      gain.gain.exponentialRampToValueAtTime(.001,start+length);
      tone.connect(gain).connect(audioContext.destination);
      tone.start(start);
      tone.stop(start+length);
    }
  } catch { /* Audio is optional on devices without an output. */ }
}

shop.addEventListener('click', event => {
  if (event.target.closest('#story-next, #story-refuse, .tip-confirm, .tip-close')) playSound('click');
},true);

function slideBoxIn(box, source) {
  if (source === 'restore') return;
  playSound('box');
  if (reducedMotion.matches) return;
  const target = box.el.getBoundingClientRect();
  const board = shop.getBoundingClientRect();
  const others = boxes.filter(b => b !== box && b.cell !== null).map(b => b.el.getBoundingClientRect());
  const overlapsX = r => r.right > target.left && r.left < target.right;
  const overlapsY = r => r.bottom > target.top && r.top < target.bottom;
  const above = others.some(r => overlapsX(r) && r.top < target.top);
  const below = others.some(r => overlapsX(r) && r.bottom > target.bottom);
  const left = others.some(r => overlapsY(r) && r.left < target.left);
  const right = others.some(r => overlapsY(r) && r.right > target.right);
  const fromTop = source !== 'inventory';
  let dx = 0, dy = 0;
  if (fromTop ? !above : !below) {
    dy = fromTop ? board.top-target.bottom : board.bottom-target.top;
  } else if (!left || !right) {
    dx = !left ? board.left-target.right : board.right-target.left;
  } else {
    dy = !above ? board.top-target.bottom : board.bottom-target.top;
  }
  const frames = [{translate:`${dx}px ${dy}px`},{translate:'0px 0px'}];
  const options = {duration:360,easing:'cubic-bezier(.2,.7,.25,1)'};
  box.el.animate(frames,options);
  for (const cup of cups) {
    if (cup.place !== 'table' || Math.floor(cup.spot/boxStride) !== box.id) continue;
    cup.el.hidden = false;
    drawCup(cup);
    cup.el.animate(frames,options);
  }
}

function openBox(box, source = 'inventory') {
  if (box.cell !== null) return false;
  const occupied = boxes.filter(b => b.cell !== null).reduce((sum,b) => sum+b.width*b.height,0);
  if (occupied+box.width*box.height > 4) {
    inventoryStatus.textContent = '桌上没有空位，请先撤下桌上的箱子。';
    return false;
  }
  if (transferSource) setTransferSource(null);
  box.cell = occupied;
  box.poses ??= makeBoxPoses(box);
  box.el = document.createElement('section');
  box.el.className = 'stock-box';
  box.el.setAttribute('aria-label',box.name);
  box.el.innerHTML = `<b class="box-count" aria-label="剩余物品数"></b><button type="button" class="close-box" aria-label="收回${box.name}">×</button>`;
  box.el.querySelector('.close-box').onclick = () => closeBox(box);
  const transfer = document.createElement('button');
  transfer.type = 'button';
  transfer.className = 'close-box transfer-box';
  transfer.textContent = '⇄';
  transfer.setAttribute('aria-label','转移箱内饮料');
  transfer.onclick = () => setTransferSource(transferSource === box ? null : box);
  const target = document.createElement('button');
  target.type = 'button';
  target.className = 'transfer-target';
  target.textContent = '转入这个箱子';
  target.hidden = true;
  target.onclick = () => {
    if (transferSource === box) setTransferSource(null);
    else transferDrinks(box);
  };
  box.el.append(transfer);
  box.transferOverlay = target;
  box.el.onclick = event => { if(event.target===box.el) returnToBox(box,event); };
  cartArea.append(box.el);
  if (!box.opened) makeBoxStock(box);
  layoutBoxes();
  for (const cup of cups) {
    if (cup.place === 'storage' && Math.floor(cup.spot/boxStride) === box.id) {
      cup.place = 'table';
      paint(cup);
    }
  }
  updateInventory();
  slideBoxIn(box,source);
  say(`已展开${box.name}`);
  return true;
}

function closeBox(box) {
  if (transferSource) setTransferSource(null);
  if (busy || cupActions.length) { say('等当前动作结束后再收箱'); return; }
  for (const cup of cups) {
    if (cup.place === 'table' && Math.floor(cup.spot/boxStride) === box.id) {
      stopFeedback(cup);
      cup.place = 'storage';
      cup.el.hidden = true;
    }
  }
  box.el.remove();
  box.cell = null;
  const empty = remainingInBox(box) === 0;
  if (empty) boxes.splice(boxes.indexOf(box),1);
  layoutBoxes();
  updateInventory();
  say(empty ? '空箱已移除' : `已将${box.name}收回仓库`);
}

document.querySelector('#inventory').onclick = () => {
  inventoryStatus.textContent = '';
  updateInventory();
  inventory.showModal();
};
connectSlidingPanel(inventory, '#close-inventory');
for (const button of document.querySelectorAll('[data-test-box]')) {
  button.onclick = () => addBox(Number(button.dataset.testBox));
}

const TABLE_SCALE = .81;
const HELD_CUP_SCALE = TABLE_SCALE * .9;
let pileGeometry, pileAspect, pileTallSpots;
const feedback = new Map();

function tablePile() {
  return cups.filter(cup => cup.place === 'table').map(cup => cup.spot);
}

function getPileGeometry() {
  const aspect = shop.clientHeight / shop.clientWidth;
  const tallSpots = cups.filter(cup => cup.place === 'table' && cup.capacity === smallCapacity)
    .map(cup => cup.spot);
  const itemSpots = new Set(cups.filter(cup => cup.place === 'table' && cup.influencer).map(cup => cup.spot));
  const stacked = new Map(cups.filter(cup => cup.place === 'table').map(cup => [cup.spot, cup.stack]));
  const shapeKey = tallSpots.join(',')+';'+[...itemSpots].join(',')+';'+[...stacked.keys()].join(',');
  if (pileGeometry && aspect === pileAspect && shapeKey === pileTallSpots) return pileGeometry;
  pileTallSpots = shapeKey;
  pileAspect = aspect;
  // Match the actual shortened SVG and its centre of rotation.
  const outline = document.createElementNS(NS, 'path');
  outline.setAttribute('d', art.outline[0]);
  const length = outline.getTotalLength();
  const outlinePoints = Array.from({length: 160}, (_, i) => {
    const point = outline.getPointAtLength(length*i/160);
    return [(point.x-27)/60, (point.y-41)/86*.5*aspect];
  });
  const shapes = [miniCapacity,smallCapacity].map(capacity =>
    [outlinePoints.map(([x,y]) => [x,y*cupHeight(capacity)])]);
  const tall = new Set(tallSpots);
  pileGeometry = [];
  for (const [spot, stack] of stacked) {
    const [x,y,angle] = positions[spot];
    pileGeometry[spot] = {
    shape:itemSpots.has(spot)
      ? [[[4,24],[50,24],[50,74],[4,74]].map(([x,y]) => [(x-27)/60,(y-41)/86*.5*aspect*cupHeight(smallCapacity)])]
      : shapes[Number(tall.has(spot))], pose: {x:x/100, y:y/100*aspect, angle, z:stack ?? spot%boxStride, size:.16*TABLE_SCALE}
    };
  }
  return pileGeometry;
}

function shakeBlocked(cup, pile, geometry) {
  const blockers = HeapRules.blockers(pile, geometry, cup.spot);
  const participants = [cup, ...blockers.map(({id}) =>
    cups.find(other => other.place === 'table' && other.spot === id))];
  participants.forEach((other, index) => {
    feedback.get(other)?.cancel();
    const distance = index ? 2 : 5;
    const animation = other.el.querySelector('svg').animate([
      {transform:'translateY(0)'},
      {transform:`translateY(${-distance}px) rotate(2deg)`},
      {transform:`translateY(${distance*.5}px) rotate(-1deg)`},
      {transform:'translateY(0)'}
    ], {duration:390, delay:index ? 24 : 0, easing:'ease-in-out'});
    other.el.dataset.feedback = index ? 'blocker' : 'source';
    feedback.set(other, animation);
    animation.onfinish = () => stopFeedback(other);
  });
  say('这只杯子被压住了，先拿上面的杯子');
}

function stopFeedback(cup) {
  feedback.get(cup)?.cancel();
  feedback.delete(cup);
  delete cup.el.dataset.feedback;
}
let cups=[], customers=[],selected=null,busy=null,serial=0,personSerial=0,served=0;
const ink=inkPaths(art.outline,3,{widthScale:art.inkScale});
const NS = 'http://www.w3.org/2000/svg';
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
  function buildGeom(style, capacity) {
    const geomPath = document.createElementNS(NS, 'path');
    geomPath.setAttribute('d', style.mask);
    const length = geomPath.getTotalLength();
    const steps = Math.ceil(length / .7);
    const polygon = Array.from({length: steps}, (_, j) => {
      const p = geomPath.getPointAtLength(j * length / steps);
      return {x: p.x - style.centerX, y: p.y - style.pivotY};
    });
    const interior = clipBelow(polygon, 0);
    const layerHeight = (style.bottom - style.top) / capacity;
    function uprightLevel(units) {
      return style.bottom - Math.max(0, Math.min(capacity, units)) * layerHeight;
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
const cupGeometries = {2:buildGeom(art, miniCapacity),3:buildGeom(art, smallCapacity)};
const stream = document.querySelector('#shop-stream path');
const cupActions = [];
const ease = t => t * t * (3 - 2 * t);
const clamp = t => Math.max(0, Math.min(1, t));

function animateLiquid(cup, layers, angle, impact = 0, phase = 0) {
  const liquid = cup.el.querySelector('.liquid');
  const geom = cupGeometries[cup.capacity];
  const polygon = geom.rotated(angle);
  const bands = [];
  for (const layer of layers) {
    if (layer.amount < .001) continue;
    if (bands.at(-1)?.color === layer.color) bands.at(-1).amount += layer.amount;
    else bands.push({...layer});
  }
  let units = bands.reduce((sum, layer) => sum + layer.amount, 0);
  liquid.innerHTML = bands.reverse().map(({color, amount}, index) => {
    const y = geom.level(units, angle, polygon);
    units -= amount;
    const edge = Array.from({length: 81}, (_, i) => {
      const x = -120 + i * 3;
      const ripple = index === 0 ? impact * Math.sin(Math.abs(x-art.centerX)*.38-phase) * Math.exp(-Math.abs(x-art.centerX)/20) : 0;
      return `${i ? 'L' : 'M'}${x} ${y + ripple + inkWaterRoughness(x, cup.id)}`;
    }).join(' ');
    const oval = art.surface;
    const ry = oval.ry * Math.max(0, 1 - Math.abs(angle)/22) * Math.min(1, amount/.2);
    return `<path d="${edge} V180 H-120Z" fill="${colors[color]}"/>` +
      (index === 0 && ry > 0 ? `<ellipse cx="${oval.cx}" cy="${y}" rx="${oval.rx}" ry="${ry}" fill="white" opacity=".26"/>` : '');
  }).join('');
  liquid.setAttribute('transform', `rotate(${-angle} ${art.centerX} ${art.pivotY})`);
}

function playPour(move, elapsed) {
  const {c, target, amount, from, direction, approach, flow, flight, duration} = move;
  const rect = shop.getBoundingClientRect();
  const dst = target.el.querySelector('svg').getScreenCTM();
  const inletX = (art.lipLeftX + art.lipRightX) / 2;
  const mouth = new DOMPoint(inletX, art.pivotY).matrixTransform(dst);
  const gap = Math.min(36, rect.height * .075);
  const pourTime = elapsed - approach;
  const emittedAt = ms => amount * ease(clamp(ms / flow));
  const emitted = emittedAt(pourTime);
  const received = emittedAt(pourTime - flight);
  const strengthAt = ms => clamp(Math.min(ms/85, (amount-emittedAt(ms))/.18));
  const strength = strengthAt(pourTime);
  const mix = ease(clamp(elapsed/approach)) * ease(clamp((duration-elapsed)/(duration-approach-flow-flight)));
  const remaining = Math.max(.0001, c.water.length-emitted);
  // Approach upright on the source side, then tilt toward the receiving cup.
  const tilt = ease(clamp((elapsed-approach*.55)/(approach*.45))) *
    ease(clamp((duration-elapsed-240)/220));
  const travel = ease(clamp(elapsed/(approach*.55))) *
    ease(clamp((duration-elapsed)/240));
  const angle = direction * Math.min(125, Math.abs(cupGeometries[c.capacity].pourAngle(remaining, direction, 3*strength))) * tilt;
  drawCup(c, [from[0], from[1], angle]);
  const svg = c.el.querySelector('svg');
  const lipX = direction < 0 ? art.lipLeftX : art.lipRightX;
  const lip = new DOMPoint(lipX, art.pivotY).matrixTransform(svg.getScreenCTM());
  drawCup(c, [from[0] + (mouth.x-lip.x)*travel/rect.width*100,
    from[1] + (mouth.y-gap-lip.y)*travel/rect.height*100, angle]);
  const color = c.water.at(-1);
  animateLiquid(c, c.water.map((color,i) => ({color, amount:clamp(c.water.length-i-emitted)})), angle,
    Math.sin(Math.PI*mix)*.8, elapsed*.02);
  const impact = clamp(Math.min((pourTime-flight)/65, (flow+flight-pourTime)/110));
  animateLiquid(target, [...target.water.map(color => ({color, amount:1})), {color, amount:received}], 0, impact, elapsed*.022);
  const head = clamp(pourTime/flight);
  const tail = clamp((pourTime-flow)/flight);
  if (head <= tail) { stream.removeAttribute('d'); return; }
  const end = new DOMPoint(inletX, cupGeometries[target.capacity].level(target.water.length+received)+2.4*impact).matrixTransform(dst);
  const x = mouth.x-rect.left, y = mouth.y-gap-rect.top;
  const left = [], right = [];
  for (let i = 0; i <= 24; i++) {
    const t = tail + (head-tail)*i/24;
    const half = 2.2*strengthAt(pourTime-flight*t)*(1-.28*t);
    const height = y+(end.y-mouth.y+gap)*t*t;
    left.push(`${x-half} ${height}`);
    right.unshift(`${x+half} ${height}`);
  }
  stream.ownerSVGElement.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  stream.setAttribute('fill', colors[color]);
  stream.setAttribute('d', `M${left.concat(right).join(' L')} Z`);
}

function svg(water,id,capacity){let bands=''; water.map((c,i)=>({c,i})).reverse().forEach(({c,i})=>{const y=art.bottom-(i+1)*(art.bottom-art.top)/capacity;bands+=`<path d="M0 ${y} Q26 ${y+6} 54 ${y} V82 H0Z" fill="${colors[c]}"/>`;});if(water.length){const y=art.bottom-water.length*(art.bottom-art.top)/capacity;bands+=`<ellipse cx="26.46" cy="${y}" rx="19.6" ry="3.1" fill="${colors[water.at(-1)]}"/><ellipse cx="26.46" cy="${y}" rx="19.6" ry="3.1" fill="white" opacity=".26"/>`;}
return `<svg viewBox="-3 -2 60 86" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="clip-${id}"><path d="${art.mask}"/></clipPath></defs>${art.outline.map(d=>`<path class="cup-silhouette" d="${d}" fill="white"/>`).join('')}<g clip-path="url(#clip-${id})"><g class="liquid">${bands}</g></g>${ink}</svg>`;}
function add(water,slot=null,spot=null,capacity=miniCapacity,influencer=null){const c={id:serial++,water,capacity,influencer,place:slot===null?'table':'hand',slot,spot};c.el=document.createElement('button');c.el.className='cup';c.el.onclick=e=>{e.stopPropagation();clickCup(c)};layer.append(c.el);cups.push(c);paint(c);return c;}
function paint(c){
  if (c.influencer) {
    c.el.innerHTML = influencerArt(c.influencer);
    c.el.setAttribute('aria-label',influencerLabel(c.influencer));
    return;
  }
  c.el.innerHTML=svg(c.water,`cup${c.id}`,c.capacity);c.el.classList.toggle('complete',complete(c));c.el.setAttribute('aria-label',`${c.place==='hand'?'手中':'桌面'}${c.capacity === smallCapacity ? '小杯' : '迷你杯'}：${c.water.map(x=>names[x]).join('、')||'空杯'}，${c.water.length}/${c.capacity}格`);}
function complete(c){return c.water.length === c.capacity && c.water.every(color => color === c.water[0])}
function pose(c) {
  if (c.place === 'storage') return null;
  return c.place === 'table' ? [...positions[c.spot], TABLE_SCALE] : [17+c.slot*32,79,0,1];
}
const cupFlightSpeed = 1100; // CSS pixels per second.
function cupFlightDuration(from, to) {
  const dx = (to[0]-from[0])*shop.clientWidth/100;
  const dy = (to[1]-from[1])*shop.clientHeight/100;
  return Math.hypot(dx,dy)/cupFlightSpeed*1000;
}
function drawCup(c,p=pose(c)) {
  const activePour = busy?.type === 'pour' && busy.c === c;
  const waiting = cupActions.some(action => action.type === 'pour' && action.c === c);
  const lifted = !activePour && cupDrag?.cup !== c && (selected === c.id || waiting);
  c.el.style.left = `${p[0]-8}%`;
  const height = 8*cupHeight(c.capacity);
  c.el.style.height = `${height}%`;
  c.el.style.top = `${p[1]-height/2}%`;
  c.el.style.transform = `rotate(${p[2]}deg) translateY(${lifted ? -10 : 0}px) scale(${p[3] ?? 1})`;
  c.el.classList.toggle('selected',lifted);
  c.el.setAttribute('aria-pressed',String(lifted));
}
function say(s){hint.textContent=s}
function clickCup(c){if(storyStage)return;if((busy && ['deliver','auto-mix'].includes(busy.type))||c.place==='delivery'||c.place==='storage')return;if(c.place==='table'){
const pile = tablePile(), geometry = getPileGeometry();
if (!HeapRules.available(pile, geometry, c.spot)) {
  shakeBlocked(c, pile, geometry);
  return;
}
if (c.influencer) {
  stopFeedback(c);
  storedInfluencers.push(c.influencer);
  cups = cups.filter(cup => cup !== c);
  c.el.remove();
  updateInventory();
  playSound('click');
  say('价格影响器已放入仓库');
  return;
}
const customer = complete(c) && customers.find(p => p.phase === 'waiting' && p.orders.includes(c.water[0]));
if (customer && !busy && !cupActions.length) {
  deliverCup(c,customer);
  return;
}
stopFeedback(c);
const slot=[0,1,2].find(s=>!cups.some(x=>x.place==='hand'&&x.slot===s));if(slot===undefined){say('手里满了 · 可以放回装满的杯子');return;}const from=pose(c);c.place='hand';c.slot=slot;const to=pose(c);cupActions.push({type:'pickup',t:0,duration:cupFlightDuration(from,to),c,from,to});
paint(c);
selected = c.id;
say('点另一只杯子倒色 · 点箱子空处放回');
return;
}
if(selected===null){selected=c.id;say('点另一只杯子倒色 · 点桌面空处放回');return;}if(selected===c.id){selected=null;return;}
const source = cups.find(c => c.id === selected);
const planned = new Map(cups.map(c => [c, [...c.water]]));
for (const move of [busy, ...cupActions]) {
  if (!move || move.type !== 'pour') continue;
  planned.get(move.target).push(...planned.get(move.c).splice(-move.amount));
}
const water = planned.get(source), destination = planned.get(c);
if (!water.length) { selected = c.id; return; }
if (destination.length === c.capacity) {
  selected = c.id;
  say('已选中这只杯子');
  return;
}
const amount = pourAmount(water,c.capacity-destination.length);
selected = null;
const from = pose(source);
const approach = 420, flow = 540 + amount*170, flight = 125;
cupActions.push({type:'pour', t:0, c:source, target:c, amount, from,
  direction:from[0] > pose(c)[0] ? -1 : 1,
  approach, flow, flight, duration:approach+flow+flight+460});
}

function pourAmount(water, room) {
  let run = 1;
  while (run < water.length && water.at(-1-run) === water.at(-1)) run++;
  return Math.min(room,run);
}

const transferOverlays = document.createElement('div');
transferOverlays.id = 'transfer-overlays';
shop.append(transferOverlays);
let transferSource = null;
let cupDrag = null;
const concurrentDrops = new Map();
let suppressDragClick = false;
let topStack = initialBoxSlots;

function setTransferSource(source) {
  if (source && (storyStage || busy || cupActions.length || cupDrag?.active)) return;
  transferSource = source;
  transferOverlays.replaceChildren();
  shop.classList.toggle('transferring-box',Boolean(source));
  for (const box of boxes) {
    if (box.cell === null) continue;
    const button = box.el.querySelector('.transfer-box');
    const active = box === source;
    button.textContent = active ? '↶' : '⇄';
    button.setAttribute('aria-label',active ? '取消转移' : '转移箱内饮料');
    button.setAttribute('aria-pressed',String(active));
    if (!source) continue;
    const overlay = box.transferOverlay;
    const {left,top,width,height} = box.bounds;
    Object.assign(overlay.style,{left:`${left}%`,top:`${top}%`,width:`${width}%`,height:`${height}%`});
    overlay.hidden = false;
    overlay.classList.toggle('transfer-source',active);
    overlay.textContent = active ? '取消移动' : '转入这个箱子';
    transferOverlays.append(overlay);
  }
}

function moveCupToBox(cup, box, x, y, angle) {
  const start = box.id*boxStride;
  const used = new Set(tablePile());
  let index = 0;
  while (used.has(start+index)) index++;
  if (index >= boxStride) return false;
  box.poses[index] = [x,y,angle];
  stopFeedback(cup);
  cup.place = 'table';
  cup.slot = null;
  cup.spot = start+index;
  cup.stack = ++topStack;
  if (selected === cup.id) selected = null;
  paint(cup);
  return true;
}

function transferDrinks(target) {
  if (!transferSource || target === transferSource || busy || cupActions.length) return;
  const source = transferSource;
  const drinks = cups.filter(cup => cup.place === 'table' && !cup.influencer &&
    Math.floor(cup.spot/boxStride) === source.id)
    .sort((a,b) => (a.stack ?? a.spot%boxStride)-(b.stack ?? b.spot%boxStride));
  setTransferSource(null);
  if (!drinks.length) { say('这个箱子里没有饮料'); return; }
  if (remainingInBox(target)+drinks.length > boxStride) { say('目标箱子已满'); return; }
  for (const cup of drinks) {
    const [x,y,angle] = source.poses[cup.spot%boxStride];
    moveCupToBox(cup,target,x,y,angle);
  }
  layoutBoxes();
  say(`已转移 ${drinks.length} 杯饮料`);
}

function dropBoxAt(x,y) {
  const open = boxes.filter(box => box.cell !== null);
  const inside = open.find(({bounds:b}) => x >= b.left && x <= b.left+b.width &&
    y >= b.top && y <= b.top+b.height);
  if (inside) return inside;
  const aspect = shop.clientHeight/shop.clientWidth;
  let best = null;
  let bestDistance = 6;
  for (const box of open) {
    const b = box.bounds;
    const distance = Math.hypot(x-Math.max(b.left,Math.min(x,b.left+b.width)),
      (y-Math.max(b.top,Math.min(y,b.top+b.height)))*aspect);
    if (distance < bestDistance) {
      best = box;
      bestDistance = distance;
    }
  }
  return best;
}

document.addEventListener('pointerdown', () => { suppressDragClick = false; },true);
document.addEventListener('click', event => {
  if (suppressDragClick) {
    suppressDragClick = false;
    event.stopImmediatePropagation();
    event.preventDefault();
    return;
  }
  if (!transferSource || event.target.closest('.transfer-box,.transfer-target')) return;
  setTransferSource(null);
  event.stopImmediatePropagation();
  event.preventDefault();
},true);
document.addEventListener('contextmenu',event => {
  if (!transferSource && !cupDrag) return;
  event.preventDefault();
  setTransferSource(null);
  cupDrag = null;
});
document.addEventListener('keydown',event => {
  if (event.key === 'Escape') setTransferSource(null);
});

layer.addEventListener('pointerdown',event => {
  if (event.button !== 0 || !event.isPrimary || storyStage || transferSource || cupActions.length) return;
  const cup = cups.find(item => item.el === event.target.closest('.cup'));
  if (!cup || cup.influencer || !['table','hand'].includes(cup.place)) return;
  if (busy && (busy.type !== 'auto-mix' || cup.place !== 'table')) return;
  cupDrag = {cup,id:event.pointerId,startX:event.clientX,startY:event.clientY,active:false};
});

document.addEventListener('pointermove',event => {
  const drag = cupDrag;
  if (!drag || drag.id !== event.pointerId) return;
  if (!drag.active) {
    if (Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY) < 5) return;
    const cup = drag.cup;
    const canDragWhileBusy = busy?.type === 'auto-mix' && cup.place === 'table';
    if ((busy && !canDragWhileBusy) || cupActions.length || storyStage || (cup.place === 'table' &&
        !HeapRules.available(tablePile(),getPileGeometry(),cup.spot))) {
      cupDrag = null;
      return;
    }
    if (cup.place === 'hand' && cup.water.length !== cup.capacity) {
      say('只有装满的杯子才能拖进箱子');
      suppressDragClick = true;
      cupDrag = null;
      return;
    }
    drag.active = true;
    concurrentDrops.delete(cup);
    stopFeedback(cup);
    drag.angle = pose(cup)[2];
    drag.scale = pose(cup)[3];
    cup.el.setPointerCapture(event.pointerId);
  }
  const board = shop.getBoundingClientRect();
  drag.x = (event.clientX-board.left)/board.width*100;
  drag.y = (event.clientY-board.top)/board.height*100;
  drag.target = dropBoxAt(drag.x,drag.y);
});

document.addEventListener('pointerup',event => {
  const drag = cupDrag;
  if (!drag || drag.id !== event.pointerId) return;
  cupDrag = null;
  if (!drag.active) return;
  suppressDragClick = true;
  const board = shop.getBoundingClientRect();
  drag.x = (event.clientX-board.left)/board.width*100;
  drag.y = (event.clientY-board.top)/board.height*100;

  const cup = drag.cup;
  // Include the slot marker beneath the cup in the drop area.
  const handSlot = cup.place === 'table' && drag.y >= 74 && drag.y <= 85
    ? [0,1,2].find(slot => Math.abs(drag.x-(17+slot*32)) <= 12)
    : undefined;
  if (handSlot !== undefined) {
    if (cups.some(other => other.place === 'hand' && other.slot === handSlot)) {
      say('这个手位已有杯子');
      return;
    }
    cup.place = 'hand';
    cup.slot = handSlot;
    selected = cup.id;
    paint(cup);
    say('点另一只杯子倒色 · 点箱子空处放回');
  } else {
    const box = dropBoxAt(drag.x,drag.y);
    if (!box) return;
    const b = box.bounds;
    const inside = drag.x >= b.left && drag.x <= b.left+b.width &&
      drag.y >= b.top && drag.y <= b.top+b.height;
    const relX = (drag.x-b.left-8)/(b.width-16);
    const relY = (drag.y-b.top-4)/(b.height-8);
    const x = inside ? relX : clamp(relX);
    const y = inside ? relY : clamp(relY);
    if (!moveCupToBox(cup,box,x,y,drag.angle)) { say('目标箱子已满'); return; }
    layoutBoxes();
  }
  const from = [drag.x,drag.y,drag.angle,drag.scale];
  const to = pose(drag.cup);
  const drop = {type:'pickup',t:0,duration:Math.max(100,cupFlightDuration(from,to)),c:drag.cup,from,to};
  // A drop can finish independently of the order's liquid animation.
  if (busy) concurrentDrops.set(drag.cup,drop);
  else busy = drop;
});
document.addEventListener('pointercancel',event => {
  if (cupDrag?.id === event.pointerId) cupDrag = null;
});

function returnToBox(box, event) {
  if (busy || cupActions.length || selected === null) return;
  const cup = cups.find(c => c.id === selected);
  if (cup.water.length !== cup.capacity) { say('只有装满的杯子才能放回箱子'); return; }
  const used = new Set(tablePile());
  const start = box.id*boxStride;
  const available = [];
  for (let spot = start; spot < start+boxStride && available.length < 6; spot++) {
    if (!used.has(spot) && positions[spot]) available.push(spot);
  }
  if (!available.length) { say('这只箱子已满'); return; }

  // Favor the clicked side while keeping the original scattered cup positions.
  const bounds = shop.getBoundingClientRect();
  const clickX = event.clientX-bounds.left;
  const clickY = event.clientY-bounds.top;
  const boxBounds = box.el.getBoundingClientRect();
  const spread = Math.hypot(boxBounds.width,boxBounds.height);
  let spot = available[0];
  let bestScore = Infinity;
  for (const [index,candidate] of available.entries()) {
    const [x,y] = positions[candidate];
    const distance = Math.hypot(x*bounds.width/100-clickX,y*bounds.height/100-clickY);
    const score = distance+index*spread*.035;
    if (score < bestScore) {
      spot = candidate;
      bestScore = score;
    }
  }
  const from = pose(cup);
  cup.place = 'table';
  cup.spot = spot;
  cup.stack = ++topStack;
  pileGeometry = null;
  cup.slot = null;
  selected = null;
  paint(cup);
  const to = pose(cup);
  busy = {type:'pickup',t:0,duration:cupFlightDuration(from,to),c:cup,from,to};
}
const customerSlots = [6, 29, 52, 75];
let customerLimit = 1;
// Prices and balances are integer tenths of a coin.
let balance = 0, displayedBalance = 0, rollElapsed = 0;
const roundMoney = amount => Math.round(amount*10)/10;
const coinText = amount => String(Math.round(amount*10)/100);
const market = [10,10,10,10].map(price => ({price, target:null, hold:0}));
const marketLabel = document.querySelector('#fruit-market');
const marketPrices = market.map((_,i) => {
  const row = document.createElement('span');
  const dot = document.createElement('i');
  dot.style.background = colors[i];
  const value = document.createElement('b');
  row.append(dot,document.createTextNode(names[i]),value);
  marketLabel.append(row);
  return value;
});

function effectivePrice(flavor) {
  const fruit = market[flavor];
  const override = fruit.influencers?.findLast(effect => day >= effect.start && day <= effect.end);
  if (override) return override.price;
  const floor = fruit.floor;
  return floor && day >= floor.start && day <= floor.end
    ? Math.max(fruit.price,floor.price) : fruit.price;
}

const influencerMenu = document.querySelector('#influencer-menu');
let selectedInfluencer = null;

function openInfluencer(item) {
  selectedInfluencer = item;
  document.querySelector('#influencer-terms').textContent =
    `从明天开始，${names[item.flavor]}每份价格变为 ${coinText(item.price)} 金币，持续 ${item.days} 天。`;
  influencerMenu.returnValue = '';
  influencerMenu.showModal();
}

influencerMenu.addEventListener('close', () => {
  const item = selectedInfluencer;
  selectedInfluencer = null;
  if (influencerMenu.returnValue !== 'apply' || !storedInfluencers.includes(item)) return;
  const fruit = market[item.flavor];
  fruit.influencers ??= [];
  fruit.influencers.push({price:item.price,start:day+1,end:day+item.days});
  storedInfluencers = storedInfluencers.filter(other => other !== item);
  updateInventory();
  (inventoryGrid.querySelector('button') ?? document.querySelector('#close-inventory')).focus();
  playSound('click');
});

function showMarket() {
  market.forEach((fruit,i) => {
    const price = effectivePrice(i);
    marketPrices[i].textContent = coinText(price);
    marketPrices[i].parentElement.title = `${names[i]}每份 ${coinText(price)}，迷你杯 ${coinText(price*2)} 金币，小杯 ${coinText(roundMoney(price*3*1.1))} 金币`;
  });
}

function advanceMarket(firstChange = false) {
  const rising = firstChange ? [...market] : [];
  if (firstChange) {
    for (let i = rising.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [rising[i],rising[j]] = [rising[j],rising[i]];
    }
    rising.length = 2;
  }
  for (const fruit of market) {
    if (fruit.rise) {
      const {from,to,start,days} = fruit.rise;
      const elapsed = day-start;
      fruit.price = from+Math.round((to-from)*elapsed/days);
      if (elapsed >= days) fruit.rise = null;
      continue;
    }
    if (fruit.hold > 0) { fruit.hold--; continue; }
    if (!firstChange && (fruit.target === null || fruit.target === fruit.price)) {
      const roll = Math.random();
      const [min,max] = roll<.50 ? [2,10] : roll<.95 ? [10,20] : [20,30];
      fruit.target = min+Math.floor(Math.random()*(max-min+1));
    }
    const roll = Math.random();
    const minStep = roll<.60 ? 1 : roll<.90 ? 2 : roll<.96 ? 3 : roll<.99 ? 4 : 5;
    const step = minStep+Math.floor(Math.random()*2);
    const distance = fruit.target-fruit.price;
    if (firstChange) {
      fruit.price += rising.includes(fruit) ? step : -step;
      fruit.target = null;
    } else {
      fruit.price += Math.sign(distance)*Math.min(Math.abs(distance),step);
      if (fruit.price === fruit.target) fruit.hold = Math.floor(Math.random()*4);
    }
  }
  showMarket();
}
const rewards = [];
const balanceLabel = document.querySelector('#balance');
const upgradeMenu = document.querySelector('#upgrade-menu');
const buyDaily = document.querySelector('#buy-daily');
const merchantTypes = [miniBoxType,0,1,2];
const merchantTypePrices = [15,50,90];
const merchantCountPrices = [10,25,50,100];
let merchantTypeLevel = 0;
let scavengeLevel = 0;
const scavengeUpgradePrices = [1,10,20];
const upgradeTutorials = [];
const buyScavengeUpgrade = document.querySelector('#buy-scavenge-upgrade');

function scavengePrizeTypes() {
  if (scavengeLevel === 3) return [0];
  if (scavengeLevel === 2) return [miniBoxType,0];
  return [miniBoxType];
}

function scavengeUpgradePrice() {
  return scavengeLevel === 1 && merchantTypeLevel === 0
    ? undefined : scavengeUpgradePrices[scavengeLevel];
}

buyScavengeUpgrade.onclick = () => {
  purchaseUpgrade(scavengeUpgradePrice(), () => {
    scavengeLevel++;
    if (scavengeLevel === 1) {
      upgradeTutorials.push(['scavenge',
        '每天营业结束后，会出现「拾荒」按钮。点进去就能看到还剩几次机会、下次成功率是多少。每次拾荒都有代价，出门前记得看看面板里的说明。']);
    }
  });
};
let merchantItemCount = 1;
const buyMerchantType = document.querySelector('#buy-merchant-type');
const buyMerchantCount = document.querySelector('#buy-merchant-count');
const buyWallet = document.querySelector('#buy-wallet');
const walletPrices = [5,6,7,8,9,10,11,12,13,14];
let walletLevel = 0;

const scavengeFreeUpgrade = {id:'scavenge-free', name:'增加无负面影响的拾荒', prices:[8,16,24], scavenge:true};
const scavengeChanceUpgrade = {id:'scavenge-chance', name:'提升拾荒成功率', prices:[8,16,24], scavenge:true};
const extraUpgrades = [
  {id:'wallet-plus', name:'顾客钱包大升级', prices:[15,16,17,18,19,20,21,22,23,24], chances:[10,20,30,40,50,60,70,80,90,100], label:'点两杯后加第三杯'},
  {id:'wallet-remodel', name:'顾客钱包改造', prices:[25,25,25,25,25], chances:[10,20,30,40,50], label:'点三杯后加第四杯'},
  {id:'merchant-extra', name:'增加额外商人概率', prices:[10,20,30,40], chances:[10,30,50,100], label:'额外出现一位商人'},
  scavengeFreeUpgrade, scavengeChanceUpgrade
];
const extraUpgradeList = document.querySelector('#extra-upgrades');
for (const upgrade of extraUpgrades) {
  upgrade.level = 0;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'buy-'+upgrade.id;
  button.className = 'extra-upgrade';
  button.innerHTML = `<span>${upgrade.name}<small></small></span><strong></strong>`;
  button.onclick = () => {
    if (upgrade.scavenge && scavengeLevel === 0) return;
    const cost = upgrade.prices[upgrade.level];
    purchaseUpgrade(cost, () => upgrade.level++);
  };
  upgrade.button = button;
  extraUpgradeList.append(button);
}

function upgradeChance(upgrade, next = 0) {
  return upgrade.chances?.[upgrade.level+next-1] ?? 0;
}
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function updateUpgrade() {
  const scavengePrice = scavengeUpgradePrice();
  buyScavengeUpgrade.hidden = scavengePrice === undefined;
  buyScavengeUpgrade.disabled = scavengePrice === undefined || balance < scavengePrice*10;
  if (scavengePrice !== undefined) {
    buyScavengeUpgrade.querySelector('span > span').textContent =
      ['解锁拾荒技能','在拾荒奖品池中加入小箱','在拾荒奖品池中删除迷你箱'][scavengeLevel];
    buyScavengeUpgrade.querySelector('small').textContent = scavengeLevel === 0
      ? '营业结束后可以出门拾荒' : '当前奖品池：'+scavengePrizeTypes().map(type => boxTypes[type].name).join('、');
    buyScavengeUpgrade.querySelector('strong').textContent = scavengePrice+' 金币';
  }
  const dailyPrice = dailyUpgradePrices[customersPerDay-baseDailyCustomers];
  document.querySelector('#daily-count').textContent = dailyPrice === undefined
    ? `每天 ${customersPerDay} 位` : `每日 ${customersPerDay} 位 → 每日 ${customersPerDay+1} 位`;
  document.querySelector('#daily-price').textContent = dailyPrice === undefined ? '已满级' : `${dailyPrice} 金币`;
  buyDaily.disabled = dailyPrice === undefined || balance < dailyPrice*10;
  const walletPrice = walletPrices[walletLevel];
  document.querySelector('#wallet-level').textContent = walletPrice === undefined
    ? '每位顾客都会多点一杯' : `多点一杯的概率 ${walletLevel*10}% → ${(walletLevel+1)*10}%`;
  document.querySelector('#wallet-price').textContent = walletPrice === undefined ? '已满级' : `${walletPrice} 金币`;
  buyWallet.disabled = walletPrice === undefined || balance < walletPrice*10;
  const typePrice = merchantTypePrices[merchantTypeLevel];
  const countPrice = merchantCountPrices[merchantItemCount-1];
  document.querySelector('#merchant-type-level').textContent = typePrice === undefined
    ? '最高可卖大箱' : `下次来访可卖${boxTypes[merchantTypes[merchantTypeLevel+1]].name}`;
  document.querySelector('#merchant-type-price').textContent = typePrice === undefined ? '已满级' : `${typePrice} 金币`;
  buyMerchantType.disabled = typePrice === undefined || balance < typePrice*10;
  document.querySelector('#merchant-count-level').textContent = countPrice === undefined
    ? '每次带 5 箱' : `下次来访带 ${merchantItemCount+1} 箱`;
  document.querySelector('#merchant-count-price').textContent = countPrice === undefined ? '已满级' : `${countPrice} 金币`;
  buyMerchantCount.disabled = countPrice === undefined || balance < countPrice*10;
  for (const upgrade of extraUpgrades) {
    const cost = upgrade.prices[upgrade.level];
    upgrade.button.hidden = upgrade.scavenge && scavengeLevel === 0;
    const current = upgradeChance(upgrade);
    const nextLevel = Math.min(upgrade.level+1,upgrade.prices.length);
    let detail;
    if (upgrade === scavengeFreeUpgrade) {
      detail = `每日无负面影响次数：${upgrade.level} → ${nextLevel}`;
      if (cost === undefined) detail = `每日 ${upgrade.level} 次无负面影响的拾荒`;
    } else if (upgrade === scavengeChanceUpgrade) {
      detail = '前几次成功率：'+[...Array(nextLevel+3)].map((_,i) => scavengeChance(i,nextLevel)+'%').join('、');
    } else {
      detail = cost === undefined
        ? `${upgrade.label} ${current}%` : `${upgrade.label} ${current}% → ${upgradeChance(upgrade,1)}%`;
    }
    upgrade.button.querySelector('small').textContent = detail;
    upgrade.button.querySelector('strong').textContent = cost === undefined ? '已满级' : `${cost} 金币`;
    upgrade.button.disabled = cost === undefined || balance < cost*10;
  }
  const costs = [scavengePrice,dailyPrice,walletPrice,typePrice,countPrice,
    ...extraUpgrades.filter(upgrade => !upgrade.button.hidden).map(upgrade => upgrade.prices[upgrade.level])].filter(cost => cost !== undefined);
  const affordable = costs.filter(cost => balance >= cost*10).length;
  setFooterBadge('upgrade-badge',affordable);
  document.querySelector('#upgrade-status').textContent = affordable < costs.length ? '部分升级金币不足' : '';
}

document.querySelector('#upgrade').onclick = () => {
  if (storyStage) return;
  updateUpgrade();
  upgradeMenu.showModal();
};
function showNextUpgradeTutorial() {
  const tutorial = upgradeTutorials.shift();
  if (!tutorial) return false;
  showStory(...tutorial);
  storyNext.textContent = '知道了';
  storyNext.focus();
  updateScavengeAvailability();
  return true;
}
upgradeMenu.addEventListener('close', showNextUpgradeTutorial);
document.querySelector('#close-upgrade').onclick = () => upgradeMenu.close();
upgradeMenu.onclick = event => {
  if (event.target === upgradeMenu) upgradeMenu.close();
};
buyDaily.onclick = () => {
  const price = dailyUpgradePrices[customersPerDay-baseDailyCustomers];
  purchaseUpgrade(price, () => customersPerDay++);
};

buyWallet.onclick = () => {
  const price = walletPrices[walletLevel];
  purchaseUpgrade(price, () => walletLevel++);
};

buyMerchantType.onclick = () => {
  const price = merchantTypePrices[merchantTypeLevel];
  purchaseUpgrade(price, () => {
    merchantTypeLevel++;
    if (merchantTypeLevel === 1) {
      upgradeTutorials.push(['small-box',
        '迷你箱里装的是迷你杯，2 份水就能装满。小箱里装的是小杯，要 3 份水才能装满。小杯的售价是 3 份水的总价 × 1.1，也就是多卖 10%。多卖小杯，就能多赚些金币。顾客只挑口味。只要口味对，装满的迷你杯和小杯他们都收。']);
    }
  });
};
buyMerchantCount.onclick = () => {
  const price = merchantCountPrices[merchantItemCount-1];
  purchaseUpgrade(price, () => merchantItemCount++);
};

const rentWarning = document.querySelector('#rent-warning');
let pendingPurchase = null;

function confirmSpending(price, action, purchase) {
  if (pendingPurchase || balance < price) return;
  const rent = Math.round(dailyRent()*10);
  const remaining = roundMoney(balance-price);
  if (remaining >= rent) {
    purchase();
    return;
  }
  rentWarning.querySelector('h2').textContent = `${action}后余额不足以支付今天的租金`;
  rentWarning.querySelector('#rent-warning-detail').textContent =
    `今日租金 ${coinText(rent)} 金币，当前余额 ${coinText(balance)} 金币，` +
    `${action}花费 ${coinText(price)} 金币，之后剩余 ${coinText(remaining)} 金币。`;
  rentWarning.returnValue = '';
  pendingPurchase = () => { if (!gameOver && balance >= price) purchase(); };
  rentWarning.showModal();
}

rentWarning.addEventListener('close', () => {
  const purchase = pendingPurchase;
  pendingPurchase = null;
  if (rentWarning.returnValue === 'confirm') purchase?.();
});

function purchaseUpgrade(price, applyUpgrade) {
  if (price === undefined) return;
  confirmSpending(price*10,'升级',() => {
    applyUpgrade();
    spendCoins(price*10,'upgrade');
  });
}

function spendCoins(price, sound = 'spend') {
  playSound(sound);
  balance = roundMoney(balance-price);
  displayedBalance = balance;
  balanceLabel.textContent = coinText(displayedBalance);
  balanceLabel.getAnimations().forEach(animation => animation.cancel());
  updateUpgrade();
}

function rewardDelivery(held, cupStock, customer) {
  const board = shop.getBoundingClientRect();
  const cup = held.isConnected ? held.getBoundingClientRect() : {x:board.x+board.width*.27,y:board.y,width:0,height:0};
  const meter = balanceLabel.getBoundingClientRect();
  const token = document.createElement('span');
  token.className = 'coin-reward';
  const unitPrice = customer.wholesale?.price ?? effectivePrice(cupStock.water[0]);
  const amount = roundMoney(unitPrice*cupStock.capacity*
    (cupStock.capacity === smallCapacity ? 1.1 : 1));
  token.textContent = `+${coinText(amount)}`;
  token.setAttribute('aria-hidden', 'true');
  shop.append(token);
  rewards.push({token, amount, elapsed:0, x:cup.x+cup.width/2-board.x, y:cup.y+cup.height/2-board.y,
    endX:meter.x+meter.width/2-board.x, endY:meter.y+meter.height/2-board.y});
}

function updateCoins(ms) {
  for (let i = rewards.length-1; i >= 0; i--) {
    const reward = rewards[i];
    reward.elapsed += ms;
    const t = clamp(reward.elapsed/(reducedMotion.matches ? 80 : 580));
    const progress = ease(t);
    const x = reward.x+(reward.endX-reward.x)*progress;
    const y = reward.y+(reward.endY-reward.y)*progress-28*Math.sin(Math.PI*t);
    reward.token.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    reward.token.style.opacity = 1-.6*t;
    if (t === 1) {
      reward.token.remove();
      rewards.splice(i,1);
      balance = roundMoney(balance+reward.amount);
      playSound('earn');
      updateUpgrade();
    }
  }
  if (displayedBalance >= balance) { rollElapsed = 0; return; }
  rollElapsed += ms;
  if (rollElapsed < 120) return;
  rollElapsed -= 120;
  displayedBalance = Math.min(balance,displayedBalance+10);
  balanceLabel.textContent = coinText(displayedBalance);
  if (!reducedMotion.matches) balanceLabel.animate(
    [{transform:'translateY(100%)'},{transform:'translateY(0)'}],
    {duration:115,easing:'ease-out'}
  );
}

const firstDayCustomers = 5;
const baseDailyCustomers = 6;
const dailyUpgradePrices = Array.from({length:28}, (_, tier) => 3+tier);
let customersPerDay = baseDailyCustomers;
let todayCustomerCount = firstDayCustomers;
let scavengingAttempts = 0;
let freeScavengingUsed = 0;
let merchantPending = 0;
let customersArrived = 0;
let traderArrival = 0;
let wholesaleArrival = 0;
let preorderArrival = 0;
let wagerArrival = 0;
let wagers = [];
let wagerResults = [];
let marketHistory = [{day:1,prices:market.map(fruit => fruit.price)}];
let preorders = [];
let day = 1;
let gameOver = false;
let started = false;
const shopPrice = 100_000; // 10,000 coins, in tenths.
const recordKey = 'colorpop-best-ending';
const startScreen = document.querySelector('#start-screen');
const shopTools = document.querySelector('#shop-tools');
const buyShop = document.querySelector('#buy-shop');
const bestRecordLabel = document.querySelector('#best-record');
let bestRecord = null;
try {
  const saved = JSON.parse(localStorage.getItem(recordKey));
  if (saved && Number.isSafeInteger(saved.day) && saved.day > 0 &&
      ['bought','bankrupt','unfinished','abandoned'].includes(saved.ending)) {
    bestRecord = {...saved,ending:saved.ending === 'unfinished' ? 'abandoned' : saved.ending};
  }
} catch {}
const endingNames = {bought:'买店',bankrupt:'破产',abandoned:'放弃'};
const endingLabel = ({day,ending}) => `第 ${day} 天${endingNames[ending]}`;
if (bestRecord) bestRecordLabel.textContent = endingLabel(bestRecord);

function recordEnding(ending, endingDay) {
  const better = !bestRecord || (bestRecord.ending === 'bought'
    ? ending === 'bought' && endingDay < bestRecord.day
    : ending === 'bought' || endingDay > bestRecord.day ||
      (endingDay === bestRecord.day && bestRecord.ending === 'abandoned' && ending === 'bankrupt'));
  if (!better) return;
  bestRecord = {day:endingDay,ending};
  bestRecordLabel.textContent = endingLabel(bestRecord);
  try { localStorage.setItem(recordKey,JSON.stringify(bestRecord)); } catch {}
}
const saveKey = 'colorpop-saved-game-v1';
function clearSavedGame() {
  try { localStorage.removeItem(saveKey); } catch {}
}
const rentGrowthPercent = 10;
const dailyRent = () => day < 2 ? 0 : Math.round(30*(1+rentGrowthPercent/100)**(day-2))/10;
const starterDebt = 100; // Ten coins, in tenths.
const firstOrders = [3,2,3,2,3];
const story = document.querySelector('#story');
const storyText = document.querySelector('#story-text');
const storyNext = document.querySelector('#story-next');
const mentor = document.querySelector('#mentor');
const storyRefuse = document.querySelector('#story-refuse');

function setStoryText(text) {
  const amounts = /×\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:金币|%|位客人|份水|杯|单|天)/g;
  const keywords = /「仓库」|「升级」|买下这家店|免费|自己调|货款|租金|进货|破产|行情|价格会浮动|收回整箱饮料|迷你箱|迷你杯|小箱|小杯/g;
  const matches = [
    ...Array.from(text.matchAll(amounts), match => ({match, className:'story-amount'})),
    ...Array.from(text.matchAll(keywords), match => ({match, className:'story-keyword'}))
  ].sort((a,b) => a.match.index-b.match.index);
  const parts = [];
  let cursor = 0;
  for (const {match,className} of matches) {
    parts.push(text.slice(cursor,match.index));
    const highlight = document.createElement('strong');
    highlight.className = className;
    highlight.textContent = match[0];
    parts.push(highlight);
    cursor = match.index+match[0].length;
  }
  parts.push(text.slice(cursor));
  storyText.replaceChildren(...parts);
}
let storyStage = 'intro';
let storyLine = 0;
let mentorExit;

function showStory(stage, text) {
  storyStage = stage;
  shop.dataset.story = stage;
  story.hidden = false;
  mentorExit?.cancel();
  mentor.hidden = false;
  mentor.style.left = '';
  if (stage === 'influencer') {
    const occupied = new Set(customers.filter(person => person.phase !== 'exit').map(person => person.slot));
    if (occupied.size) mentor.style.left = `${customerSlots.find(slot => !occupied.has(slot)) ?? 75}%`;
  }
  mentor.classList.remove('arrive');
  void mentor.offsetWidth;
  mentor.classList.add('arrive');
  setStoryText(text);
  storyRefuse.hidden = stage !== 'repay';
  storyNext.textContent = '继续';
}

document.querySelector('#start-game').onclick = () => {
  if (started) return;
  clearSavedGame();
  started = true;
  playSound('click');
  startScreen.hidden = true;
  shop.hidden = false;
  shopTools.hidden = false;
  showStory('intro','身上没钱？来，我教你做点生意。这是我的摊位，今天先免费借你用 1 天。等你攒够 10000 金币，就可以买下这家店。');
  storyNext.focus();
};
storyNext.onclick = () => {
  if (storyStage === 'intro' && storyLine++ === 0) {
    const box = addBox(0);
    box.starter = true;
    openBox(box,'gift');
    setStoryText(`低价买进，高价卖出，这是做生意的基本功。我先赊你一箱饮料，这箱一共 ${box.count} 杯。`);
    return;
  }
  if (storyStage === 'intro' && storyLine === 2) {
    setStoryText('今天有 5 位客人，照着他们要的口味拿杯。前 2 杯已经调好了，后面 3 单要你自己调，每杯能卖 2 金币。明天开摊前，我会来收这箱饮料的货款，一共 10 金币。');
    storyNext.textContent = '开始营业';
    return;
  }
  if (storyStage === 'repay') {
    if (!payBill(starterDebt,'货款',1)) return;
    explainRent();
    return;
  }
  if (storyStage === 'refused') {
    explainRent(true);
    return;
  }
  if (storyStage === 'rent') {
    storyStage = 'stock';
    shop.dataset.story = storyStage;
    setStoryText('下面的「仓库」用来存箱子。之后会有人来卖箱子，记得留点金币进货。要是手头没货，又买不起新箱子，就会破产。');
    storyNext.textContent = '开始第二天';
    return;
  }
  if (showNextUpgradeTutorial()) return;
  const opening = storyStage === 'intro';
  storyStage = '';
  delete shop.dataset.story;
  story.hidden = true;
  mentor.classList.remove('arrive');
  if (reducedMotion.matches) {
    mentor.hidden = true;
    mentor.querySelector('.carried-box')?.remove();
  } else {
    if (opening) shop.classList.add('hud-enter');
    mentorExit = mentor.animate(
      [{transform:'translateX(0)'},{transform:'translateX(510%)'}],
      {duration:1150,easing:'linear'}
    );
    mentorExit.onfinish = () => {
      mentor.hidden = true;
      mentor.querySelector('.carried-box')?.remove();
      shop.classList.remove('hud-enter');
    };
  }
  updateQueue();
  say('拿起顾客想要的饮料');
};
function explainRent(refused = false) {
  storyStage = 'rent';
  shop.dataset.story = storyStage;
  rentLabel.textContent = `今日租金 ${dailyRent()} 金币`;
  setStoryText((refused ? '' : '货款收到了。') + `这个摊位从今天起正式租给你，今天收摊交 3 金币租金，以后每天涨 ${rentGrowthPercent}%。手头宽裕了，可以点下面的「升级」，把摊位经营得更好。`);
  storyNext.textContent = '继续';
  storyRefuse.hidden = true;
}

storyRefuse.onclick = async () => {
  if (storyStage !== 'repay') return;
  storyStage = 'refused';
  storyNext.textContent = '我靠！';
  shop.dataset.story = storyStage;
  storyRefuse.hidden = true;
  const box = boxes.find(box => box.starter);
  setStoryText(box
    ? '说好的货款，你怎么能不交？这箱货我收回了。（主理人收回整箱饮料。）'
    : '说好的货款，你怎么能不交？那箱货的事就到这儿吧。');
  if (box) {
    storyNext.disabled = true;
    await reclaimStarterBox(box);
    storyNext.disabled = false;
  }
  storyNext.focus();
};

async function reclaimStarterBox(box) {
  const stock = cups.filter(cup => ['table','storage'].includes(cup.place) &&
    Math.floor(cup.spot/boxStride) === box.id);
  const board = shop.getBoundingClientRect();
  const bounds = box.el?.isConnected ? box.el.getBoundingClientRect() : null;
  const width = bounds?.width ?? board.width*.45;
  const height = bounds?.height ?? board.height*.2;
  const left = bounds ? bounds.left-board.left : (board.width-width)/2;
  const top = bounds ? bounds.top-board.top : board.height*.425;
  const parcel = document.createElement('div');
  parcel.className = 'carried-box stock-box';
  parcel.setAttribute('aria-hidden','true');
  Object.assign(parcel.style,{width:`${width}px`,height:`${height}px`,left:`${left}px`,top:`${top}px`});
  stock.forEach(cup => {
    const [x,y,angle] = box.poses[cup.spot%boxStride];
    const drink = document.createElement('div');
    drink.className = 'carried-drink';
    drink.innerHTML = svg(cup.water,`reclaimed-${cup.id}`,cup.capacity);
    Object.assign(drink.style,{
      left:`${board.width*.08+x*(width-board.width*.16)}px`,
      top:`${board.height*.04+y*(height-board.height*.08)}px`,
      width:`${board.width*.16*TABLE_SCALE}px`,height:`${board.height*.08*TABLE_SCALE*cupHeight(cup.capacity)}px`,
      transform:`translate(-50%,-50%) rotate(${angle}deg)`
    });
    parcel.append(drink);
    stopFeedback(cup);
    cup.el.remove();
  });
  const removed = new Set(stock);
  cups = cups.filter(cup => !removed.has(cup));
  boxes.splice(boxes.indexOf(box),1);
  box.el?.remove();
  layoutBoxes();
  updateInventory();

  shop.append(parcel);
  playSound('box');
  const scale = mentor.offsetWidth*.92/width;
  const handX = mentor.offsetWidth*.65;
  const tableTop = document.querySelector('#table').offsetTop;
  const handY = Math.min(mentor.offsetHeight*.29, tableTop-mentor.offsetTop-height*scale-10);
  if (!reducedMotion.matches) {
    const dx = mentor.offsetLeft+handX-left;
    const dy = mentor.offsetTop+handY-top;
    await parcel.animate([
      {transform:'translate(0,0) scale(1)'},
      {transform:`translate(${dx}px,${dy}px) scale(${scale})`}
    ],{duration:430,easing:'ease-in-out'}).finished;
  }
  Object.assign(parcel.style,{left:`${handX}px`,top:`${handY}px`,transform:`scale(${scale})`});
  mentor.append(parcel);
}

let unseated = firstDayCustomers;
const dayLabel = document.querySelector('#day-number');
const queueLabel = document.querySelector('#queue-count');
const closeDay = document.querySelector('#close-day');
const rentLabel = document.querySelector('#rent-today');
const rentFailure = document.querySelector('#rent-failure');

for (const dialog of [rentFailure,buyShop]) {
  dialog.addEventListener('cancel', event => event.preventDefault());
}
document.querySelector('#confirm-buy-shop').onclick = () => {
  if (!buyShop.open || gameOver || balance < shopPrice) return;
  gameOver = true;
  clearSavedGame();
  spendCoins(shopPrice);
  recordEnding('bought',day);
  buyShop.close();
  document.querySelector('#rent-failure-title').textContent = '买店成功';
  document.querySelector('#rent-failure-detail').textContent = endingLabel({day,ending:'bought'});
  rentFailure.showModal();
};
document.querySelector('#restart-shop').onclick = () => location.reload();

function waitingCount() {
  return unseated + merchantPending;
}

function remainingPeople() {
  return waitingCount() + customers.filter(person => person.phase !== 'exit').length;
}

function updateQueue() {
  const waiting = waitingCount();
  const done = remainingPeople() === 0;
  shop.classList.toggle('queue-empty',done);
  queueLabel.textContent = done ? '今天没有客人了' : `还有 ${waiting} 人在排队`;
  if (done) say('今天没有客人了，点击收摊进入下一天');
  updateScavengeAvailability();
}

function payBill(amount, bill, billDay = day) {
  if (balance >= amount) {
    spendCoins(amount);
    return true;
  }
  gameOver = true;
  clearSavedGame();
  recordEnding('bankrupt',billDay);
  document.querySelector('#rent-failure-title').textContent = `${bill}不足，营业结束`;
  document.querySelector('#rent-failure-detail').textContent =
    `第 ${billDay} 天需付 ${coinText(amount)} 金币${bill}，手上有 ${coinText(balance)} 金币，还差 ${coinText(amount-balance)} 金币。`;
  rentFailure.showModal();
  return false;
}

const dayBanner = document.querySelector('#day-banner');
let dayBannerAnimation;
function showDayBanner(label) {
  dayBannerAnimation?.cancel();
  dayBanner.textContent = label;
  dayBanner.hidden = false;
  const frames = reducedMotion.matches
    ? [{opacity:1},{opacity:1}]
    : [{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0)',offset:.23},
      {clipPath:'inset(0)',offset:.74},{clipPath:'inset(0 0 0 100%)'}];
  dayBannerAnimation = dayBanner.animate(frames,{duration:1150,easing:'ease-in-out'});
  dayBannerAnimation.onfinish = () => { dayBanner.hidden = true; };
}

function connectSlidingPanel(panel, closeSelector) {
  let closing = false;
  function closePanel() {
    if (!panel.open || closing) return;
    if (reducedMotion.matches) {
      panel.close();
      return;
    }
    closing = true;
    panel.inert = true;
    const animation = panel.animate([
      {transform:getComputedStyle(panel).transform},
      {transform:panel === inventory ? 'translateY(100%)' : 'translateY(100dvh)'}
    ], {duration:250,easing:'ease-in',fill:'forwards'});
    animation.onfinish = () => {
      panel.close();
      animation.cancel();
      panel.inert = false;
      closing = false;
    };
  }
  document.querySelector(closeSelector).onclick = closePanel;
  panel.addEventListener('cancel', event => {
    event.preventDefault();
    closePanel();
  });
}

const openScavenge = document.querySelector('#open-scavenge');
function updateScavengeAvailability() {
  openScavenge.hidden = scavengeLevel === 0 || Boolean(storyStage) || remainingPeople() > 0;
}

const scavengeMenu = document.querySelector('#scavenge-menu');
const scavengeButton = document.querySelector('#try-scavenge');
const scavengeResult = document.querySelector('#scavenge-result');
const tomorrowCustomers = () => customersPerDay-(scavengingAttempts-freeScavengingUsed);
const freeScavengingRemaining = () => scavengeFreeUpgrade.level-freeScavengingUsed;
function scavengeChance(attempt = scavengingAttempts, level = scavengeChanceUpgrade.level) {
  if (attempt < level) return 50+10*(level-attempt);
  return [50,20,10][attempt-level] ?? 5;
}

function updateScavenge() {
  const free = freeScavengingRemaining();
  const remaining = tomorrowCustomers()+free;
  document.querySelector('#scavenge-customers').textContent = tomorrowCustomers();
  document.querySelector('#scavenge-free-count').hidden = free === 0;
  document.querySelector('#scavenge-free-attempts').textContent = free;
  document.querySelector('#scavenge-prizes').textContent = '奖品池：'+scavengePrizeTypes().map(type => boxTypes[type].name).join('、');
  document.querySelector('#scavenge-attempts').textContent = remaining;
  document.querySelector('#scavenge-percent').textContent = `${scavengeChance()}%`;
  document.querySelector('#scavenge-chance').hidden = remaining === 0;
  document.querySelector('#scavenge-exhausted').hidden = remaining > 0;
  scavengeButton.disabled = remaining === 0;
}

openScavenge.onclick = () => {
  if (openScavenge.hidden || gameOver || storageFlightsActive) return;
  updateScavenge();
  scavengeMenu.showModal();
};
connectSlidingPanel(scavengeMenu, '#close-scavenge');
scavengeButton.onclick = () => {
  if (!scavengeMenu.open || tomorrowCustomers()+freeScavengingRemaining() <= 0) return;
  const found = Math.random()*100 < scavengeChance();
  if (freeScavengingRemaining() > 0) freeScavengingUsed++;
  scavengingAttempts++;
  let prize;
  if (found) {
    const types = scavengePrizeTypes();
    prize = addBox(types[Math.floor(Math.random()*types.length)]);
    queueStorageFlight(prize,scavengeButton);
  }
  scavengeResult.dataset.outcome = found ? 'success' : 'failure';
  scavengeResult.textContent = found ? `捡到一个${prize.name}，已放入仓库。` : '这次没捡到箱子。';
  updateScavenge();
};

const closeDayWarning = document.querySelector('#close-day-warning');
closeDay.onclick = () => {
  if (!canCloseDay()) return;
  if (day >= 10 && remainingPeople() > 0) {
    unseated = 0;
    merchantPending = 0;
    for (const person of customers) {
      if (person.phase !== 'exit') sendCustomerAway(person);
    }
    updateQueue();
    return;
  }
  const waiting = waitingCount();
  if (!waiting) {
    settleDay();
    return;
  }
  closeDayWarning.querySelector('#close-day-warning-detail').textContent =
    `今天还剩 ${remainingPeople()} 人，你确定要收摊吗？`;
  closeDayWarning.returnValue = '';
  closeDayWarning.showModal();
};

closeDayWarning.addEventListener('close', () => {
  if (closeDayWarning.returnValue === 'confirm') settleDay();
});

function canCloseDay() {
  return !gameOver && !buyShop.open && !storyStage && !cupDrag?.active && !busy && !cupActions.length && !rewards.length;
}

function specialArrivals(customerCount, currentDay) {
  const arrivals = [0,0,0,0];
  if (currentDay < 6) return arrivals;
  const slots = Array.from({length:customerCount}, (_,i) => i+1);
  const chosen = arrivals.map((_,i) => i).filter(i => (i !== 3 || maxWagerStake() >= 1) && Math.random() < .10);
  let quota = Math.floor(customerCount/5);
  while (quota > 0 && chosen.length) {
    const role = chosen.splice(Math.floor(Math.random()*chosen.length),1)[0];
    arrivals[role] = slots.splice(Math.floor(Math.random()*slots.length),1)[0];
    quota--;
  }
  return arrivals;
}

function settleDay() {
  if (!canCloseDay()) return;
  setTransferSource(null);
  const firstSettlement = day === 1;
  const rent = dailyRent();
  if (!settlePreorders()) return;
  if (!firstSettlement && !payBill(Math.round(rent*10),'租金')) return;
  for (const person of customers) person.el.remove();
  customers = [];
  todayCustomerCount = tomorrowCustomers();
  scavengingAttempts = 0;
  freeScavengingUsed = 0;
  scavengeResult.textContent = '';
  unseated = todayCustomerCount;
  customersArrived = 0;
  dayLabel.textContent = `第 ${++day} 天`;
  for (const fruit of market) {
    if (fruit.influencers) fruit.influencers = fruit.influencers.filter(effect => effect.end >= day);
  }
  showDayBanner(dayLabel.textContent);
  if (day >= 4) advanceMarket(day === 4);
  else showMarket();
  marketHistory = [...marketHistory,{day,prices:market.map(fruit => fruit.price)}].slice(-3);
  settleWagers();
  [traderArrival,wholesaleArrival,preorderArrival,wagerArrival] = specialArrivals(unseated,day);
  merchantPending = day >= 2
    ? 1 + Number(Math.random()*100 < upgradeChance(extraUpgrades[2]))
    : 0;
  rentLabel.textContent = `今日租金 ${dailyRent()} 金币`;
  if (firstSettlement) {
    rentLabel.textContent = '待付货款 10 金币';
    showStory('repay','我来收昨天赊给你的那箱饮料的货款了。按咱们说好的，交给我 10 金币就行。');
    storyNext.textContent = '交出 10 金币';
  } else if (day === 3) {
    showStory('market','注意到右上角的颜色和数字了吗？那是每份饮料的行情。从明天（第 4 天）开始，右上角的价格就会变化。可以趁便宜进货，等手里的口味涨价了再卖。');
    storyNext.textContent = '开始第 3 天';
  } else {
    say(`已付 ${rent} 金币租金，新的一天开始了`);
  }
  updateQueue();
}

const skipTip = document.querySelector('#skip-tip');
let skipTipSeen = false;

function dismissSkipTip() {
  skipTipSeen = true;
  skipTip.hidden = true;
}
document.querySelector('#close-skip-tip').onclick = dismissSkipTip;
document.querySelector('#confirm-skip-tip').onclick = dismissSkipTip;

function updateSkipTip() {
  if (skipTipSeen || !skipTip.hidden || busy || cupActions.length || storyStage) return;
  const stock = colors.map(() => 0);
  const capacities = [];
  for (const cup of cups) {
    if (!['hand','table','storage'].includes(cup.place)) continue;
    capacities.push(cup.capacity);
    for (const color of cup.water) stock[color]++;
  }
  for (const box of boxes) {
    if (box.opened || !box.offerStock) continue;
    for (const water of box.offerStock) {
      capacities.push(water.length);
      for (const color of water) stock[color]++;
    }
  }
  const minimum = Math.min(...capacities);
  const customer = customers.find(p => p.phase === 'waiting' && !p.merchant &&
    p.orders.some(color => stock[color] < minimum));
  if (customer) skipTip.hidden = false;
}

const returnTip = document.querySelector('#return-tip');
let returnTipClosed = false;
let lastReturnTipCheck = '';

function dismissReturnTip() {
  returnTipClosed = true;
  returnTip.hidden = true;
}
document.querySelector('#close-return-tip').onclick = dismissReturnTip;
document.querySelector('#confirm-return-tip').onclick = dismissReturnTip;

function canMakeOrder(hand, wanted) {
  const pending = [hand.map(cup => cup.water)];
  const seen = new Set();
  while (pending.length) {
    const water = pending.pop();
    const key = JSON.stringify(water);
    if (seen.has(key)) continue;
    seen.add(key);
    if (water.some((cup,i) => complete({water:cup,capacity:hand[i].capacity}) && wanted.has(cup[0]))) return true;
    for (const [from, source] of water.entries()) {
      if (!source.length) continue;
      for (const [to, target] of water.entries()) {
        if (from === to || target.length === hand[to].capacity) continue;
        const amount = pourAmount(source,hand[to].capacity-target.length);
        const next = water.map(cup => [...cup]);
        next[to].push(...next[from].splice(-amount));
        pending.push(next);
      }
    }
  }
  return false;
}

function updateReturnTip() {
  if (returnTipClosed || !returnTip.hidden || storyStage || busy || cupActions.length) return;
  const hand = cups.filter(cup => cup.place === 'hand');
  const wanted = new Set(customers.filter(p => p.phase === 'waiting' && !p.merchant).flatMap(p => p.orders));
  if (hand.length !== 3 || !wanted.size) return;
  const key = JSON.stringify([hand.map(cup => [cup.capacity,cup.water]),[...wanted]]);
  if (key === lastReturnTipCheck) return;
  lastReturnTipCheck = key;
  const portions = hand.flatMap(cup => cup.water);
  const enough = [...wanted].filter(color => portions.filter(portion => portion === color).length >= 2);
  if (!enough.length || !canMakeOrder(hand,new Set(enough))) returnTip.hidden = false;
}

function sendCustomerAway(person) {
  person.phase = 'exit';
  person.target = 120;
  person.dismiss.disabled = true;
  updateQueue();
}

function makeOrders() {
  if (day === 1) return [firstOrders[customersArrived-1]];
  let count = 1;
  if (walletLevel && Math.random()*100 < walletLevel*10) {
    count++;
    if (Math.random()*100 < upgradeChance(extraUpgrades[0])) {
      count++;
      if (Math.random()*100 < upgradeChance(extraUpgrades[1])) count++;
    }
  }
  return Array.from({length:count}, () => Math.floor(Math.random()*colors.length));
}

function showOrders(person) {
  const bubble = person.el.querySelector('.bubble');
  bubble.replaceChildren();
  for (const color of person.orders) {
    const dot = document.createElement('span');
    dot.style.background = colors[color];
    dot.title = names[color];
    bubble.append(dot);
  }
  bubble.dataset.orders = person.orders.length;
  person.color = person.orders[0] ?? null;
  person.el.setAttribute('aria-label', `顾客还要${person.orders.map(color => names[color]).join('、')}`);
}

function newPerson(slot) {
  const p = {id:personSerial++, orders:makeOrders(), x:-30,
    target:slot, slot, phase:'enter', held:null};
  p.el = document.createElement('div');
  p.el.className = 'person';
  p.el.innerHTML = `<div class="head"></div><div class="body"></div>
    <div class="bubble"></div>
    <button type="button" class="dismiss-customer" disabled>撵走</button>`;
  showOrders(p);
  p.dismiss = p.el.querySelector('button');
  p.dismiss.onclick = () => {
    if (p.phase !== 'waiting') return;
    sendCustomerAway(p);
  };
  people.append(p.el);
  return p;
}
const traderMenu = document.querySelector('#trader-menu');
const traderAccept = document.querySelector('#trader-accept');
let activeTrader = null;

function traderFee() {
  let portions = cups.reduce((total,cup) => total+(cup.place === 'delivery' ? 0 : cup.water.length),0);
  for (const box of boxes) {
    if (box.opened) continue;
    box.offerStock ??= generateStock(box);
    portions += box.offerStock.reduce((total,cup) => total+cup.length,0);
  }
  const cupEquivalent = portions/2;
  const low = Math.max(1,Math.ceil(cupEquivalent*.20));
  const high = Math.max(low,Math.floor(cupEquivalent*.30));
  const originalFee = low+Math.floor(Math.random()*(high-low+1));
  return originalFee*10/2;
}

function generateTraderDeal() {
  const flavors = market.map((_,i) => i)
    .filter(i => !market[i].rise && !(market[i].floor?.end > day));
  const flavor = flavors[Math.floor(Math.random()*flavors.length)];
  const kind = Math.random() < .5 ? 'floor' : 'rise';
  const days = 2+Math.floor(Math.random()*2);
  const amount = kind === 'floor'
    ? 6+Math.floor(Math.random()*15)
    : 5+Math.floor(Math.random()**2*16);
  const from = effectivePrice(flavor);
  return {flavor,kind,days,amount,from,fee:traderFee()};
}

function makeTrader(slot, savedDeal = null) {
  const person = newPerson(slot);
  person.orders = [];
  person.color = null;
  person.el.classList.add('merchant','trader');
  person.el.setAttribute('aria-label','操盘手');
  person.el.querySelector('.bubble').textContent = '我跟你谈个生意';
  const glasses = document.createElement('span');
  glasses.className = 'trader-glasses';
  glasses.setAttribute('aria-hidden','true');
  person.el.querySelector('.head').append(glasses);

  person.deal = savedDeal ?? generateTraderDeal();
  const offerButton = document.createElement('button');
  offerButton.type = 'button';
  offerButton.className = 'merchant-offer';
  offerButton.textContent = '谈生意';
  offerButton.onclick = () => {
    if (person.phase !== 'waiting') return;
    activeTrader = person;
    const deal = person.deal;
    const terms = deal.kind === 'floor'
      ? `从明天起 ${deal.days} 天内，${names[deal.flavor]}每份不会低于 ${coinText(deal.amount)} 金币。`
      : `从明天起逐日抬价，${deal.days} 天内让${names[deal.flavor]}每份上涨 ${coinText(deal.amount)} 金币，达到 ${coinText(deal.from+deal.amount)} 金币。`;
    document.querySelector('#trader-terms').textContent = terms;
    traderAccept.textContent = `同意，支付 ${coinText(deal.fee)} 金币`;
    traderAccept.disabled = balance < deal.fee;
    document.querySelector('#trader-status').textContent = traderAccept.disabled ? '金币不足' : '';
    traderMenu.showModal();
  };
  person.el.append(offerButton);
  return person;
}

traderAccept.onclick = () => {
  if (!traderMenu.open || activeTrader?.phase !== 'waiting') return;
  const {flavor,kind,days,amount,from,fee} = activeTrader.deal;
  if (balance < fee) return;
  spendCoins(fee);
  const fruit = market[flavor];
  if (kind === 'floor') {
    fruit.floor = {price:amount,start:day+1,end:day+days};
  } else {
    fruit.target = from+amount;
    fruit.hold = 0;
    fruit.rise = {from,to:fruit.target,start:day,days};
  }
  sendCustomerAway(activeTrader);
  traderMenu.close();
  say('协议已签，明天开始生效');
};

document.querySelector('#trader-decline').onclick = () => {
  if (activeTrader?.phase === 'waiting') sendCustomerAway(activeTrader);
  traderMenu.close();
};
traderMenu.addEventListener('close', () => { activeTrader = null; });

const wholesaleMenu = document.querySelector('#wholesale-menu');
let activeWholesaler = null;

function wholesalePrice(price) {
  if (price <= 5) return Math.min(10,price+1+Math.floor(Math.random()*4));
  if (price <= 10) return price;
  if (price <= 20) return price-1-Math.floor(Math.random()*4);
  return price-4-Math.floor(Math.random()*6);
}

function showWholesaleTerms(person) {
  const {flavor,price,accepted} = person.wholesale;
  if (accepted) showOrders(person);
  else {
    person.el.querySelector('.bubble').textContent = '批发';
    person.color = null;
  }
  person.el.setAttribute('aria-label','批发商');
  person.el.querySelector('.merchant-offer').hidden = accepted;
  const speech = person.el.querySelector('.wholesale-speech');
  speech.hidden = !accepted;
  speech.textContent = `${names[flavor]}每份 ${coinText(price)} 金币，有多少收多少。`;
  person.dismiss.textContent = accepted ? '结束交易' : '撵走';
}

function makeWholesaler(slot, savedOffer) {
  const person = newPerson(slot);
  const flavor = savedOffer?.flavor ?? Math.floor(Math.random()*names.length);
  person.wholesale = savedOffer ?? {flavor,price:wholesalePrice(effectivePrice(flavor)),accepted:false};
  person.orders = person.wholesale.accepted ? [flavor] : [];
  person.el.classList.add('merchant','wholesaler');
  const apron = document.createElement('span');
  apron.className = 'wholesale-apron';
  apron.setAttribute('aria-hidden','true');
  person.el.querySelector('.body').append(apron);
  const talk = document.createElement('button');
  talk.type = 'button';
  talk.className = 'merchant-offer';
  talk.textContent = '谈收购';
  talk.onclick = () => {
    if (person.phase !== 'waiting' || person.wholesale.accepted || busy) return;
    activeWholesaler = person;
    const {price} = person.wholesale;
    document.querySelector('#wholesale-terms').textContent =
      `我按每份 ${coinText(price)} 金币收购${names[flavor]}。同味满杯都收，按杯型结算，有多少收多少。`;
    wholesaleMenu.returnValue = '';
    wholesaleMenu.showModal();
  };
  const speech = document.createElement('p');
  speech.className = 'wholesale-speech';
  person.el.append(talk,speech);
  showWholesaleTerms(person);
  for (const [index,capacity] of (person.wholesale.stack ?? []).entries()) {
    if (wholesaleStackY(index) < -5) break;
    person.el.append(makeHeldCup(person,{water:Array(capacity).fill(flavor),capacity},index));
  }
  return person;
}

wholesaleMenu.addEventListener('close', () => {
  const person = activeWholesaler;
  activeWholesaler = null;
  if (person?.phase !== 'waiting') return;
  if (wholesaleMenu.returnValue === 'accept') {
    person.wholesale.accepted = true;
    person.orders = [person.wholesale.flavor];
    showWholesaleTerms(person);
  } else sendCustomerAway(person);
});

const wagerOffer = document.querySelector('#wager-offer');
const wagerBook = document.querySelector('#wager-book');
const wagerButton = document.querySelector('#wagers');
const wagerStake = document.querySelector('#wager-stake');
const wagerWhole = document.querySelector('#wager-whole');
const wagerDecimal = document.querySelector('#wager-decimal');
const wagerMultiplier = document.querySelector('#wager-multiplier');
const wagerTolerances = {1.1:5,1.2:4,1.5:3,2:2,3:1};
let activeWagerCustomer = null;

function maxWagerStake() {
  return Math.max(0,Math.floor((balance-Math.round(dailyRent()*10))/10));
}

function readWager() {
  const multiplier = Number(wagerMultiplier.value);
  const validPrediction = wagerWhole.validity.valid && wagerDecimal.validity.valid;
  return {
    stake:Number(wagerStake.value)*10,
    prediction:validPrediction ? Number(wagerWhole.value)*10+Number(wagerDecimal.value) : null,
    multiplier,
    tolerance:wagerTolerances[multiplier]
  };
}

function updateWagerQuote() {
  const {stake,prediction,multiplier,tolerance} = readWager();
  const preview = document.querySelector('#wager-preview');
  document.querySelector('#wager-stake-value').textContent = `${coinText(stake)} 金币`;
  const payout = Math.round(stake*multiplier);
  const range = prediction === null ? '请填写预测价。'
    : `命中范围 ${coinText(Math.max(0,prediction-tolerance))}～${coinText(prediction+tolerance)} 金币。`;
  const affordable = stake >= 10 && stake <= maxWagerStake()*10;
  preview.textContent = affordable
    ? `${range} 猜中共返 ${coinText(payout)} 金币（净赚 ${coinText(payout-stake)}），猜错损失本金 ${coinText(stake)} 金币。`
    : '留出今日租金后，余额不足以支付这笔本金。';
  document.querySelector('#wager-sign').disabled = !affordable || prediction === null;
}

wagerOffer.addEventListener('input',updateWagerQuote);
wagerOffer.querySelector('form').addEventListener('submit',event => {
  if (event.submitter?.value !== 'sign') return;
  updateWagerQuote();
  if (document.querySelector('#wager-sign').disabled) event.preventDefault();
});

function makeWagerCustomer(slot,savedOffer) {
  const person = newPerson(slot);
  person.orders = [];
  person.color = null;
  person.wagerOffer = savedOffer ?? {flavor:Math.floor(Math.random()*names.length),due:day+2+Math.floor(Math.random()*3)};
  person.el.classList.add('merchant','wager-customer');
  person.el.setAttribute('aria-label','对赌客');
  person.el.querySelector('.bubble').textContent = '对赌';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'merchant-offer';
  button.textContent = '谈对赌';
  button.onclick = () => {
    if (person.phase !== 'waiting' || busy || cupActions.length) return;
    activeWagerCustomer = person;
    const {flavor,due} = person.wagerOffer;
    document.querySelector('#wager-terms').textContent =
      `预测第 ${due} 天的${names[flavor]}基础行情。签约先付本金，到期开摊自动结算。`;
    const history = document.querySelector('#wager-history');
    history.replaceChildren();
    for (let date = day-2; date <= day; date++) {
      const record = marketHistory.find(entry => entry.day === date);
      const price = date === day ? market[flavor].price : record?.prices[flavor];
      const entry = document.createElement('li');
      entry.textContent = `第 ${date} 天 · ${price === undefined ? '暂无记录' : coinText(price)+' 金币'}`;
      history.append(entry);
    }
    const limit = maxWagerStake();
    wagerStake.max = Math.max(1,limit);
    wagerStake.disabled = limit <= 1;
    wagerStake.value = 1;
    wagerWhole.value = '';
    wagerDecimal.value = '';
    wagerMultiplier.value = 2;
    wagerOffer.returnValue = '';
    updateWagerQuote();
    wagerOffer.showModal();
  };
  person.el.append(button);
  return person;
}

wagerOffer.addEventListener('close',() => {
  const person = activeWagerCustomer;
  activeWagerCustomer = null;
  if (person?.phase !== 'waiting' || gameOver || buyShop.open) return;
  if (wagerOffer.returnValue === 'sign') {
    const terms = readWager();
    if (terms.prediction === null || terms.stake < 10 || terms.stake > maxWagerStake()*10) return;
    spendCoins(terms.stake);
    wagers.push({...person.wagerOffer,...terms});
    updateWagerBook();
  }
  sendCustomerAway(person);
});

function updateWagerBook() {
  wagerButton.hidden = !wagers.length && !wagerResults.length;
  wagerButton.textContent = '对赌';
  const list = document.querySelector('#wager-list');
  list.replaceChildren();
  for (const wager of [...wagers,...wagerResults]) {
    const entry = document.createElement('p');
    const terms = `第 ${wager.due} 天 · ${names[wager.flavor]} · 猜 ${coinText(wager.prediction)} · 本金 ${coinText(wager.stake)} · ${wager.multiplier} 倍`;
    entry.textContent = wager.actual === undefined ? terms+' · 待结算'
      : terms+` · 实际 ${coinText(wager.actual)} · ${wager.payout ? '返还 '+coinText(wager.payout)+' 金币' : '未命中，本金已扣'}`;
    list.append(entry);
  }
}

wagerButton.onclick = () => {
  if (storyStage || gameOver) return;
  updateWagerBook();
  wagerBook.showModal();
};

function settleWagers() {
  const due = wagers.filter(wager => wager.due <= day);
  if (!due.length) return;
  wagers = wagers.filter(wager => wager.due > day);
  let payout = 0;
  for (const wager of due) {
    const actual = market[wager.flavor].price;
    const tolerance = wager.tolerance ?? (4-wager.multiplier);
    const returned = Math.abs(actual-wager.prediction) <= tolerance
      ? Math.round(wager.stake*wager.multiplier) : 0;
    payout += returned;
    wagerResults.unshift({...wager,actual,payout:returned});
  }
  wagerResults = wagerResults.slice(0,8);
  if (payout) spendCoins(-payout,'earn');
  updateWagerBook();
  document.querySelector('#wager-settlement').textContent =
    `今日结算 ${due.length} 笔，共返还 ${coinText(payout)} 金币。`;
  wagerBook.showModal();
}

const preorderOfferMenu = document.querySelector('#preorder-offer');
const preorderMenu = document.querySelector('#preorder-menu');
const preorderButton = document.querySelector('#preorders');
let activePreorderCustomer = null;

function preorderStock() {
  const portions = names.map(() => 0);
  for (const cup of cups) {
    if (cup.place !== 'hand' && cup.place !== 'table') continue;
    for (const flavor of cup.water) portions[flavor]++;
  }
  return portions;
}

function makePreorder() {
  const stock = preorderStock();
  const flavors = stock.map((_,i) => i).filter(i => stock[i] >= 6);
  const flavor = flavors.length ? flavors[Math.floor(Math.random()*flavors.length)]
    : stock.indexOf(Math.max(...stock));
  const total = stock.reduce((sum, portions) => sum+portions,0);
  const [min,max] = total < 40 ? [2,5] : total < 100 ? [4,10] : [10,25];
  const demand = Math.round(min+(max-min)*(Math.random()+Math.random())/2);
  const quantity = Math.min(demand,Math.max(2,Math.floor(stock[flavor]*.75/miniCapacity)));
  const days = quantity >= 10 ? (Math.random() < quantity/30 ? 4 : 3)
    : (Math.random() < (quantity >= 5 ? .65 : .25) ? 3 : 2);
  const roll = Math.random()*100;
  const weights = [28,22,15,12,10,8,3,1.6,.4];
  let threshold = 0;
  const premium = 2+weights.findIndex(weight => roll < (threshold += weight));
  return {flavor,quantity,price:effectivePrice(flavor)+premium,due:day+days};
}

function makePreorderCustomer(slot, savedOffer) {
  const person = newPerson(slot);
  person.orders = [];
  person.color = null;
  person.preorder = savedOffer ?? makePreorder();
  person.el.classList.add('merchant','preorder-customer');
  person.el.setAttribute('aria-label','预订商');
  person.el.querySelector('.bubble').textContent = '预订';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'merchant-offer';
  button.textContent = '谈预订';
  button.onclick = () => {
    if (person.phase !== 'waiting' || busy) return;
    activePreorderCustomer = person;
    const {flavor,quantity,price,due} = person.preorder;
    document.querySelector('#preorder-terms').textContent =
      `第 ${due} 天来取 ${quantity} 杯${names[flavor]}。每份锁价 ${coinText(price)} 金币，任意杯型都算一杯。`;
    const portions = preorderStock()[flavor];
    document.querySelector('#preorder-stock').textContent = `当前有 ${portions} 份${names[flavor]}原料`;
    for (const [id,capacity,label] of [['mini',miniCapacity,'迷你杯'],['small',smallCapacity,'小杯']]) {
      const forecast = document.querySelector('#preorder-'+id);
      const possible = portions/capacity;
      forecast.dataset.enough = String(possible >= quantity);
      forecast.textContent = `${label} ${Number(possible.toFixed(1))} / ${quantity} 杯`;
    }
    document.querySelector('#preorder-value').textContent =
      `交齐预计收入 ${coinText(quantity*miniCapacity*price)}～${coinText(roundMoney(quantity*smallCapacity*price*1.1))} 金币。到期少交一杯，赔 ${coinText(price)} 金币。`;
    preorderOfferMenu.returnValue = '';
    preorderOfferMenu.showModal();
  };
  person.el.append(button);
  return person;
}

preorderOfferMenu.addEventListener('close', () => {
  const person = activePreorderCustomer;
  activePreorderCustomer = null;
  if (person?.phase !== 'waiting') return;
  if (preorderOfferMenu.returnValue === 'accept') {
    preorders.push({...person.preorder,reserved:[]});
    updatePreorders();
    say('预订已签，可以提前预留满杯');
    sendCustomerAway(person);
  } else sendCustomerAway(person);
});

function preorderIncome(order) {
  return roundMoney(order.reserved.reduce((sum,capacity) =>
    sum+capacity*order.price*(capacity === smallCapacity ? 1.1 : 1),0));
}

function updatePreorders() {
  preorderButton.hidden = preorders.length === 0;
  preorderButton.textContent = `预订 ${preorders.length}`;
  const list = document.querySelector('#preorder-list');
  list.replaceChildren();
  for (const order of preorders) {
    const panel = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = `第 ${order.due} 天取货 · ${names[order.flavor]}`;
    const detail = document.createElement('p');
    detail.textContent = `已预留 ${order.reserved.length} / ${order.quantity} 杯 · 每份 ${coinText(order.price)} 金币 · 已备货值 ${coinText(preorderIncome(order))} 金币`;
    panel.append(title,detail);
    const pile = tablePile();
    const exposed = HeapRules.exposure(pile,getPileGeometry()).free;
    const eligible = cups.filter(cup => (cup.place === 'hand' ||
      (cup.place === 'table' && exposed.has(cup.spot))) && complete(cup) && cup.water[0] === order.flavor);
    for (const cup of eligible) {
      if (order.reserved.length >= order.quantity) break;
      const reserve = document.createElement('button');
      reserve.type = 'button';
      reserve.textContent = `预留${cup.place === 'hand' ? '手中' : '箱内'}${cup.capacity === miniCapacity ? '迷你杯' : '小杯'}`;
      reserve.onclick = () => {
        if (busy || cupActions.length || !cups.includes(cup) || order.reserved.length >= order.quantity) return;
        order.reserved.push(cup.capacity);
        if (selected === cup.id) selected = null;
        concurrentDrops.delete(cup);
        stopFeedback(cup);
        cup.el.remove();
        cups = cups.filter(item => item !== cup);
        updatePreorders();
      };
      panel.append(reserve);
    }
    if (day >= order.due && order.reserved.length === order.quantity) {
      const collect = document.createElement('button');
      collect.type = 'button';
      collect.textContent = '交货并收款';
      collect.onclick = () => {
        settlePreorder(order);
        updatePreorders();
      };
      panel.append(collect);
    }
    list.append(panel);
  }
}

preorderButton.onclick = () => {
  if (storyStage || gameOver || busy || cupActions.length) return;
  updatePreorders();
  preorderMenu.showModal();
};

function settlePreorder(order) {
  const income = preorderIncome(order);
  if (income) {
    spendCoins(-income,'earn');
    served += order.reserved.length;
  }
  preorders = preorders.filter(item => item !== order);
  preorderButton.hidden = preorders.length === 0;
  preorderButton.textContent = `预订 ${preorders.length}`;
  const penalty = (order.quantity-order.reserved.length)*order.price;
  return !penalty || payBill(penalty,'预订违约金');
}

function settlePreorders() {
  for (const order of preorders.filter(order => order.due <= day)) {
    if (!settlePreorder(order)) return false;
  }
  return true;
}

const merchantMenu = document.querySelector('#merchant-menu');
const merchantOffers = document.querySelector('#merchant-offers');

function makeOffer(type, discount = 1) {
  const stock = generateStock(boxTypes[type],{uniqueLeader:true});
  const counts = colors.map(() => 0);
  for (const color of stock.flat()) counts[color]++;
  const most = Math.max(...counts);
  const leaders = names.filter((_,i) => counts[i] === most);
  const balanced = leaders.length === names.length;
  const dominant = leaders.length === 1
    ? leaders[0] : leaders.slice(0,-1).join('、')+'和'+leaders.at(-1);
  const value = counts.reduce((sum,count,i) => sum+count*effectivePrice(i),0);
  const roll = Math.random();
  const factor = roll<.10 ? .50+Math.random()*.25 :
    roll<.70 ? .78+Math.random()*.19 : 1.02+Math.random()*.18;
  let price = Math.max(1,Math.round(value*factor));
  if (type === miniBoxType) {
    price = Math.round(9+(Math.random()+Math.random()-1)*4)*10;
  }
  if (type === 0) {
    const offset = Math.random()+Math.random()-1;
    price = Math.round(15+offset*(offset < 0 ? 7 : 6))*10;
  }
  return {type,stock,originalPrice:price,price:Math.round(price*discount),discount,dominant,balanced,sold:false};
}

function showOffers(person, notice = '') {
  merchantOffers.replaceChildren();
  for (const offer of person.offers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'merchant-buy';
    const name = document.createElement('span');
    name.textContent = boxTypes[offer.type].name;
    const detail = document.createElement('small');
    detail.textContent = offer.balanced ? '口味均匀' : `${offer.dominant}最多`;
    name.append(detail);
    const price = document.createElement('strong');
    price.textContent = offer.sold ? '已售出' : `${coinText(offer.price)} 金币`;
    if (!offer.sold && offer.discount < 1) {
      const original = document.createElement('span');
      original.className = 'offer-original';
      original.textContent = `${coinText(offer.originalPrice)} 金币`;
      const discounted = document.createElement('span');
      discounted.className = 'offer-discount';
      discounted.textContent = `${coinText(offer.price)} 金币（${Math.round((1-offer.discount)*100)}% OFF）`;
      price.className = 'offer-price-change';
      price.replaceChildren(original,discounted);
    }
    button.append(name,price);
    button.disabled = offer.sold || balance < offer.price;
    button.onclick = () => confirmSpending(offer.price,'买箱子',() => {
      if (offer.sold || person.phase !== 'waiting' || balance < offer.price) return;
      offer.sold = true;
      spendCoins(offer.price);
      const box = addBox(offer.type,offer.stock);
      const opened = openBox(box,'purchase');
      const message = opened ? `${box.name}已摆上桌` : '';
      if (!opened) {
        queueStorageFlight(box,button);
      }
      if (person.offers.every(item => item.sold)) {
        sendCustomerAway(person);
        merchantMenu.close();
      } else {
        showOffers(person,message);
      }
      if (message) say(message);
    });
    merchantOffers.append(button);
  }
  document.querySelector('#merchant-status').textContent =
    notice || (person.offers.some(offer => !offer.sold && balance < offer.price) ? '部分箱子金币不足' : '');
}

function makeMerchant(slot, companion = false, savedOffers = null) {
  const person = newPerson(slot);
  const discount = [0.3,0.5,0.8][day-2] ?? 1;
  const tutorial = discount < 1;
  const available = merchantTypes.slice(0,tutorial ? 1 : merchantTypeLevel+1);
  person.offers = savedOffers ?? Array.from({length:tutorial ? 1 : merchantItemCount},(_,index) => {
    const type = index === 0 ? available.at(-1) : available[Math.floor(Math.random()*available.length)];
    return makeOffer(type,discount);
  });
  person.merchant = true;
  person.companion = companion;
  person.orders = [];
  person.color = null;
  delete person.el.querySelector('.bubble').dataset.orders;
  person.el.classList.add('merchant');
  person.el.setAttribute('aria-label','箱子商人');
  person.el.querySelector('.bubble').textContent = '箱';
  const offerButton = document.createElement('button');
  offerButton.type = 'button';
  offerButton.className = 'merchant-offer';
  offerButton.textContent = '看货';
  offerButton.onclick = () => {
    if (person.phase !== 'waiting' || merchantMenu.open || storageFlightsActive) return;
    showOffers(person);
    merchantMenu.showModal();
  };
  if (tutorial && !companion) {
    const speech = document.createElement('p');
    speech.className = 'merchant-speech';
    speech.textContent = day === 2
      ? '嘿，我来卖箱子了！第一次见你，这箱迷你箱给你打三折。从今天起我每天都来，等最后一位顾客走了就来，记得留点钱进货。'
      : day === 3
        ? '又见面了！今天这箱迷你箱给你打五折。'
        : '今天这箱迷你箱给你打八折，下次来就是原价喽。';
    person.el.append(speech);
  }
  person.el.append(offerButton);
  return person;
}

function queueStorageFlight(box, source) {
  const bounds = source.getBoundingClientRect();
  pendingStorageFlights.set(box,{x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2});
  updateInventory();
}

let storageFlightsActive = false;
merchantMenu.addEventListener('close', playStorageFlights);
scavengeMenu.addEventListener('close', playStorageFlights);

async function playStorageFlights() {
  if (storageFlightsActive || !pendingStorageFlights.size) return;
  storageFlightsActive = true;
  const inventoryButton = document.querySelector('#inventory');
  const badge = document.querySelector('#inventory-badge');
  for (const [box,origin] of [...pendingStorageFlights]) {
    const board = shop.getBoundingClientRect();
    const target = (badge.hidden ? inventoryButton : badge).getBoundingClientRect();
    if (!reducedMotion.matches) {
      const token = document.createElement('i');
      token.className = 'box-icon storage-flight';
      token.setAttribute('aria-hidden','true');
      shop.append(token);
      const fromX = origin.x-board.left;
      const fromY = origin.y-board.top;
      const toX = target.left+target.width/2-board.left;
      const toY = target.top+target.height/2-board.top;
      await token.animate([
        {transform:`translate(${fromX}px,${fromY}px) translate(-50%,-50%)`},
        {transform:`translate(${toX}px,${toY}px) translate(-50%,-50%) scale(.55)`}
      ],{duration:420,easing:'ease-in-out'}).finished;
      token.remove();
    }
    pendingStorageFlights.delete(box);
    setFooterBadge('inventory-badge',boxes.filter(item => item.cell === null && !pendingStorageFlights.has(item)).length);
    if (!reducedMotion.matches && !badge.hidden) {
      badge.animate([{transform:'scale(1.45)'},{transform:'scale(1)'}],{duration:260,easing:'ease-out'});
    }
  }
  storageFlightsActive = false;
}

document.querySelector('#close-merchant').onclick = () => merchantMenu.close();
function deliverCup(cup, customer) {
  const drop = concurrentDrops.get(cup);
  const from = drop ? dropPosition(drop) : pose(cup);
  concurrentDrops.delete(cup);
  stopFeedback(cup);
  selected = null;
  cup.place = 'delivery';
  customer.phase = 'receiving';
  const stackY = customer.wholesale ? wholesaleStackY(customer.wholesale.stack?.length ?? 0) : 23;
  const to = [customer.x+21,Math.max(-6,stackY),-13,HELD_CUP_SCALE];
  busy = {type:'deliver',t:0,duration:cupFlightDuration(from,to)*.68,c:cup,p:customer,from,to};
  say('颜色对了，给你！');
}

const wholesaleStackY = index => 23-index*2.7;

function makeHeldCup(customer, cup, index) {
  const held = document.createElement('div');
  held.className = 'held';
  if (customer.wholesale) {
    held.classList.add('wholesale-held');
    held.style.setProperty('--stack-y', `${(wholesaleStackY(index)-12.5)/.23}%`);
    held.style.zIndex = String(100-index);
  } else held.style.setProperty('--cup-offset', `${index*11}px`);
  held.innerHTML = svg(cup.water,`held${customer.id}-${index}`,cup.capacity);
  held.style.setProperty('--held-cup-width', `min(${16*HELD_CUP_SCALE}vw, ${8.176*HELD_CUP_SCALE}dvh)`);
  held.style.setProperty('--held-cup-height', `${8*cupHeight(cup.capacity)*HELD_CUP_SCALE}dvh`);
  return held;
}

function finishDelivery({p:customer,c:cup}) {
  playSound('serve');
  const color = cup.water[0];
  customer.held = color;
  const stack = customer.wholesale ? (customer.wholesale.stack ??= []) : null;
  const index = stack ? stack.length : customer.el.querySelectorAll('.held').length;
  if (stack) stack.push(cup.capacity);
  const held = makeHeldCup(customer,cup,index);
  if (!stack || wholesaleStackY(index) >= -5) customer.el.append(held);
  rewardDelivery(held,cup,customer);
  cup.el.remove();
  cups = cups.filter(c => c !== cup);
  served++;
  if (customer.wholesale) {
    customer.phase = 'waiting';
    say('批发商还在收购');
    return;
  }
  customer.orders.splice(customer.orders.indexOf(color),1);
  if (customer.orders.length) {
    showOrders(customer);
    customer.phase = 'waiting';
    say(`这位顾客还要 ${customer.orders.length} 杯`);
  } else {
    say('下一位，请！');
    sendCustomerAway(customer);
  }
}

const autoMixToggle = document.querySelector('#auto-mix');
const boxAutoMixToggle = document.querySelector('#box-auto-mix');
const autoSaleExclusions = document.querySelector('#auto-sale-exclusions');
const autoDismissExcluded = document.querySelector('#auto-dismiss-excluded');
const cupPriorityInputs = [...document.querySelectorAll('input[name="cup-priority"]')];
for (const input of cupPriorityInputs) {
  input.onchange = () => {
    if (!input.checked) return;
    for (const other of cupPriorityInputs) {
      if (other !== input) other.checked = false;
    }
  };
}
const excludedFlavorInputs = names.map((name, flavor) => {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.autocomplete = 'off';
  const dot = document.createElement('span');
  dot.className = 'auto-sale-dot';
  dot.style.backgroundColor = colors[flavor];
  dot.setAttribute('aria-hidden','true');
  const label = document.createElement('label');
  label.append(input,dot,name);
  autoSaleExclusions.append(label);
  return input;
});
function updateAutoDismissAvailability() {
  autoDismissExcluded.disabled = !boxAutoMixToggle.checked;
}

boxAutoMixToggle.addEventListener('change', () => {
  if (boxAutoMixToggle.checked) autoMixToggle.checked = true;
  updateAutoDismissAvailability();
});
autoMixToggle.addEventListener('change', () => {
  if (!autoMixToggle.checked) boxAutoMixToggle.checked = false;
  updateAutoDismissAvailability();
});

function startAutoMix(customer, candidates, color, capacity) {
  if (candidates.flatMap(cup => cup.water).filter(portion => portion === color).length < capacity) return false;
  const targets = candidates.filter(cup => cup.capacity === capacity);
  if (!targets.length) return false;
  // A full box cup as the destination leaves enough liquid to refill the box.
  const target = targets.find(cup => cup.place === 'table' && cup.water.includes(color))
    ?? targets.find(cup => cup.place === 'table')
    ?? targets.reduce((least,cup) => cup.water.length < least.water.length ? cup : least);
  let needed = capacity;
  const moved = [];
  const ordered = [target,...candidates.filter(cup => cup !== target)];
  const changes = ordered.map(cup => {
    const before = cup.water.map(portion => {
      const wanted = portion === color && needed > 0;
      if (wanted) needed--;
      else if (cup === target) moved.push(portion);
      return {color:portion, removed:wanted || cup === target};
    });
    return {cup,before,added:cup === target ? Array(capacity).fill(color) : []};
  });
  const remainingCups = changes.slice(1);
  // Refill table cups before using spare capacity in hand.
  const refillOrder = [
    ...remainingCups.filter(change => change.cup.place === 'table'),
    ...remainingCups.filter(change => change.cup.place !== 'table')
  ];
  for (const change of refillOrder) {
    const remaining = change.before.filter(layer => !layer.removed).length;
    change.added.push(...moved.splice(0,change.cup.capacity-remaining));
  }
  for (const change of refillOrder.filter(change => change.cup.place === 'table')) {
    let missing = change.before.filter(layer => layer.removed).length-change.added.length;
    for (const donor of refillOrder) {
      if (missing <= 0) break;
      if (donor.cup.place !== 'hand') continue;
      while (missing > 0 && donor.added.length) {
        change.added.push(donor.added.pop());
        missing--;
      }
      for (const layer of donor.before) {
        if (missing <= 0) break;
        if (layer.removed) continue;
        layer.removed = true;
        change.added.push(layer.color);
        missing--;
      }
    }
    if (missing > 0) return false;
  }
  selected = null;
  busy = {type:'auto-mix',t:0,duration:target.water.length ? 360 : 260,
    changes,target,customer,simultaneous:target.water.length === 0};
  customer.dismiss.disabled = true;
  say(target.place === 'table' ? '正在箱内自动配单' : '正在自动配单');
  return true;
}

function animateAutoMix(action, t) {
  const shrink = ease(action.simultaneous ? t : clamp(t*2));
  const grow = ease(action.simultaneous ? t : clamp(t*2-1));
  for (const {cup,before,added} of action.changes) {
    if (t === 1) {
      cup.water = [...before.filter(layer => !layer.removed).map(layer => layer.color), ...added];
      paint(cup);
      continue;
    }
    const layers = before.map(({color,removed}) => ({color,amount:removed ? 1-shrink : 1}));
    layers.push(...added.map(color => ({color,amount:grow})));
    animateLiquid(cup,layers,0);
  }
}

function dropPosition(drop) {
  const progress = Math.min(1,drop.t/drop.duration);
  return drop.from.map((value,index) => value+(drop.to[index]-value)*progress);
}

function tryServe(exposedSpots) {
  if (storyStage || busy || cupActions.length || cupDrag || transferSource || settingsMenu.open || wholesaleMenu.open || preorderMenu.open || preorderOfferMenu.open || wagerOffer.open || wagerBook.open) return;
  const hand = cups.filter(cup => cup.place === 'hand');
  const exposed = boxAutoMixToggle.checked
    ? cups.filter(cup => cup.place === 'table' && !cup.influencer && exposedSpots.has(cup.spot))
    : [];
  for (const customer of customers) {
    if (customer.phase !== 'waiting' || customer.merchant || !customer.orders.length) continue;
    const assistEnabled = autoMixToggle.checked || boxAutoMixToggle.checked;
    const allowedOrders = assistEnabled
      ? customer.orders.filter(color => !excludedFlavorInputs[color].checked)
      : customer.orders;
    if (!allowedOrders.length) {
      if (!customer.wholesale && boxAutoMixToggle.checked && autoDismissExcluded.checked) sendCustomerAway(customer);
      continue;
    }
    const preferredCapacity = Number(cupPriorityInputs.find(input => input.checked)?.value ?? 0);
    const available = [...hand,...exposed];
    if (!preferredCapacity) {
      const ready = available.find(cup => complete(cup) && allowedOrders.includes(cup.water[0]));
      if (ready) { deliverCup(ready,customer); return; }
    }
    const capacities = preferredCapacity
      ? [preferredCapacity,miniCapacity+smallCapacity-preferredCapacity]
      : [...new Set(available.map(cup => cup.capacity))];
    for (const capacity of capacities) {
      const ready = available.find(cup => cup.capacity === capacity &&
        complete(cup) && allowedOrders.includes(cup.water[0]));
      if (ready) { deliverCup(ready,customer); return; }
      if (autoMixToggle.checked &&
          allowedOrders.some(color => startAutoMix(customer,hand,color,capacity))) return;
      if (exposed.length &&
          allowedOrders.some(color => startAutoMix(customer,available,color,capacity))) return;
    }
  }
}
function step(ms){if(!started || gameOver || buyShop.open || closeDayWarning.open)return;for(const p of customers){if(p.phase==='enter'||p.phase==='exit'){const d=p.target-p.x;p.x+=Math.sign(d)*Math.min(Math.abs(d),ms*.065);if(Math.abs(d)<.1&&p.phase==='enter')p.phase='waiting';}p.el.style.left=`${p.x}%`;p.el.classList.toggle('ready',p.phase==='waiting');p.dismiss.disabled=p.phase!=='waiting'||busy?.type==='auto-mix';}
for (const person of customers.filter(p => p.phase === 'exit' && p.x >= 119)) {
  person.el.remove();
  customers = customers.filter(p => p !== person);
  updateScavengeAvailability();
}
if (influencerTutorialPending && !storyStage && !busy && !cupActions.length && !cupDrag && !transferSource &&
    !document.querySelector('dialog[open]')) {
  influencerTutorialPending = false;
  influencerTutorialSeen = true;
  showStory('influencer','哇，你真幸运！小箱里有时会开出价格影响器。把挡在上面的杯子拿开，点一下道具，就能收进「仓库」。想用的时候就在仓库里点它。它从明天起会暂时改变对应口味的价格。');
  storyNext.textContent = '知道了';
  storyNext.focus();
  updateScavengeAvailability();
}
for (const slot of customerSlots.slice(0,customerLimit)) {
  if (storyStage || customers.some(person => person.slot === slot && person.phase !== 'exit')) continue;
  if (unseated > 0) {
    unseated--;
    customersArrived++;
    customers.push(customersArrived === traderArrival ? makeTrader(slot)
      : customersArrived === wholesaleArrival ? makeWholesaler(slot)
      : customersArrived === preorderArrival ? makePreorderCustomer(slot)
      : customersArrived === wagerArrival && maxWagerStake() >= 1 ? makeWagerCustomer(slot) : newPerson(slot));
    updateQueue();
  }
}
if (!storyStage && merchantPending > 0 && unseated === 0 &&
    !customers.some(person => person.phase !== 'exit')) {
  const count = merchantPending;
  merchantPending = 0;
  for (let i = 0; i < count; i++) customers.push(makeMerchant(customerSlots[i],i > 0));
  updateQueue();
}
updateCoins(ms);
if (balance >= shopPrice) {
  for (const id of ['upgrade-menu','inventory-menu','merchant-menu','trader-menu','wholesale-menu','preorder-menu','preorder-offer','wager-offer','wager-book']) {
    document.getElementById(id).close();
  }
  buyShop.showModal();
  return;
}
if (!busy && cupActions.length) busy = cupActions.shift();
const pile = tablePile();
for (const box of boxes) {
  if (box.cell === null) continue;
  const badge = box.el.querySelector('.box-count');
  const count = String(pile.filter(spot => Math.floor(spot/boxStride) === box.id).length);
  if (badge.textContent !== count) badge.textContent = count;
}
const countText = `物品总数：${pile.length}`;
if (itemCount.textContent !== countText) itemCount.textContent = countText;
const exposedSpots = HeapRules.exposure(pile, getPileGeometry()).free;
for (const c of cups) {
  c.el.hidden = c.place === 'storage';
  if (c.el.hidden) {
    concurrentDrops.delete(c);
    continue;
  }
  if (cupDrag?.active && cupDrag.cup === c) {
    const targetScale = cupDrag.target ? TABLE_SCALE : 1;
    c.el.style.zIndex = '1000000';
    cupDrag.scale += (targetScale-cupDrag.scale)*Math.min(1,ms/55);
    drawCup(c,[cupDrag.x,cupDrag.y,cupDrag.angle,cupDrag.scale]);
    continue;
  }
  const onTable = c.place === 'table';
  c.el.classList.toggle('table-cup', onTable);
  c.el.classList.toggle('blocked-cup', onTable && !exposedSpots.has(c.spot));
  c.el.style.zIndex = c.place === 'table' ? (c.stack ?? c.spot%boxStride) : topStack+1;
  const drop = concurrentDrops.get(c);
  if (drop) {
    drop.t += ms;
    drawCup(c,dropPosition(drop));
    if (drop.t >= drop.duration) concurrentDrops.delete(c);
    continue;
  }
  const pendingPickup = cupActions.find(action => action.type === 'pickup' && action.c === c);
  drawCup(c,pendingPickup?.from ?? pose(c));
}
if(busy){const a=busy;a.t+=ms*(a.type==='pour' ? 1.85 : 1);const t=Math.min(1,a.t/a.duration);if (a.type === 'pour') {
  a.c.el.style.zIndex = String(topStack+2);
  playPour(a, Math.min(a.t,a.duration));
} else if (a.type === 'auto-mix') {
  if (!a.mixed) {
    animateAutoMix(a,t);
    a.mixed = t === 1;
  }
  // Keep the completed order on the pointer until its cup is released.
  if (t === 1 && cupDrag?.active && cupDrag.cup === a.target) return;
} else {
  a.c.el.style.zIndex = String(topStack+2);
  drawCup(a.c,a.from.map((v,i)=>v+(a.to[i]-v)*t));
}if(t===1){busy=null;
if(a.type==='pour'){a.c.el.style.zIndex='';stream.removeAttribute('d');a.target.water.push(...a.c.water.splice(-a.amount));paint(a.c);paint(a.target);say(complete(a.target)?'同色满杯已完成 · 等待对应顾客':'继续把相同颜色倒在一起');}if (a.type === 'deliver') finishDelivery(a);
if (a.type === 'auto-mix') deliverCup(a.target,a.customer);
}}tryServe(exposedSpots);updateSkipTip();updateReturnTip();closeDay.disabled=Boolean(busy)||cupActions.length>0||rewards.length>0;}
const settingsMenu = document.querySelector('#settings-menu');
const settingsStatus = document.querySelector('#settings-status');
const continueGame = document.querySelector('#continue-game');
let savedGame;
try {
  const candidate = JSON.parse(localStorage.getItem(saveKey));
  if (candidate?.version === 1 && Number.isInteger(candidate.day)) savedGame = candidate;
} catch {}
if (savedGame) {
  continueGame.hidden = false;
  continueGame.textContent = `继续游戏 · 第 ${savedGame.day} 天`;
}

document.querySelector('.setting').onclick = () => {
  if (storyStage || gameOver) return;
  settingsStatus.textContent = '';
  settingsMenu.showModal();
};

function abandonRun(restart) {
  recordEnding('abandoned',day);
  clearSavedGame();
  location.hash = restart ? 'restart' : '';
  location.reload();
}

document.querySelector('#settings-restart').onclick = () => abandonRun(true);
document.querySelector('#settings-abandon').onclick = () => abandonRun(false);

document.querySelector('#settings-save').onclick = () => {
  if (busy || cupActions.length || rewards.length) {
    settingsStatus.textContent = '请等当前动作结束后再保存。';
    return;
  }
  const save = {
    version:1,boxStride,storedInfluencers,influencerTutorialSeen,influencerTutorialPending,scavengeLevel,freeScavengingUsed,day,balance,served,customerLimit,customersPerDay,todayCustomerCount,
    merchantTypeLevel,merchantItemCount,walletLevel,scavengingAttempts,merchantPending,
    customersArrived,traderArrival,wholesaleArrival,preorderArrival,preorders,wagerArrival,wagers,wagerResults,marketHistory,unseated,market,
    skipTipSeen,returnTipClosed,skipTipOpen:!skipTip.hidden,returnTipOpen:!returnTip.hidden,
    upgrades:extraUpgrades.map(upgrade => upgrade.level),
    assist: {
      hand:autoMixToggle.checked, boxes:boxAutoMixToggle.checked,
      dismiss:autoDismissExcluded.checked,
      excluded:excludedFlavorInputs.map(input => input.checked),
      priority:cupPriorityInputs.find(input => input.checked)?.value ?? null
    },
    boxes:boxes.map(({el,bounds,transferOverlay,...box}) => box),
    cups:cups.map(({el,...cup}) => cup),
    customers:customers.filter(person => person.phase !== 'exit').map(person => ({
      slot:person.slot,orders:person.orders,offers:person.offers,deal:person.deal,
      companion:person.companion,held:person.held,wholesale:person.wholesale,preorder:person.preorder,wagerOffer:person.wagerOffer
    }))
  };
  try { localStorage.setItem(saveKey,JSON.stringify(save)); }
  catch {
    settingsStatus.textContent = '浏览器无法保存游戏。';
    return;
  }
  location.hash = '';
  location.reload();
};

continueGame.onclick = () => {
  if (!savedGame || started) return;
  const save = savedGame;
  wholesaleArrival = save.wholesaleArrival ?? 0;
  preorderArrival = save.preorderArrival ?? 0;
  preorders = save.preorders ?? [];
  wagerArrival = save.wagerArrival ?? 0;
  wagers = save.wagers ?? [];
  wagerResults = save.wagerResults ?? [];
  marketHistory = save.marketHistory ?? [];
  storedInfluencers = save.storedInfluencers ?? [];
  influencerTutorialSeen = save.influencerTutorialSeen ?? false;
  influencerTutorialPending = save.influencerTutorialPending ?? false;
  scavengeLevel = save.scavengeLevel ?? 0;
  freeScavengingUsed = save.freeScavengingUsed ?? 0;
  ({day,balance,served,customerLimit,customersPerDay,todayCustomerCount,
    merchantTypeLevel,merchantItemCount,walletLevel,scavengingAttempts,merchantPending,
    customersArrived,traderArrival,unseated,skipTipSeen,returnTipClosed} = save);
  skipTip.hidden = !save.skipTipOpen;
  returnTip.hidden = !save.returnTipOpen;
  market.forEach((fruit,i) => Object.assign(fruit,save.market[i]));
  extraUpgrades.forEach((upgrade,i) => { upgrade.level = save.upgrades[i] ?? 0; });
  if (save.assist) {
    autoMixToggle.checked = save.assist.hand;
    boxAutoMixToggle.checked = save.assist.boxes;
    autoDismissExcluded.checked = save.assist.dismiss;
    updateAutoDismissAvailability();
    excludedFlavorInputs.forEach((input,i) => { input.checked = save.assist.excluded[i]; });
    for (const input of cupPriorityInputs) {
      input.checked = input.value === save.assist.priority;
    }
  }
  startScreen.hidden = true;
  shop.hidden = false;
  shopTools.hidden = false;
  storyStage = '';
  delete shop.dataset.story;
  cups.forEach(cup => cup.el.remove());
  cups = [];
  for (const entry of save.boxes) {
    const box = {...entry,cell:null};
    boxes.push(box);
    if (entry.cell !== null) openBox(box,'restore');
  }
  nextBoxId = Math.max(-1,...boxes.map(box => box.id))+1;
  for (const entry of save.cups) {
    const oldStride = save.boxStride ?? initialBoxSlots;
    const spot = entry.spot == null ? null : Math.floor(entry.spot/oldStride)*boxStride+entry.spot%oldStride;
    const cup = add(entry.water,entry.slot,spot,entry.capacity,entry.influencer);
    cup.stack = entry.stack;
    topStack = Math.max(topStack,entry.stack ?? 0);
    cup.place = entry.place;
    cup.el.hidden = cup.place === 'storage';
  }
  customers = save.customers.map(entry => {
    const person = entry.wagerOffer ? makeWagerCustomer(entry.slot,entry.wagerOffer)
      : entry.preorder ? makePreorderCustomer(entry.slot,entry.preorder)
      : entry.wholesale ? makeWholesaler(entry.slot,entry.wholesale)
      : entry.deal ? makeTrader(entry.slot,entry.deal)
      : entry.offers ? makeMerchant(entry.slot,entry.companion,entry.offers) : newPerson(entry.slot);
    if (!entry.wagerOffer && !entry.preorder && !entry.wholesale && !entry.deal && !entry.offers) {
      person.orders = entry.orders;
      showOrders(person);
    }
    person.held = entry.held;
    person.x = person.target;
    person.phase = 'waiting';
    return person;
  });
  displayedBalance = balance;
  balanceLabel.textContent = coinText(balance);
  dayLabel.textContent = `第 ${day} 天`;
  rentLabel.textContent = day === 1 ? '明日付货款 10 金币' : `今日租金 ${dailyRent()} 金币`;
  showMarket();
  updateInventory();
  updateUpgrade();
  updateQueue();
  updatePreorders();
  updateWagerBook();
  started = true;
};

add([],0);
showMarket();
updateUpgrade();
if (location.hash === '#restart') {
  history.replaceState(null,'',location.pathname+location.search);
  document.querySelector('#start-game').click();
}
const propCatalog = document.querySelector('#prop-catalog');
const influencerPreviews = document.querySelector('#influencer-previews');
for (const [flavor, name] of names.entries()) {
  const preview = document.createElement('figure');
  preview.innerHTML = `<div class="price-influencer">${influencerArt({flavor,price:12,days:3})}</div><figcaption></figcaption>`;
  preview.querySelector('figcaption').textContent = name;
  influencerPreviews.append(preview);
}
document.querySelector('#open-prop-catalog').onclick = () => propCatalog.showModal();

let last=performance.now();function frame(now){step(Math.min(now-last,40));last=now;requestAnimationFrame(frame)}requestAnimationFrame(frame);
window.advanceTime=ms=>{for(let left=ms;left>0;left-=16)step(Math.min(16,left));};
window.render_game_to_text=()=>JSON.stringify({coordinates:'percent of portrait board; origin top-left, x right, y down',art:'01',cupCapacities:[miniCapacity,smallCapacity],palette:names,handLimit:3,served,balance:balance/10,displayedBalance:displayedBalance/10,market:market.map((_,i)=>effectivePrice(i)/10),customerLimit,walletLevel,merchantTypeLevel,merchantItemCount,boxes:boxes.map(box=>({id:box.id,name:box.name,cell:box.cell,count:box.opened?box.count:null,remaining:box.opened?remainingInBox(box):null,opened:box.opened})),day,started,bestRecord,buyShopOpen:buyShop.open,storyStage,rent:dailyRent(),merchantPending,gameOver,queueRemaining:waitingCount(),selected,blocked:tablePile().filter(spot=>!HeapRules.available(tablePile(),getPileGeometry(),spot)),busy:busy?.type||null,queuedActions:cupActions.map(a=>a.type),customersPerDay,customers:customers.map(({id,color,orders,x,phase,held,merchant})=>({id,color,orders,x,phase,held,merchant})),cups:cups.map(c=>({id:c.id,influencer:c.influencer,water:c.water,capacity:c.capacity,place:c.place,slot:c.slot,position:pose(c)}))});
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='f'){if(document.fullscreenElement)document.exitFullscreen?.();else shop.requestFullscreen?.();}});
})();
