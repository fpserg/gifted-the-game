#!/usr/bin/env node
// GIFTED-004E (#48), stage B0: behaviour baseline (reference) for the behaviour-preserving refactoring
// packages B1–B4. Read-only: loads game.js / tutorial.js in vm contexts and changes nothing. Not in CI.
//
// Components (each hashed separately; a refactoring package must reproduce every hash):
//  novice    direct implementation contract of the frozen Novice (scripts/check-novice-contract.cjs logic):
//            plan body and choice reducers identical to the fixed reference 2923eaf; registration unchanged.
//  rules     every card x every location revealed by the real endTurn in a fixed seeded position (36 x 9).
//  tutorial  the scripted "Первая битва", both initiative lots: state and DOM after every step.
//  ui        splash, hero pick, library tabs, menu, a match per faction driven to the result screen with a
//            DOM stub: every element's HTML, classes and visibility after every step; deterministic clock.
//  ai        6 pairs (N/N, T/N, S/N, T/T, S/T, S/S) x 2 modes x 18 configurations x `games`: the complete game
//            record of the attestation harness without decision times, plus the match RNG state after each game.
//  balance   balance simulator (Novice vs Novice, 3 faction pairs), fixed seed, without time and source SHA.
// Fixed parameters (seeds, games) are part of the baseline file and checked.
//
// Scope of the conclusion: equal hashes prove identical behaviour in the played scenarios only (the listed
// seeds, positions and flows). They do not prove equivalence outside them; the mutation suites,
// check-ai-architecture and the Novice contract stay required. See docs/refactor-baseline/README.md.
//
// Usage:
//   node scripts/behaviour-baseline.cjs --write=<file> [--games=10] [--balance=1000]
//   node scripts/behaviour-baseline.cjs --check=<file> [--fail-fast] [--only=novice,rules,...] [--root=<dir>]
// --root: directory with game.js and tutorial.js to measure (default: this checkout); used by the controls.
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const REPO=path.join(__dirname,'..');
const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith(`--${k}=`));return a?a.slice(k.length+3):d;};
const flag=k=>process.argv.includes(`--${k}`);
const ROOT=path.resolve(arg('root',REPO));
const L=require('./attest-lib.cjs'),NC=require('./check-novice-contract.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const PAIRS=[['novice','novice'],['tactician','novice'],['strategist','novice'],['tactician','tactician'],['strategist','tactician'],['strategist','strategist']];
const ORDER=['novice','rules','tutorial','ui','ai','balance'];
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

// ---------- DOM stub (deterministic, records every element) ----------
function makeDom(){
 const all=[];let created=0;
 const mkClassList=e=>({add:(...x)=>x.forEach(c=>e._cls.add(c)),remove:(...x)=>x.forEach(c=>e._cls.delete(c)),contains:c=>e._cls.has(c),
  toggle:(c,f)=>{const on=f===undefined?!e._cls.has(c):!!f;on?e._cls.add(c):e._cls.delete(c);return on;}});
 const element=key=>{const e={_key:key,_cls:new Set(),_attr:{},innerHTML:'',textContent:'',hidden:false,disabled:false,value:'',style:{},dataset:{},scrollTop:0,scrollLeft:0,
   children:[],addEventListener(){},removeEventListener(){},setAttribute(k,v){e._attr[k]=String(v);},removeAttribute(k){delete e._attr[k];},getAttribute:k=>e._attr[k]??null,
   querySelector:()=>element(`${key}>q${created++}`),querySelectorAll:()=>[],closest:()=>null,append(...c){e.children.push(...c);},appendChild(c){e.children.push(c);return c;},
   remove(){e._removed=true;},cloneNode:()=>element(`${key}>clone${created++}`),focus(){},scrollIntoView(){},scrollTo(){},getBoundingClientRect:()=>({left:0,top:0,width:100,height:100,right:100,bottom:100}),
   setPointerCapture(){},releasePointerCapture(){},contains:()=>false,matches:()=>false};
  e.classList=mkClassList(e);all.push(e);return e;};
 const byId=new Map(),getElementById=id=>{if(!byId.has(id))byId.set(id,element('#'+id));return byId.get(id);};
 const body=element('body');
 const document={getElementById,querySelectorAll:()=>[],querySelector:()=>null,body,createElement:t=>element(`<${t}>${created++}`),elementFromPoint:()=>null,addEventListener(){}};
 const snapshot=()=>all.filter(e=>!e._removed).map(e=>[e._key,e.innerHTML,e.textContent,[...e._cls].sort().join(' '),e.hidden,e.disabled,JSON.stringify(e.style),JSON.stringify(e._attr)]);
 return {document,snapshot};
}
function uiContext(seed){
 const dom=makeDom(),timers=[],storage={};let x=seed>>>0,clock=1764000000000;
 const math=Object.create(Math);math.random=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);
 const FakeDate=class extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock+=16;}};
 const ctx=vm.createContext({console,Math:math,Date:FakeDate,performance:{now:()=>clock},Promise,document:dom.document,
  localStorage:{getItem:k=>storage[k]??null,setItem:(k,v)=>{storage[k]=String(v);},removeItem:k=>{delete storage[k];}},
  navigator:{},location:{href:'about:blank'},setTimeout:(fn)=>{timers.push(fn);return timers.length;},clearTimeout(){},requestAnimationFrame:fn=>{timers.push(fn);return timers.length;},
  window:{addEventListener(){},matchMedia:()=>({matches:false}),innerWidth:390,innerHeight:844}});
 vm.runInContext(read('tutorial.js')+'\n'+read('game.js'),ctx);
 const run=s=>vm.runInContext(s,ctx);
 const flush=()=>{for(let i=0;i<50&&timers.length;i++)timers.splice(0).forEach(fn=>fn());};
 // Await a game promise while running timers; a pending choice of the human seat (Astromancer effects) is
 // answered with its first option (recorded in the snapshots like any other step).
 const settle=async(expr,onChoice)=>{let done=false,err=null;const p=run(expr);Promise.resolve(p).then(()=>{done=true;},e=>{err=e;done=true;});
  for(let i=0;i<5000&&!done;i++){await new Promise(r=>setImmediate(r));flush();
   if(!done&&run('!!astroChoice')){onChoice&&onChoice();run("finishAstroChoice(astroChoice.kind==='lane'?astroChoice.lanes[0]:astroChoice.cards[0])");}}
  if(err)throw err;if(!done)throw Error('game promise did not settle: '+expr);};
 return {run,flush,settle,snapshot:dom.snapshot,storage,rng:()=>x};
}

// ---------- components ----------
const C={};
C.novice=async()=>{const r=NC.contract(ROOT);return {sha256:sha(JSON.stringify(r.parts)),detail:r.parts,ok:r.ok,reasons:r.reasons};};

// Every card x every location: a fixed seeded position on turn 5 (Novice vs Novice), then the card is placed by
// its own faction's side on lane 0 with location L, the opponent plans, and the real endTurn reveals.
C.rules=async()=>{
 const src=read('tutorial.js')+'\n'+read('game.js'),items=[];
 const probe=vm.createContext({console,Math,performance,setTimeout});vm.runInContext(src,probe);
 const cards=JSON.parse(vm.runInContext('JSON.stringify(CARDS.map(c=>({id:c.id,f:c.f})))',probe)),locs=JSON.parse(vm.runInContext('JSON.stringify(LOCS.map(l=>l.id))',probe));
 for(const card of cards)for(const loc of locs){
  let x=parseInt(sha(card.id+'|'+loc).slice(0,8),16)>>>0;
  const math=Object.create(Math);math.random=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);
  const ctx=vm.createContext({console,Math:math,performance:{now:()=>0},setTimeout});vm.runInContext(src,ctx);const run=s=>vm.runInContext(s,ctx);
  const out=await run(`(async()=>{FAST=true;setAiStrategy('p','novice');setAiStrategy('e','novice');newGame(${JSON.stringify(card.f)});
   for(let t=1;t<5;t++){aiPlan('p');await endTurn();}
   for(const l of G.board)for(const c of [...l])if(c.pending&&c.owner==='p')unplace(c);
   const L=LOCS.find(l=>l.id===${JSON.stringify(loc)});G.locs[0]=L;G.locRev[0]=true;
   const c=inst(CARDS.find(d=>d.id===${JSON.stringify(card.id)}),'p');G.hand.p.push(c);G.spent.p=0;G.turn=Math.max(G.turn,c.def.cost);
   const placed=place('p',c,0)!==false&&c.lane===0;
   await endTurn();
   return JSON.stringify({placed,turn:G.turn,phase:G.phase,result:G.result??null,board:G.board.map(l=>l.map(c=>[c.def.id,c.owner,c.revealed,c.buff])),
    totals:[0,1,2].map(l=>[laneTotal(l,'p'),laneTotal(l,'e')]),hand:{p:G.hand.p.map(c=>c.def.id),e:G.hand.e.map(c=>c.def.id)},
    deck:{p:G.deck.p.length,e:G.deck.e.length},discard:G.discard,spent:G.spent,discount:G.discount,surcharge:G.surcharge,blocked:G.blockedUntil,locs:G.locs.map(l=>l&&l.id),log:logLines.slice(-30)});})()`);
  items.push(card.id+'|'+loc+'|'+sha(out)+'|'+x);
 }
 return {sha256:sha(items.join('\n')),detail:{cases:items.length,first:items[0].split('|').slice(0,3).join('|')}};
};

// "Первая битва": both initiative lots; after every action: G (without functions), coach/lesson DOM, storage.
C.tutorial=async()=>{
 const steps=[];
 for(const lot of [.1,.9]){
  const u=uiContext(1);let n=0;u.run(`Math.random=()=>{${''}return ${lot};}`);
  const snap=tag=>steps.push(`${lot}|${tag}|${n++}|`+sha(JSON.stringify([u.run('JSON.stringify(G)'),u.run('JSON.stringify(tutorialState)'),u.snapshot(),u.storage])));
  u.run('FAST=true;Tutorial.intro()');u.flush();snap('intro');
  u.run('Tutorial.start()');u.flush();snap('start');
  for(let turn=1;turn<=6;turn++){
   u.run("globalThis.__t=G.hand.p.find(c=>c.def.id===Tutorial.round()[0]);G.sel=__t.uid;render()");snap('select');
   u.run("place('p',__t,Tutorial.round()[1]);render()");snap('place');
   if(turn===1){u.run('unplace(__t);render()');snap('undo');u.run("place('p',__t,Tutorial.round()[1]);render()");snap('replace');}
   await u.settle('endTurn()');snap('reveal');
   u.run('Tutorial.next()');u.flush();snap('next');
  }
 }
 return {sha256:sha(steps.join('\n')),detail:{steps:steps.length}};
};

// Normal UI: splash, hero pick, library tabs, menu dialog, then one match per faction (Novice on both seats,
// seeded) to the result screen, with the DOM after every step.
C.ui=async()=>{
 const steps=[];
 for(const [i,hero] of ['eng','ast','kee'].entries()){
  const u=uiContext(4800+i);let n=0;const snap=tag=>steps.push(`${hero}|${tag}|${n++}|`+sha(JSON.stringify([u.run('JSON.stringify(G)'),u.snapshot(),u.storage,u.rng()])));
  u.run('FAST=true');u.flush();snap('splash');
  u.run(`pickedHero=${JSON.stringify(hero)};heroPick()`);snap('pick');
  for(const tab of ['loc','eng','ast','kee']){u.run(`library(${JSON.stringify(tab)},'pick')`);snap('lib-'+tab);}
  u.run('heroPick();startMatch(false);render()');u.flush();snap('match');
  u.run("$('menuBtn').onclick&&$('menuBtn').onclick()");snap('menu');u.run('closeOv();render()');snap('menu-closed');
  for(let t=1;t<=6;t++){
   u.run("setAiStrategy('p','novice');aiPlan('p');render()");snap('planned');
   await u.settle('endTurn()',()=>snap('choice'));snap('turn'+t);
  }
  u.flush();snap('result');
 }
 return {sha256:sha(steps.join('\n')),detail:{steps:steps.length}};
};

// AI series through the attestation harness (pve = the real game; symmetric = test contour of 004D).
C.ai=async(P,stopAt)=>{
 const src=L.buildSource(path.join(ROOT,'game.js'),path.join(ROOT,'tutorial.js')),series={};
 for(const [i,[a,b]] of PAIRS.entries())for(const mode of ['pve','symmetric']){
  const lines=[],configs=[];let idx=0;
  for(const fa of L.FACS)for(const fb of L.FACS)for(const aSide of ['p','e']){
   const cl=[];
   for(let g=0;g<P.games;g++){
    const c=L.makeContext(src),seed=(48004+i*1000003+idx*7919+g*104729)>>>0;
    const strat=aSide==='p'?{p:a,e:b}:{p:b,e:a},fac=aSide==='p'?{p:fa,e:fb}:{p:fb,e:fa};
    const rec=await L.playGame(c,{seed,p:strat.p,e:strat.e,pf:fac.p,ef:fac.e,mode});
    cl.push(JSON.stringify({seed,config:{fa,fb,aSide},rec:JSON.parse(JSON.stringify(rec,(k,v)=>k==='ms'?undefined:v)),rngAfter:c.rngState()}));
   }
   configs.push(sha(cl.join('\n')));lines.push(...cl);idx++;
  }
  const name=`${a}-${b}-${mode}`;series[name]={games:lines.length,sha256:sha(lines.join('\n')),configs};
  process.stderr.write(`  ai ${name}: ${series[name].sha256.slice(0,16)}\n`);
  if(stopAt&&stopAt(name,series[name]))return {sha256:null,detail:series,stopped:name};
 }
 return {sha256:sha(Object.entries(series).map(([k,v])=>k+':'+v.sha256).join('\n')),detail:series};
};
C.balance=async(P)=>{
 const {simulate}=require('./simulate-balance.cjs');
 const bal=await simulate(path.join(ROOT,'game.js'),P.balance,20261118);const {elapsedSeconds,sourceSha256,...rest}=bal;
 return {sha256:sha(JSON.stringify(rest)),detail:{gamesPerPair:P.balance,seed:20261118,totalGames:bal.totalGames}};
};

async function compute(P,{only=ORDER,ref=null,failFast=false}={}){
 const out={};
 for(const k of ORDER){if(!only.includes(k))continue;const t0=Date.now();
  const stopAt=failFast&&ref&&k==='ai'?(name,s)=>ref.components.ai.detail[name].sha256!==s.sha256:null;
  out[k]=await C[k](P,stopAt);out[k].seconds=Math.round((Date.now()-t0)/1000);
  process.stderr.write(`${k}: ${out[k].sha256?out[k].sha256.slice(0,16):'stopped at '+out[k].stopped} (${out[k].seconds} s)\n`);
  if(failFast&&ref&&(out[k].sha256!==ref.components[k].sha256))break;
 }
 return out;
}
const params=()=>({games:+arg('games','10'),balance:+arg('balance','1000'),aiSeedFormula:'(48004+pair*1000003+config*7919+game*104729)>>>0',balanceSeed:20261118});

if(require.main===module)(async()=>{
 const write=arg('write',null),check=arg('check',null);
 if(!!write===!!check){console.error('use --write=<file> or --check=<file>');process.exit(2);}
 if(write){
  const P=params(),t0=Date.now(),components=await compute(P);
  if(!components.novice.ok){console.error('Novice contract does not hold on this code: '+components.novice.reasons.join('; '));process.exit(1);}
  const base={issue:'#48',kind:'gifted-behaviour-baseline',scope:'identical behaviour in the played scenarios only; see docs/refactor-baseline/README.md',
   code:{commitNote:'measured on the checkout given by --root',gameSha256:sha(read('game.js')),tutorialSha256:sha(read('tutorial.js'))},params:P,components,
   combinedSha256:sha(ORDER.map(k=>k+':'+components[k].sha256).join('\n')),elapsedSeconds:Math.round((Date.now()-t0)/1000)};
  fs.writeFileSync(write,JSON.stringify(base,null,1)+'\n');console.log(`wrote ${write}: combined ${base.combinedSha256}`);return;
 }
 const ref=JSON.parse(fs.readFileSync(check,'utf8'));
 if(ref.kind!=='gifted-behaviour-baseline')throw Error('not a behaviour baseline file');
 for(const k of ['games','balance'])if(arg(k,null)!==null&&+arg(k)!==ref.params[k])throw Error(`--${k} differs from the baseline parameters (${ref.params[k]}); the parameters are fixed by the baseline`);
 const only=(arg('only',ORDER.join(','))).split(',');for(const k of only)if(!ORDER.includes(k))throw Error('unknown component '+k);
 const got=await compute(ref.params,{only,ref,failFast:flag('fail-fast')});
 const diff=[];
 for(const k of only){if(!got[k])continue;const a=ref.components[k],b=got[k];
  if(k==='novice'&&!b.ok)diff.push(`novice: contract broken (${b.reasons.join('; ')})`);
  else if(a.sha256!==b.sha256){
   if(k==='ai'){for(const [n,s] of Object.entries(b.detail)){const r=a.detail[n];if(r.sha256!==s.sha256){const cfg=s.configs.map((h,i)=>h!==r.configs[i]?i:null).filter(i=>i!==null);diff.push(`ai ${n}: differs in configurations ${cfg.join(',')}`);}}}
   else diff.push(`${k}: ${a.sha256.slice(0,16)} → ${b.sha256.slice(0,16)}`);
  }}
 const missing=ORDER.filter(k=>only.includes(k)&&!got[k]);
 if(diff.length){console.log('DIFFERENT: '+diff.join(' | ')+(missing.length?` (not computed after the first difference: ${missing.join(', ')})`:''));process.exit(1);}
 console.log(`IDENTICAL: ${only.join(', ')} equal the baseline ${path.basename(check)} (in the played scenarios only)`);
})().catch(e=>{console.error('ERROR: '+(e&&e.stack||e));process.exit(2);});
module.exports={compute,ORDER};
