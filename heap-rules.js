/* Framework-free gameplay and screen-space 2D coverage rules. */
(() => {
  const amount = (a,b) => {
    if(!a?.length || !b || b.length>=4) return 0;
    let n=1;
    while(n<a.length && a[a.length-1-n]===a.at(-1)) n++;
    return Math.min(n,4-b.length);
  };
  const complete = a => a.length===4 && a.every(c=>c===a[0]);
  const geometryCache=new WeakMap();
  function inside(poly,x,y) {
    let hit=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const a=poly[i],b=poly[j];
      if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;
    }
    return hit;
  }
  function geometry(bottles) {
    if(geometryCache.has(bottles))return geometryCache.get(bottles);
    const shapes=window.HeapShapes;
    const entries=bottles.map((b,id)=>{
      if(!b.pose)return null;
      const parts=b.shape ?? shapes[b.style],points=parts.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
      const bounds={left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
      const a=b.pose.angle*Math.PI/180,sin=Math.sin(a),cos=Math.cos(a),size=b.pose.size;
      const world=(x,y)=>({x:b.pose.x-.5+size*(x*cos-y*sin),y:b.pose.y+size*(x*sin+y*cos)});
      const corners=[[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]].map(p=>world(...p));
      const worldBounds={left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
      const contains=(x,y)=>{
        if(x<worldBounds.left||x>worldBounds.right||y<worldBounds.top||y>worldBounds.bottom)return false;
        const dx=(x-(b.pose.x-.5))/size,dy=(y-b.pose.y)/size;
        const lx=dx*cos+dy*sin,ly=-dx*sin+dy*cos;
        return parts.some(poly=>inside(poly,lx,ly));
      };
      const samples=[];
      for(let y=bounds.top+.045;y<bounds.bottom;y+=.09)for(let x=bounds.left+.045;x<bounds.right;x+=.09)
        if(parts.some(poly=>inside(poly,x,y)))samples.push(world(x,y));
      return {id,z:b.pose.z,samples,contains};
    }).filter(Boolean);
    for(const entry of entries)for(const point of entry.samples)
      point.coveredBy=entries.filter(other=>other.z>entry.z&&other.contains(point.x,point.y)).map(other=>other.id);
    const result={entries,key:null,free:new Set(),coverage:new Map(),visible:new Map()};
    geometryCache.set(bottles,result);return result;
  }
  function exposure(pile,bottles) {
    const model=geometry(bottles),key=pile.join(',');
    if(model.key===key)return model;
    model.key=key;model.free=new Set();model.coverage=new Map();model.visible=new Map();
    const remaining=new Set(pile);
    for(const entry of model.entries)if(remaining.has(entry.id)){
      const visible=entry.samples.filter(p=>!p.coveredBy.some(id=>remaining.has(id)));
      const covered=1-visible.length/entry.samples.length;
      model.coverage.set(entry.id,covered);model.visible.set(entry.id,visible);
      if(covered<=.1)model.free.add(entry.id);
    }
    return model;
  }
  const available = (pile,bottles,id) => pile.includes(id) &&
    (bottles[id].pose?exposure(pile,bottles).free.has(id):bottles[id].blockedBy.every(other=>!pile.includes(other)));
  function blockers(pile,bottles,id) {
    const model=geometry(bottles),entry=model.entries.find(e=>e.id===id);
    if(!entry||!pile.includes(id))return [];
    const remaining=new Set(pile),depth=new Map(model.entries.map(e=>[e.id,e.z])),counts=new Map();
    // Attribute hidden samples to the bottle actually visible on top there.
    for(const point of entry.samples) {
      let owner=null;
      for(const other of point.coveredBy)if(remaining.has(other)&&(owner===null||depth.get(other)>depth.get(owner)))owner=other;
      if(owner!==null)counts.set(owner,(counts.get(owner)||0)+1);
    }
    return [...counts].map(([id,count])=>({id,fraction:count/entry.samples.length}))
      .filter(b=>b.fraction>=.01).sort((a,b)=>b.fraction-a.fraction);
  }
  const initial = level => ({water:level.bottles.map(b=>[...b.colors]),slots:[0,1,null,null,null],pile:level.bottles.map((_,id)=>id).slice(2)});
  function apply(state,move) {
    const next=structuredClone(state);
    if(move.type==='pick') {
      next.pile=next.pile.filter(id=>id!==move.id);
      next.slots[next.slots.indexOf(null)]=move.id;
    } else {
      const count=amount(next.water[move.from],next.water[move.to]);
      next.water[move.to].push(...next.water[move.from].splice(-count));
      for(const id of [move.from,move.to]) if(complete(next.water[id])) {
        next.water[id]=[];
        next.slots[next.slots.indexOf(id)]=null;
      }
    }
    return next;
  }
  // Ported from bottlegame/src/rules.js: gather four matching portions from
  // anywhere in the hand, redistribute other liquid, and release one bottle.
  function autoClear(state) {
    const ids=state.slots.filter(id=>id!==null),count=new Map();
    for(const id of ids)for(const color of state.water[id])count.set(color,(count.get(color)||0)+1);
    const color=[...count].find(([,n])=>n>=4)?.[0];
    if(color===undefined)return null;
    const mine=id=>state.water[id].filter(c=>c===color).length;
    const others=id=>state.water[id].length-mine(id);
    const elim=[...ids].sort((a,b)=>others(a)-others(b)||mine(b)-mine(a)||b-a)[0];
    const next=structuredClone(state),take=[];
    let need=4-Math.min(4,mine(elim));
    for(const id of ids.filter(id=>id!==elim&&mine(id)).sort((a,b)=>others(a)-others(b)||b-a)) {
      const w=state.water[id];
      for(let index=w.length-1;index>=0&&need>0;index--)if(w[index]===color){take.push({id,index});need--;}
      if(!need)break;
    }
    for(const {id,index} of [...take].sort((a,b)=>b.index-a.index))next.water[id].splice(index,1);
    const moveOut=[];
    state.water[elim].forEach((c,index)=>{if(c!==color)moveOut.unshift({index,color:c});});
    for(const move of moveOut) {
      const top=id=>next.water[id].at(-1);
      move.to=ids.filter(id=>id!==elim&&next.water[id].length<4).sort((a,b)=>
        (top(b)===move.color)-(top(a)===move.color)||next.water[a].length-next.water[b].length)[0];
      next.water[move.to].push(move.color);
    }
    next.water[elim]=[];
    next.slots[next.slots.indexOf(elim)]=null;
    return {color,elim,take,moveOut,state:next};
  }
  const won = s => !s.pile.length && s.slots.every(id=>id===null || !s.water[id].length);
  function lost(state) {
    if(state.slots.includes(null)||won(state))return false;
    const totals=new Map();
    for(const id of state.slots)for(const c of state.water[id])totals.set(c,(totals.get(c)||0)+1);
    return [...totals.values()].every(n=>n<4);
  }
  function validateSolution(level,path) {
    if(!Array.isArray(path))return false;
    let state=initial(level);
    for(const move of path) {
      if(move.type==='pick') {
        if(!state.slots.includes(null)||!available(state.pile,level.bottles,move.id))return false;
      } else if(move.type==='pour') {
        if(move.from===move.to||!state.slots.includes(move.from)||!state.slots.includes(move.to)||!amount(state.water[move.from],state.water[move.to]))return false;
      } else return false;
      state=apply(state,move);
      if(lost(state))return false;
    }
    return won(state);
  }
  function moves(state,level) {
    const output=[];
    if(state.slots.includes(null)) for(const id of state.pile) if(available(state.pile,level.bottles,id)) output.push({type:'pick',id});
    const ids=state.slots.filter(id=>id!==null);
    for(const from of ids) for(const to of ids) if(from!==to && amount(state.water[from],state.water[to])) output.push({type:'pour',from,to});
    return output;
  }
  // Test-sized levels: prefer merges and empty recipients, avoiding pointless
  // swaps. Colour placement and cover dependencies are both part of the state.
  function solve(level,limit=50000) {
    if(level.solution && validateSolution(level,level.solution))return structuredClone(level.solution);
    const seen=new Set();let visits=0;
    function visit(state,path) {
      if(won(state)) return path;
      if(lost(state)||++visits>limit || path.length>400) return null;
      const key=state.pile.join(',')+'|'+state.slots.map(id=>id===null?'_':id+':'+state.water[id].join(',')).join('/');
      if(seen.has(key)) return null;
      seen.add(key);
      const choices=moves(state,level).map(move=>{
        if(move.type==='pick')return {move,rank:30};
        const a=state.water[move.from],b=state.water[move.to],n=amount(a,b);
        const finishes=complete([...b,...a.slice(-n)]);
        const rank=finishes?100:b.length&&b.at(-1)===a.at(-1)?50:!b.length?10:0;
        return {move,rank:!b.length&&a.every(c=>c===a[0])?-1:rank};
      }).filter(c=>c.rank>0).sort((a,b)=>b.rank-a.rank);
      for(const {move} of choices) {const result=visit(apply(state,move),[...path,move]);if(result)return result;}
      return null;
    }
    return visit(initial(level),[]);
  }
  function level(number=1) {
    const data=structuredClone(window.HeapLevelData);
    let seed=(number*2654435761)>>>0;
    const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const colors=[0,1,2,3,4];
    for(let i=4;i>0;i--){const j=Math.floor(rnd()*(i+1));[colors[i],colors[j]]=[colors[j],colors[i]];}
    data.bottles.forEach(b=>b.colors=b.colors.map(c=>colors[c]));
    return {...data,number};
  }
  window.HeapRules={amount,complete,available,initial,apply,autoClear,won,lost,moves,solve,level,exposure,blockers,validateSolution};
})();
