#!/usr/bin/env node
// GIFTED-004D (#56): honesty and contour checks for the AI attestation.
// Usage: node scripts/check-ai-attestation.cjs   (sections via ATTEST_CHECK_SECTIONS=1,2,...; default all)
//  1 rule identity: the attestation harness (pve) reproduces tournament-ai.cjs game for game, so the
//    contour (telemetry, timing, legality checks) neither changes the rules nor consumes randomness;
//    the in-memory patches match exactly once and are inert in pve.
//  2 symmetric mode: the turn-start snapshot is faithful; p's decision is identical whatever e actually
//    planned (no leak through face-down counts, hand size, discount, lane availability or the real state);
//    the Strategist models the opponent's answer there; e is unaffected.
//  3 hidden information (all three levels, both sides, both modes): with the observation unchanged, any
//    change of hidden state (opponent hand, deck and face-down identities, own deck order) leaves the
//    decision identical at every turn of real games.
//  4 sandbox and RNG isolation: a plan leaves G, UID, the log and Math.random in place and changes only its
//    own side; opponent state and both decks are untouched.
//  5 legality: real games of every pair in both modes have no violation and no refused action.
//  6 Strategist fallback: forced exceptions reach the fallback (Tactician's best plan, or nothing when no
//    plan exists), and both tournament runners count them with their causes.
//  7 attestation checkpoint: resume without duplicates, identity refusal, partial-line repair.
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert'),{execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..'),L=require('./attest-lib.cjs');
const GAME=process.env.ATTEST_GAME||path.join(ROOT,'game.js'),TUT=path.join(path.dirname(GAME),'tutorial.js');
const SECTIONS=new Set((process.env.ATTEST_CHECK_SECTIONS||'1,2,3,4,5,6,7').split(','));
const LEVELS=['novice','tactician','strategist'];
const done=[];
const src=()=>L.buildSource(GAME,TUT);
const J=(c,e)=>JSON.parse(c.run(`JSON.stringify(${e})`));
// In-context test helpers: decide on a clone (placements only, nothing applied to G), perturb hidden state.
const TEST=String.raw`
function __decideOn(state,o,sym){
 const saved=G,mem=typeof strategistMemory==='object'?__cloneAll(strategistMemory):null;
 const st=__cloneAll(state);AI_PUBLIC_HISTORY.set(st,__cloneAll(AI_PUBLIC_HISTORY.get(state)||{destroyed:{p:[],e:[]}}));
 __A.logG=st;__A.logList=[];G=st;if(sym)__ATTEST_SYM_P=true;
 try{__aiPlan(o);}finally{__ATTEST_SYM_P=false;G=saved;__A.logG=null;if(mem)for(const k of Object.keys(mem))strategistMemory[k]=mem[k];}
 return __A.logList.map(x=>x.join(':')).join(',');
}
function __lcg(s){let n=s>>>0;return ()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);}
function __perturb(state,o,seed){
 const st=__cloneAll(state);AI_PUBLIC_HISTORY.set(st,__cloneAll(AI_PUBLIC_HISTORY.get(state)||{destroyed:{p:[],e:[]}}));
 const r=__lcg(seed),f=o==='p'?'e':'p',pick=()=>CARDS[Math.floor(r()*CARDS.length)];
 for(const c of st.hand[f])c.def=pick();
 for(const c of st.deck[f])c.def=pick();
 for(const l of st.board)for(const c of l)if(c.owner===f&&c.pending)c.def=pick();
 const d=st.deck[o];for(let i=d.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
 return st;
}
function __obsOn(state,o){const saved=G;G=state;try{return JSON.stringify(observe(o));}finally{G=saved;}}`;
function ctxWith(extra=''){const c=L.makeContext(src());c.run(TEST+extra);return c;}

(async()=>{
 // 1. Rule identity against tournament-ai.cjs (same seeds, same configuration order).
 if(SECTIONS.has('1')){
  for(const [a,b] of [['strategist','novice'],['tactician','novice'],['novice','novice']]){
   const seed=4242,games=2;
   const t=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'tournament-ai.cjs'),a,b,String(games),String(seed),'2',GAME],{cwd:path.dirname(GAME),encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<26}));
   const r=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'attest-ai.cjs'),`--pair=${a}:${b}`,'--mode=pve',`--games=${games}`,`--seed=${seed}`,'--workers=2',`--game=${GAME}`],{cwd:path.dirname(GAME),encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<28}));
   const tr=t.byCombination.map(x=>[x.t,x.n,x.seat,x.wins,x.losses,x.draws].join()),ar=r.byCombination.map(x=>[x.fa,x.fb,x.aSide,x.aWins,x.aLosses,x.draws].join());
   assert.deepEqual(ar,tr,`1: attestation pve must reproduce tournament-ai.cjs for ${a}:${b}`);
   assert.equal(r.violations,0);assert.equal(r.legalRefused,0);
  }
  for(const p of L.PATCHES)assert.equal(fs.readFileSync(GAME,'utf8').split(p.find).length,2,'1: patch target exactly once: '+p.find);
  done.push('rule identity vs tournament-ai (3 pairs × 18 configurations)');
 }
 // 2. Symmetric mode.
 if(SECTIONS.has('2')){
  let checks=0,answerModels=0;
  for(const [pS,eS] of [['strategist','tactician'],['tactician','strategist'],['novice','strategist'],['strategist','strategist']])for(const seed of [7,8]){
   const c=ctxWith(String.raw`
    var __symChecks=[],__answers=0;const __tp=tacticianPlan;tacticianPlan=function(ctx){if(__ATTEST_SYM_P&&tacticianFastSamples===1)__answers++;return __tp(ctx);};
    const __sym=__planP_symmetric;
    __planP_symmetric=function(){
     // Snapshot fidelity: the observation on the snapshot equals the one captured before e planned.
     AI_PUBLIC_HISTORY.set(__A.snap,__A.snapHist);
     if(__obsOn(__A.snap,'p')!==__A.obsAtStart)__symChecks.push('snapshot observation differs: '+__obsOn(__A.snap,'p').slice(0,300)+' vs '+__A.obsAtStart.slice(0,300));
     const snap=__A.snap,hist=__A.snapHist,real=G,rng=__rngGet();
     const variant=(mut)=>{const R=__cloneAll(real);AI_PUBLIC_HISTORY.set(R,__cloneAll(publicHistory()));mut(R);G=R;__A.snap=__cloneAll(snap);__A.snapHist=__cloneAll(hist);
      const mem=__cloneAll(strategistMemory);__rngSet(rng);__A.cur={t:R.turn,sides:{}};
      try{__sym();return R.board.flatMap((l,i)=>l.filter(c=>c.owner==='p'&&c.pending).map(c=>c.def.id+'@'+i)).sort().join();}finally{G=real;for(const k of Object.keys(mem))strategistMemory[k]=mem[k];}};
     const a=variant(()=>{}),b=variant(R=>{for(const l of R.board)for(let i=l.length-1;i>=0;i--)if(l[i].owner==='e'&&l[i].pending){const x=l.splice(i,1)[0];x.pending=false;x.lane=-1;R.hand.e.push(x);}R.spent.e=0;R.discount.e=1;}),
      d=variant(R=>{for(const c of R.hand.e.splice(0))R.deck.e.push(c);R.spent.e=R.turn;});
     if(a!==b||a!==d)__symChecks.push('p decision depends on the real state: '+[a,b,d].join(' | '));
     // The applied placements equal the plan made on the snapshot itself.
     {const mem=__cloneAll(strategistMemory);__rngSet(rng);const plan=__decideOn(snap,'p',true).split(',').filter(Boolean).map(x=>{const q=x.split(':');return q[1]+'@'+q[3];}).sort().join();
      for(const k of Object.keys(mem))strategistMemory[k]=mem[k];if(plan!==a)__symChecks.push('applied placements differ from the snapshot plan: '+a+' vs '+plan);}
     __rngSet(rng);__A.snap=snap;__A.snapHist=hist;__A.cur.sides={...__A.cur.sides};return __sym();
    };
    const __ap=aiPlan;aiPlan=function(o){if(__A.mode==='symmetric'&&o==='e')__A.obsAtStart=JSON.stringify(observe('p'));return __ap(o);};`);
   c.run(`var __rngGet=()=>__rngState(),__rngSet=s=>__rngSetState(s);`);
   c.ctx.__rngState=c.rngState;c.ctx.__rngSetState=c.setSeed;
   await L.playGame(c,{seed:900+seed,p:pS,e:eS,pf:'kee',ef:'ast',mode:'symmetric'});
   const v=J(c,'__symChecks');assert.deepEqual(v,[],`2: symmetric ${pS} vs ${eS}#${seed}: ${v[0]}`);checks+=6;
   if(pS==='strategist')answerModels+=c.run('__answers');
  }
  assert(answerModels>0,'2: the Strategist on p must model the opponent answer in the symmetric mode');
  // e plans at the start of the turn in both modes: identical e decisions in pve and symmetric when p is the Novice.
  for(const eS of ['tactician','strategist']){
   const recs=[];for(const mode of ['pve','symmetric']){const c=ctxWith();recs.push(await L.playGame(c,{seed:77,p:'novice',e:eS,pf:'eng',ef:'kee',mode}));}
   assert.deepEqual(recs[0].turns.map(t=>t.sides.e.played),recs[1].turns.map(t=>t.sides.e.played),`2: e (${eS}) must plan identically in both modes when p's plans coincide`);
  }
  done.push(`symmetric mode (${checks} turn checks: snapshot fidelity, p independent of e's real plan; answer modelled ${answerModels}×)`);
 }
 // 3. Hidden information invariance.
 if(SECTIONS.has('3')){
  let n=0;
  for(const mode of ['pve','symmetric'])for(const S of LEVELS)for(const side of ['p','e'])for(const seed of [3,4]){
   const opp=S==='novice'?'tactician':'novice',strat=side==='p'?{p:S,e:opp}:{p:opp,e:S};
   const c=ctxWith(String.raw`
    var __inv=[];const __ap2=aiPlan;
    aiPlan=function(o){
     if(o==='${side}'){
      const sym=__A.mode==='symmetric'&&o==='p';
      const base=sym?(()=>{const s=__cloneAll(G);AI_PUBLIC_HISTORY.set(s,__cloneAll(publicHistory()));
        for(const l of s.board)for(let i=l.length-1;i>=0;i--)if(l[i].owner==='e'&&l[i].pending)l.splice(i,1);return s;})():G;
      if(!sym||(__A.snap&&__A.snap.turn===G.turn)){
       const st=sym?__A.snap:G,rng=__rngGet();
       for(let k=0;k<2;k++){const q=__perturb(st,o,1000+k*31+G.turn);
        if(__obsOn(q,o)!==__obsOn(st,o)){__inv.push('perturbation changed the observation');continue;}
        __rngSet(rng);const a=__decideOn(st,o,sym);__rngSet(rng);const b=__decideOn(q,o,sym);
        if(a!==b)__inv.push('turn '+G.turn+': '+a+' vs '+b);}
       __rngSet(rng);
      }
     }
     return __ap2(o);
    };`);
   c.run(`var __rngGet=()=>__rngState(),__rngSet=s=>__rngSetState(s);`);c.ctx.__rngState=c.rngState;c.ctx.__rngSetState=c.setSeed;
   await L.playGame(c,{seed:300+seed,p:strat.p,e:strat.e,pf:['eng','ast','kee'][seed%3],ef:['kee','eng','ast'][seed%3],mode});
   const v=J(c,'__inv');assert.deepEqual(v,[],`3: ${mode} ${S} on ${side}#${seed}: ${v[0]}`);n++;
  }
  done.push(`hidden information (${n} games × 6 turns × 2 perturbations: 3 levels, both sides, both modes)`);
 }
 // 4. Sandbox and RNG isolation of a plan.
 if(SECTIONS.has('4')){
  let n=0;
  for(const S of LEVELS)for(const side of ['p','e']){
   const opp=S==='strategist'?'tactician':'strategist',strat=side==='p'?{p:S,e:opp}:{p:opp,e:S};
   const c=ctxWith(String.raw`
    var __iso=[];const __ap3=aiPlan;
    aiPlan=function(o){
     if(o==='${side}'){const g=G,uid=UID,log=logLines,rnd=Math.random,f=o==='p'?'e':'p';
      const before=JSON.stringify({fh:G.hand[f].map(c=>[c.uid,c.def.id]),fd:G.deck[f].map(c=>c.uid),od:G.deck[o].map(c=>c.uid),
       fb:G.board.map(l=>l.filter(c=>c.owner===f).map(c=>[c.uid,c.def.id,c.pending,c.revealed,c.buff])),fs:[G.spent[f],G.discount[f],G.surcharge[f]],disc:G.discard,locs:G.locs.map(x=>x.id),rev:G.locRev});
      const r=__ap3(o);
      const after=JSON.stringify({fh:G.hand[f].map(c=>[c.uid,c.def.id]),fd:G.deck[f].map(c=>c.uid),od:G.deck[o].map(c=>c.uid),
       fb:G.board.map(l=>l.filter(c=>c.owner===f).map(c=>[c.uid,c.def.id,c.pending,c.revealed,c.buff])),fs:[G.spent[f],G.discount[f],G.surcharge[f]],disc:G.discard,locs:G.locs.map(x=>x.id),rev:G.locRev});
      if(G!==g)__iso.push('G replaced');if(UID!==uid)__iso.push('UID changed');if(logLines!==log)__iso.push('log replaced');if(Math.random!==rnd)__iso.push('Math.random replaced');
      if(before!==after)__iso.push('opponent state or a deck changed');return r;}
     return __ap3(o);};`);
   for(const mode of ['pve','symmetric'])await L.playGame(c,{seed:55,p:strat.p,e:strat.e,pf:'ast',ef:'kee',mode});
   const v=J(c,'__iso');assert.deepEqual(v,[],`4: ${S} on ${side}: ${v[0]}`);n++;
  }
  done.push(`sandbox and RNG isolation (${n} level/side combinations, both modes)`);
 }
 // 5. Legality in real games of every pair and mode.
 if(SECTIONS.has('5')){
  let games=0;
  for(const mode of ['pve','symmetric'])for(let i=0;i<LEVELS.length;i++)for(let j=i;j<LEVELS.length;j++){
   const c=ctxWith(),acc={};
   for(const [k,[pf,ef]] of [['eng','ast'],['kee','kee'],['ast','eng']].entries())for(const sw of [0,1]){
    const strat=sw?{p:LEVELS[j],e:LEVELS[i]}:{p:LEVELS[i],e:LEVELS[j]};
    let rec;try{rec=await L.playGame(c,{seed:500+k*7+sw,p:strat.p,e:strat.e,pf,ef,mode});}
    catch(e){const v=J(c,'__A.violations');assert.fail(`5: ${mode} ${strat.p}:${strat.e} game failed (${String(e.message).slice(0,80)}); violations ${v.map(x=>x.kind).join(', ')||'none'}`);}
    L.aggregate(acc,rec,strat);games++;
   }
   assert.equal(acc.violations,0,`5: ${mode} ${LEVELS[i]}:${LEVELS[j]} violations ${JSON.stringify(acc.violationKinds)}`);
   assert.equal(acc.legalRefused,0,`5: ${mode} ${LEVELS[i]}:${LEVELS[j]} refused actions`);
  }
  done.push(`legality (${games} games, 6 pairs × 2 modes)`);
 }
 // 6. Strategist fallback: forced exceptions and both runners' counters.
 if(SECTIONS.has('6')){
  const c=ctxWith(String.raw`var __force=null;const __sw=strategistWorld;strategistWorld=function(...a){if(__force==='world')throw Error('forced world failure');return __sw(...a);};
   const __tps=tacticianPlans;tacticianPlans=function(...a){if(__force==='plans')throw Error('forced plans failure');return __tps(...a);};`);
  c.setSeed(91);c.run(`setAiStrategy('p','strategist');setAiStrategy('e','novice');FAST=true;__beginGame('pve');__opp='eng';newGame('kee');__opp=null;`);
  await c.run("(async()=>{aiPlan('p');await endTurn()})()");
  // Expected fallback: the best plan by tacticianEvaluate, computed on a clone with the same random state.
  const rng=c.rngState();
  const expected=c.run(String.raw`(()=>{const saved=G,st=__cloneAll(G);AI_PUBLIC_HISTORY.set(st,__cloneAll(publicHistory()));G=st;
   try{const obs=observe('p'),base=tacticianState(obs);const plans=tacticianPlans(obs,base);const sc=plans.map(p=>({p,v:tacticianEvaluate(obs,base,p)}));
    const best=[...sc].sort((a,b)=>b.v-a.v)[0].p;return best.map(([u,l])=>u+':'+l).join(',');}finally{G=saved;}})()`);
  c.setSeed(rng);
  const f0=J(c,'strategistStats');
  c.run("__force='world'");const got=c.run(String.raw`(()=>{const st=__cloneAll(G);AI_PUBLIC_HISTORY.set(st,__cloneAll(publicHistory()));__A.logG=st;__A.logList=[];const saved=G;G=st;
   try{__aiPlan('p');}finally{G=saved;__A.logG=null;}return __A.logList.map(x=>x[2]+':'+x[3]).join(',');})()`);
  const f1=J(c,'strategistStats');
  assert.equal(f1.fallbacks-f0.fallbacks,1,'6: forced world failure must count one fallback');
  assert.equal((f1.fallbackCauses['forced world failure']||0)-(f0.fallbackCauses['forced world failure']||0),1,'6: cause recorded');
  assert.equal(got,expected,'6: the fallback must play the best Tactician-evaluated plan');
  c.run("__force='plans'");const got2=c.run(String.raw`(()=>{const st=__cloneAll(G);AI_PUBLIC_HISTORY.set(st,__cloneAll(publicHistory()));__A.logG=st;__A.logList=[];const saved=G;G=st;
   try{__aiPlan('p');}finally{G=saved;__A.logG=null;}return __A.logList.length;})()`);
  const f2=J(c,'strategistStats');
  assert.equal(got2,0,'6: without any plan nothing is played');assert.equal(f2.fallbacksWithoutPlan-f1.fallbacksWithoutPlan,1,'6: fallback without plan counted');
  // Both runners count fallbacks from the engine counters (a game.js copy whose worlds always fail).
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'attest-fb-'));
  fs.copyFileSync(TUT,path.join(tmp,'tutorial.js'));
  const g=fs.readFileSync(GAME,'utf8'),hook='function strategistWorld(obs,st,info){';assert.equal(g.split(hook).length,2,'6: strategistWorld signature');
  fs.writeFileSync(path.join(tmp,'game.js'),g.replace(hook,hook+"throw Error('forced in runner test');"));
  const r=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'attest-ai.cjs'),'--pair=strategist:novice','--mode=pve','--games=1','--seed=3','--workers=2',`--game=${path.join(tmp,'game.js')}`],{cwd:tmp,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<28}));
  assert(r.strategistCounters.calls>0&&r.strategistCounters.fallbacks===r.strategistCounters.calls,`6: attest-ai must count every forced fallback (${r.strategistCounters.fallbacks}/${r.strategistCounters.calls})`);
  assert.equal(r.strategistCounters.causes['forced in runner test'],r.strategistCounters.fallbacks,'6: attest-ai causes');
  const t=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'tournament-ai.cjs'),'strategist','novice','1','3','2',path.join(tmp,'game.js')],{cwd:tmp,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<26}));
  assert(t.fallbacks.plans>0&&t.fallbacks.plans===t.planTimeMs.calls,`6: tournament-ai must count every forced fallback (${t.fallbacks.plans}/${t.planTimeMs.calls})`);
  assert.equal(t.fallbacks.causes['forced in runner test'],t.fallbacks.plans,'6: tournament-ai causes');
  fs.rmSync(tmp,{recursive:true,force:true});
  done.push(`Strategist fallback (forced world and plan failures; both runners count ${r.strategistCounters.fallbacks} / ${t.fallbacks.plans} forced fallbacks with causes)`);
 }
 // 7. Attestation checkpoint.
 if(SECTIONS.has('7')){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'attest-ck-')),ck=path.join(tmp,'ck.jsonl');
  const run=(extra=[])=>execFileSync(process.execPath,[path.join(__dirname,'attest-ai.cjs'),'--pair=tactician:novice','--mode=symmetric','--games=1','--seed=19','--workers=2',`--game=${GAME}`,`--checkpoint=${ck}`,...extra],{cwd:path.dirname(GAME),encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:1<<28});
  // Everything except wall-clock data (elapsed time, planning-time histograms) is deterministic.
  const strip=s=>{const d=JSON.parse(s);delete d.elapsedSeconds;delete d.checkpoint;delete d.aggregate.perf;return JSON.stringify(d);};
  const full=strip(run());
  // Interrupted run: keep the identity and 7 configurations, add a partial line; resume must finish the rest once.
  const lines=fs.readFileSync(ck,'utf8').split('\n').filter(Boolean);fs.writeFileSync(ck,lines.slice(0,8).join('\n')+'\n'+lines[8].slice(0,40));
  assert.equal(strip(run()),full,'7: resumed result must equal the uninterrupted one');
  const after=fs.readFileSync(ck,'utf8').split('\n').filter(Boolean).slice(1).map(l=>JSON.parse(l).index);
  assert.equal(after.length,18,'7: 18 configuration lines');assert.equal(new Set(after).size,18,'7: no duplicate configuration');
  // A finished checkpoint replays without recomputing; a duplicated line is ignored.
  fs.appendFileSync(ck,lines[3]+'\n');assert.equal(strip(run()),full,'7: duplicate line ignored');
  let refused=false;try{execFileSync(process.execPath,[path.join(__dirname,'attest-ai.cjs'),'--pair=tactician:novice','--mode=symmetric','--games=1','--seed=20','--workers=2',`--game=${GAME}`,`--checkpoint=${ck}`],{cwd:path.dirname(GAME),stdio:'pipe'});}catch(e){refused=/refusing to resume/.test(String(e.stderr));}
  assert(refused,'7: a different seed must be refused');
  const ls=fs.readFileSync(ck,'utf8').split('\n');ls[4]='{corrupt';fs.writeFileSync(ck,ls.join('\n'));
  let corrupt=false;try{run();}catch(e){corrupt=/corrupt/.test(String(e.stderr));}assert(corrupt,'7: a corrupt middle line must stop the run');
  // Chunked units give the same result as whole configurations; a deadline stops with exit 3 and the rerun completes.
  const det=out=>{const d=JSON.parse(out);delete d.aggregate.perf;return JSON.stringify([d.byCombination,d.strategistCounters,d.aggregate]);};
  const base=['--pair=strategist:tactician','--mode=symmetric','--games=2','--seed=31','--workers=2',`--game=${GAME}`];
  const ex=(extra)=>execFileSync(process.execPath,[path.join(__dirname,'attest-ai.cjs'),...base,...extra],{cwd:path.dirname(GAME),encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:1<<28});
  const whole=det(ex(['--chunk=0'])),ck2=path.join(tmp,'ck2.jsonl');
  let stopped=false;try{ex(['--chunk=1',`--checkpoint=${ck2}`,'--deadline=0']);}catch(e){stopped=e.status===3&&/incomplete/.test(String(e.stderr));}
  assert(stopped,'7: a reached deadline must stop with exit code 3');
  assert.equal(det(ex(['--chunk=1',`--checkpoint=${ck2}`])),whole,'7: chunked and resumed result must equal the whole-configuration result');
  fs.rmSync(tmp,{recursive:true,force:true});
  done.push('attestation checkpoint (resume, duplicates, identity, partial and corrupt lines; chunks and deadline)');
 }
 console.log(`PASS: AI attestation checks: ${done.join('; ')}`);
})().catch(e=>{console.error(e);process.exit(1);});
