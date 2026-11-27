// GIFTED-004D (#56): shared measurement contour for the AI attestation (tournaments, tests, analytics).
// Nothing here changes the game: game.js is loaded unchanged except two in-memory patches, each required
// to match exactly once:
//  1. the opponent faction can be fixed by the harness (as in tournament-ai.cjs), mirrors included;
//  2. the Strategist's "opponent still to act" test also holds while side p plans on the turn-start
//     snapshot of the symmetric mode (__ATTEST_SYM_P). With the flag false the line is unchanged.
// Modes:
//  pve       — the real order: e plans at the start of the turn, p plans seeing e's face-down counts.
//  symmetric — neither side sees the other's plan of the current turn: e plans first as in the game;
//              p plans on a deep copy of the state captured just before e planned (so e's face-down
//              cards, its reduced hand, used discount and lane availability are all as at turn start),
//              its placements are recorded in order and then applied to the real state with the
//              engine's own legality checks (canPlay, effective cost, energy).
// Telemetry is read from the state outside the AI (no Math.random use, no state change).
'use strict';
const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const FACS=['eng','ast','kee'];
const PICK="const ef=scenario?scenario.opponentFaction:rndOf(Object.keys(FACTIONS).filter(f=>f!==pf));";
const PICK_TO="const ef=__opp??(scenario?scenario.opponentFaction:rndOf(Object.keys(FACTIONS).filter(f=>f!==pf)));";
const FOE_TO_ACT="foeToAct=o==='e'&&!obs.lanes.some(l=>l.foePendingCount);";
const FOE_TO_ACT_TO="foeToAct=(o==='e'||__ATTEST_SYM_P)&&!obs.lanes.some(l=>l.foePendingCount);";
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
function buildSource(gameFile='game.js',tutorialFile='tutorial.js'){
 const game=fs.readFileSync(gameFile,'utf8');
 for(const [a,n] of [[PICK,'opponent selection'],[FOE_TO_ACT,'Strategist foeToAct']])if(game.split(a).length!==2)throw Error(`${n} line not found exactly once`);
 return 'var __opp=null,__ATTEST_SYM_P=false;\n'+fs.readFileSync(tutorialFile,'utf8')+'\n'+game.replace(PICK,PICK_TO).replace(FOE_TO_ACT,FOE_TO_ACT_TO);
}
const PATCHES=[{find:PICK,replace:PICK_TO},{find:FOE_TO_ACT,replace:FOE_TO_ACT_TO}];

// In-context harness. Wraps aiPlan, place, unplace and startTurn by reassigning the global bindings
// (the engine calls them by name); records one compact record per game.
const HARNESS=String.raw`
var __A={mode:'pve',snap:null,snapHist:null,placed:null,turns:[],violations:[],cur:null,legalRefused:0};
const __REFS=new Set([...CARDS,...LOCS]);
function __clone(v,m){if(v===null||typeof v!=='object')return v;if(__REFS.has(v))return v;if(m.has(v))return m.get(v);
 if(Array.isArray(v)){const a=[];m.set(v,a);for(const x of v)a.push(__clone(x,m));return a;}
 if(v instanceof Map){const r=new Map();m.set(v,r);for(const [k,x] of v)r.set(__clone(k,m),__clone(x,m));return r;}
 if(v instanceof Set){const r=new Set();m.set(v,r);for(const x of v)r.add(__clone(x,m));return r;}
 const o={};m.set(v,o);for(const k of Object.keys(v))o[k]=__clone(v[k],m);return o;}
const __cloneAll=v=>__clone(v,new Map());
const __aiPlan=aiPlan,__place=place,__unplace=unplace,__startTurn=startTurn;
place=function(o,c,l){const r=__place(o,c,l);if(r){if(__A.placed&&G===__A.snap&&o==='p')__A.placed.push([c.uid,l]);if(__A.logG&&G===__A.logG)__A.logList.push([o,c.def.id,c.uid,l]);}return r;};
unplace=function(c){const o=c.owner,u=c.uid;const r=__unplace(c);if(r!==false&&__A.placed&&G===__A.snap&&o==='p'){const i=__A.placed.findIndex(x=>x[0]===u);if(i>=0)__A.placed.splice(i,1);}return r;};
function __sideState(o){return {hand:G.hand[o].map(c=>c.def.id),afford:G.hand[o].filter(c=>effCost(o,c)<=G.turn-G.spent[o]).map(c=>c.def.id),
 energy:G.turn-G.spent[o],discount:G.discount[o]?1:0,surcharge:surchargeOf(o),pending:G.board.flat().filter(c=>c.owner===o&&c.pending).map(c=>c.uid)};}
function __check(o,before){
 // Legality after a plan: energy never exceeded, lane caps and blocked lanes respected, only own cards moved.
 if(G.spent[o]>G.turn)__A.violations.push({kind:'energy exceeded',side:o,turn:G.turn,spent:G.spent[o]});
 // A cap applies to placing: only lanes that received cards in this plan are checked (cards placed before a
 // location with a lower cap was revealed may legitimately exceed it).
 for(let l=0;l<3;l++){const mine=G.board[l].filter(c=>c.owner===o);if(mine.some(c=>c.pending&&!before.pending.includes(c.uid))&&mine.length>capOf(l))__A.violations.push({kind:'lane cap exceeded',side:o,turn:G.turn,lane:l});}
 for(const c of G.board.flat())if(c.owner===o&&c.pending&&!before.pending.includes(c.uid)&&G.blockedUntil[o][c.lane]===G.turn)__A.violations.push({kind:'blocked lane used',side:o,turn:G.turn});
}
function __timed(o,fn){
 const before=__sideState(o),t0=performance.now();fn();const ms=performance.now()-t0;__check(o,before);
 const played=G.board.flat().filter(c=>c.owner===o&&c.pending&&!before.pending.includes(c.uid)).map(c=>[c.def.id,c.lane,c.paid]);
 __A.cur.sides[o]={...before,played,spent:G.spent[o],ms};
}
function __planP_symmetric(){
 const real=G,snap=__A.snap;if(!snap||snap.turn!==real.turn)throw Error('symmetric: no turn-start snapshot for turn '+real.turn);
 AI_PUBLIC_HISTORY.set(snap,__A.snapHist);__A.placed=[];
 G=snap;__ATTEST_SYM_P=true;let ms,before;
 try{before=__sideState('p');const t0=performance.now();__aiPlan('p');ms=performance.now()-t0;}finally{__ATTEST_SYM_P=false;G=real;}
 const placed=__A.placed;__A.placed=null;__A.snap=null;
 const bReal=__sideState('p');
 for(const [uid,l] of placed){const c=G.hand.p.find(x=>x.uid===uid);
  if(!c||!canPlay('p',l)||effCost('p',c)>G.turn-G.spent.p){__A.violations.push({kind:'symmetric plan not applicable',turn:G.turn,uid,lane:l});break;}
  __place('p',c,l);}
 __check('p',bReal);
 const played=G.board.flat().filter(c=>c.owner==='p'&&c.pending&&!bReal.pending.includes(c.uid)).map(c=>[c.def.id,c.lane,c.paid]);
 __A.cur.sides.p={...before,played,spent:G.spent.p,ms};
}
aiPlan=function(o){
 if(!__A.cur||__A.cur.t!==G.turn){__A.cur={t:G.turn,sides:{}};__A.turns.push(__A.cur);}
 if(__A.mode==='symmetric'&&o==='e'){__A.snap=__cloneAll(G);__A.snapHist=__cloneAll(publicHistory());}
 if(__A.mode==='symmetric'&&o==='p')return __planP_symmetric();
 return __timed(o,()=>__aiPlan(o));
};
function __lanes(){return [0,1,2].map(l=>({p:laneTotal(l,'p'),e:laneTotal(l,'e'),w:laneWinner(l)}));}
startTurn=function(){if(__A.cur)__A.cur.after=__lanes();return __startTurn();};
// aiContext().play refusals on the real state or the symmetric snapshot (sandboxes excluded): attempted illegal actions.
const __aiContext=aiContext;
aiContext=function(o){const c=__aiContext(o);const real=G,p=c.play;c.play=(u,l)=>{const r=p(u,l);if(!r&&G===real&&(G===__A.realG||(G===__A.snap&&__A.placed)))__A.legalRefused++;return r;};return c;};
function __beginGame(mode){__A.mode=mode;__A.snap=null;__A.turns=[];__A.violations=[];__A.cur=null;__A.legalRefused=0;}
function __record(){
 if(__A.cur&&!__A.cur.after)__A.cur.after=__lanes();
 const hist=publicHistory();
 return {result:G.result===undefined?null:G.result,fac:{...G.fac},locs:G.locs.map(L=>L.id),turns:__A.turns,
  final:{lanes:__lanes(),board:{p:G.board.flat().filter(c=>c.owner==='p'&&c.revealed).map(c=>[c.def.id,c.lane,power(c)]),e:G.board.flat().filter(c=>c.owner==='e'&&c.revealed).map(c=>[c.def.id,c.lane,power(c)])},
   hand:{p:G.hand.p.map(c=>c.def.id),e:G.hand.e.map(c=>c.def.id)},destroyed:{p:hist.destroyed.p.length,e:hist.destroyed.e.length}},
  violations:__A.violations,legalRefused:__A.legalRefused};
}`;

// A context with the harness; Math.random is a per-game LCG set by the driver.
function makeContext(src){
 let x=0;const math=Object.create(Math);math.random=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);
 const ctx=vm.createContext({Math:math,console,performance,setTimeout});vm.runInContext(src,ctx);vm.runInContext(HARNESS,ctx);
 const run=s=>vm.runInContext(s,ctx);
 return {ctx,run,setSeed:s=>{x=s>>>0;},rngState:()=>x};
}
// One game: strategies per side, hero faction (p), opponent faction (e), mode. Returns the record.
async function playGame(c,{seed,p,e,pf,ef,mode}){
 c.setSeed(seed);
 c.run(`setAiStrategy('p','${p}');setAiStrategy('e','${e}');FAST=true;__beginGame('${mode}');__opp='${ef}';newGame('${pf}');__opp=null;__A.realG=G;`);
 if(c.run('G.fac.p')!==pf||c.run('G.fac.e')!==ef)throw Error('faction setup failed');
 for(let i=0;i<6;i++)await c.run("(async()=>{aiPlan('p');await endTurn();__A.realG=G;})()");
 if(c.run('G.phase')!=='over')throw Error('match did not finish');
 return JSON.parse(c.run('JSON.stringify(__record())'));
}

// ---- aggregation (additive counters; keys starting with "max" take the maximum) ----
const HIST_BINS=200; // log histogram: bucket = round(log(ms)*200) → about 0.5% resolution
const bucket=ms=>Math.round(Math.log(Math.max(ms,0.001))*HIST_BINS);
function add(acc,path,v=1){let o=acc;for(let i=0;i<path.length-1;i++)o=o[path[i]]||(o[path[i]]={});const k=path[path.length-1];o[k]=(o[k]||0)+v;}
function setMax(acc,path,v){let o=acc;for(let i=0;i<path.length-1;i++)o=o[path[i]]||(o[path[i]]={});const k=path[path.length-1];o[k]=Math.max(o[k]??-Infinity,v);}
function merge(a,b){for(const [k,v] of Object.entries(b)){if(v&&typeof v==='object')merge(a[k]||(a[k]={}),v);else if(k.startsWith('max'))a[k]=Math.max(a[k]??-Infinity,v);else a[k]=(a[k]||0)+v;}return a;}
const leaderOf=lanes=>{const p=lanes.filter(l=>l.w==='p').length,e=lanes.filter(l=>l.w==='e').length;return p>e?'p':e>p?'e':null;};
// Aggregate one game into acc. strat = {p:id,e:id}.
function aggregate(acc,rec,strat){
 const R=rec.result,res=o=>R===null?'draw':R===o?'win':'loss';
 add(acc,['games']);add(acc,['result',R===null?'draw':R]);
 add(acc,['violations'],rec.violations.length);add(acc,['legalRefused'],rec.legalRefused);
 for(const v of rec.violations)add(acc,['violationKinds',v.kind]);
 for(const o of ['p','e']){
  const S=strat[o],F=rec.fac[o],key=[S,F];
  add(acc,['bySide',o,S,res(o)]);add(acc,['byFaction',S,F,res(o)]);
  const held=new Set(),played=new Set();
  for(const t of rec.turns){const s=t.sides[o];if(!s)continue;
   add(acc,['perf',S,o,F,'t'+t.t,'n']);add(acc,['perf',S,o,F,'t'+t.t,'h',String(bucket(s.ms))]);setMax(acc,['perf',S,o,F,'t'+t.t,'maxMs'],s.ms);if(s.ms>1000)add(acc,['perf',S,o,F,'t'+t.t,'over1s']);
   add(acc,['energy',S,'t'+t.t,'n']);add(acc,['energy',S,'t'+t.t,'available'],s.energy+s.discount);add(acc,['energy',S,'t'+t.t,'spent'],s.spent);
   if(!s.played.length)add(acc,['energy',S,'t'+t.t,'pass']);
   for(const id of s.hand){held.add(id);add(acc,['cards',S,F,id,'inHand']);}
   for(const id of s.afford)add(acc,['cards',S,F,id,'affordable']);
   for(const [id,lane,paid] of s.played){played.add(id);add(acc,['cards',S,F,id,'plays']);add(acc,['cards',S,F,id,'paid'],paid);add(acc,['cards',S,F,id,'playTurn'],t.t);
    add(acc,['locations',rec.locs[lane],S,'played']);}
  }
  for(const id of played){add(acc,['cards',S,F,id,'gamesPlayed']);add(acc,['cards',S,F,id,'played_'+res(o)]);}
  for(const id of held)if(!played.has(id)){add(acc,['cards',S,F,id,'gamesHeldUnplayed']);add(acc,['cards',S,F,id,'heldUnplayed_'+res(o)]);}
  for(const [id,lane,pw] of rec.final.board[o]){const w=rec.final.lanes[lane].w;add(acc,['cards',S,F,id,'finalOnBoard']);add(acc,['cards',S,F,id,'finalPower'],pw);if(w===o)add(acc,['cards',S,F,id,'finalLaneWon']);}
  add(acc,['saved',S,'cards'],rec.final.hand[o].length);add(acc,['saved',S,'n']);add(acc,['destroyed',S],rec.final.destroyed[o]);
  const pl=[...played].sort();for(let i=0;i<pl.length;i++)for(let j=i+1;j<pl.length;j++){add(acc,['combos',S,F,pl[i]+'+'+pl[j],'n']);add(acc,['combos',S,F,pl[i]+'+'+pl[j],res(o)]);}
 }
 rec.final.lanes.forEach((l,i)=>{const L=rec.locs[i];add(acc,['locations',L,'lanes']);add(acc,['locations',L,'power'],l.p+l.e);
  if(l.w===null)add(acc,['locations',L,'tie']);else{add(acc,['locations',L,'won',strat[l.w]+':'+rec.fac[l.w]]);if(R!==null)add(acc,['locations',L,l.w===R?'winnerTookLane':'loserTookLane']);}
  for(const o of ['p','e'])add(acc,['locations',L,'present',strat[o]+':'+rec.fac[o]]);});
 // Momentum: leader by lanes after each turn; comebacks and the turn from which the winner led for good.
 const leaders=rec.turns.map(t=>t.after?leaderOf(t.after):null);
 if(R!==null){
  const behind=t=>leaders[t-1]&&leaders[t-1]!==R;
  if(behind(4))add(acc,['momentum','comebackAfter4']);if(behind(5))add(acc,['momentum','comebackAfter5']);
  let tp=leaders.length;while(tp>0&&leaders[tp-1]===R)tp--;add(acc,['momentum','turningPoint','t'+(tp+1)]);
 }
 add(acc,['momentum','decided'],R===null?0:1);
}
function histQuantiles(h){
 const e=Object.entries(h).map(([b,n])=>[+b,n]).sort((a,b)=>a[0]-b[0]),N=e.reduce((a,x)=>a+x[1],0),q=p=>{let c=0;const k=Math.min(N-1,Math.floor(N*p));for(const [b,n] of e){c+=n;if(c>k)return Math.round(Math.exp(b/HIST_BINS)*100)/100;}};
 return {n:N,p50:q(.5),p95:q(.95),p99:q(.99)};
}
module.exports={FACS,PATCHES,buildSource,makeContext,playGame,aggregate,merge,histQuantiles,sha256,HIST_BINS,bucket};
