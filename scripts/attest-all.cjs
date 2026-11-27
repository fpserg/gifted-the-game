#!/usr/bin/env node
// GIFTED-004D (#56): the complete attestation — 6 unordered pairs of novice-1/tactician-1/strategist-1 (mirrors
// included) × 2 modes (pve, symmetric) × 30 006 games = 360 072 games — then the report.
// Usage: node scripts/attest-all.cjs --out=<dir> [--games=1667] [--workers=2] [--chunk=50] [--deadline=<seconds>] [--only=<pair>/<mode>,...]
// Fixed seeds: pair i (order below) uses 2026112700 + 10*i in both modes, so the two modes of a pair play the
// same deals (paired comparison; for the Novice pair both modes must coincide game for game).
// Resumable: a finished run (<out>/<pair>-<mode>.json) is kept only after attest-verify.cjs accepts it (schedule,
// code identity, strict checkpoint, result equal to its checkpoint); otherwise the command stops with exit 1 and
// the reason (it never recomputes or overwrites silently). An interrupted run continues from its checkpoint
// (<out>/<pair>-<mode>.ckpt). Rerun the same command after any interruption. With --deadline the whole command stops
// with exit code 3 when the time is up (no new chunk starts after it); rerun it to continue.
'use strict';
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const V=require('./attest-verify.cjs'),PAIRS=V.PAIRS,MODES=V.MODES;
const a=Object.fromEntries(process.argv.slice(2).map(x=>{const m=/^--([a-z]+)=(.*)$/.exec(x);if(!m)throw Error('bad argument '+x);return [m[1],m[2]];}));
const out=a.out||'attestation',games=a.games||'1667',workers=a.workers||'2',chunk=a.chunk||'50',only=a.only?a.only.split(','):null,t0=Date.now();
const left=()=>a.deadline?Math.max(0,+a.deadline-(Date.now()-t0)/1000):null;
fs.mkdirSync(out,{recursive:true});
const run=(args,file)=>new Promise((ok,bad)=>{const o=fs.openSync(file+'.part','w');const c=spawn(process.execPath,args,{stdio:['ignore',o,'inherit']});
 c.on('exit',code=>{fs.closeSync(o);if(code===0){fs.renameSync(file+'.part',file);ok(true);}else if(code===3){fs.rmSync(file+'.part',{force:true});ok(false);}else bad(Error(`${path.basename(file)}: exit ${code}`));});});
(async()=>{
 const done=[];
 for(const [i,[A,B]] of PAIRS.entries())for(const mode of MODES){
  const name=`${A}-${B}-${mode}`,file=path.join(out,name+'.json');
  if(only&&!only.includes(`${A}:${B}/${mode}`))continue;
  const seed=2026112700+10*i,expect={name,pair:[A,B],mode,seed,games:+games},ckpt=path.join(out,name+'.ckpt');
  if(fs.existsSync(file)){
   try{V.verifyRun(file,ckpt,expect);}catch(e){process.stderr.write(`existing result rejected: ${e.message}\nremove ${file} (and its checkpoint if it is not of this code) to recompute\n`);process.exit(1);}
   process.stderr.write(`${name}: done earlier, verified\n`);done.push(file);continue;}
  process.stderr.write(`${name}: seed ${seed}\n`);
  if(left()===0){process.stderr.write('deadline reached; rerun to continue\n');process.exit(3);}
  const fin=await run([path.join(__dirname,'attest-ai.cjs'),`--pair=${A}:${B}`,`--mode=${mode}`,`--games=${games}`,`--seed=${seed}`,`--workers=${workers}`,`--chunk=${chunk}`,
   ...(left()!=null?[`--deadline=${Math.floor(left())}`]:[]),`--checkpoint=${ckpt}`],file);
  if(!fin){process.stderr.write(`${name}: incomplete; rerun to continue\n`);process.exit(3);}
  try{V.verifyRun(file,ckpt,expect);}catch(e){fs.renameSync(file,file+'.rejected');process.stderr.write(`new result rejected (kept as ${file}.rejected): ${e.message}\n`);process.exit(1);}
  done.push(file);
 }
 if(!only)await new Promise((ok,bad)=>spawn(process.execPath,[path.join(__dirname,'attest-report.cjs'),`--out=${out}`,...done],{stdio:'inherit'}).on('exit',c=>c?bad(Error('report failed')):ok()));
})().catch(e=>{console.error(e.message);process.exit(1);});
