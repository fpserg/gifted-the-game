// Run: node scripts/check-normal-regression.cjs [baseline-ref-or-game.js]
// Plays 90 seeded AI-vs-AI normal matches (3 factions x 30 seeds) with the working-tree
// game.js/tutorial.js and with a baseline, and requires identical locations, lane power
// and winner. Baseline: a git ref (default origin/main, else main, else HEAD) read via
// `git show <ref>:game.js` / `<ref>:tutorial.js`, or an explicit path to a game.js file.
// When the working tree equals the baseline, the run still verifies that every match
// completes six turns and that a seed is reproducible.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),{execFileSync}=require('child_process');
const git=args=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']});
function baseline(){
 const arg=process.argv[2];
 if(arg&&fs.existsSync(arg))return {label:arg,game:fs.readFileSync(arg,'utf8'),tutorial:fs.readFileSync('tutorial.js','utf8')};
 for(const ref of arg?[arg]:['origin/main','main','HEAD']){
  try{git(['rev-parse','--verify','--quiet',ref+'^{commit}']);}catch{continue;}
  return {label:ref+' ('+git(['rev-parse','--short',ref]).trim()+')',game:git(['show',ref+':game.js']),tutorial:git(['show',ref+':tutorial.js'])};
 }
 throw Error('Baseline not found: pass a git ref or a game.js path');
}
async function play(src,seed,faction){
 let n=seed;const math=Object.create(Math);math.random=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
 const c=vm.createContext({Math:math,console,performance,setTimeout});
 vm.runInContext(src.tutorial+'\n'+src.game,c);const run=s=>vm.runInContext(s,c);
 run(`FAST=true;newGame('${faction}')`);
 assert.equal(run('gameMode'),'normal');assert.equal(run('G.fac.p'),faction);
 for(let i=0;i<6;i++)await run("(async()=>{aiPlan('p');await endTurn()})()");
 assert.equal(run('G.phase'),'over',`seed ${seed} ${faction}: match did not finish`);assert.equal(run('G.turn'),6);
 return run("JSON.stringify({winner:G.result,locs:G.locs.map(l=>l.id),power:[0,1,2].map(l=>[laneTotal(l,'p'),laneTotal(l,'e')])})");
}
(async()=>{
 const current={game:fs.readFileSync('game.js','utf8'),tutorial:fs.readFileSync('tutorial.js','utf8')},base=baseline();
 let games=0;
 for(const f of ['eng','ast','kee'])for(let seed=1;seed<=30;seed++){
  const now=await play(current,seed,f);
  assert.equal(now,await play(base,seed,f),`seed ${seed} ${f}: differs from baseline ${base.label}`);
  games++;
 }
 assert.equal(await play(current,7,'ast'),await play(current,7,'ast'),'same seed must reproduce the same match');
 console.log(`PASS: ${games} normal matches identical to baseline ${base.label} (locations, lane power, winner); seed reproducible`);
})().catch(e=>{console.error(e);process.exitCode=1});
