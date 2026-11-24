// Run: node scripts/check-tactician.cjs (no browser/dependencies).
// GIFTED-004B (#42) targeted checks for tactician-1 on the real engine:
//  1. scenarios: card synergy, effects of all three factions (Engineer, Astromancer, Keeper),
//     target choice, open/unknown locations and location rules, both initiative orders and a tie,
//     two-location priority and the final result, skipping to save the result;
//  2. full matches against Novice on both seats: a plan on every turn, no refused (illegal) action;
//  3. no side effects on the real match: state, uid counter, log and real Math.random untouched;
//  4. plans unchanged when only hidden state changes; sandbox independent of the match RNG.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const SRC=fs.readFileSync('tutorial.js','utf8')+'\n'+fs.readFileSync('game.js','utf8');
const lcg=seed=>{let n=seed>>>0;return ()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);};
function boot(seed=1){
 const trace=[],math=Object.create(Math);let src=lcg(seed);math.random=()=>{const v=src();trace.push(v);return v;};
 const ctx=vm.createContext({Math:math,console,performance,setTimeout,__rngCalls:()=>trace.length});vm.runInContext(SRC,ctx);
 return {run:s=>vm.runInContext(s,ctx),trace,setRandom:f=>{src=f;}};
}
const J=(t,s)=>JSON.parse(t.run(`JSON.stringify(${s})`));
// Builds a planning position for side `side` on turn `turn`. lanes: [{loc, me:[[id,buff]], foe:[[id,buff]], foeHidden}]
function position(t,{side='e',turn,hand,lanes,energy=turn,foeHand=3}){
 const o=side,f=side==='p'?'e':'p';
 t.run(`FAST=true;newGame('eng');setAiStrategy('${o}','tactician');G.turn=${turn};G.phase='plan';G.spent={p:0,e:0};G.spent.${o}=${turn-energy};
  G.board=[[],[],[]];G.trap=[{p:false,e:false},{p:false,e:false},{p:false,e:false}];G.blockedUntil={p:[0,0,0],e:[0,0,0]};G.locDisabledUntil=[0,0,0];
  G.discount={p:0,e:0};G.surcharge={p:0,e:0};G.surchargeTurn={p:0,e:0};
  var mk=(id,owner,lane,buff,state)=>{const c=inst(CARDS.find(x=>x.id===id),owner);c.buff=buff||0;if(lane>=0){c.lane=lane;c.revealed=state!=='hidden';c.pending=state==='hidden';G.board[lane].push(c);}return c;};
  G.hand.${o}=${JSON.stringify(hand)}.map(id=>mk(id,'${o}',-1));G.hand.${f}=G.deck.${f}.splice(0,${foeHand});`);
 lanes.forEach((L,l)=>{
  t.run(`G.locs[${l}]=${L.loc?`LOCS.find(x=>x.id==='${L.loc}')`:'G.locs[0]'};G.locRev[${l}]=${!!L.loc};`);
  for(const [id,b] of L.me||[])t.run(`mk('${id}','${o}',${l},${b||0})`);
  for(const [id,b] of L.foe||[])t.run(`mk('${id}','${f}',${l},${b||0})`);
  for(let i=0;i<(L.foeHidden||0);i++)t.run(`mk('e1','${f}',${l},0,'hidden')`);
 });
 if(lanes.some(L=>!L.loc))t.run(`for(let l=0;l<3;l++)if(!G.locRev[l])G.locs[l]=LOCS.find(x=>x.id==='well');`);
}
const played=(t,o)=>J(t,`G.board.map(l=>l.filter(c=>c.owner==='${o}'&&c.pending).map(c=>c.def.id))`);
function plan(t,o){t.run(`var __refused=0;{const s=AI_STRATEGIES.tactician;const ctx=aiContext('${o}');const play=ctx.play;ctx.play=(u,l)=>{const r=play(u,l);if(!r)__refused++;return r;};s.plan(ctx);}`);
 assert.equal(t.run('__refused'),0,'tactician attempted an illegal play');return played(t,o);}
const pendingIds=(t,o,ids)=>plan(t,o).map(l=>l.filter(id=>ids.includes(id)));

(async()=>{
 const results=[];
 for(const side of ['p','e']){
  // 1a. Engineer synergy: Smith (+3 with an own artifact here) goes to the lane with the artifact.
  {const t=boot();position(t,{side,turn:4,energy:3,hand:['e6'],lanes:[
    {loc:'forge',me:[['e3',2]],foe:[['e1',3]]},{loc:'waste',me:[['e1',1]],foe:[['e1',3]]},{loc:'well',foe:[['e12',20]]}]});
   // forge +1 on play: lane0 3+3+1+3=10 vs 6; lane1 waste: 3-1+3... the artifact synergy decides
   assert.deepEqual(pendingIds(t,side,['e6']),[['e6'],[],[]],`${side}: Smith must join the artifact`);results.push('eng synergy');}
  // 1b. Keeper effect: Executioner destroys the weakest enemy card; it flips lane 0.
  {const t=boot();position(t,{side,turn:4,hand:['k7'],lanes:[
    {loc:'forge',me:[['k12',-6]],foe:[['e1',2]]},{loc:'well',me:[['k12',0]],foe:[['e1',0]]},{loc:'waste',foe:[['e12',15],['e1',3]]}]});
   // lane 0: 3 vs 5 -> Executioner removes the 5, 7:0; lane 2 stays lost after removing its weakest card.
   assert.deepEqual(plan(t,side),[['k7'],[],[]],`${side}: Executioner must remove the card that decides lane 0`);results.push('kee destroy');}
  // 1c. Astromancer effect: Starfall (+2 if losing here) where the bonus wins the lane.
  {const t=boot();position(t,{side,turn:5,energy:4,hand:['a8'],lanes:[
    {loc:'well',me:[['a11',0]],foe:[['e1',0]]},{loc:'forge',me:[],foe:[['e9',1]]},{loc:'waste',foe:[['e12',20]]}]});
   // lane1: forge 6+1, losing 0:9 -> +2 = 9:9 tie; lane1 only reasonable flip is with the bonus. lane0 is already won.
   const p=plan(t,side);assert.equal(p[2].length,0,`${side}: no card into a hopeless lane`);assert.equal(p[0].length,0,`${side}: no overkill in a won lane`);
   assert.deepEqual(p[1],['a8'],`${side}: Starfall must use its losing-lane bonus`);results.push('ast effect');}
  // 1d. Two-location priority on the final turn and no overkill.
  {const t=boot();position(t,{side,turn:6,energy:3,foeHand:0,hand:['e1','k12'],lanes:[
    {loc:'well',me:[['e12',10]],foe:[['e1',0]]},{loc:'forge',me:[['e1',0]],foe:[['e1',2]]},{loc:'waste',me:[],foe:[['e12',30]]}]});
   const p=plan(t,side);assert(p[1].includes('e1'),`${side}: the final card must take the second location`);assert.equal(p[0].length,0,`${side}: no card into the won lane`);results.push('two lanes');}
  // 1e. Skip: on the final turn the only open lane is a Crooked Arena that we win with less power.
  {const t=boot();position(t,{side,turn:6,energy:6,foeHand:0,hand:['e1','e9'],lanes:[
    {loc:'arena',me:[['e1',-2]],foe:[['e1',0]]},{loc:'tower',me:[['e1',0],['e1',0]],foe:[['e1',-2]]},{loc:'fog',me:[],foe:[['e12',30]]}]});
   assert.deepEqual(plan(t,side),[[],[],[]],`${side}: playing would lose the arena; Tower is full and Fog closed`);results.push('skip/rules');}
  // 1f. Unknown locations: early turn plays may go to unrevealed lanes, only legally.
  {const t=boot();position(t,{side,turn:1,hand:['e1','k1','a2'],lanes:[{loc:'tower'},{},{}]});
   const p=plan(t,side);assert(p.flat().length>=1,`${side}: turn 1 must develop`);assert(J(t,`observe('${side}').lanes.map(l=>l.location)`).slice(1).every(x=>x===null),'unrevealed locations stay hidden');results.push('unknown locations');}
 }
 // 1i. Final turn as the AI side, before the opponent acts (no face-down cards yet, 3 cards in hand):
 // narrow leads are not treated as decided, so the Tactician reinforces them instead of passing.
 {const t=boot();position(t,{side:'e',turn:6,energy:6,foeHand:3,hand:['e1','k12'],lanes:[
   {loc:'well',me:[['e1',0]],foe:[['e1',-1]]},{loc:'forge',me:[['e1',0]],foe:[['e1',-1]]},{loc:'waste',foe:[['e12',30]]}]});
  const p=plan(t,'e');assert(p[0].length+p[1].length>=1,'the opponent may still act: narrow leads must be reinforced');assert.equal(p[2].length,0);
  results.push('opponent still to act');}
 // 1g. Target choice through the shared interface (Owl blocks the contested lane; Supernova flips a lane;
 // Astromancer discards the strongest card; optional choice declined when moving would not help).
 {const t=boot();position(t,{side:'e',turn:4,hand:[],lanes:[{loc:'well',me:[['a11',0],['e1',0]],foe:[['e1',0]]},{loc:'forge',foe:[['e1',-1]]},{loc:'waste',me:[],foe:[['e12',20]]}]});
  // margins +10, -2, -20: Owl blocks lane 1; Supernova moves the 3-power card from lane 0 (still won) to win lane 1.
  t.run("setAiStrategy('e','tactician')");
  assert.equal(await t.run("chooseAstroLane('Owl',[0,1,2],'e',()=>0,false,'a5')"),1,'Owl must block the contested lane');
  const src=t.run("G.board[0].find(c=>c.owner==='e'&&c.def.id==='e1').uid");
  assert.equal(await t.run("(async()=>{const c=await chooseAstroCard('Supernova',G.board.flat().filter(c=>c.owner==='e'),'e',()=>0,true,'a12');return c&&c.uid})()"),src,'Supernova must move the surplus card');
  assert.equal(await t.run("chooseAstroLane('Supernova lane',[1,2],'e',()=>0,true,'a12')"),1,'and move it to the contested lane');
  t.run("G.hand.p=[inst(CARDS.find(x=>x.id==='e1'),'p'),inst(CARDS.find(x=>x.id==='e11'),'p'),inst(CARDS.find(x=>x.id==='e3'),'p')]");
  assert.equal(await t.run("(async()=>{const c=await chooseAstroCard('Астромантка: выбери карту соперника для сброса',G.hand.p,'e',()=>0,false,'a10');return c.def.id})()"),'e11');
  results.push('target choice');}
 // 1h. Initiative: one branch when totals differ, both branches on a tie (counted in the sandbox).
 {for(const [foeBuff,branches] of [[1,1],[0,2]]){const t=boot();
   position(t,{side:'e',turn:3,hand:['e1'],lanes:[{loc:'well',me:[['e1',0]],foe:[['e1',foeBuff]]},{loc:'forge'},{loc:'waste'}]});
   t.run("var __rev=0;const __sr=sandboxReveal;sandboxReveal=(f,c)=>{__rev++;return __sr(f,c);};");
   const plans=t.run("tacticianPlans(observe('e'),tacticianState(observe('e'))).length");plan(t,'e');
   assert.equal(t.run('__rev'),plans*t.run('TACTICIAN.samples')*branches,`initiative branches: expected ${branches}`);}
  results.push('initiative branches');}

 // 2./3. Full matches vs Novice on both seats: a plan in phase 'plan' on every turn, no refused action,
 // nothing but its own plays changed, and no draw from the real Math.random during planning.
 let matches=0,calls=0;
 for(const seat of ['p','e'])for(const f of ['eng','ast','kee'])for(let seed=1;seed<=10;seed++){
  const t=boot(seed);
  t.run(`var __calls=[];const __s=AI_STRATEGIES.tactician;AI_STRATEGIES.tactician=Object.freeze({...__s,plan(ctx){
    const o=ctx.side,f=o==='p'?'e':'p';
    const snap=()=>JSON.stringify([G.board.map(l=>l.filter(c=>!(c.owner===o&&c.pending)).map(c=>[c.uid,c.def.id,c.buff,c.lane,c.revealed])),
     G.hand[f].map(c=>c.uid),G.deck.p.map(c=>c.uid),G.deck.e.map(c=>c.uid),UID,logLines,G.discount[f],G.surcharge[f],G.spent[f],G.blockedUntil,G.trap,G.locRev,G.locs.map(l=>l.id),G.locDisabledUntil,G.turn,G.phase]);
    const before=snap(),n0=__rngCalls(),r0=Math.random;let refused=0;const play=ctx.play;ctx.play=(u,l)=>{const r=play(u,l);if(!r)refused++;return r;};
    __s.plan(ctx);__calls.push({turn:G.turn,phase:ctx.observation.phase,refused,same:snap()===before&&Math.random===r0,rng:__rngCalls()-n0});}});
   setAiStrategy('${seat}','tactician');FAST=true;newGame('${f}')`);
  for(let i=0;i<6;i++)await t.run("(async()=>{aiPlan('p');await endTurn()})()");
  assert.equal(t.run('G.phase'),'over');
  const log=J(t,'__calls'),tag=`${seat} ${f}#${seed}`;
  assert.deepEqual(log.map(x=>x.turn),[1,2,3,4,5,6],tag+': one plan per turn');
  for(const x of log){
   assert.equal(x.phase,'plan',`${tag} turn ${x.turn}: phase`);assert.equal(x.refused,0,`${tag} turn ${x.turn}: illegal play attempted`);
   assert(x.same,`${tag} turn ${x.turn}: planning changed the match beyond its own plays`);assert.equal(x.rng,0,`${tag} turn ${x.turn}: planning used the real Math.random`);
  }
  matches++;calls+=log.length;
 }
 // 4. Hidden-state perturbation (opponent hand, face-down cards, deck orders/content, unrevealed
 // locations, real RNG state): the plan of side o at every turn must not change.
 const hide=`(o)=>{const f=o==='p'?'e':'p',pool=CARDS.filter(c=>!G.board.flat().some(b=>b.def===c));
  G.hand[f]=G.hand[f].map((c,i)=>{const x=inst(pool[(i*7+3)%pool.length],f);x.uid=c.uid;return x;});
  G.deck.p.reverse();G.deck.e.reverse();if(G.deck[f].length)G.deck[f][0]=inst(pool[1],f);
  for(const c of G.board.flat())if(c.owner===f&&c.pending){c.def=pool[(c.uid*5)%pool.length];c.buff=4;c.uid+=10000;}
  for(let l=0;l<3;l++)if(!G.locRev[l])G.locs[l]=LOCS.find(x=>!G.locs.includes(x)&&x.id!==G.locs[l].id)||G.locs[l];}`;
 let points=0;
 for(const f of ['eng','ast','kee'])for(let seed=1;seed<=10;seed++)for(const o of ['p','e'])for(let turn=1;turn<=6;turn++){
  const replay=async()=>{const t=boot(seed);
   t.run(`registerAiStrategy({id:'hold',version:'test-1',legacy:true,plan(){}});setAiStrategy('e','hold');FAST=true;newGame('${f}')`);
   for(let i=1;i<turn;i++){t.run("noviceAiPlan('e');noviceAiPlan('p')");await t.run('endTurn()');}
   if(o==='p')t.run("noviceAiPlan('e')");return t;};
  const a=await replay(),b=await replay();if(a.run('G.phase')!=='plan')continue;
  b.run(`(${hide})('${o}')`);b.setRandom(lcg(999));b.run('Math.random();Math.random()');
  const go=t=>{t.run(`AI_STRATEGIES.tactician.plan(aiContext('${o}'))`);return t.run(`JSON.stringify(G.board.map(l=>l.filter(c=>c.owner==='${o}'&&c.pending).map(c=>c.def.id+'@'+c.uid)))`);};
  assert.equal(go(b),go(a),`plan changed with hidden state: ${f}#${seed} ${o} turn ${turn}`);points++;
 }
 // Sandbox determinism: the same position gives the same plan twice in a row.
 {const t=boot(4);t.run("FAST=true;newGame('ast')");const p1=t.run("JSON.stringify(tacticianPlans(observe('e'),tacticianState(observe('e'))).length)");
  assert.equal(t.run("JSON.stringify(tacticianPlans(observe('e'),tacticianState(observe('e'))).length)"),p1);}
 console.log(`PASS: tactician scenarios (${[...new Set(results)].join(', ')}) for both sides; ${matches} full matches vs Novice (${calls} plans): phase plan every turn, no illegal action, no side effects, no real RNG use; plans unchanged by hidden state at ${points} points`);
})().catch(e=>{console.error(e);process.exitCode=1});
