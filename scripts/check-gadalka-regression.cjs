// Run: node scripts/check-gadalka-regression.cjs [baseline-ref=origin/main]
// GIFTED-002 (#36). Replays the 90 seeded normal matches of check-normal-regression.cjs
// (3 factions x 30 seeds, AI vs AI) with the working tree and with a baseline from git, and
// classifies every difference:
//  - identical: same locations, lane power and winner;
//  - expected:  the baseline still had a Gadalka surcharge alive on a turn later than N+1
//               (the behaviour this task removes), and both runs were identical, apart from
//               the surcharge fields, at the start of every turn up to and including that turn;
//  - unexpected: any other difference (fails the check).
// When the baseline already contains the change, every match must be identical.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),{execFileSync}=require('child_process');
const git=a=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const ref=process.argv[2]||'origin/main';
const base={game:git(['show',ref+':game.js']),tutorial:git(['show',ref+':tutorial.js'])};
const current={game:fs.readFileSync('game.js','utf8'),tutorial:fs.readFileSync('tutorial.js','utf8')};
const probe=`
var __rev={},__snaps={},__stale=0,__last=0;
(()=>{const a3=CARDS.find(c=>c.id==='a3'),orig=a3.onReveal;a3.onReveal=c=>{__rev[other(c.owner)]=G.turn;return orig(c);};})();
const __ai=aiPlan;
aiPlan=function(o){
 if(__last!==G.turn){__last=G.turn;
  const cards=a=>a.map(c=>[c.uid,c.def.id,c.lane,c.revealed,c.pending,power(c)]);
  __snaps[G.turn]=JSON.stringify({board:G.board.map(cards),hand:[cards(G.hand.p),cards(G.hand.e)],deck:[G.deck.p.map(c=>c.uid),G.deck.e.map(c=>c.uid)],
   spent:G.spent,discount:G.discount,blocked:G.blockedUntil,disabled:G.locDisabledUntil,trap:G.trap,locs:G.locs.map(l=>l.id)});
  for(const s of ['p','e'])if(!__stale&&G.surcharge[s]>0&&__rev[s]!==undefined&&G.turn>__rev[s]+1)__stale=G.turn;
 }
 return __ai(o);
};`;
async function play(src,seed,faction){
 let n=seed;const math=Object.create(Math);math.random=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
 const c=vm.createContext({Math:math,console,performance,setTimeout});
 vm.runInContext(src.tutorial+'\n'+src.game,c);vm.runInContext(probe,c);const run=s=>vm.runInContext(s,c);
 run(`FAST=true;newGame('${faction}')`);
 for(let i=0;i<6;i++)await run("(async()=>{aiPlan('p');await endTurn()})()");
 assert.equal(run('G.phase'),'over');
 return {result:run("JSON.stringify({winner:G.result,locs:G.locs.map(l=>l.id),power:[0,1,2].map(l=>[laneTotal(l,'p'),laneTotal(l,'e')])})"),
  snaps:JSON.parse(run('JSON.stringify(__snaps)')),stale:run('__stale')};
}
(async()=>{
 const tally={identical:0,expected:0,unexpected:0},detail=[];
 for(const f of ['eng','ast','kee'])for(let seed=1;seed<=30;seed++){
  const now=await play(current,seed,f),old=await play(base,seed,f);
  assert.equal(now.stale,0,`seed ${seed} ${f}: surcharge survived past N+1 in the working tree`);
  if(now.result===old.result&&JSON.stringify(now.snaps)===JSON.stringify(old.snaps)){tally.identical++;continue;}
  let kind='unexpected';
  if(old.stale){let same=true;for(let t=1;t<=old.stale;t++)if(now.snaps[t]!==old.snaps[t])same=false;if(same)kind='expected';}
  tally[kind]++;detail.push(`${f}#${seed}:${kind}(stale turn ${old.stale||'-'})`);
 }
 console.log(`baseline ${ref}: ${JSON.stringify(tally)}${detail.length?' · '+detail.join(' '):''}`);
 assert.equal(tally.unexpected,0,'Unexpected normal-mode differences: '+detail.filter(d=>d.includes('unexpected')).join(' '));
 console.log(`PASS: ${tally.identical+tally.expected} of 90 normal matches identical or differing only after an expired Gadalka surcharge`);
})().catch(e=>{console.error(e);process.exitCode=1});
