// Run: node scripts/check-initiative-regression.cjs [baseline-ref=origin/main]
// GIFTED-003 (#38). Separates expected from unexpected normal-mode differences against an explicit
// baseline before the change. Plays the 90 seeded AI-vs-AI matches of check-normal-regression.cjs:
//  1. raw: working tree vs baseline — differences are reported, not failed (the rule changed);
//  2. control: working tree with initiative() replaced by the previous rule (lane lead, tie -> player,
//     no random draw) vs baseline — must be identical in every match, so all raw differences come
//     from the initiative rule and nothing else changed in normal play.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),{execFileSync}=require('child_process');
const git=a=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const ref=process.argv[2]||'origin/main',sha=git(['rev-parse','--short',ref]).trim();
const base={game:git(['show',ref+':game.js']),tutorial:git(['show',ref+':tutorial.js'])};
const current={game:fs.readFileSync('game.js','utf8'),tutorial:fs.readFileSync('tutorial.js','utf8')};
assert(/function initiative\(\)/.test(current.game),'working tree has no initiative()');
const previousRule="initiative=function(){let lead=0;for(let l=0;l<3;l++){const w=laneWinner(l);if(w==='p')lead++;else if(w==='e')lead--;}return lead<0?'e':'p';};";
async function play(src,seed,faction,patch=''){
 let n=seed;const math=Object.create(Math);math.random=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
 const c=vm.createContext({Math:math,console,performance,setTimeout});
 vm.runInContext(src.tutorial+'\n'+src.game,c);if(patch)vm.runInContext(patch,c);const run=s=>vm.runInContext(s,c);
 run(`FAST=true;newGame('${faction}')`);
 for(let i=0;i<6;i++)await run("(async()=>{aiPlan('p');await endTurn()})()");
 assert.equal(run('G.phase'),'over');assert.equal(run('G.turn'),6);
 return run("JSON.stringify({winner:G.result,locs:G.locs.map(l=>l.id),power:[0,1,2].map(l=>[laneTotal(l,'p'),laneTotal(l,'e')])})");
}
(async()=>{
 let raw=0,winners=0,control=0;const bad=[];
 for(const f of ['eng','ast','kee'])for(let seed=1;seed<=30;seed++){
  const old=await play(base,seed,f),now=await play(current,seed,f),shim=await play(current,seed,f,previousRule);
  if(now!==old){raw++;if(JSON.parse(now).winner!==JSON.parse(old).winner)winners++;}
  if(shim!==old){control++;bad.push(`${f}#${seed}`);}
 }
 console.log(`baseline ${ref} (${sha}): raw differences ${raw}/90 (winner changed in ${winners}) — expected, initiative rule; control with previous rule: ${control}/90 differences`);
 assert.equal(control,0,'Unexpected normal-mode differences not explained by initiative: '+bad.join(' '));
 console.log('PASS: every normal-mode difference is explained by the initiative rule; with the previous rule all 90 matches equal the baseline');
})().catch(e=>{console.error(e);process.exitCode=1});
