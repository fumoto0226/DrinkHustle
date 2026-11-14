const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
global.window=global;require(path.join(root,'heap-shapes.js'));require(path.join(root,'heap-rules.js'));
const R=HeapRules,source=JSON.parse(fs.readFileSync(path.join(root,'docs/level-source-003.json')));
const id=old=>old>=30?old-30:old+2;
const solution=source.solution.map(m=>m.type==='pick'?{type:'pick',id:id(m.id)}:{type:'pour',from:id(m.a),to:id(m.b)});
const order=solution.filter(m=>m.type==='pick').map(m=>m.id);
function candidate(seed){
 let value=seed;const rnd=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
 const bottles=[{colors:[],style:0},{colors:[],style:0}];
 const phase=rnd()*Math.PI*2;
 for(let i=0;i<30;i++){
  const phi=i*2.39996323+phase+(rnd()-.5)*.38,r=Math.sqrt((i+.7)/30);
  bottles.push({colors:source.heap[i][0],style:0,pose:{
   x:+(.5+Math.cos(phi)*.327*r+(rnd()-.5)*.022).toFixed(5),
   y:+(Math.sin(phi)*.282*r+(rnd()-.5)*.022).toFixed(5),
   angle:Math.round(rnd()*360-180),z:20+30-order.indexOf(i+2),size:.10,
  }});
 }
 return {version:'2d-30-cup04-v1',number:1,bottles,solution};
}
function waves(level){let pile=R.initial(level).pile,result=[];while(pile.length){const free=pile.filter(id=>R.available(pile,level.bottles,id));if(!free.length)throw Error('coverage cycle');result.push(free);pile=pile.filter(id=>!free.includes(id));}return result;}
function opening(level){
 let sequences=0,safe=0,probability=0;
 function walk(pile,picks,weight){
  if(picks.length===3){sequences++;const count=Array(5).fill(0);picks.forEach(id=>level.bottles[id].colors.forEach(c=>count[c]++));if(count.some(n=>n>=4)){safe++;probability+=weight;}return;}
  const free=pile.filter(id=>R.available(pile,level.bottles,id));
  for(const id of free)walk(pile.filter(n=>n!==id),[...picks,id],weight/free.length);
 }
 walk(R.initial(level).pile,[],1);return {sequences,safe,safeProbability:probability};
}
let chosen=null,best=-Infinity;
for(let seed=1;seed<=24;seed++){
 const level=candidate(seed),ws=waves(level),free=ws[0].length;
 if(free<6||free>10)continue;
 const exposure=ws.flat(),chunks=[exposure.slice(0,10),exposure.slice(10,20),exposure.slice(20)];
 const complexity=chunks.map(ids=>ids.reduce((n,id)=>n+new Set(level.bottles[id].colors).size,0)/ids.length);
 const open=opening(level);const score=open.safeProbability*10+(complexity[2]-complexity[0])*2-Math.abs(free-8)*.08;
 if(score>best){best=score;chosen={level,report:{seed,free,waves:ws.map(a=>a.length),complexity,...open}};}
 if(open.safeProbability>=.94 && complexity[2]>=complexity[0]+.2)break;
}
if(!chosen)throw Error('No suitable geometry');
if(!R.validateSolution(chosen.level,solution))throw Error('Reference path fails 2D validation');
const totals=Array(5).fill(0),mix={2:0,3:0,4:0};chosen.level.bottles.slice(2).forEach(b=>{b.colors.forEach(c=>totals[c]++);mix[new Set(b.colors).size]++;});
chosen.level.report={...chosen.report,totals,mix,solutionLength:solution.length};
fs.writeFileSync(path.join(root,'heap-level.js'),'// Reference level-003 colours, certified again against the 2D SVG coverage.\nwindow.HeapLevelData='+JSON.stringify(chosen.level)+';\n');
fs.writeFileSync(path.join(root,'docs/level-30-analysis.json'),JSON.stringify(chosen.level.report,null,2)+'\n');
console.log(chosen.level.report);
