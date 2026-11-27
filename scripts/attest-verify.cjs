#!/usr/bin/env node
// GIFTED-004D (#56): independent validation of attestation results before they are reused or reported.
//
// A run is the pair <name>.json (attest-ai.cjs result) + <name>.ckpt (its checkpoint), plain or gzip (.gz).
// verifyRun accepts a run only if ALL of the following hold:
//  1. the name, pair, mode, seed and games per configuration are those of the fixed schedule (SCHEDULE below);
//  2. the identity matches the code in this checkout: SHA-256 of game.js, tutorial.js and attest-lib.cjs, the
//     in-memory patches and the 18 configurations; the runner SHA-256 names an available runner source (the
//     current scripts/attest-ai.cjs or an archived one in scripts/attest-runners/, content-addressed);
//  3. the checkpoint is strict: every line valid JSON (no partial line), line 1 equals the result's identity,
//     units are exactly the expected set (no duplicate, missing, extra or out-of-range unit), every unit has the
//     configuration's factions and seat and wins + losses + draws = its games;
//  4. the result equals what that runner itself recombines from the checkpoint (run in a temporary directory on
//     a copy, with --deadline=0, so no game is played and no input changes); only elapsedSeconds, environment and
//     checkpoint bookkeeping are excluded;
// verifySet additionally requires the complete set (6 pairs x 2 modes), each pair and mode exactly once, and the
// same code, games and patches in every run. replayUnits replays chosen checkpoint units with the current code
// and compares them with the recorded ones (timings excluded), which also catches a consistent forgery of both
// files. Exits non-zero with a reason on any failure; never modifies its inputs.
//
// Usage: node scripts/attest-verify.cjs --dir=<dir> [--manifest=<MANIFEST.json>] [--summary=<attestation-summary.json>]
//          [--replay=<n>] [--replay-seed=<n>] [--max-replay-games=<n>] [--write-manifest=<file>]
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),zlib=require('zlib'),{spawnSync,fork}=require('child_process');
const L=require('./attest-lib.cjs');
const ROOT=path.join(__dirname,'..');
const PAIRS=[['novice','novice'],['tactician','novice'],['strategist','novice'],['tactician','tactician'],['strategist','tactician'],['strategist','strategist']];
const MODES=['pve','symmetric'];
const SCHEDULE=[];for(const [i,pair] of PAIRS.entries())for(const mode of MODES)SCHEDULE.push({name:`${pair[0]}-${pair[1]}-${mode}`,pair,mode,seed:2026112700+10*i});
const CONFIGS=[];for(const fa of L.FACS)for(const fb of L.FACS)for(const aSide of ['p','e'])CONFIGS.push({fa,fb,aSide});
const EXCLUDED=['elapsedSeconds','environment','checkpoint'];

const fail=m=>{throw new Error(m);};
const readMaybeGz=f=>{const b=fs.readFileSync(f);return f.endsWith('.gz')?zlib.gunzipSync(b):b;};
const stable=x=>Array.isArray(x)?'['+x.map(stable).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x);
// First path where two JSON values differ (for a readable reason).
function firstDiff(a,b,p='$'){
 if(stable(a)===stable(b))return null;
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])){const d=firstDiff(a[k],b[k],p+'.'+k);if(d)return d;}
 }
 return `${p}: ${JSON.stringify(a)?.slice(0,80)} vs ${JSON.stringify(b)?.slice(0,80)}`;
}
const findFile=(dir,base)=>[base,base+'.gz'].map(f=>path.join(dir,f)).find(f=>fs.existsSync(f))||null;

// Runner sources available for recombination, by SHA-256 of their content.
function runners(){
 const m=new Map(),add=f=>m.set(L.sha256(fs.readFileSync(f)),f);
 add(path.join(__dirname,'attest-ai.cjs'));
 const d=path.join(__dirname,'attest-runners');if(fs.existsSync(d))for(const f of fs.readdirSync(d).filter(f=>f.endsWith('.cjs')))add(path.join(d,f));
 return m;
}
function expectedUnits(id){
 const size=id.chunk||id.gamesPerConfig,u=[];
 for(let i=0;i<CONFIGS.length;i++)for(let f=0;f<id.gamesPerConfig;f+=size)u.push({i,from:f,to:Math.min(id.gamesPerConfig,f+size)});
 return u;
}
function code(){
 return {gameSha256:L.sha256(fs.readFileSync(path.join(ROOT,'game.js'))),tutorialSha256:L.sha256(fs.readFileSync(path.join(ROOT,'tutorial.js'))),
  libSha256:L.sha256(fs.readFileSync(path.join(__dirname,'attest-lib.cjs')))};
}

// Validate one run. expect: {name, pair, mode, seed, games?}. Returns facts about the run.
function verifyRun(jsonFile,ckptFile,expect){
 const tag=expect.name;
 if(!jsonFile||!fs.existsSync(jsonFile))fail(`${tag}: result file is missing`);
 if(!ckptFile||!fs.existsSync(ckptFile))fail(`${tag}: checkpoint is missing (${ckptFile||expect.name+'.ckpt'}); a result without its checkpoint is not accepted`);
 const jsonBytes=readMaybeGz(jsonFile),ckptBytes=readMaybeGz(ckptFile);
 let r;try{r=JSON.parse(jsonBytes.toString('utf8'));}catch(e){fail(`${tag}: result is not valid JSON`);}
 if(!r||typeof r!=='object'||r.kind!=='gifted-attestation'||!r.identity||typeof r.identity!=='object'||!r.overall||!Array.isArray(r.byCombination)||!r.aggregate)
  fail(`${tag}: result has no attestation structure (kind, identity, overall, byCombination, aggregate)`);
 const id=r.identity,C=code();
 if(id.kind!=='gifted-attestation-checkpoint')fail(`${tag}: identity kind is not gifted-attestation-checkpoint`);
 // 1. schedule
 for(const [k,v] of [['pair',expect.pair],['mode',expect.mode],['seed',expect.seed]]){
  if(stable(r[k])!==stable(v))fail(`${tag}: result ${k} ${JSON.stringify(r[k])} differs from the schedule ${JSON.stringify(v)}`);
  if(stable(id[k])!==stable(v))fail(`${tag}: identity ${k} ${JSON.stringify(id[k])} differs from the schedule ${JSON.stringify(v)}`);
 }
 if(!Number.isInteger(id.gamesPerConfig)||id.gamesPerConfig<1||r.gamesPerConfig!==id.gamesPerConfig)fail(`${tag}: games per configuration inconsistent (${r.gamesPerConfig} / ${id.gamesPerConfig})`);
 if(expect.games!=null&&id.gamesPerConfig!==expect.games)fail(`${tag}: games per configuration ${id.gamesPerConfig}, expected ${expect.games}`);
 // 2. code identity
 if(id.gameSha256!==C.gameSha256)fail(`${tag}: game.js SHA-256 ${String(id.gameSha256).slice(0,12)} is not the checked-out game.js ${C.gameSha256.slice(0,12)}`);
 if(id.tutorialSha256!==C.tutorialSha256)fail(`${tag}: tutorial.js SHA-256 ${String(id.tutorialSha256).slice(0,12)} is not the checked-out tutorial.js ${C.tutorialSha256.slice(0,12)}`);
 if(id.libSha256!==C.libSha256)fail(`${tag}: attest-lib.cjs SHA-256 ${String(id.libSha256).slice(0,12)} is not the checked-out attest-lib.cjs ${C.libSha256.slice(0,12)}`);
 if(stable(id.patches)!==stable(L.PATCHES))fail(`${tag}: in-memory patches differ from attest-lib.cjs`);
 if(stable(id.configs)!==stable(CONFIGS))fail(`${tag}: configurations differ from the 18 expected`);
 const runner=runners().get(id.scriptSha256);
 if(!runner)fail(`${tag}: runner SHA-256 ${String(id.scriptSha256).slice(0,12)} is neither scripts/attest-ai.cjs nor an archived runner in scripts/attest-runners/`);
 // 3. strict checkpoint
 const text=ckptBytes.toString('utf8');
 if(!text.endsWith('\n'))fail(`${tag}: checkpoint does not end with a complete line`);
 const lines=text.slice(0,-1).split('\n'),parsed=[];
 for(const [n,l] of lines.entries()){try{parsed.push(JSON.parse(l));}catch(e){fail(`${tag}: checkpoint line ${n+1} is not valid JSON`);}}
 if(stable(parsed[0])!==stable(id))fail(`${tag}: checkpoint identity differs from the result identity (${firstDiff(parsed[0],id)})`);
 const want=expectedUnits(id),key=(i,f)=>i+':'+f,wantKeys=new Map(want.map(u=>[key(u.i,u.from),u])),seen=new Set();
 for(const [n,x] of parsed.slice(1).entries()){
  const line=n+2;
  if(!x||!Number.isInteger(x.index)||!x.result||typeof x.result!=='object')fail(`${tag}: checkpoint line ${line} is not a unit`);
  const from=id.chunk?x.from:0,u=wantKeys.get(key(x.index,from));
  if(id.chunk&&(!Number.isInteger(x.from)||!Number.isInteger(x.to)))fail(`${tag}: checkpoint line ${line} has no game range`);
  if(!u||(id.chunk&&x.to!==u.to))fail(`${tag}: checkpoint line ${line} is an unexpected unit (config ${x.index}, games ${x.from}-${x.to})`);
  const k=key(x.index,from);if(seen.has(k))fail(`${tag}: checkpoint line ${line} duplicates unit config ${x.index} games ${u.from}-${u.to}`);seen.add(k);
  const cfg=CONFIGS[x.index],res=x.result;
  if(res.fa!==cfg.fa||res.fb!==cfg.fb||res.aSide!==cfg.aSide)fail(`${tag}: checkpoint line ${line} has factions/seat of another configuration`);
  if(res.games!==u.to-u.from||res.aWins+res.aLosses+res.draws!==res.games||[res.aWins,res.aLosses,res.draws].some(v=>!Number.isInteger(v)||v<0))
   fail(`${tag}: checkpoint line ${line} has inconsistent counts`);
 }
 if(seen.size!==want.length)fail(`${tag}: checkpoint has ${seen.size} of ${want.length} units`);
 // 4. recombination by the recorded runner, on copies, without playing
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'attest-verify-'));
 try{
  fs.copyFileSync(runner,path.join(tmp,'attest-ai.cjs'));fs.copyFileSync(path.join(__dirname,'attest-lib.cjs'),path.join(tmp,'attest-lib.cjs'));
  fs.writeFileSync(path.join(tmp,'run.ckpt'),ckptBytes);
  const args=[path.join(tmp,'attest-ai.cjs'),`--pair=${id.pair.join(':')}`,`--mode=${id.mode}`,`--games=${id.gamesPerConfig}`,`--seed=${id.seed}`,'--workers=1',
   `--checkpoint=${path.join(tmp,'run.ckpt')}`,`--game=${path.join(ROOT,'game.js')}`,'--deadline=0',...(id.chunk?[`--chunk=${id.chunk}`]:[])];
  const p=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:1<<30,timeout:600000});
  if(p.status!==0)fail(`${tag}: the recorded runner could not recombine the checkpoint (exit ${p.status}): ${(p.stderr||'').trim().split('\n').pop()}`);
  const again=JSON.parse(p.stdout),strip=x=>{const y={...x};for(const k of EXCLUDED)delete y[k];return y;};
  const d=firstDiff(strip(r),strip(again));
  if(d)fail(`${tag}: result differs from its checkpoint (${d})`);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 return {name:tag,pair:id.pair,mode:id.mode,seed:id.seed,gamesPerConfig:id.gamesPerConfig,games:r.overall.games,units:want.length,chunk:id.chunk||null,
  runnerSha256:id.scriptSha256,runner:path.relative(ROOT,runner),resultSha256:L.sha256(jsonBytes),checkpointSha256:L.sha256(ckptBytes),checkpointLines:lines.length,parsed,identity:id};
}

// Validate a whole set: files are result paths (.json or .json.gz); checkpoints are found next to them.
function verifySet(files,opts={}){
 const byName=new Map();
 for(const f of files){
  const base=path.basename(f).replace(/\.gz$/,'').replace(/\.json$/,'');
  const s=SCHEDULE.find(x=>x.name===base);
  if(!s)fail(`${f}: file name is not one of the scheduled runs (${SCHEDULE.map(x=>x.name).join(', ')})`);
  if(byName.has(base))fail(`${base}: given more than once (${byName.get(base)} and ${f})`);
  byName.set(base,f);
 }
 if(!opts.partial){const miss=SCHEDULE.filter(s=>!byName.has(s.name)).map(s=>s.name);if(miss.length)fail(`incomplete set: missing ${miss.join(', ')}`);}
 const out=[];
 for(const s of SCHEDULE){if(!byName.has(s.name))continue;const f=byName.get(s.name),dir=path.dirname(f);
  out.push(verifyRun(f,findFile(dir,s.name+'.ckpt'),{...s,games:opts.games??(out[0]&&out[0].gamesPerConfig)}));}
 return out;
}

// Replay units with the current code; compare with the recorded unit results without timings.
async function replayUnits(run,picks){
 const src=L.buildSource(path.join(ROOT,'game.js'),path.join(ROOT,'tutorial.js')),id=run.identity,res=[];
 const P={pair:id.pair,mode:id.mode,games:id.gamesPerConfig,seed:id.seed};
 const noPerf=r=>{const y=JSON.parse(JSON.stringify(r));if(y.acc)delete y.acc.perf;return y;};
 for(const x of picks){
  const from=id.chunk?x.from:0,to=id.chunk?x.to:id.gamesPerConfig;
  const got=await new Promise((ok,bad)=>{const c=fork(path.join(__dirname,'attest-ai.cjs'),['--worker']);let m=null;c.on('message',v=>{m=v;});c.on('error',bad);
   c.on('exit',code=>m&&m.ok?ok(m.ok):bad(Error(`replay ${run.name} config ${x.index}: ${m&&m.err||'exit '+code}`)));c.send({src,i:x.index,from,to,P});});
  const d=firstDiff(noPerf(x.result),noPerf(got));
  res.push({config:x.index,from,to,ok:!d,diff:d});
  if(d)fail(`${run.name}: replay of config ${x.index} games ${from}-${to} differs from the checkpoint (${d})`);
 }
 return res;
}
// Deterministic choice of units to replay.
function pickUnits(run,n,seed,maxGames){
 let s=seed>>>0;const rnd=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296;
 const units=run.parsed.slice(1).filter(x=>x.result.games<=maxGames),picks=[];
 while(picks.length<Math.min(n,units.length)){const u=units[Math.floor(rnd()*units.length)];if(!picks.includes(u))picks.push(u);}
 return picks;
}

module.exports={SCHEDULE,PAIRS,MODES,CONFIGS,verifyRun,verifySet,replayUnits,pickUnits,findFile,readMaybeGz,stable,firstDiff};

if(require.main===module){
 const a=Object.fromEntries(process.argv.slice(2).map(x=>{const m=/^--([a-z-]+)=(.*)$/.exec(x);if(!m)fail('bad argument '+x);return [m[1],m[2]];}));
 (async()=>{
  if(!a.dir)fail('--dir=<dir> is required');
  const files=SCHEDULE.map(s=>findFile(a.dir,s.name+'.json')).filter(Boolean);
  if(a.manifest){
   const M=JSON.parse(fs.readFileSync(a.manifest,'utf8'));
   for(const e of M.files){const f=path.join(a.dir,e.file);if(!fs.existsSync(f))fail(`manifest: ${e.file} is missing`);
    const b=fs.readFileSync(f);if(L.sha256(b)!==e.sha256||b.length!==e.bytes)fail(`manifest: ${e.file} checksum or size differs`);
    if(e.contentSha256&&L.sha256(readMaybeGz(f))!==e.contentSha256)fail(`manifest: ${e.file} content checksum differs`);}
   const listed=new Set(M.files.map(e=>e.file));for(const f of fs.readdirSync(a.dir))if(f!==path.basename(a.manifest)&&!listed.has(f))fail(`manifest: ${f} is not listed`);
   console.log(`manifest: ${M.files.length} files, checksums OK`);
  }
  const runs=verifySet(files);
  for(const r of runs)console.log(`${r.name.padEnd(34)} OK  games ${r.games}  units ${r.units}  runner ${r.runnerSha256.slice(0,8)}  ckpt ${r.checkpointSha256.slice(0,12)}`);
  const total=runs.reduce((s,r)=>s+r.games,0);console.log(`set: ${runs.length} runs, ${total} games, one code identity (game.js ${runs[0].identity.gameSha256.slice(0,12)})`);
  if(a.summary){
   const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'attest-summary-'));
   try{const p=spawnSync(process.execPath,[path.join(__dirname,'attest-report.cjs'),`--out=${tmp}`,...files],{encoding:'utf8',maxBuffer:1<<30});
    if(p.status!==0)fail('report regeneration failed: '+p.stderr.trim());
    const want=JSON.parse(fs.readFileSync(a.summary,'utf8')),got=JSON.parse(fs.readFileSync(path.join(tmp,'attestation-summary.json'),'utf8'));
    delete want.generated;delete got.generated;const d=firstDiff(want,got);if(d)fail(`summary ${a.summary} is not the report of these runs (${d})`);
    console.log(`summary: ${a.summary} equals the report regenerated from the verified runs`);}
   finally{fs.rmSync(tmp,{recursive:true,force:true});}
  }
  if(a.replay){
   const n=+a.replay,seed=+(a['replay-seed']||20261127),max=+(a['max-replay-games']||100);
   for(const r of runs){const picks=pickUnits(r,n,seed+r.seed,max);const res=await replayUnits(r,picks);
    console.log(`replay ${r.name}: ${res.length} unit(s) identical (${res.map(x=>`c${x.config}:${x.from}-${x.to}`).join(' ')})`);}
  }
  if(a['write-manifest']){
   const files2=fs.readdirSync(a.dir).filter(f=>f!==path.basename(a['write-manifest'])).sort().map(f=>{const b=fs.readFileSync(path.join(a.dir,f));
    return {file:f,bytes:b.length,sha256:L.sha256(b),...(f.endsWith('.gz')?{contentSha256:L.sha256(zlib.gunzipSync(b))}:{})};});
   fs.writeFileSync(a['write-manifest'],JSON.stringify({issue:'#56',kind:'gifted-attestation-data',runs:runs.map(r=>({name:r.name,games:r.games,units:r.units,chunk:r.chunk,checkpointLines:r.checkpointLines,
    runnerSha256:r.runnerSha256,runner:r.runner,resultSha256:r.resultSha256,checkpointSha256:r.checkpointSha256})),files:files2},null,1)+'\n');
   console.log('wrote '+a['write-manifest']);
  }
 })().catch(e=>{console.error('FAIL: '+e.message);process.exit(1);});
}
