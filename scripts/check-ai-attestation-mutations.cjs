#!/usr/bin/env node
// GIFTED-004D (#56): every mutant injects one kind of defect into a copy of the code (game.js, the
// attestation harness or a tournament runner); scripts/check-ai-attestation.cjs must fail on it with the
// expected message. Positive control: the unmodified copy passes the same sections.
// Usage: node scripts/check-ai-attestation-mutations.cjs [name filter]
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..');
const M=[
 // [name, file, [[find, replace], ...], expected message, sections]
 ['harness consumes randomness','scripts/attest-lib.cjs',[["startTurn=function(){if(__A.cur)__A.cur.after=__lanes();","startTurn=function(){Math.random();if(__A.cur)__A.cur.after=__lanes();"]],/1: attestation pve must reproduce tournament-ai/,'1'],
 ['symmetric: p plans on the real state','scripts/attest-lib.cjs',[["G=snap;__ATTEST_SYM_P=true;","__ATTEST_SYM_P=true;"]],/2: symmetric/,'2'],
 ['symmetric: snapshot taken after e planned','scripts/attest-lib.cjs',[
   [" if(__A.mode==='symmetric'&&o==='e'){__A.snap=__cloneAll(G);__A.snapHist=__cloneAll(publicHistory());}\n",""],
   [" return __timed(o,()=>__aiPlan(o));\n};"," const r=__timed(o,()=>__aiPlan(o));if(__A.mode==='symmetric'&&o==='e'){__A.snap=__cloneAll(G);__A.snapHist=__cloneAll(publicHistory());}return r;\n};"]],/2: symmetric .*(snapshot observation differs|depends on the real state)/,'2'],
 ['symmetric: Strategist does not model the answer','scripts/attest-lib.cjs',[["const FOE_TO_ACT_TO=\"foeToAct=(o==='e'||__ATTEST_SYM_P)&&","const FOE_TO_ACT_TO=\"foeToAct=(o==='e')&&"]],/2: the Strategist on p must model the opponent answer/,'2'],
 ['observation exposes the opponent hand','game.js',[["  foe:{handCount:G.hand[foe].length,","  foe:{hand:G.hand[foe].map(c=>c.def.id),handCount:G.hand[foe].length,"]],/3: .*perturbation changed the observation/,'3'],
 ['Novice counts the opponent face-down power','game.js',[["    const diff=mine-laneTotal(l,foe);","    const diff=mine-laneTotal(l,foe)-G.board[l].filter(x=>x.owner===foe&&x.pending).reduce((s,x)=>s+x.def.power,0);"]],/3: .*novice on p/,'3'],
 ['Tactician reads the opponent deck','game.js',[[" tacticianStats.calls++;\n const obs=ctx.observation;if(obs.phase!=='plan')return;"," tacticianStats.calls++;\n const obs=ctx.observation;if(obs.phase!=='plan')return;\n {const d=G.deck[other(ctx.side)];if(d.length&&d[d.length-1].def.power>=6)return;}"]],/3: .*tactician on/,'3'],
 ['Strategist samples the real face-down cards','game.js',[["function strategistPlan(ctx){","function strategistPlan(ctx){globalThis.__realG=G;"],
   ["hidden.forEach((l,i)=>{const c=card(s.hidden[i].def,f);","hidden.forEach((l,i)=>{const rc=__realG.board[l].filter(x=>x.owner===f&&x.pending)[0];const c=card(rc?rc.def:s.hidden[i].def,f);"]],/3: .*strategist on p/,'3'],
 ['sandbox does not restore UID','game.js',[["finally{G=saved.G;UID=saved.UID;logLines=saved.logLines;","finally{G=saved.G;logLines=saved.logLines;"]],/4: .*UID changed/,'4'],
 ['Novice ignores energy','game.js',[["  for(const c of G.hand[o]){const cost=effCost(o,c);if(cost>energy)continue;","  for(const c of G.hand[o]){const cost=effCost(o,c);"]],/5: .*energy exceeded/,'5'],
 ['fallback cause not recorded','game.js',[["strategistStats.fallbackCauses[why]=(strategistStats.fallbackCauses[why]||0)+1;",""]],/6: cause recorded/,'6'],
 ['attest-ai does not count fallbacks','scripts/attest-ai.cjs',[["fallbacks:d('fallbacks')","fallbacks:0"]],/6: attest-ai must count every forced fallback/,'6'],
 ['tournament-ai does not count fallbacks','scripts/tournament-ai.cjs',[["out.fallbacks=d('fallbacks');","out.fallbacks=0;"]],/6: tournament-ai must count every forced fallback/,'6'],
 ['checkpoint resume recomputes finished configurations','scripts/attest-ai.cjs',[["const queue=CONFIGS.map((_,i)=>i).filter(i=>!results.has(i));","const queue=CONFIGS.map((_,i)=>i);"]],/7: (no duplicate configuration|18 configuration lines)/,'7'],
];
function copyTree(dst){
 fs.mkdirSync(path.join(dst,'scripts'),{recursive:true});
 for(const f of ['game.js','tutorial.js'])fs.copyFileSync(path.join(ROOT,f),path.join(dst,f));
 for(const f of fs.readdirSync(path.join(ROOT,'scripts')))if(f.endsWith('.cjs'))fs.copyFileSync(path.join(ROOT,'scripts',f),path.join(dst,'scripts',f));
}
function run(dir,sections){
 const r=spawnSync(process.execPath,[path.join(dir,'scripts','check-ai-attestation.cjs')],{cwd:dir,env:{...process.env,ATTEST_GAME:path.join(dir,'game.js'),ATTEST_CHECK_SECTIONS:sections},encoding:'utf8',timeout:3600000,maxBuffer:1<<26});
 return {status:r.status,out:(r.stdout||'')+(r.stderr||'')};
}
const filter=(process.argv[2]||'').split(',').filter(Boolean);
const results=[];let failed=false;
{const d=fs.mkdtempSync(path.join(os.tmpdir(),'attest-mut-'));copyTree(d);const r=run(d,'1,2,3,4,5,6,7');
 if(r.status!==0){console.log('CONTROL FAILED\n'+r.out.slice(-2000));process.exit(1);}console.log('control: unmodified copy passes');fs.rmSync(d,{recursive:true,force:true});}
for(const [name,file,edits,expect,sections] of M){
 if(filter.length&&!filter.some(f=>name.includes(f)))continue;
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'attest-mut-'));copyTree(d);
 const p=path.join(d,file);let s=fs.readFileSync(p,'utf8');
 for(const [a,b] of edits){const n=s.split(a).length-1;if(n!==1){console.log(`TARGET ${name}: found ${n}× ${a.slice(0,60)}`);process.exit(1);}s=s.replace(a,b);}
 fs.writeFileSync(p,s);
 const r=run(d,sections),msg=(r.out.match(/AssertionError[^\n]*\n?[^\n]*/)||[''])[0].replace(/\s+/g,' ').slice(0,220);
 const ok=r.status!==0&&expect.test(r.out);results.push([name,ok?'DETECTED':'MISSED',msg]);if(!ok)failed=true;
 console.log(`${ok?'DETECTED':'MISSED  '} ${name}${ok?'':' :: '+(msg||r.out.slice(-300))}`);
 fs.rmSync(d,{recursive:true,force:true});
}
console.log(`${failed?'FAIL':'PASS'}: ${results.filter(r=>r[1]==='DETECTED').length}/${results.length} attestation mutants detected`);
process.exit(failed?1:0);
