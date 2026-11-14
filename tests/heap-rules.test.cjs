const test=require('node:test');const assert=require('node:assert/strict');
global.window=global;require('../heap-shapes.js');require('../heap-level.js');require('../heap-rules.js');
const R=HeapRules;
test('30 mixed bottles, five colours × 24 portions, two empty hand bottles and three vacancies',()=>{
 const level=R.level(),s=R.initial(level),totals=Array(5).fill(0),mix={2:0,3:0,4:0};
 assert.deepEqual(s.slots,[0,1,null,null,null]);assert.equal(s.pile.length,30);
 s.water.flat().forEach(c=>totals[c]++);assert.deepEqual(totals,[24,24,24,24,24]);
 level.bottles.slice(2).forEach(b=>mix[new Set(b.colors).size]++);assert.deepEqual(mix,{2:12,3:16,4:2});
 assert.ok(level.bottles.slice(2).some(b=>Math.abs(b.pose.angle)>130));assert.ok(level.bottles.slice(2).some(b=>Math.abs(b.pose.angle)>70&&Math.abs(b.pose.angle)<110));
 const arrangements=new Set(level.bottles.slice(2).map(b=>b.colors.map((c,_,a)=>a.indexOf(c)).join('')));assert.ok(arrangements.size>=6);
});
test('pickable bottles use actual SVG overlap and release after covering bottles leave',()=>{
 const level=R.level(),pile=R.initial(level).pile,model=R.exposure(pile,level.bottles);
 const initialFree=[...model.free],initialBlocked=pile.filter(id=>!initialFree.includes(id));
 assert.equal(initialFree.length,level.report.free);assert.ok(initialFree.length>=6&&initialFree.length<=10);assert.ok(initialBlocked.length>0);
 for(const id of initialFree)assert.ok(model.coverage.get(id)<=.1);
 let remaining=pile.filter(id=>!initialFree.includes(id));
 const next=remaining.filter(id=>R.available(remaining,level.bottles,id));assert.ok(next.length>0);assert.ok(next.some(id=>initialBlocked.includes(id)));
 assert.equal(R.available(pile,level.bottles,-1),false);
});
test('top runs accept different colours; capacity and cleared slots are respected',()=>{
 assert.equal(R.amount([0,1,1],[2,2,2]),1);assert.equal(R.amount([0,1,1],[]),2);assert.equal(R.amount([1],[2,2,2,2]),0);
 const s={water:[[2,2],[2,2],[]],slots:[0,1,2,null,null],pile:[]},next=R.apply(s,{type:'pour',from:0,to:1});
 assert.deepEqual(s.water,[[2,2],[2,2],[]]);assert.deepEqual(next.water,[[],[],[]]);assert.deepEqual(next.slots,[0,null,2,null,null]);
});
test('failure requires full hand and fewer than four of every colour',()=>{
 assert.equal(R.lost({water:[[0,1],[2,3],[4,0],[1,2],[3,4]],slots:[0,1,2,3,4],pile:[5]}),true);
 assert.equal(R.lost({water:[[0,0],[0,0],[1],[2],[3]],slots:[0,1,2,3,4],pile:[5]}),false);
});
test('126-step certificate replays legally with 30 clears and 120 portions conserved',()=>{
 const level=R.level(),path=R.solve(level);assert.equal(path.length,126);assert.ok(R.validateSolution(level,path));
 let state=R.initial(level),removed=0;
 for(const move of path){
  if(move.type==='pick'){assert.ok(state.slots.includes(null));assert.ok(R.available(state.pile,level.bottles,move.id));}
  else {assert.ok(state.slots.includes(move.from)&&state.slots.includes(move.to));assert.ok(R.amount(state.water[move.from],state.water[move.to])>0);}
  const before=state.water.flat().length;state=R.apply(state,move);removed+=before-state.water.flat().length;
  assert.equal(state.water.flat().length+removed,120);assert.ok(state.water.every(a=>a.length<=4));assert.equal(state.slots.length,5);assert.equal(R.lost(state),false);
 }
 assert.ok(R.won(state));assert.equal(removed,120);
});
test('same round is deterministic; colour permutations preserve a winning path',()=>{
 assert.deepEqual(R.level(4),R.level(4));
 for(const n of [2,3,8,17]){const level=R.level(n);assert.ok(R.validateSolution(level,level.solution));}
});
test('blocked-click feedback identifies actual remaining occluders',()=>{
 const level=R.level(),pile=R.initial(level).pile,model=R.exposure(pile,level.bottles);
 const blocked=pile.filter(id=>!model.free.has(id)&&model.visible.get(id).length);
 assert.ok(blocked.length);
 for(const id of blocked){
  const covers=R.blockers(pile,level.bottles,id);assert.ok(covers.length);
  for(const b of covers){assert.ok(pile.includes(b.id));assert.ok(level.bottles[b.id].pose.z>level.bottles[id].pose.z);assert.ok(b.fraction>=.01);}
  const removed=covers[0].id;assert.ok(R.blockers(pile.filter(n=>n!==removed),level.bottles,id).every(b=>b.id!==removed));
 }
 assert.deepEqual(R.blockers([],level.bottles,2),[]);
});
test('auto assist gathers buried matches, releases one bottle and preserves every other portion',()=>{
 const s={water:[[0,1,0],[2,0,3],[0,2,3,1],[],[]],slots:[0,1,2,3,4],pile:[]};
 const original=structuredClone(s),r=R.autoClear(s);assert.ok(r);assert.equal(r.color,0);assert.deepEqual(s,original);
 const before=Array(5).fill(0),after=Array(5).fill(0);s.water.flat().forEach(c=>before[c]++);r.state.water.flat().forEach(c=>after[c]++);
 before[0]-=4;assert.deepEqual(after,before);assert.equal(r.state.slots.filter(x=>x===null).length,1);assert.ok(r.state.water.every(a=>a.length<=4));
 assert.deepEqual(r.state.water[r.elim],[]);
});
test('auto assist never overflows: 2000 varied five-bottle hands',()=>{
 let seed=9234;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let k=0;k<2000;k++){
  const water=Array.from({length:5},()=>Array.from({length:Math.floor(rnd()*5)},()=>Math.floor(rnd()*5)));
  const state={water,slots:[0,1,2,3,4],pile:[]},plan=R.autoClear(state),count=Array(5).fill(0);water.flat().forEach(c=>count[c]++);
  if(!plan){assert.ok(count.every(n=>n<4));continue;}
  const remaining=Array(5).fill(0);plan.state.water.flat().forEach(c=>remaining[c]++);count[plan.color]-=4;
  assert.deepEqual(remaining,count);assert.ok(plan.state.water.every(a=>a.length<=4));assert.equal(plan.state.slots.filter(id=>id!==null).length,4);
 }
});
