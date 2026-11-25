// Run: node scripts/check-strategist.cjs  (extended check, about a minute; no browser/dependencies)
// GIFTED-004C (#46) checks for strategist-1 on the real engine:
//  1. positions from real matches where the Strategist's choice differs from the Tactician's because of
//     saving a card, giving up a location, and its forecast of the opponent's answer;
//  2. full matches vs Novice and vs Tactician on both seats: a plan in phase 'plan' every turn, no refused
//     action, nothing changed but its own plays (state, uid counter, log, Math.random), no real RNG use;
//  3. plans unchanged when only hidden state changes (opponent hand and face-down cards, deck orders and
//     content, unrevealed locations, real RNG), with the Strategist's own memory built over earlier turns;
//  4. search budget, legal Tactician fallback, both initiative branches in a tie, delegated target choice,
//     memory reset for a new match, same position -> same plan;
//  5. PR #47 inspection: face-down opponent cards in sampled worlds are legal for its start-of-turn energy
//     (discount/surcharge), unknown cards when no legal set exists;
//  6. PR #47 inspection: destroyed revealed cards stay in the public history and never return to the unknown cards.
// STRATEGIST_CHECK_SECTIONS=1,2,3,4,5,6 (default all) lets check-strategist-mutations.cjs show which section
// detects a defect on its own.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const SECTIONS=new Set((process.env.STRATEGIST_CHECK_SECTIONS||'1,2,3,4,5,6').split(','));
const SRC=fs.readFileSync('tutorial.js','utf8')+'\n'+fs.readFileSync('game.js','utf8');
const lcg=seed=>{let n=seed>>>0;return ()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);};
function boot(seed=1){
 const trace=[],math=Object.create(Math);let src=lcg(seed);math.random=()=>{const v=src();trace.push(v);return v;};
 const ctx=vm.createContext({Math:math,console,performance,setTimeout,__rngCalls:()=>trace.length});vm.runInContext(SRC,ctx);
 return {run:s=>vm.runInContext(s,ctx),setRandom:f=>{src=f;}};
}
const J=(t,s)=>JSON.parse(t.run(`JSON.stringify(${s})`));
const placed=(t,o)=>J(t,`G.board.flatMap(l=>l.filter(c=>c.owner==='${o}'&&c.pending).map(c=>[c.def.id,c.lane])).sort()`);
// Tactician's best plan in the current position, as [card id, lane] (computed, not played).
const tacticianChoice=(t,o)=>J(t,`(()=>{const obs=observe('${o}'),base=tacticianState(obs);let best=[],bv=-1e9;
 for(const p of tacticianPlans(obs,base)){const v=tacticianEvaluate(obs,base,p);if(v>bv+1e-9){bv=v;best=p;}}
 return best.map(([u,l])=>[G.hand['${o}'].find(c=>c.uid===u).def.id,l]).sort();})()`);
// Replays a Strategist-vs-Tactician match up to the planning point of the Strategist on `turn`.
async function replayTo(seed,faction,seat,turn){
 const t=boot(seed),opp=seat==='p'?'e':'p';
 t.run(`registerAiStrategy({id:'hold',version:'test-1',legacy:true,plan(){}});setAiStrategy('e','hold');FAST=true;newGame('${faction}')`);
 const act=o=>t.run(o===seat?`AI_STRATEGIES.strategist.plan(aiContext('${o}'))`:`AI_STRATEGIES.tactician.plan(aiContext('${o}'))`);
 for(let i=1;i<turn;i++){act('e');act('p');await t.run('endTurn()');}
 if(seat==='p')act('e');
 return {t,act:()=>act(seat)};
}
(async()=>{
 const done=[];
 // 1. Choices that differ from the Tactician (found in Strategist-vs-Tactician matches, seeds 300-305).
 if(SECTIONS.has('1')){
 {const {t,act}=await replayTo(300,'eng','p',1);const tac=tacticianChoice(t,'p');act();
  assert(tac.length>0&&placed(t,'p').length===0,'saving a card: the Tactician plays turn 1, the Strategist keeps its cards');done.push('save card');}
 {const {t,act}=await replayTo(302,'kee','p',4);const tac=tacticianChoice(t,'p');act();const mine=placed(t,'p');
  assert(tac.some(([,l])=>l===1)&&!mine.some(([,l])=>l===1),'giving up a location: the Tactician fights the lost Observatory, the Strategist does not');
  assert(mine.length>0,'the card goes elsewhere');done.push('give up a location');}
 {const a=await replayTo(305,'kee','e',4),b=await replayTo(305,'kee','e',4);
  const tac=tacticianChoice(a.t,'e');a.act();const withAnswer=placed(a.t,'e');
  b.t.run('STRATEGIST.modelAnswer=false');b.act();const noAnswer=placed(b.t,'e');
  assert.notDeepEqual(withAnswer,tac,'forecast: the Strategist differs from the Tactician');
  assert.notDeepEqual(withAnswer,noAnswer,'forecast: modelling the opponent answer changes the choice');done.push('opponent answer forecast');}
 }

 // 2. Full matches on both seats against both opponents.
 let matches=0,plans=0;
 if(SECTIONS.has('2'))for(const opp of ['novice','tactician'])for(const seat of ['p','e'])for(const f of ['eng','ast','kee'])for(const seed of [11,12]){
  const t=boot(seed),other=seat==='p'?'e':'p';
  t.run(`var __calls=[];const __s=AI_STRATEGIES.strategist;AI_STRATEGIES.strategist=Object.freeze({...__s,plan(ctx){
    const o=ctx.side,f=o==='p'?'e':'p';
    const snap=()=>JSON.stringify([G.board.map(l=>l.filter(c=>!(c.owner===o&&c.pending)).map(c=>[c.uid,c.def.id,c.buff,c.lane,c.revealed])),
     G.hand[f].map(c=>c.uid),G.deck.p.map(c=>c.uid),G.deck.e.map(c=>c.uid),UID,logLines,G.discount[f],G.surcharge[f],G.spent[f],G.blockedUntil,G.trap,G.locRev,G.locs.map(l=>l.id),G.locDisabledUntil,G.turn,G.phase,G.discard]);
    const before=snap(),n0=__rngCalls(),r0=Math.random;let refused=0;const play=ctx.play;ctx.play=(u,l)=>{const r=play(u,l);if(!r)refused++;return r;};
    __s.plan(ctx);__calls.push({turn:G.turn,phase:ctx.observation.phase,refused,same:snap()===before&&Math.random===r0,rng:__rngCalls()-n0});}});
   setAiStrategy('${seat}','strategist');setAiStrategy('${other}','${opp}');FAST=true;newGame('${f}')`);
  for(let i=0;i<6;i++)await t.run("(async()=>{aiPlan('p');await endTurn()})()");
  assert.equal(t.run('G.phase'),'over');const log=J(t,'__calls'),tag=`${opp} ${seat} ${f}#${seed}`;
  assert.deepEqual(log.map(x=>x.turn),[1,2,3,4,5,6],tag+': one plan per turn');
  for(const x of log){assert.equal(x.phase,'plan',`${tag} turn ${x.turn}: phase`);assert.equal(x.refused,0,`${tag} turn ${x.turn}: illegal play attempted`);
   assert(x.same,`${tag} turn ${x.turn}: planning changed the match beyond its own plays`);assert.equal(x.rng,0,`${tag} turn ${x.turn}: planning used the real Math.random`);}
  assert.equal(t.run('strategistStats.fallbacks'),0,tag+': no fallback in normal play');
  matches++;plans+=log.length;
 }
 if(SECTIONS.has('2'))done.push(`${matches} full matches`);

 // 3. Hidden-state perturbation at every turn, both sides, with memory built on earlier turns.
 const hide=`(o)=>{const f=o==='p'?'e':'p',pool=CARDS.filter(c=>!G.board.flat().some(b=>b.def===c));
  G.hand[f]=G.hand[f].map((c,i)=>{const x=inst(pool[(i*7+3)%pool.length],f);x.uid=c.uid;return x;});
  G.deck.p.reverse();G.deck.e.reverse();if(G.deck[f].length)G.deck[f][0]=inst(pool[1],f);
  for(const c of G.board.flat())if(c.owner===f&&c.pending){c.def=pool[(c.uid*5)%pool.length];c.buff=4;c.uid+=10000;}
  for(let l=0;l<3;l++)if(!G.locRev[l])G.locs[l]=LOCS.find(x=>!G.locs.includes(x)&&x.id!==G.locs[l].id)||G.locs[l];}`;
 let points=0;
 if(SECTIONS.has('3'))for(const f of ['eng','ast','kee'])for(const seed of [21,22])for(const o of ['p','e'])for(let turn=1;turn<=6;turn++){
  const replay=async()=>{const t=boot(seed);
   t.run(`registerAiStrategy({id:'hold',version:'test-1',legacy:true,plan(){}});setAiStrategy('e','hold');FAST=true;newGame('${f}')`);
   for(let i=1;i<turn;i++){for(const x of ['e','p'])t.run(x===o?`AI_STRATEGIES.strategist.plan(aiContext('${o}'))`:`noviceAiPlan('${x}')`);await t.run('endTurn()');}
   if(o==='p')t.run("noviceAiPlan('e')");return t;};
  const a=await replay(),b=await replay();if(a.run('G.phase')!=='plan')continue;
  b.run(`(${hide})('${o}')`);b.setRandom(lcg(999));b.run('Math.random();Math.random()');
  const go=t=>{t.run(`AI_STRATEGIES.strategist.plan(aiContext('${o}'))`);return t.run(`JSON.stringify(G.board.map(l=>l.filter(c=>c.owner==='${o}'&&c.pending).map(c=>c.def.id+'@'+c.uid)))`);};
  assert.equal(go(b),go(a),`plan changed with hidden state: ${f}#${seed} ${o} turn ${turn}`);points++;
 }
 if(SECTIONS.has('3'))done.push(`${points} hidden-state points`);

 // 4a. Budget: playouts per decision never exceed worlds x candidates + finalWorlds x finalists.
 if(SECTIONS.has('4')){
 {const t=boot(5);t.run(`var __pl=0,__max=0;const __p=strategistPlayout;strategistPlayout=(...a)=>{__pl++;return __p(...a);};
   const __sp=AI_STRATEGIES.strategist;AI_STRATEGIES.strategist=Object.freeze({...__sp,plan(c){__pl=0;__sp.plan(c);__max=Math.max(__max,__pl);}});
   setAiStrategy('e','strategist');FAST=true;newGame('ast')`);
  for(let i=0;i<6;i++)await t.run("(async()=>{aiPlan('p');await endTurn()})()");
  const S=J(t,'STRATEGIST'),bound=S.worlds*(S.candidates+1)+S.finalWorlds*S.finalists;
  assert(t.run('__max')>0&&t.run('__max')<=bound,`playouts per decision ${t.run('__max')} exceed the budget ${bound}`);done.push('budget');}
 // 4b. Fallback: a failure inside the search plays the Tactician's best plan, legally.
 {const t=boot(6);t.run("registerAiStrategy({id:'hold',version:'test-1',legacy:true,plan(){}});setAiStrategy('e','hold');FAST=true;newGame('eng')");
  await t.run('endTurn()');await t.run('endTurn()');t.run("setAiStrategy('e','strategist')");
  const tac=tacticianChoice(t,'e');assert(tac.length>0,'fallback position must have a non-empty Tactician plan');t.run("strategistWorld=()=>{throw Error('simulated failure');}");
  t.run(`var __ref=0;{const ctx=aiContext('e'),play=ctx.play;ctx.play=(u,l)=>{const r=play(u,l);if(!r)__ref++;return r;};AI_STRATEGIES.strategist.plan(ctx);}`);
  assert.equal(t.run('strategistStats.fallbacks'),1,'fallback must be used');assert.equal(t.run('__ref'),0);
  assert.deepEqual(placed(t,'e'),tac,'fallback plays the Tactician plan');done.push('fallback');}
 // 4c. Initiative tie (empty board, turn 1): sampled worlds explore both reveal orders.
 {const t=boot(7);t.run(`var __first=new Set();const __in=initiative;initiative=()=>{const r=__in();if(G.turn===1)__first.add(r);return r;};
   FAST=true;newGame('kee');G.board.forEach(l=>l.length=0);G.spent={p:0,e:0};`);
  t.run("AI_STRATEGIES.strategist.plan(aiContext('e'))");assert.deepEqual(J(t,'[...__first].sort()'),['e','p'],'both initiative branches');done.push('initiative branches');}
 // 4d. Target choice is the Tactician policy through the shared interface.
 {const t=boot(8);t.run("FAST=true;newGame('ast');setAiStrategy('e','strategist')");
  assert.equal(t.run("AI_STRATEGIES.strategist.choose(aiContext('e'),{kind:'lane',effect:'a5',title:'t',optional:false,options:[{lane:0},{lane:1},{lane:2}]})"),
   t.run("tacticianPick('e',{kind:'lane',effect:'a5',title:'t',optional:false,options:[{lane:0},{lane:1},{lane:2}]},false)"));done.push('target choice');}
 // 4e. Memory: reset for a new match; same position -> same plan.
 {const t=boot(9);t.run("FAST=true;newGame('eng');strategistMemory.e.byTurn[5]={turn:5,foeDiscount:1,foe:new Set([1]),me:new Set()};strategistMemory.e.turn=6;newGame('eng');AI_STRATEGIES.strategist.plan(aiContext('e'))");
  assert.equal(t.run("5 in strategistMemory.e.byTurn"),false,'memory must reset for a new match');
  assert.equal(t.run("observe('e').foe.destroyed.length+observe('e').me.destroyed.length"),0,'a new match starts with an empty destroyed history');
  const u=boot(10);u.run("FAST=true;newGame('kee')");await u.run('endTurn()');
  const p1=u.run("(()=>{const s=JSON.stringify(G.board);AI_STRATEGIES.strategist.plan(aiContext('p'));const r=JSON.stringify(G.board.flat().filter(c=>c.owner==='p'&&c.pending).map(c=>c.uid+'@'+c.lane));G.board.flat().filter(c=>c.owner==='p'&&c.pending).forEach(unplace);return r;})()");
  assert.equal(u.run("(()=>{AI_STRATEGIES.strategist.plan(aiContext('p'));return JSON.stringify(G.board.flat().filter(c=>c.owner==='p'&&c.pending).map(c=>c.uid+'@'+c.lane));})()"),p1,'same position, same plan');
  done.push('memory/determinism');}
 }
 // 5./6. Inspection findings of PR #47 (HEAD 24b99a9); both sections also run on that HEAD's API.
 if(SECTIONS.has('5')){
  // 5a. Face-down opponent cards in sampled worlds are always legal for the opponent's start-of-turn energy.
  // The oracle is the real engine state recorded by the harness at the start of each turn (test-only);
  // the model never sees it.
  let worlds=0,checked=0;
  for(const f of ['eng','ast','kee'])for(const seed of [31,32,33,34])for(const foeAi of ['novice','tactician']){
   const t=boot(seed);
   t.run(`var __bud=null;registerAiStrategy({id:'hold',version:'test-1',legacy:true,plan(){}});setAiStrategy('e','hold');FAST=true;newGame('${f}');
    var __viol=[];const __w=strategistWorld;strategistWorld=(obs,st,info,sets)=>{const r=__w(obs,st,info,sets);
     const h=r.board.flat().filter(c=>c.owner!==obs.side&&c.pending);
     if(h.length){const cost=h.reduce((s,c)=>s+c.def.cost,0);__worlds++;if(h.some(c=>c.def.id==='?'))__unknown++;else if(cost>__bud)__viol.push([G.turn,cost,__bud,h.map(c=>c.def.id)]);}
     return r;};var __worlds=0,__unknown=0;`);
   for(let turn=1;turn<=6;turn++){
    // e (opponent) acts first: record its real start-of-turn budget, then let it play.
    t.run(`__bud=G.turn+(G.discount.e?1:0)-surchargeOf('e');AI_STRATEGIES['${foeAi}'].legacy?noviceAiPlan('e'):AI_STRATEGIES['${foeAi}'].plan(aiContext('e'));AI_STRATEGIES.strategist.plan(aiContext('p'));`);
    await t.run('endTurn()');if(t.run('G.phase')==='over')break;
   }
   const v=J(t,'__viol');assert.deepEqual(v,[],`${f}#${seed} vs ${foeAi}: impossible face-down cards in sampled worlds ${JSON.stringify(v.slice(0,3))}`);
   worlds+=t.run('__worlds');checked++;
  }
  assert(worlds>500,'enough sampled worlds with face-down cards');
  // 5b. The natural first-turn case from the inspection: one face-down card after turn 1 costs at most 1.
  for(let seed=1;seed<=40;seed++){const t=boot(seed);
   t.run("registerAiStrategy({id:'hold',version:'test-1',legacy:true,plan(){}});setAiStrategy('e','hold');FAST=true;newGame('eng');G.board.forEach(l=>{for(let i=l.length-1;i>=0;i--)if(l[i].owner==='e')l.splice(i,1);});");
   t.run("const c=G.hand.e.find(x=>x.def.cost===1)||inst(CARDS.find(x=>x.id==='a1'),'e');if(!G.hand.e.includes(c))G.hand.e.push(c);G.spent.e=0;place('e',c,0);");
   const costs=J(t,"(()=>{const obs=observe('p'),info=strategistRemember(obs),sets=strategistHiddenSets(CARDS.filter(d=>d.f===obs.foe.faction&&!info.known.foe.has(d.id)),1,info.budget.budget);return sets.map(s=>s[0].cost);})()");
   assert(costs.length&&costs.every(c=>c<=1),`turn 1: only cost-1 cards are legal (seed ${seed}): ${costs}`);}
  // 5c. No legal set of unseen cards: unknown effect-free cards, never an impossible real card.
  {const t=boot(3);t.run("FAST=true;newGame('kee');");
   const r=J(t,`(()=>{const obs=observe('p');obs.foe.faction='eng';obs.lanes[0].foePendingCount=1;obs.lanes[1].foePendingCount=1;obs.turn=1;
    const info={known:{me:new Set(),foe:new Set(CARDS.filter(d=>d.f==='eng'&&d.cost<=1).map(d=>d.id))},budget:{budget:1}};
    const sets=strategistHiddenSets(CARDS.filter(d=>d.f==='eng'&&!info.known.foe.has(d.id)),2,1);
    return runAiSandbox(tacticianClone(tacticianState(obs)),1,()=>strategistWorld(obs,tacticianClone(tacticianState(obs)),info,sets)).board.flat().filter(c=>c.owner==='e'&&c.pending).map(c=>c.def.id);})()`);
   assert.deepEqual(r,['?','?'],'no legal set: only unknown cards');}
  done.push(`legal face-down worlds (${worlds} sampled)`);
 }
 if(SECTIONS.has('6')){
  // 6. A revealed card destroyed later (and one revealed and destroyed in the same reveal) stays
  // accounted for: it is in the public history and never returns to the sampled hand, deck or face-down cards.
  for(const sameReveal of [false,true]){const t=boot(4);
   t.run(`registerAiStrategy({id:'hold',version:'test-1',legacy:true,plan(){}});setAiStrategy('e','hold');FAST=true;newGame('eng');`);
   t.run(`G.fac.e='kee';G.board=[[],[],[]];G.hand.e=[];G.hand.p=G.hand.p.filter(c=>c.def.id!=='e1');G.deck.p=G.deck.p.filter(c=>c.def.id!=='e1');
    const v=inst(CARDS.find(x=>x.id==='e1'),'p');v.lane=0;v.buff=-2;G.board[0].push(v);v.revealed=${!sameReveal};v.pending=${sameReveal};
    const x=inst(CARDS.find(x=>x.id==='k7'),'e');x.lane=0;x.pending=true;G.board[0].push(x);
    G.deck.e=G.deck.e.filter(c=>c.def.id!=='k7');`);
   // Executioner reveals after the victim (player has initiative or reveals first in the same reveal).
   t.run("initiative=()=>'p'");await t.run('endTurn()');
   assert.equal(t.run("G.board.flat().some(c=>c.def.id==='e1')"),false,'the victim was destroyed');
   // Works with the previous HEAD's API too (strategistWorld(obs,st,seen)), so the regression is shown on it.
   const leak=J(t,`(()=>{const obs=observe('e'),info=strategistRemember(obs),out=[];for(let w=0;w<60;w++){const st=runAiSandbox(tacticianClone(tacticianState(obs)),w+1,()=>strategistWorld(obs,tacticianClone(tacticianState(obs)),info,[]));
     out.push(...st.hand.p.map(c=>c.def.id),...st.deck.p.map(c=>c.def.id),...st.board.flat().filter(c=>c.owner==='p'&&c.pending).map(c=>c.def.id));}return out.filter(id=>id==='e1').length;})()`);
   assert.equal(leak,0,`destroyed e1 must not return to the unknown cards (${sameReveal?'same reveal':'earlier reveal'})`);
   const d=J(t,"observe('e').foe.destroyed?.map(x=>x.id)||[]");assert(d.includes('e1'),'destroyed card in the public history');
  }
  done.push('destroyed-card history');
 }
 console.log(`PASS: strategist ${done.join(', ')}; ${plans} plans: phase plan, no illegal action, no side effects, no real RNG use`);
})().catch(e=>{console.error(e);process.exitCode=1});
