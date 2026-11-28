#!/usr/bin/env node
// GIFTED-004E (#48), stage B0: direct implementation contract of the frozen Novice (novice-1).
// The sampled behaviour comparison (check-ai-architecture.cjs) may miss a small change (e.g. a scoring constant
// 1.3 -> 1.31 kept every sampled decision). This contract checks the code that actually runs, with no tolerance:
//  * Live code, not text: game.js (and the reference 2923eaf) are executed in vm contexts and the functions
//    actually bound after loading are read with Function.prototype.toString. A copy of a line in a comment or a
//    string, or a second definition, cannot stand in for the live code.
//  * Unambiguous definitions: in the code with comments and string/template contents blanked (the blanked text
//    must still compile, which proves the scan), each contract declaration occurs exactly once.
//  1. live noviceAiPlan body == live aiPlan body of 2923eaf (AI_BASELINE.baseCommit);
//  2. live aiPlan (legacy dispatch) and aiStrategy equal the pinned text; live aiChoose and registerAiStrategy
//     equal the pinned SHA-256; the legacy choice reducers of 2923eaf occur in live aiChoose code;
//  3. AI_BASELINE, the registered entry (frozen, legacy, plan === live noviceAiPlan, name) and the default seats;
//  4. dispatch probe: aiPlan(side) changes the state exactly as noviceAiPlan(side) on the same seeded position.
// Scope: the Novice's own code and its dispatch. Engine functions it calls (canPlay, effCost, place, …) are rules,
// covered by the rules / ai / balance components of behaviour-baseline.cjs.
// Usage: node scripts/check-novice-contract.cjs [--root=<dir with game.js and tutorial.js>]
//        (needs commit 2923eaf locally: git fetch --no-tags --depth=1 origin 2923eafca24d8b23ec0b3de71306ca555919b782)
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),{execFileSync}=require('child_process');
const REPO=path.join(__dirname,'..'),BASE='2923eafca24d8b23ec0b3de71306ca555919b782';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const PINNED={
 aiPlan:"function aiPlan(o){const s=aiStrategy(o);if(s.legacy)return s.plan(o);return s.plan(aiContext(o));}",
 aiStrategy:"function aiStrategy(o){return AI_STRATEGIES[aiSides[o]];}",
 aiChooseSha256:'9dffbeff5d58d5ba662f6bd3e832167b4654a9fd39460766b4d40a7b54f1a447',
 registerAiStrategySha256:'12622d02f8a3a0654fdc0e49f4f8bd31b7d613d968da31e1a50ecb2bddbdab87',
 baseline:{id:'novice',version:'novice-1',baseCommit:BASE},
};
const REDUCERS=["(best,l)=>best===null||score(l)>score(best)?l:best","(best,c)=>!best||score(c)>score(best)?c:best"];
const DECLS=['function noviceAiPlan(','function aiPlan(','function aiStrategy(','function aiChoose(','function registerAiStrategy(','const AI_BASELINE=','const AI_STRATEGIES=','const aiSides='];

// Blank comments and the contents of strings / templates (keeping ${…} code), preserving length and newlines.
function codeOnly(src){
 const out=src.split(''),n=src.length,stack=[];let i=0,prev='';
 const blank=(a,b)=>{for(let k=a;k<b;k++)if(out[k]!=='\n')out[k]=' ';};
 const tpl=j=>{const s=j;for(;j<n;j++){if(src[j]==='\\'){j++;continue;}if(src[j]==='`'){blank(s,j);prev='`';return j+1;}if(src[j]==='$'&&src[j+1]==='{'){blank(s,j);stack.push(0);return j+2;}}throw Error('unterminated template');};
 while(i<n){const c=src[i],d=src[i+1];
  if(stack.length&&c==='}'&&stack[stack.length-1]===0){stack.pop();i=tpl(i+1);continue;}
  if(c==='/'&&d==='/'){const e=src.indexOf('\n',i),j=e<0?n:e;blank(i,j);i=j;continue;}
  if(c==='/'&&d==='*'){const e=src.indexOf('*/',i+2);if(e<0)throw Error('unterminated comment');blank(i,e+2);i=e+2;continue;}
  if(c==='"'||c==="'"){let j=i+1;for(;j<n&&src[j]!==c;j++){if(src[j]==='\\')j++;else if(src[j]==='\n')throw Error('unterminated string');}blank(i+1,j);i=j+1;prev=c;continue;}
  if(c==='`'){i=tpl(i+1);continue;}
  if(c==='/'&&(prev===''||/[(,=:[!&|?{};+\-*%<>~^]/.test(prev))){let j=i+1,cls=false;
   for(;j<n;j++){const x=src[j];if(x==='\\'){j++;continue;}if(x==='[')cls=true;else if(x===']')cls=false;else if(x==='/'&&!cls)break;else if(x==='\n')throw Error('unterminated regex');}
   blank(i+1,j);i=j+1;while(/[a-z]/i.test(src[i]||''))i++;prev='/';continue;}
  if(stack.length){if(c==='{')stack[stack.length-1]++;else if(c==='}')stack[stack.length-1]--;}
  if(!/\s/.test(c))prev=c;i++;
 }
 if(stack.length)throw Error('unterminated template expression');
 return out.join('');
}
const count=(code,s)=>code.split(s).length-1;
function load(game,tut,seed){
 let x=seed>>>0;const math=Object.create(Math);math.random=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);
 const ctx=vm.createContext({console,Math:math,performance,setTimeout});vm.runInContext(tut+'\n'+game,ctx);return s=>vm.runInContext(s,ctx);
}
const bodyOf=f=>f.slice(f.indexOf('{'));
function reference(f){try{return execFileSync('git',['show',`${BASE}:${f}`],{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1<<26});}catch{return null;}}

function contract(root=REPO){
 const reasons=[],parts={},fail=m=>reasons.push(m);
 const game=fs.readFileSync(path.join(root,'game.js'),'utf8'),tut=fs.readFileSync(path.join(root,'tutorial.js'),'utf8');
 // 0. unambiguous declarations in executable code (the blanked code must compile: proof of the scan)
 let code=null;try{code=codeOnly(game);new vm.Script(code);}catch(e){fail('source scan failed ('+e.message+'); the contract cannot be checked');}
 if(code)for(const d of DECLS){const k=count(code,d);parts['decl:'+d]=k;if(k!==1)fail(`${d}… declared ${k} times in executable code (expected exactly 1)`);}
 // 1–2. live code
 let run;try{run=load(game,tut,1);}catch(e){fail('game.js does not load: '+e.message);return {ok:false,reasons,parts};}
 const live=n=>{try{return run(`typeof ${n}==='function'?${n}.toString():null`);}catch{return null;}};
 const plan=live('noviceAiPlan'),dispatch=live('aiPlan'),strat=live('aiStrategy'),choose=live('aiChoose'),reg=live('registerAiStrategy');
 parts.planBodySha256=plan&&sha(bodyOf(plan));parts.aiChooseSha256=choose&&sha(choose);parts.registerAiStrategySha256=reg&&sha(reg);
 const rg=reference('game.js'),rt=reference('tutorial.js');
 if(rg===null||rt===null)fail(`reference commit ${BASE} not available locally (git fetch it)`);
 else{const rplan=load(rg,rt,1)('aiPlan.toString()');parts.referencePlanBodySha256=sha(bodyOf(rplan));
  if(!plan||!/^function noviceAiPlan\(o\)\{/.test(plan)||!/^function aiPlan\(o\)\{/.test(rplan))fail('live noviceAiPlan or the reference aiPlan has an unexpected signature');
  else if(bodyOf(plan)!==bodyOf(rplan))fail('live noviceAiPlan body differs from live aiPlan at 2923eaf');
  const rcode=codeOnly(rg);for(const r of REDUCERS)if(!rcode.includes(r))fail('reference lacks reducer '+r);}
 if(dispatch!==PINNED.aiPlan)fail('live aiPlan (legacy dispatch) differs from the pinned text');
 if(strat!==PINNED.aiStrategy)fail('live aiStrategy differs from the pinned text');
 if(!choose||sha(choose)!==PINNED.aiChooseSha256)fail('live aiChoose differs from the pinned SHA-256');
 else{const cc=codeOnly(choose);for(const r of REDUCERS)if(count(cc,r)!==1)fail('live aiChoose code lacks the legacy reducer '+r);}
 if(!reg||sha(reg)!==PINNED.registerAiStrategySha256)fail('live registerAiStrategy differs from the pinned SHA-256');
 // 3. descriptor, registration, default seats (live values)
 let f=null;try{f=JSON.parse(run(`JSON.stringify((()=>{const s=AI_STRATEGIES.novice;return {baseline:AI_BASELINE,keys:s?Object.keys(s).sort():null,frozen:!!s&&Object.isFrozen(s),
  legacy:!!s&&s.legacy===true,samePlan:!!s&&s.plan===noviceAiPlan,id:s&&s.id,version:s&&s.version,baseCommit:s&&s.baseCommit,name:s&&s.name,seats:{...aiSides}};})())`));}catch(e){fail('registration cannot be read: '+e.message);}
 if(f){parts.registration=f;
  if(JSON.stringify(f.baseline)!==JSON.stringify(PINNED.baseline))fail('AI_BASELINE differs: '+JSON.stringify(f.baseline));
  if(JSON.stringify(f.keys)!==JSON.stringify(['baseCommit','id','legacy','name','plan','version']))fail('registered novice entry has other fields: '+JSON.stringify(f.keys));
  if(!f.frozen||!f.legacy||!f.samePlan||f.id!=='novice'||f.version!=='novice-1'||f.baseCommit!==BASE||f.name!=='Новичок')fail('registered novice entry is not the live noviceAiPlan as a frozen legacy strategy');
  if(f.seats.p!=='novice'||f.seats.e!=='novice')fail('default seats are not the Novice');}
 // 4. dispatch probe on seeded positions
 for(const [i,side] of ['p','e','p'].entries()){
  const setup=`FAST=true;setAiStrategy('p','novice');setAiStrategy('e','novice');newGame(${JSON.stringify(['eng','ast','kee'][i])});G.board.forEach(l=>l.forEach(c=>{if(c.pending&&c.owner===${JSON.stringify(side)})unplace(c);}));G.turn=4;G.spent[${JSON.stringify(side)}]=0;`;
  try{const a=load(game,tut,900+i),b=load(game,tut,900+i);a(setup);b(setup);a(`aiPlan(${JSON.stringify(side)})`);b(`noviceAiPlan(${JSON.stringify(side)})`);
   const sa=a('JSON.stringify(G)'),sb=b('JSON.stringify(G)');// (state hashes are not part of the contract: they depend on the rules)
   if(sa!==sb)fail(`dispatch probe ${i}: aiPlan('${side}') does not act as noviceAiPlan('${side}')`);
   if(!a(`G.board.flat().some(c=>c.owner===${JSON.stringify(side)}&&c.pending)`))fail(`dispatch probe ${i}: the Novice placed nothing`);}
  catch(e){fail(`dispatch probe ${i} failed: ${e.message}`);}
 }
 return {ok:reasons.length===0,reasons,parts};
}
module.exports={contract,codeOnly,PINNED};
if(require.main===module){
 const a=process.argv.find(x=>x.startsWith('--root='));const r=contract(a?path.resolve(a.slice(7)):REPO);
 if(process.argv.includes('--print-pins'))console.log(JSON.stringify({aiChooseSha256:r.parts.aiChooseSha256,registerAiStrategySha256:r.parts.registerAiStrategySha256}));
 if(!r.ok){console.error('FAIL: Novice implementation contract: '+r.reasons.join('; '));process.exit(1);}
 console.log(`PASS: Novice implementation contract (live noviceAiPlan body = live aiPlan at 2923eaf, sha256 ${r.parts.planBodySha256.slice(0,16)}; live dispatch, aiStrategy, aiChoose, registerAiStrategy, descriptor, registration, unambiguous declarations, dispatch probes)`);
}
