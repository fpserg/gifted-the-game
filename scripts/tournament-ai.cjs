// Usage: node scripts/tournament-ai.cjs <hero> <opponent> [gamesPerConfig=1667] [seed] [workers=2] [game.js] > results.json
// GIFTED-004C (#46), generalised from tournament-tactician.cjs: strategy <hero> vs <opponent> over all
// 9 faction combinations (3 mirrors) x both seats (hero as p and as e), gamesPerConfig each, fixed
// seeds (seed + config*1000003 + game*7919). Default 1667 per config = 30 006 games. Reports
// wins/losses/draws overall, per hero faction, per opponent faction, per seat, per combination, and the
// hero's planning time per call (performance.now in this Node/V8 process; not a smartphone).
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),{fork}=require('child_process');
const FACS=['eng','ast','kee'];
const CONFIGS=[];for(const t of FACS)for(const n of FACS)for(const seat of ['p','e'])CONFIGS.push({t,n,seat});
async function playConfig(src,cfg,index,count,seed,heroId,oppId){
 const out={...cfg,games:0,wins:0,losses:0,draws:0,times:[],fallbacks:0};
 // One engine context per configuration (fresh contexts per game exhaust memory); every game starts
 // with newGame() and its own random stream, so games do not share match state.
 let x=0;const math=Object.create(Math);math.random=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);
 const ctx=vm.createContext({Math:math,console,performance,setTimeout});vm.runInContext(src,ctx);const run=s=>vm.runInContext(s,ctx);
 const hero=cfg.seat==='p'?cfg.t:cfg.n,opp=cfg.seat==='p'?cfg.n:cfg.t;
 const oseat=cfg.seat==='p'?'e':'p';
 run(`var __t=[];const __plan=AI_STRATEGIES['${heroId}'].plan;AI_STRATEGIES['${heroId}']=Object.freeze({...AI_STRATEGIES['${heroId}'],plan(c){const s=performance.now();__plan(c);__t.push(performance.now()-s);}});
  setAiStrategy('${cfg.seat}','${heroId}');setAiStrategy('${oseat}','${oppId}');FAST=true;`);
 for(let g=0;g<count;g++){
  x=(seed+index*1000003+g*7919)>>>0;
  run(`__t=[];__opp='${opp}';newGame('${hero}');__opp=null;`);
  if(run('G.fac.p')!==hero||run('G.fac.e')!==opp)throw Error('faction setup failed');
  for(let i=0;i<6;i++)await run("(async()=>{aiPlan('p');await endTurn()})()");
  if(run('G.phase')!=='over')throw Error('match did not finish');
  const r=run('G.result');out.games++;if(r===null)out.draws++;else if(r===cfg.seat)out.wins++;else out.losses++;
  out.times.push(...JSON.parse(run('JSON.stringify(__t)')));
 }
 return out;
}
if(process.argv[2]==='--worker'){
 process.on('message',async({src,jobs,count,seed,heroId,oppId})=>{const res=[];for(const i of jobs)res.push(await playConfig(src,CONFIGS[i],i,count,seed,heroId,oppId));process.send(res,()=>process.exit(0));});
}else{
 const heroId=process.argv[2],oppId=process.argv[3];if(!heroId||!oppId)throw Error('usage: tournament-ai.cjs <hero> <opponent> [games] [seed] [workers] [game.js]');
 const count=+(process.argv[4]||1667),seed=+(process.argv[5]||20261124),workers=Math.max(1,+(process.argv[6]||2)),file=process.argv[7]||'game.js';
 // In memory only: let the harness fix the opponent faction, mirrors included (newGame never picks
 // the hero's own faction). The match itself is unchanged; the line must exist exactly once.
 const pick="const ef=scenario?scenario.opponentFaction:rndOf(Object.keys(FACTIONS).filter(f=>f!==pf));";
 const game=fs.readFileSync(file,'utf8');if(game.split(pick).length!==2)throw Error('opponent selection line not found');
 const src='var __opp=null;\n'+fs.readFileSync('tutorial.js','utf8')+'\n'+game.replace(pick,"const ef=__opp??(scenario?scenario.opponentFaction:rndOf(Object.keys(FACTIONS).filter(f=>f!==pf)));");
 const start=Date.now();
 // One child process per configuration, at most `workers` at a time.
 const queue=CONFIGS.map((_,i)=>i),results=[];
 const runOne=i=>new Promise((ok,bad)=>{const child=fork(__filename,['--worker']);let got=false;
  child.on('message',m=>{got=true;ok(m);});child.on('error',bad);
  child.on('exit',(c,sig)=>{if(c||!got)bad(Error(`config ${i}: worker exit ${c} ${sig||''}${got?'':' without results'}`));});
  child.send({src,jobs:[i],count,seed,heroId,oppId});});
 Promise.all(Array.from({length:workers},async()=>{while(queue.length){const i=queue.shift();results.push(...await runOne(i));process.stderr.write(`config ${i} done\n`);}})).then(()=>[results]).then(parts=>{
  const rows=parts.flat().sort((a,b)=>CONFIGS.findIndex(c=>c.t===a.t&&c.n===a.n&&c.seat===a.seat)-CONFIGS.findIndex(c=>c.t===b.t&&c.n===b.n&&c.seat===b.seat));
  const sum=f=>{const r={games:0,wins:0,losses:0,draws:0};for(const x of rows.filter(f)){r.games+=x.games;r.wins+=x.wins;r.losses+=x.losses;r.draws+=x.draws;}
   r.winRateDecisive=Math.round(r.wins/(r.wins+r.losses)*10000)/100;r.winRate=Math.round(r.wins/r.games*10000)/100;return r;};
  const times=rows.flatMap(x=>x.times).sort((a,b)=>a-b),q=p=>Math.round(times[Math.min(times.length-1,Math.floor(times.length*p))]*100)/100;
  const report={issue:'#46',hero:heroId,opponent:oppId,source:file,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
   seed,gamesPerConfig:count,configs:CONFIGS.length,overall:sum(()=>true),
   byHeroFaction:Object.fromEntries(FACS.map(f=>[f,sum(x=>x.t===f)])),byOpponentFaction:Object.fromEntries(FACS.map(f=>[f,sum(x=>x.n===f)])),
   bySeat:{p:sum(x=>x.seat==='p'),e:sum(x=>x.seat==='e')},mirror:sum(x=>x.t===x.n),
   byCombination:rows.map(({times,...x})=>({...x,winRateDecisive:Math.round(x.wins/(x.wins+x.losses)*10000)/100})),
   planTimeMs:{calls:times.length,mean:Math.round(times.reduce((s,x)=>s+x,0)/times.length*100)/100,p50:q(.5),p95:q(.95),p99:q(.99),max:q(1)},
   environment:{node:process.version,platform:process.platform,arch:process.arch,cpus:require('os').cpus().length,cpu:require('os').cpus()[0]?.model},
   elapsedSeconds:(Date.now()-start)/1000};
  console.log(JSON.stringify(report,null,2));
 }).catch(e=>{console.error(e);process.exitCode=1;});
}
