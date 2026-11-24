// Run: node scripts/check-ai-architecture.cjs [baseline-ref=2923eafca24d8b23ec0b3de71306ca555919b782]
// GIFTED-004A (#40). Checks, without a browser:
//  1. Baseline preservation: 90 seeded normal matches and the tutorial (both turn-1 lots) produce the
//     same Math.random call sequence and the same engine state after every turn as the baseline commit.
//  2. Strategy interface: registry validation, Novice by default, independent choice per side,
//     legal-action validation and automatic target choice for non-legacy strategies; full six-turn
//     matches where a non-legacy strategy places cards on every turn for p, for e and for both.
//  3. Visibility boundary: observe(side) is unchanged when only hidden state changes (opponent hand,
//     face-down cards, deck orders, unrevealed locations, random state) and changes with public state.
//  4. Legacy Novice check (empirical, scope below): its plan does not change under the same hidden
//     perturbations at every planning point of the 90 matches. Target choices are checked by code review.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),{execFileSync}=require('child_process');
const ref=process.argv[2]||'2923eafca24d8b23ec0b3de71306ca555919b782';
const git=a=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const base={game:git(['show',ref+':game.js']),tutorial:git(['show',ref+':tutorial.js'])};
const current={game:fs.readFileSync('game.js','utf8'),tutorial:fs.readFileSync('tutorial.js','utf8')};
const lcg=seed=>{let n=seed>>>0;return ()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);};
function boot(src,rand,extra={}){
 const trace=[],math=Object.create(Math);let source=rand;math.random=()=>{const v=source();trace.push(v);return v;};
 const ctx=vm.createContext({Math:math,console,performance,setTimeout,...extra});
 vm.runInContext(src.tutorial+'\n'+src.game,ctx);
 return {run:s=>vm.runInContext(s,ctx),trace,setRandom:f=>{source=f;}};
}
const SNAP="JSON.stringify(G,(k,v)=>k==='def'?v.id:(k==='revAt'||k==='flash'||k==='info'?undefined:v))";
const digest=t=>crypto.createHash('sha256').update(JSON.stringify(t)).digest('hex');
async function normalTrace(src,seed,faction){
 const t=boot(src,lcg(seed));t.run(`FAST=true;newGame('${faction}')`);const snaps=[];
 for(let i=0;i<6;i++){await t.run("(async()=>{aiPlan('p');await endTurn()})()");snaps.push(t.run(SNAP));}
 assert.equal(t.run('G.phase'),'over');return {rng:digest(t.trace),calls:t.trace.length,state:digest(snaps)};
}
async function tutorialTrace(src,lot){
 const t=boot(src,()=>lot,{localStorage:{getItem(){},setItem(){}}});t.run('FAST=true;Tutorial.start()');const snaps=[];
 for(let turn=1;turn<=6;turn++){
  t.run("globalThis.tg=G.hand.p.find(c=>c.def.id===Tutorial.round()[0]);place('p',tg,Tutorial.round()[1])");
  if(turn===1)t.run("unplace(tg);place('p',tg,Tutorial.round()[1])");
  await t.run('endTurn()');snaps.push(t.run(SNAP));t.run('Tutorial.next()');
 }
 return {calls:t.trace.length,state:digest(snaps),result:t.run('G.result')};
}
const other=o=>o==='p'?'e':'p';
(async()=>{
 // 1. Baseline preservation. AI_CHECK_SKIP_BASELINE=1 is used only by check-ai-mutations.cjs to show
 // that the legacy honesty check (section 4) detects a cheating Novice on its own.
 let same=0;const skipBaseline=process.env.AI_CHECK_SKIP_BASELINE==='1';
 if(!skipBaseline)for(const f of ['eng','ast','kee'])for(let seed=1;seed<=30;seed++){
  const now=await normalTrace(current,seed,f),old=await normalTrace(base,seed,f);
  assert.deepEqual(now,old,`${f}#${seed}: RNG order or engine state differs from ${ref.slice(0,7)}`);same++;
 }
 if(!skipBaseline)for(const lot of [.1,.9])assert.deepEqual(await tutorialTrace(current,lot),await tutorialTrace(base,lot),'tutorial differs from baseline');

 // 2. Strategy interface.
 {const t=boot(current,lcg(5));
  assert.equal(t.run('aiStrategy("p").id+aiStrategy("e").id'),'novicenovice','Novice must be the default for both sides');
  assert.equal(t.run('JSON.stringify(AI_BASELINE)'),JSON.stringify({id:'novice',version:'novice-1',baseCommit:'2923eafca24d8b23ec0b3de71306ca555919b782'}));
  assert.equal(t.run("AI_STRATEGIES.novice.plan===noviceAiPlan&&AI_STRATEGIES.novice.legacy"),true);
  for(const bad of ["registerAiStrategy({id:'x'})","registerAiStrategy({id:'novice',version:'2',plan(){}})","setAiStrategy('p','missing')","setAiStrategy('x','novice')"])
   assert.throws(()=>t.run(bad),undefined,bad);
  t.run(`registerAiStrategy({id:'pass',version:'test-1',plan(){}});
   var __seen=[];registerAiStrategy({id:'probe',version:'test-1',plan(ctx){__seen.push(ctx);const h=ctx.observation.me.hand.filter(c=>c.cost<=ctx.observation.energy);
    for(const c of h){const l=ctx.observation.lanes.find(x=>x.canPlay);if(l&&ctx.play(c.uid,l.lane))break;}},
    choose(ctx,req){__seen.push(req);return req.options.length-1;}});`);
  for(const [a,b] of [['pass','novice'],['novice','pass']]){
   const g=boot(current,lcg(11));g.run(`registerAiStrategy({id:'pass',version:'test-1',plan(){}});setAiStrategy('p','${a}');setAiStrategy('e','${b}');FAST=true;newGame('eng')`);
   let placed={p:0,e:0};
   for(let i=0;i<6;i++){g.run("aiPlan('p')");for(const o of ['p','e'])placed[o]+=g.run(`G.board.flat().filter(c=>c.owner==='${o}'&&c.pending).length`);await g.run('endTurn()');}
   const passer=a==='pass'?'p':'e';
   assert.equal(placed[passer],0,'pass side must not play');assert(placed[other(passer)]>0,'novice side must still play');
  }
  // Legal-action validation and observation passed to a non-legacy strategy.
  const g=boot(current,lcg(3));
  g.run(`registerAiStrategy({id:'probe',version:'test-1',plan(ctx){globalThis.__ctx=ctx;}});setAiStrategy('e','probe');FAST=true;newGame('kee');`);
  assert.equal(g.run('__ctx.side'),'e');assert.equal(g.run('__ctx.observation.turn'),1);
  g.run("G.hand.e.push(inst(CARDS.find(c=>c.id==='k11'),'e'))");
  const k11=g.run("G.hand.e.find(c=>c.def.id==='k11').uid"),cheap=g.run("G.hand.e.find(c=>effCost('e',c)<=1)?.uid ?? -1"),foeCard=g.run('G.hand.p[0].uid');
  assert.equal(g.run(`__ctx.play(${k11},0)`),false,'unaffordable card must be refused');
  assert.equal(g.run(`__ctx.play(${foeCard},0)`),false,'opponent card must be refused');
  assert.equal(g.run(`__ctx.play(${k11},5)`),false,'invalid lane must be refused');
  g.run("G.blockedUntil.e[0]=G.turn");
  if(cheap>=0){assert.equal(g.run(`__ctx.play(${cheap},0)`),false,'blocked lane must be refused');
   g.run("G.blockedUntil.e[0]=0");assert.equal(g.run(`__ctx.play(${cheap},0)`),true,'legal play must succeed');
   assert.equal(g.run(`G.board[0].some(c=>c.uid===${cheap}&&c.pending)`),true);}
  // Phase check with an otherwise legal play: refused outside planning, accepted in planning.
  const ok=g.run("(()=>{G.spent.e=0;G.blockedUntil.e=[0,0,0];const c=inst(CARDS.find(x=>x.id==='e1'),'e');G.hand.e.push(c);return c.uid;})()");
  const freeLane=g.run('[0,1,2].find(l=>canPlay("e",l))');assert.notEqual(freeLane,undefined);
  for(const ph of ['reveal','lesson','over']){g.run(`G.phase='${ph}'`);assert.equal(g.run(`__ctx.play(${ok},${freeLane})`),false,`play outside planning must be refused (${ph})`);}
  g.run("G.phase='plan'");assert.equal(g.run(`__ctx.play(${ok},${freeLane})`),true,'the same play is legal during planning');
  // Automatic target choice: legacy keeps first-best argmax; others pick by index from public descriptors.
  const lanes=await g.run("chooseAstroLane('t',[0,1,2],'p',l=>[1,3,3][l])");assert.equal(lanes,1,'legacy first-best lane');
  g.run(`registerAiStrategy({id:'last',version:'test-1',plan(){},choose(ctx,req){globalThis.__req=req;return req.options.length-1;}});setAiStrategy('p','last')`);
  assert.equal(await g.run("chooseAstroLane('t',[0,1,2],'p',l=>[1,3,3][l])"),2);
  assert.equal(g.run("JSON.stringify(__req)"),JSON.stringify({kind:'lane',title:'t',optional:false,options:[{lane:0},{lane:1},{lane:2}]}));
  const pick=await g.run("(async()=>{const c=await chooseAstroCard('c',G.hand.e.slice(0,2),'p',x=>x.def.cost);return c.uid;})()");
  assert.equal(pick,g.run('G.hand.e[1].uid'));assert.deepEqual(Object.keys(JSON.parse(g.run("JSON.stringify(__req.options[0])"))).sort(),['cost','id','lane','power','uid']);
  g.run(`registerAiStrategy({id:'bad',version:'test-1',plan(){},choose(){return 9;}});setAiStrategy('p','bad')`);
  await assert.rejects(async()=>g.run("chooseAstroLane('t',[0,1],'p',()=>0)"),/invalid choice/);
 }

 // 2b. Full six-turn matches with a non-legacy strategy on side p, side e and both sides. The strategy
 // decides only from its observation and acts only through ctx.play(); the harness separately records,
 // from the engine, whether a legal play existed, so every refused or missed legal play is caught.
 {const STRAT=`var __log=[],__choices=[];registerAiStrategy({id:'greedy-test',version:'test-1',plan(ctx){
   const s=ctx.side,legal=G.hand[s].some(c=>effCost(s,c)<=G.turn-G.spent[s])&&[0,1,2].some(l=>canPlay(s,l));
   const e={side:s,turn:ctx.observation.turn,phase:ctx.observation.phase,legal,placed:0,refused:0};__log.push(e);
   for(let obs=ctx.observation;;obs=ctx.observe()){
    const card=obs.me.hand.filter(c=>c.cost<=obs.energy).sort((a,b)=>b.cost-a.cost||a.uid-b.uid)[0],lane=obs.lanes.find(l=>l.canPlay);
    if(!card||!lane)break;if(ctx.play(card.uid,lane.lane))e.placed++;else{e.refused++;break;}
   }},
   choose(ctx,req){__choices.push(req.kind);return 0;}});`;
  const configs=[['greedy-test','novice'],['novice','greedy-test'],['greedy-test','greedy-test']];
  let matches=0,plays=0,allTurnsBoth=0,choices=0;const covered={};
  for(const [pa,ea] of configs)for(const f of ['eng','ast','kee'])for(let seed=1;seed<=30;seed++){
   const g=boot(current,lcg(seed));g.run(STRAT+`setAiStrategy('p','${pa}');setAiStrategy('e','${ea}');FAST=true;newGame('${f}')`);
   for(let i=0;i<6;i++)await g.run("(async()=>{aiPlan('p');await endTurn()})()");
   assert.equal(g.run('G.phase'),'over');matches++;
   const log=JSON.parse(g.run('JSON.stringify(__log)')),tag=`${pa}/${ea} ${f}#${seed}`;
   const greedy=[pa==='greedy-test'&&'p',ea==='greedy-test'&&'e'].filter(Boolean);
   assert.deepEqual([...new Set(log.map(x=>x.side))].sort(),greedy.sort(),tag+': strategy called for the wrong side');
   for(const o of greedy){const mine=log.filter(x=>x.side===o);
    assert.deepEqual(mine.map(x=>x.turn),[1,2,3,4,5,6],tag+`: side ${o} must plan once on each turn`);
    for(const x of mine){
     assert.equal(x.phase,'plan',`${tag}: side ${o} turn ${x.turn} observed phase ${x.phase}`);
     assert.equal(x.refused,0,`${tag}: side ${o} turn ${x.turn} legal play refused`);
     if(x.legal)assert(x.placed>0,`${tag}: side ${o} turn ${x.turn} had a legal play but placed nothing`);
     if(x.placed){covered[o+x.turn]=1;plays+=x.placed;}
    }}
   if(greedy.length===2&&log.every(x=>x.placed>0))allTurnsBoth++;
   choices+=g.run('__choices.length');
  }
  for(const o of ['p','e'])for(let t=1;t<=6;t++)assert(covered[o+t],`no successful play by side ${o} on turn ${t}`);
  assert(allTurnsBoth>0,'no match where both sides placed cards on all six turns');
  assert(choices>0,'Astromancer effects must reach choose() of the new strategy');
  globalThis.__matchSummary=`${matches} matches with the new strategy (p, e, both): ${plays} successful plays and ${choices} effect choices, every legal turn played, ${allTurnsBoth} matches with plays by both sides on all six turns`;
 }

 // 3./4. Visibility boundary for observe() and the empirical legacy check.
 const hide=`(o)=>{const f=o==='p'?'e':'p',pool=CARDS.filter(c=>!G.board.flat().some(b=>b.def===c));
  G.hand[f]=G.hand[f].map((c,i)=>{const x=inst(pool[(i*7+3)%pool.length],f);x.uid=c.uid;return x;}); // other opponent hand
  G.deck.p.reverse();G.deck.e.reverse();if(G.deck[f].length)G.deck[f][0]=inst(pool[1],f); // deck orders and content, same counts
  for(const c of G.board.flat())if(c.owner===f&&c.pending){c.def=pool[(c.uid*5)%pool.length];c.buff=4;c.uid+=10000;} // face-down cards
  for(let l=0;l<3;l++)if(!G.locRev[l])G.locs[l]=LOCS.find(x=>!G.locs.includes(x)&&x.id!==G.locs[l].id)||G.locs[l]; // unrevealed locations
 }`;
 let observed=0,legacyPoints=0;
 for(const f of ['eng','ast','kee'])for(let seed=1;seed<=30;seed++)for(const o of ['p','e'])for(let turn=1;turn<=6;turn++){
  // Replay to the planning point of side o on this turn with the novice planner driven by the harness.
  const replay=async()=>{const t=boot(current,lcg(seed));
   t.run(`registerAiStrategy({id:'hold',version:'test-1',legacy:true,plan(){}});setAiStrategy('e','hold');FAST=true;newGame('${f}')`);
   for(let i=1;i<turn;i++){t.run("noviceAiPlan('e');noviceAiPlan('p')");await t.run('endTurn()');}
   if(o==='p')t.run("noviceAiPlan('e')");return t;};
  const a=await replay(),b=await replay();
  if(a.run('G.phase')!=='plan')continue;
  const before=a.run(`JSON.stringify(observe('${o}'))`);
  b.run(`(${hide})('${o}')`);b.setRandom(lcg(999));b.run('Math.random();Math.random()');
  assert.equal(b.run(`JSON.stringify(observe('${o}'))`),before,`observe(${o}) changed with hidden state: ${f}#${seed} turn ${turn}`);observed++;
  // Legacy plan under the same hidden perturbation, with an identical random stream from here on.
  a.setRandom(lcg(4242));b.setRandom(lcg(4242));const ra=a.trace.length,rb=b.trace.length;
  a.run(`noviceAiPlan('${o}')`);b.run(`noviceAiPlan('${o}')`);
  const plays=t=>t.run(`JSON.stringify(G.board.map(l=>l.filter(c=>c.owner==='${o}'&&c.pending).map(c=>c.def.id+'@'+c.uid)))`);
  assert.equal(plays(b),plays(a),`legacy plan changed with hidden state: ${f}#${seed} ${o} turn ${turn}`);
  assert.equal(b.trace.length-rb,a.trace.length-ra,'legacy RNG use changed with hidden state');legacyPoints++;
 }
 // Public changes must be visible.
 {const t=boot(current,lcg(8));t.run("FAST=true;newGame('ast')");await t.run('endTurn()');
  const o1=t.run("JSON.stringify(observe('p'))");t.run("const c=inst(CARDS[0],'e');c.lane=0;c.revealed=true;G.board[0].push(c)");
  assert.notEqual(t.run("JSON.stringify(observe('p'))"),o1,'a revealed card must change the observation');
  const o2=t.run("JSON.stringify(observe('p'))");t.run("const h=inst(CARDS[1],'e');h.lane=1;h.pending=true;G.board[1].push(h)");
  const o3=JSON.parse(t.run("JSON.stringify(observe('p'))"));assert.equal(o3.lanes[1].foePendingCount,1,'face-down cards are visible as a count');
  assert(!JSON.stringify(o3).includes('"deck":')&&!('hand' in o3.foe),'no opponent hand or deck content');assert.notEqual(JSON.stringify(o3),o2);}

 if(skipBaseline)console.log('NOTE: baseline comparison skipped (AI_CHECK_SKIP_BASELINE=1)');
 console.log(`PASS: ${same} normal matches and the tutorial (both lots) keep baseline ${ref.slice(0,7)} RNG order and state; strategy registry, per-side choice, legal actions and target choices; observe() unchanged by hidden state at ${observed} planning points; legacy Novice plan unchanged by the same hidden changes at ${legacyPoints} points; ${__matchSummary}`);
})().catch(e=>{console.error(e);process.exitCode=1});
