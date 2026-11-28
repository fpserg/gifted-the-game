#!/usr/bin/env node
// GIFTED-004E (#48), stage A: behavioural fingerprint of the current code, for equivalence checks of later
// refactoring (stage B). Read-only: loads game.js / tutorial.js in vm contexts through scripts/attest-lib.cjs
// (the attestation harness) and scripts/simulate-balance.cjs; changes nothing. Not part of CI.
//  - AI: for each of the 6 pairs (N/N, T/N, S/N, T/T, S/T, S/S) and both modes (pve, symmetric), every one of
//    the 18 configurations (3x3 factions x 2 seats) with `--games` games: the complete game record of the
//    attestation harness (hands, affordable cards, plays, energy, lane totals, final board, result) with the
//    decision times removed, plus the state of the match random stream after the game (RNG consumption).
//  - Balance: the balance simulator (Novice vs Novice, 3 faction pairs) with a fixed seed, without the
//    elapsed time and the source SHA-256.
// A refactoring that is meant to be behaviour-preserving must reproduce every hash exactly.
// Usage: node docs/audit-004e/fingerprint.cjs [--games=2] [--balance=1000] [--out=<file>]
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.join(__dirname,'..','..');
const L=require(path.join(ROOT,'scripts','attest-lib.cjs')),{simulate}=require(path.join(ROOT,'scripts','simulate-balance.cjs'));
const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith(`--${k}=`));return a?a.slice(k.length+3):d;};
const games=+arg('games','2'),balanceGames=+arg('balance','1000');
const PAIRS=[['novice','novice'],['tactician','novice'],['strategist','novice'],['tactician','tactician'],['strategist','tactician'],['strategist','strategist']];
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const noTimes=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='ms'?undefined:v));
(async()=>{
 process.chdir(ROOT);
 const t0=Date.now(),src=L.buildSource('game.js','tutorial.js'),out={issue:'#48',kind:'gifted-behaviour-fingerprint',
  code:{gameSha256:L.sha256(fs.readFileSync('game.js')),tutorialSha256:L.sha256(fs.readFileSync('tutorial.js')),libSha256:L.sha256(fs.readFileSync('scripts/attest-lib.cjs'))},
  gamesPerConfig:games,ai:{},balance:null};
 for(const [i,[a,b]] of PAIRS.entries())for(const mode of ['pve','symmetric']){
  const lines=[];
  for(const [k,fa] of L.FACS.entries())for(const fb of L.FACS)for(const aSide of ['p','e']){
   const idx=lines.length/games|0;
   for(let g=0;g<games;g++){
    const c=L.makeContext(src),seed=(48004+i*1000003+idx*7919+g*104729)>>>0;
    const strat=aSide==='p'?{p:a,e:b}:{p:b,e:a},fac=aSide==='p'?{p:fa,e:fb}:{p:fb,e:fa};
    const rec=await L.playGame(c,{seed,p:strat.p,e:strat.e,pf:fac.p,ef:fac.e,mode});
    lines.push(JSON.stringify({seed,config:{fa,fb,aSide},rec:noTimes(rec),rngAfter:c.rngState()}));
   }
  }
  const name=`${a}-${b}-${mode}`,results=lines.map(l=>JSON.parse(l).rec.result);
  out.ai[name]={games:lines.length,sha256:sha(lines.join('\n')),results:{p:results.filter(x=>x==='p').length,e:results.filter(x=>x==='e').length,draw:results.filter(x=>x===null).length}};
  process.stderr.write(`${name}: ${out.ai[name].sha256.slice(0,16)} (${lines.length} games)\n`);
 }
 const bal=await simulate('game.js',balanceGames,20261118);
 const {elapsedSeconds,sourceSha256,...rest}=bal;
 out.balance={gamesPerPair:balanceGames,seed:20261118,totalGames:bal.totalGames,sha256:sha(JSON.stringify(rest))};
 out.combinedSha256=sha(JSON.stringify({ai:Object.fromEntries(Object.entries(out.ai).map(([k,v])=>[k,v.sha256])),balance:out.balance.sha256}));
 out.elapsedSeconds=Math.round((Date.now()-t0)/1000);
 const file=arg('out',null);const text=JSON.stringify(out,null,1)+'\n';
 if(file)fs.writeFileSync(file,text);else process.stdout.write(text);
})().catch(e=>{console.error(e);process.exit(1);});
