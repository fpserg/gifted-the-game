#!/usr/bin/env node
// GIFTED-004E (#48), stage B0: negative controls for the two defects found by the inspection of PR #68 and the
// related bypasses. Fast (no AI series): every case runs the real tools on a temporary copy.
//  A. Novice contract bypasses — the live Novice code changed while the pinned text survives in a comment,
//     a string or a template, a second definition, a runtime override, a rewired registration:
//     check-novice-contract.cjs and the gate (--only=novice) must both fail.
//  B. Baseline integrity — a damaged or substituted baseline file must be refused (exit 2) before anything
//     is computed.
//  C. Partial runs — --only must report DIAGNOSTIC ONLY (exit 3), never a gate pass; parameter overrides refused.
// Usage: node scripts/check-behaviour-gate-integrity.cjs
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const REPO=path.join(__dirname,'..'),BASELINE=path.join(REPO,'docs','refactor-baseline','behaviour-baseline.json');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gate-integrity-'));let pass=0,failed=0;
const ok=(c,m)=>{if(c){pass++;console.log('  PASS '+m);}else{failed++;console.log('  FAIL '+m);}};
const node=(script,args)=>spawnSync(process.execPath,[path.join(__dirname,script),...args],{encoding:'utf8',maxBuffer:1<<28,timeout:900000});
const last=p=>((p.stdout||'')+(p.stderr||'')).trim().split('\n').pop().slice(0,150);
const G=fs.readFileSync(path.join(REPO,'game.js'),'utf8'),T=fs.readFileSync(path.join(REPO,'tutorial.js'),'utf8');
const DISPATCH="function aiPlan(o){const s=aiStrategy(o);if(s.legacy)return s.plan(o);return s.plan(aiContext(o));}";
const BROKEN="function aiPlan(o){const s=aiStrategy(o);if(s.legacy)return;return s.plan(aiContext(o));}";
const once=(src,a,b)=>{const n=src.split(a).length-1;if(n!==1)throw Error(`anchor found ${n} times: ${a.slice(0,60)}`);return src.replace(a,b);};
let k=0;const root=(game,tut=T)=>{const d=path.join(tmp,'r'+(k++));fs.mkdirSync(d);fs.writeFileSync(path.join(d,'game.js'),game);fs.writeFileSync(path.join(d,'tutorial.js'),tut);return d;};
try{
 console.log('A. Novice contract: live code, not text');
 const novStart=G.indexOf('function noviceAiPlan(o){'),plan=G.slice(novStart,G.indexOf('\n}\n',novStart)+2);
 const A=[
  ['dispatch disabled, original kept in a block comment (inspection case)',once(G,DISPATCH,BROKEN+'\n/*\n'+DISPATCH+'\n*/')],
  ['dispatch disabled, original kept in a line comment',once(G,DISPATCH,BROKEN+'\n//'+DISPATCH)],
  ['dispatch disabled, original kept in a string',once(G,DISPATCH,BROKEN+'\nconst __decoy="'+DISPATCH+'";')],
  ['dispatch disabled, original kept in a template',once(G,DISPATCH,BROKEN+'\nconst __decoy=`'+DISPATCH+'`;')],
  ['second, later definition of noviceAiPlan (live one changed)',G+'\nfunction noviceAiPlan(o){}\n'],
  ['earlier decoy definition of aiPlan (ambiguous)',once(G,DISPATCH,BROKEN+'\n'+DISPATCH)],
  ['Novice constant changed, original body kept in a comment',once(G,plan,plan.replace('cost*1.3+','cost*1.31+')+'\n/*\n'+plan+'\n*/')],
  ['runtime reassignment of noviceAiPlan',G+'\nnoviceAiPlan=function(o){};\n'],
  ['registration rewired to a wrapper, original line in a comment',once(G,"registerAiStrategy({...AI_BASELINE,name:'Новичок',legacy:true,plan:noviceAiPlan});","registerAiStrategy({...AI_BASELINE,name:'Новичок',legacy:true,plan:o=>{}});\n// registerAiStrategy({...AI_BASELINE,name:'Новичок',legacy:true,plan:noviceAiPlan});")],
  ['registry entry replaced after registration',G+"\nAI_STRATEGIES.novice=Object.freeze({...AI_STRATEGIES.novice,plan:o=>{}});\n"],
  ['legacy choice reducer changed, original line in a comment',once(G,"if(s.legacy)return kind==='lane'?options.reduce((best,l)=>best===null||score(l)>score(best)?l:best,null)","/* if(s.legacy)return kind==='lane'?options.reduce((best,l)=>best===null||score(l)>score(best)?l:best,null) */if(s.legacy)return kind==='lane'?options.reduce((best,l)=>best===null||score(l)>=score(best)?l:best,null)")],
  ['aiStrategy redirected',once(G,"function aiStrategy(o){return AI_STRATEGIES[aiSides[o]];}","function aiStrategy(o){return AI_STRATEGIES[aiSides[o]]||AI_STRATEGIES.novice;}\n// function aiStrategy(o){return AI_STRATEGIES[aiSides[o]];}")],
  ['AI_BASELINE version changed',once(G,"version:'novice-1',baseCommit","version:'novice-2',baseCommit")],
  ['default seat changed',once(G,"const aiSides={p:AI_BASELINE.id,e:AI_BASELINE.id};","const aiSides={p:AI_BASELINE.id,e:'tactician'};")],
 ];
 for(const [name,game] of A){const d=root(game);
  const c=node('check-novice-contract.cjs',[`--root=${d}`]),g=node('behaviour-baseline.cjs',[`--check=${BASELINE}`,`--root=${d}`,'--only=novice']);
  ok(c.status===1&&/FAIL: Novice implementation contract/.test(c.stderr)&&g.status===1&&/DIFFERENT: novice: contract broken/.test(g.stdout),
   `${name} → contract exit ${c.status}, gate exit ${g.status}: ${last(c)}`);}
 {const d=root(G),c=node('check-novice-contract.cjs',[`--root=${d}`]);ok(c.status===0,'unchanged copy → contract PASS');}

 console.log('B. Baseline integrity (refused before computing)');
 const base=JSON.parse(fs.readFileSync(BASELINE,'utf8')),cp=()=>JSON.parse(JSON.stringify(base));
 const recombine=b=>{b.combinedSha256=sha(['novice','rules','tutorial','ui','ai','balance'].map(x=>x+':'+b.components[x].sha256).join('\n'));return b;};
 const B=[
  ['combinedSha256 replaced by zeros (inspection case)',b=>{b.combinedSha256='0'.repeat(64);}],
  ['balance component missing',b=>{delete b.components.balance;}],
  ['extra component',b=>{b.components.extra={sha256:'0'.repeat(64),detail:{}};}],
  ['games parameter changed',b=>{b.params.games=5;}],
  ['seed formula changed',b=>{b.params.aiSeedFormula='other';}],
  ['component hash changed',b=>{b.components.rules.sha256='1'.repeat(64);}],
  ['component hash changed and combined recomputed (consistent forgery)',b=>{b.components.ui.sha256='2'.repeat(64);recombine(b);}],
  ['code.gameSha256 changed',b=>{b.code.gameSha256='3'.repeat(64);}],
  ['bound to another commit',b=>{b.code.baseCommit='7d3891a8cef879a0ba3fb1aa80a69abe92fa9633';}],
  ['ai series missing',b=>{delete b.components.ai.detail['novice-novice-pve'];}],
  ['ai configuration list shortened',b=>{b.components.ai.detail['tactician-novice-pve'].configs.pop();}],
  ['ai series hash changed',b=>{b.components.ai.detail['strategist-strategist-symmetric'].sha256='4'.repeat(64);}],
  ['novice detail changed',b=>{b.components.novice.detail.planBodySha256='5'.repeat(64);}],
  ['rules case count changed',b=>{b.components.rules.detail.cases=300;}],
  ['kind changed',b=>{b.kind='other';}],
  ['extra top-level field',b=>{b.note='x';}],
 ];
 for(const [name,f] of B){const b=cp();f(b);const file=path.join(tmp,'b'+(k++)+'.json');fs.writeFileSync(file,JSON.stringify(b));
  const t=Date.now(),g=node('behaviour-baseline.cjs',[`--check=${file}`,'--only=novice']);
  ok(g.status===2&&/INTEGRITY FAIL/.test(g.stderr)&&Date.now()-t<60000,`${name} → exit ${g.status}: ${last(g)}`);}
 {const file=path.join(tmp,'notjson.json');fs.writeFileSync(file,'{"kind":');const g=node('behaviour-baseline.cjs',[`--check=${file}`]);ok(g.status===2&&/INTEGRITY FAIL/.test(g.stderr),'not JSON → exit '+g.status);}

 console.log('C. Partial runs are diagnostics, never a gate pass');
 let g=node('behaviour-baseline.cjs',[`--check=${BASELINE}`,'--only=novice']);
 ok(g.status===3&&/DIAGNOSTIC ONLY/.test(g.stdout)&&/NOT a pass of the behaviour gate/.test(g.stdout)&&!/GATE PASS/.test(g.stdout),`--only=novice on intact code → exit ${g.status}: ${last(g)}`);
 g=node('behaviour-baseline.cjs',[`--check=${BASELINE}`,'--only=novice,rules,tutorial,ui']);
 ok(g.status===3&&/DIAGNOSTIC ONLY/.test(g.stdout),`fast components on intact code → exit ${g.status}`);
 g=node('behaviour-baseline.cjs',[`--check=${BASELINE}`,'--games=5','--only=novice']);
 ok(g.status===2&&/fixed by the baseline/.test(g.stderr),`--games override → exit ${g.status}`);
 g=node('behaviour-baseline.cjs',[`--check=${BASELINE}`,'--only=nothing']);ok(g.status===2,`unknown component → exit ${g.status}`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log(`\n${pass} PASS, ${failed} FAIL`);process.exit(failed?1:0);
