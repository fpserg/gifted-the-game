#!/usr/bin/env node
// GIFTED-004D (#56): the complete attestation — 6 unordered pairs of novice-1/tactician-1/strategist-1 (mirrors
// included) × 2 modes (pve, symmetric) × 30 006 games = 360 072 games — then the report.
// Usage: node scripts/attest-all.cjs --out=<dir> [--games=1667] [--workers=2] [--only=<pair>/<mode>,...]
// Fixed seeds: pair i (order below) uses 2026112700 + 10*i in both modes, so the two modes of a pair play the
// same deals (paired comparison; for the Novice pair both modes must coincide game for game).
// Resumable: a finished run (<out>/<pair>-<mode>.json) is kept; an interrupted one continues from its checkpoint
// (<out>/<pair>-<mode>.ckpt). Rerun the same command after any interruption.
'use strict';
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const PAIRS=[['novice','novice'],['tactician','novice'],['strategist','novice'],['tactician','tactician'],['strategist','tactician'],['strategist','strategist']];
const MODES=['pve','symmetric'];
const a=Object.fromEntries(process.argv.slice(2).map(x=>{const m=/^--([a-z]+)=(.*)$/.exec(x);if(!m)throw Error('bad argument '+x);return [m[1],m[2]];}));
const out=a.out||'attestation',games=a.games||'1667',workers=a.workers||'2',only=a.only?a.only.split(','):null;
fs.mkdirSync(out,{recursive:true});
const run=(args,file)=>new Promise((ok,bad)=>{const o=fs.openSync(file+'.part','w');const c=spawn(process.execPath,args,{stdio:['ignore',o,'inherit']});
 c.on('exit',code=>{fs.closeSync(o);if(code===0){fs.renameSync(file+'.part',file);ok();}else bad(Error(`${path.basename(file)}: exit ${code}`));});});
(async()=>{
 const done=[];
 for(const [i,[A,B]] of PAIRS.entries())for(const mode of MODES){
  const name=`${A}-${B}-${mode}`,file=path.join(out,name+'.json');
  if(only&&!only.includes(`${A}:${B}/${mode}`))continue;
  if(fs.existsSync(file)){process.stderr.write(`${name}: done earlier\n`);done.push(file);continue;}
  const seed=2026112700+10*i;process.stderr.write(`${name}: seed ${seed}\n`);
  await run([path.join(__dirname,'attest-ai.cjs'),`--pair=${A}:${B}`,`--mode=${mode}`,`--games=${games}`,`--seed=${seed}`,`--workers=${workers}`,`--checkpoint=${path.join(out,name+'.ckpt')}`],file);
  done.push(file);
 }
 if(!only)await new Promise((ok,bad)=>spawn(process.execPath,[path.join(__dirname,'attest-report.cjs'),`--out=${out}`,...done],{stdio:'inherit'}).on('exit',c=>c?bad(Error('report failed')):ok()));
})().catch(e=>{console.error(e.message);process.exit(1);});
