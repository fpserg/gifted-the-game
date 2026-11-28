#!/usr/bin/env node
// GIFTED-004E (#48), stage B0: direct implementation contract of the frozen Novice (novice-1).
// The behavioural comparison of check-ai-architecture.cjs plays a sample of matches and may miss a small change
// (e.g. a scoring constant 1.3 -> 1.31 kept every sampled decision). This contract checks the implementation
// itself, against the fixed reference commit 2923eaf (AI_BASELINE.baseCommit), with no tolerance:
//  1. the body of noviceAiPlan(o) is byte-identical to the body of aiPlan(o) at 2923eaf;
//  2. the legacy choice branch of aiChoose uses exactly the two reducers of 2923eaf (chooseAstroCard /
//     chooseAstroLane) and is byte-identical to the pinned line;
//  3. the legacy dispatch in aiPlan, the AI_BASELINE descriptor and the registration are byte-identical to the pinned
//     lines (exactly one occurrence each).
// Scope: the Novice's own code. The engine functions it calls (canPlay, effCost, laneTotal, place, …) are rules;
// their changes are caught by the rules / ai / balance components of behaviour-baseline.cjs, not here.
// Usage: node scripts/check-novice-contract.cjs [--root=<dir with game.js>]   (needs the commit 2923eaf locally:
//        git fetch --no-tags --depth=1 origin 2923eafca24d8b23ec0b3de71306ca555919b782)
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const REPO=path.join(__dirname,'..'),BASE='2923eafca24d8b23ec0b3de71306ca555919b782';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const PINNED={
 dispatch:"function aiPlan(o){const s=aiStrategy(o);if(s.legacy)return s.plan(o);return s.plan(aiContext(o));}",
 choice:" if(s.legacy)return kind==='lane'?options.reduce((best,l)=>best===null||score(l)>score(best)?l:best,null):options.reduce((best,c)=>!best||score(c)>score(best)?c:best,null);",
 baseline:"const AI_BASELINE={id:'novice',version:'novice-1',baseCommit:'2923eafca24d8b23ec0b3de71306ca555919b782'};",
 register:"registerAiStrategy({...AI_BASELINE,name:'Новичок',legacy:true,plan:noviceAiPlan});",
};
const REDUCERS=["(best,l)=>best===null||score(l)>score(best)?l:best","(best,c)=>!best||score(c)>score(best)?c:best"];
// Body `{…}` of `function <name>(` with a scanner that skips strings, templates, regex-free code and comments.
function body(src,name){
 const i=src.indexOf(`function ${name}(`);if(i<0||src.indexOf(`function ${name}(`,i+1)>=0)return null;
 let k=src.indexOf('{',src.indexOf(')',i)),d=0,start=k;
 for(;k<src.length;k++){const c=src[k];
  if(c==='"'||c==="'"||c==='`'){const q=c;for(k++;k<src.length&&src[k]!==q;k++)if(src[k]==='\\')k++;continue;}
  if(c==='/'&&src[k+1]==='/'){k=src.indexOf('\n',k);continue;}
  if(c==='/'&&src[k+1]==='*'){k=src.indexOf('*/',k)+1;continue;}
  if(c==='{')d++;else if(c==='}'&&--d===0)return src.slice(start,k+1);
 }
 return null;
}
const lines=(src,line)=>src.split('\n').filter(l=>l===line).length;
function reference(){try{return execFileSync('git',['show',`${BASE}:game.js`],{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<26});}catch{return null;}}
function contract(root=REPO){
 const src=fs.readFileSync(path.join(root,'game.js'),'utf8'),ref=reference(),reasons=[],parts={};
 const plan=body(src,'noviceAiPlan');parts.planBodySha256=plan?sha(plan):null;
 if(!plan)reasons.push('noviceAiPlan not found exactly once');
 if(ref===null)reasons.push(`reference commit ${BASE} not available locally (git fetch it)`);
 else{
  const refPlan=body(ref,'aiPlan');parts.referencePlanBodySha256=refPlan?sha(refPlan):null;
  if(!refPlan)reasons.push('aiPlan not found in the reference');
  else if(plan!==refPlan)reasons.push('noviceAiPlan body differs from aiPlan at 2923eaf');
  for(const r of REDUCERS)if(!ref.includes(r))reasons.push('reference lacks reducer '+r);
 }
 for(const [k,line] of Object.entries(PINNED)){const n=lines(src,line);parts[k]=n;if(n!==1)reasons.push(`${k}: pinned line found ${n} times (expected exactly 1)`);}
 for(const r of REDUCERS)if(!PINNED.choice.includes(r))reasons.push('pinned choice line lacks reducer');
 return {ok:reasons.length===0,reasons,parts};
}
module.exports={contract,body};
if(require.main===module){
 const a=process.argv.find(x=>x.startsWith('--root='));const r=contract(a?path.resolve(a.slice(7)):REPO);
 if(!r.ok){console.error('FAIL: Novice implementation contract: '+r.reasons.join('; '));process.exit(1);}
 console.log(`PASS: Novice implementation contract (plan body identical to 2923eaf aiPlan, sha256 ${r.parts.planBodySha256.slice(0,16)}; choice, dispatch, descriptor and registration lines pinned)`);
}
