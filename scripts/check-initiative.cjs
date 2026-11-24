// Run: node scripts/check-initiative.cjs (no browser/dependencies).
// GIFTED-003 (#38): before each reveal, the side with more total power of already revealed cards
// (laneTotal, the displayed lane scores, with buffs and ongoing modifiers) reveals all its cards
// first; an exact tie is decided by one 50/50 lot per turn; the order is fixed for the turn.
// Black Market only targets revealed enemy cards and never retries. Uses the real endTurn reveal;
// the opponent AI planner is disabled and locations are kept hidden so no location rule interferes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function boot(rand){
 const math=Object.create(Math);let calls=0,src=()=>.42;math.random=()=>{calls++;return src();};
 const ctx=vm.createContext({Math:math,console,performance,setTimeout});
 vm.runInContext(fs.readFileSync('tutorial.js','utf8')+'\n'+fs.readFileSync('game.js','utf8'),ctx);
 const run=s=>vm.runInContext(s,ctx);
 run("FAST=true;aiPlan=function(){};newGame('eng');G.board=[[],[],[]];G.hand={p:[],e:[]};G.deck={p:[],e:[]};G.locRev=[false,false,false];");
 run("var __seq=[],__first=[];const __say=say;say=function(t){const m=/^(Ты|Враг): «/.exec(t);if(m)__seq.push(m[1]==='Ты'?'p':'e');if(/раскрываются первыми/.test(t))__first.push(t.startsWith('Твои')?'p':'e');return __say(t);};");
 src=rand;calls=0;// newGame setup uses its own random draws; the scenario's source starts here.
 return {run,calls:()=>calls};
}
// Puts a card on the board. revealed=false makes it a hidden card of the current turn.
const put=(run,id,o,lane,{revealed=true,buff=0}={})=>run(`(()=>{const c=inst(CARDS.find(x=>x.id==='${id}'),'${o}');c.lane=${lane};c.buff=${buff};c.revealed=${revealed};c.pending=${!revealed};G.board[${lane}].push(c);return c.uid;})()`);
const alive=(run,uid)=>run(`G.board.flat().some(c=>c.uid===${uid})`);
async function reveal(t){t.run('__seq=[];G.locRev=[false,false,false]');const before=t.calls();await t.run('endTurn()');
 return {first:t.run('__first[__first.length-1]'),seq:JSON.parse(t.run('JSON.stringify(__seq)')),lots:t.calls()-before};}
const other=o=>o==='p'?'e':'p';
const never=()=>{throw Error('unexpected random call');};

(async()=>{
 for(const x of ['p','e']){const y=other(x);
  // 1. More total power wins initiative even while losing more lanes (x 12 total, 1 lane; y 5 total, 2 lanes).
  {const t=boot(never);
   put(t.run,'e1',x,0,{buff:7});put(t.run,'e1',x,1,{buff:-2});put(t.run,'e1',x,2,{buff:-2});
   put(t.run,'e1',y,0,{buff:-2});put(t.run,'e1',y,1,{buff:-1});put(t.run,'e1',y,2,{buff:-1});
   assert.deepEqual(JSON.parse(t.run('JSON.stringify([0,1,2].map(laneWinner))')),[x,y,y]);
   put(t.run,'e1',x,0,{revealed:false});put(t.run,'e1',y,1,{revealed:false});
   const r=await reveal(t);assert.equal(r.first,x);assert.deepEqual(r.seq,[x,y]);assert.equal(r.lots,0,'no lot without a tie');}
  // 2. Hidden cards of the current turn do not count (x revealed 3 + hidden 12 vs y revealed 5).
  {const t=boot(never);
   put(t.run,'e1',x,0);put(t.run,'e1',y,1,{buff:2});
   put(t.run,'e1',x,2,{revealed:false,buff:9});put(t.run,'e1',y,2,{revealed:false});
   const r=await reveal(t);assert.equal(r.first,y,'hidden power must not give initiative');assert.deepEqual(r.seq,[y,x]);}
  // 3. Current modifiers count: x raw 9 but Keeper hero gives all x cards -1 (6); y 3 + 3 + buff 1 = 7.
  {const t=boot(never);
   for(const l of [0,1,2])put(t.run,'e1',x,l);put(t.run,'k10',y,0);put(t.run,'e1',y,1,{buff:1});
   assert.equal(t.run(`[0,1,2].reduce((s,l)=>s+laneTotal(l,'${x}'),0)`),6);
   put(t.run,'e1',x,2,{revealed:false});put(t.run,'e1',y,2,{revealed:false});
   const r=await reveal(t);assert.equal(r.first,y,'modified totals decide');assert.deepEqual(r.seq,[y,x]);}
  // 4. Power changes during the reveal do not change the chosen order: y leads 6:5, its first card
  //    (Raven, -2 to x's strongest here) flips the totals, yet y's second card still reveals before x.
  {const t=boot(never);
   put(t.run,'e1',x,0,{buff:2});put(t.run,'e1',y,0,{buff:3});
   put(t.run,'k4',y,0,{revealed:false});put(t.run,'e1',y,1,{revealed:false,buff:-3});put(t.run,'e1',x,1,{revealed:false});
   const r=await reveal(t);assert.equal(r.first,y);assert.deepEqual(r.seq,[y,y,x],'order must stay fixed for the turn');}
 }
 // 5. Exact tie, including the empty board of turn 1: one 50/50 lot per turn, both branches.
 for(const [lot,side] of [[.1,'p'],[.49,'p'],[.5,'e'],[.9,'e']]){
  {const t=boot(()=>lot);assert.equal(t.run('G.turn'),1);
   put(t.run,'e1','p',0,{revealed:false});put(t.run,'e1','e',1,{revealed:false});
   const r=await reveal(t);assert.equal(r.lots,1,'turn-1 tie draws exactly one lot');assert.equal(r.first,side);assert.deepEqual(r.seq,[side,other(side)]);}
  {const t=boot(()=>lot);put(t.run,'e1','p',0);put(t.run,'e1','e',1);
   put(t.run,'e1','p',2,{revealed:false});put(t.run,'e1','e',2,{revealed:false});
   const r=await reveal(t);assert.equal(r.lots,1);assert.equal(r.first,side,'non-empty tie');}
 }
 // 6. The same seed reproduces the same initiative sequence over full AI matches; another seed may differ.
 const seqFor=async seed=>{let n=seed;const math=Object.create(Math);math.random=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
  const ctx=vm.createContext({Math:math,console,performance,setTimeout});vm.runInContext(fs.readFileSync('tutorial.js','utf8')+'\n'+fs.readFileSync('game.js','utf8'),ctx);
  const run=s=>vm.runInContext(s,ctx);run("var __first=[];const __say=say;say=function(t){if(/раскрываются первыми/.test(t))__first.push(t[0]);return __say(t);};FAST=true;newGame('kee')");
  for(let i=0;i<6;i++)await run("(async()=>{aiPlan('p');await endTurn()})()");return run('__first.join("")+G.result');};
 assert.equal(await seqFor(77),await seqFor(77),'same seed must reproduce initiative and result');
 // 7. Black Market (k11) targets only revealed enemy cards in its lane, in both reveal orders.
 for(const k of ['p','e']){const f=other(k);
  {const t=boot(never);// Market side first: revealed 3 is destroyed, hidden 9 survives.
   put(t.run,'e1',k,1,{buff:20});const r3=put(t.run,'e1',f,0),h9=put(t.run,'e1',f,0,{revealed:false,buff:6});
   put(t.run,'k11',k,0,{revealed:false});
   const r=await reveal(t);assert.equal(r.first,k);
   assert.equal(alive(t.run,r3),false,'Market must destroy the strongest revealed enemy');assert.equal(alive(t.run,h9),true,'Market must not touch hidden cards');}
  {const t=boot(never);// Market side first, no revealed target: nothing happens and nothing is deferred.
   put(t.run,'e1',k,1,{buff:20});const h9=put(t.run,'e1',f,0,{revealed:false,buff:6});
   const m=put(t.run,'k11',k,0,{revealed:false});
   const r=await reveal(t);assert.equal(r.first,k);assert.equal(alive(t.run,h9),true,'no retry after the target reveals');
   assert.equal(t.run('G.board[0].length'),2);assert.equal(alive(t.run,m),true);
   await reveal(t);assert.equal(alive(t.run,h9),true,'no delayed trigger on a later turn');}
  {const t=boot(never);// Enemy first: its card is revealed before the Market and is the strongest target.
   put(t.run,'e1',f,1,{buff:20});const r3=put(t.run,'e1',f,0),h9=put(t.run,'e1',f,0,{revealed:false,buff:6});
   put(t.run,'k11',k,0,{revealed:false});
   const r=await reveal(t);assert.equal(r.first,f);assert.deepEqual(r.seq,[f,k]);
   assert.equal(alive(t.run,h9),false,'Market must destroy the strongest revealed enemy (9)');assert.equal(alive(t.run,r3),true);}
 }
 console.log('PASS: initiative by total revealed power for both sides (beats lane count, hidden ignored, modifiers counted, order fixed), ties incl. empty turn 1 with both lot branches, seed reproducible, Black Market in both orders');
})().catch(e=>{console.error(e);process.exitCode=1});
