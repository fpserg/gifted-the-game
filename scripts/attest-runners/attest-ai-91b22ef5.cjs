#!/usr/bin/env node
// GIFTED-004D (#56): reproducible AI attestation tournament for one pair of strategies in one mode.
// Usage: node scripts/attest-ai.cjs --pair=<a>:<b> --mode=pve|symmetric [--games=1667] --seed=<n> [--workers=2]
//          [--checkpoint=<file>] [--game=game.js] > result.json
// 9 faction combinations (3 mirrors) x 2 seat assignments (a on p / a on e) = 18 configurations,
// --games each (1667 → 30 006 games). Game g of configuration i uses the LCG seed seed + i*1000003 + g*7919.
// Every game is recorded by scripts/attest-lib.cjs and aggregated: results per side, faction, combination;
// planning time per strategy, side, faction and turn (log histogram + max + over 1 s); legality violations
// and refused actions; Strategist fallbacks with causes; card, location, energy, momentum and combo data.
// --checkpoint: identity line (pair, mode, games, seed, SHA-256 of game.js, tutorial.js, attest-lib.cjs and this
// script, patches, configurations); one fsynced line per finished configuration; a rerun resumes, skips finished
// configurations (no duplicates) and refuses any identity difference; a partial last line is dropped.
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),{fork}=require('child_process');
const L=require('./attest-lib.cjs');
const LEVELS=['novice','tactician','strategist'];
const CONFIGS=[];for(const fa of L.FACS)for(const fb of L.FACS)for(const aSide of ['p','e'])CONFIGS.push({fa,fb,aSide});

async function playConfig(src,cfg,index,P){
 const c=L.makeContext(src),[A,B]=P.pair,acc={},rows={games:0,aWins:0,aLosses:0,draws:0};
 const stat=()=>JSON.parse(c.run("JSON.stringify(typeof strategistStats==='object'?strategistStats:{})"));const s0=stat();
 const strat=cfg.aSide==='p'?{p:A,e:B}:{p:B,e:A},fac=cfg.aSide==='p'?{p:cfg.fa,e:cfg.fb}:{p:cfg.fb,e:cfg.fa};
 for(let g=0;g<P.games;g++){
  const rec=await L.playGame(c,{seed:(P.seed+index*1000003+g*7919)>>>0,p:strat.p,e:strat.e,pf:fac.p,ef:fac.e,mode:P.mode});
  L.aggregate(acc,rec,strat);rows.games++;
  if(rec.result===null)rows.draws++;else if(rec.result===cfg.aSide)rows.aWins++;else rows.aLosses++;
 }
 const s1=stat(),d=k=>(s1[k]||0)-(s0[k]||0),causes={};
 for(const [k,v] of Object.entries(s1.fallbackCauses||{})){const n=v-((s0.fallbackCauses||{})[k]||0);if(n)causes[k]=n;}
 return {...cfg,...rows,strategist:{calls:d('calls'),fallbacks:d('fallbacks'),fallbacksWithoutPlan:d('fallbacksWithoutPlan'),worldOpponent:d('foeFallbacks'),worldOwn:d('ownFallbacks'),causes},acc};
}
function parseArgs(argv){
 const a=Object.fromEntries(argv.map(x=>{const m=/^--([a-z]+)=(.*)$/.exec(x);if(!m)throw Error('bad argument '+x);return [m[1],m[2]];}));
 const pair=(a.pair||'').split(':');
 if(pair.length!==2||pair.some(x=>!LEVELS.includes(x)))throw Error('--pair=<a>:<b> with a, b in '+LEVELS.join('/'));
 if(!['pve','symmetric'].includes(a.mode))throw Error('--mode=pve|symmetric');
 if(!a.seed||!/^\d+$/.test(a.seed))throw Error('--seed=<integer> is required');
 return {pair,mode:a.mode,games:+(a.games||1667),seed:+a.seed,workers:Math.max(1,+(a.workers||2)),checkpoint:a.checkpoint||null,game:a.game||'game.js'};
}
if(process.argv[2]==='--worker'){
 process.on('message',async({src,i,P})=>{try{const r=await playConfig(src,CONFIGS[i],i,P);process.send({ok:r},()=>process.exit(0));}catch(e){process.send({err:String(e.stack||e)},()=>process.exit(1));}});
}else{
 const P=parseArgs(process.argv.slice(2)),start=Date.now();
 const src=L.buildSource(P.game,path.join(path.dirname(P.game),'tutorial.js'));
 const identity={kind:'gifted-attestation-checkpoint',pair:P.pair,mode:P.mode,gamesPerConfig:P.games,seed:P.seed,
  gameSha256:L.sha256(fs.readFileSync(P.game)),tutorialSha256:L.sha256(fs.readFileSync(path.join(path.dirname(P.game),'tutorial.js'))),
  libSha256:L.sha256(fs.readFileSync(path.join(__dirname,'attest-lib.cjs'))),scriptSha256:L.sha256(fs.readFileSync(__filename)),patches:L.PATCHES,configs:CONFIGS};
 const results=new Map();let resumed=0;
 if(P.checkpoint&&fs.existsSync(P.checkpoint)){
  const lines=fs.readFileSync(P.checkpoint,'utf8').split('\n').filter(Boolean),parsed=[];
  for(const [n,l] of lines.entries()){try{parsed.push(JSON.parse(l));}catch(e){if(n!==lines.length-1)throw Error(`checkpoint line ${n+1} is corrupt`);}}
  if(!parsed.length||JSON.stringify(parsed[0])!==JSON.stringify(identity))throw Error(`checkpoint ${P.checkpoint} belongs to a different code version, seed or parameters; refusing to resume`);
  if(parsed.length!==lines.length)fs.writeFileSync(P.checkpoint,parsed.map(x=>JSON.stringify(x)).join('\n')+'\n');
  for(const x of parsed.slice(1))if(!results.has(x.index)){results.set(x.index,x.result);resumed++;}
  process.stderr.write(`resumed ${resumed} configurations from ${P.checkpoint}\n`);
 }else if(P.checkpoint)fs.writeFileSync(P.checkpoint,JSON.stringify(identity)+'\n');
 const save=(i,r)=>{if(!P.checkpoint)return;const fd=fs.openSync(P.checkpoint,'a');fs.writeSync(fd,JSON.stringify({index:i,result:r})+'\n');fs.fsyncSync(fd);fs.closeSync(fd);};
 const queue=CONFIGS.map((_,i)=>i).filter(i=>!results.has(i));
 const runOne=i=>new Promise((ok,bad)=>{const child=fork(__filename,['--worker']);let got=null;
  child.on('message',m=>{got=m;});child.on('error',bad);
  child.on('exit',c=>{if(got&&got.ok)ok(got.ok);else bad(Error(`config ${i}: ${got&&got.err||'worker exit '+c}`));});
  child.send({src,i,P});});
 Promise.all(Array.from({length:P.workers},async()=>{while(queue.length){const i=queue.shift();const r=await runOne(i);save(i,r);results.set(i,r);process.stderr.write(`config ${i} done\n`);}})).then(()=>{
  const rows=CONFIGS.map((_,i)=>results.get(i)),acc={};for(const r of rows)L.merge(acc,r.acc);
  const sum=f=>{const r={games:0,wins:0,losses:0,draws:0};for(const x of rows.filter(f)){r.games+=x.games;r.wins+=x.aWins;r.losses+=x.aLosses;r.draws+=x.draws;}return r;};
  const strategist=rows.reduce((a,x)=>{for(const k of ['calls','fallbacks','fallbacksWithoutPlan','worldOpponent','worldOwn'])a[k]=(a[k]||0)+x.strategist[k];for(const [k,v] of Object.entries(x.strategist.causes))a.causes[k]=(a.causes[k]||0)+v;return a;},{causes:{}});
  const report={issue:'#56',kind:'gifted-attestation',pair:P.pair,mode:P.mode,seed:P.seed,gamesPerConfig:P.games,configs:CONFIGS.length,identity,
   overall:sum(()=>true),byFactionA:Object.fromEntries(L.FACS.map(f=>[f,sum(x=>x.fa===f)])),byFactionB:Object.fromEntries(L.FACS.map(f=>[f,sum(x=>x.fb===f)])),
   bySideA:{p:sum(x=>x.aSide==='p'),e:sum(x=>x.aSide==='e')},mirror:sum(x=>x.fa===x.fb),
   byCombination:rows.map(({acc,strategist,...x})=>x),strategistCounters:strategist,
   violations:acc.violations||0,violationKinds:acc.violationKinds||{},legalRefused:acc.legalRefused||0,aggregate:acc,
   environment:{node:process.version,platform:process.platform,arch:process.arch,cpus:os.cpus().length,cpu:os.cpus()[0]?.model},
   checkpoint:P.checkpoint?{file:P.checkpoint,resumedConfigs:resumed}:null,elapsedSeconds:(Date.now()-start)/1000};
  process.stdout.write(JSON.stringify(report)+'\n');
 }).catch(e=>{console.error(e);process.exitCode=1;});
}
