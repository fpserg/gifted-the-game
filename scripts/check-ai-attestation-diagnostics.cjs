#!/usr/bin/env node
// GIFTED-004D (#56): failure diagnostics of check-ai-attestation.cjs. Runs it on broken copies of game.js and
// checks that a failure names its section, that a failed child process is reported with its command, exit
// status and stderr (no longer suppressed), and that the full child output is saved to a log file. The checks
// themselves are not changed by the diagnostics: a broken copy must still fail, and the intact code must pass.
// Usage: node scripts/check-ai-attestation-diagnostics.cjs
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert'),{spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..'),CHECK=path.join(__dirname,'check-ai-attestation.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'attest-diag-check-'));
const done=[];
function broken(name,mutate){
 const d=path.join(tmp,name);fs.mkdirSync(d);fs.copyFileSync(path.join(ROOT,'tutorial.js'),path.join(d,'tutorial.js'));
 const g=fs.readFileSync(path.join(ROOT,'game.js'),'utf8'),m=mutate(g);assert.notEqual(m,g,name+': mutation applied');
 fs.writeFileSync(path.join(d,'game.js'),m);return path.join(d,'game.js');
}
function check(sections,game){
 const diag=fs.mkdtempSync(path.join(tmp,'diag-'));
 const p=spawnSync(process.execPath,[CHECK],{cwd:ROOT,encoding:'utf8',maxBuffer:1<<28,timeout:600000,
  env:{...process.env,ATTEST_CHECK_SECTIONS:sections,ATTEST_CHECK_DIAG:diag,...(game?{ATTEST_GAME:game}:{})}});
 const dirs=fs.readdirSync(diag).map(f=>path.join(diag,f));
 return {...p,dirs,files:dirs.flatMap(d=>fs.readdirSync(d).map(f=>path.join(d,f)))};
}
try{
 // 1. A child process fails: section, command, status and the child's own stderr are reported and kept.
 const NEW=/function newGame\([^)]*\)\{/;
 const g1=broken('child-fails',g=>g.replace(NEW,m=>m+"throw new Error('injected child failure for diagnostics');"));
 let r=check('1',g1);
 assert.notEqual(r.status,0,'1: broken game must fail section 1');
 assert(/FAIL in section 1 \(rule identity\)/.test(r.stderr),'1: section named: '+r.stderr.slice(0,300));
 assert(/child tournament-ai strategist:novice exited with status [1-9]/.test(r.stderr),'1: child, command label and status reported');
 assert(/injected child failure for diagnostics/.test(r.stderr),'1: child stderr shown (was suppressed before)');
 const log=r.files.find(f=>/section1-tournament_ai_strategist_novice\.log$/.test(f));
 assert(log,'1: child log saved: '+r.files.join(', '));
 const L=fs.readFileSync(log,'utf8');
 assert(/^section: 1 \(rule identity\)/.test(L)&&/command: .*tournament-ai\.cjs strategist novice 2 4242 2 /.test(L)&&/status: [1-9]/.test(L)&&/injected child failure/.test(L),'1: log has section, command, status and stderr');
 assert(r.files.some(f=>/failure\.txt$/.test(f)),'1: failure summary saved');
 done.push('child failure: section, command, status, stderr tail and full log');
 // 2. An in-process assertion fails: the section is named and the assertion message kept.
 const g2=broken('in-process',g=>g.replace(/function strategistWorld\(obs,st,info\)\{/,m=>m+"if(!globalThis.__once){globalThis.__once=1;}"));
 // A harmless change must NOT fail (section 4 does not depend on it) — the diagnostics add no false failures.
 r=check('4',g2);
 assert.equal(r.status,0,'2: harmless change passes section 4: '+r.stderr.slice(-300));
 assert.equal(r.files.length,0,'2: no diagnostics written when passing');
 const g3=broken('legality',g=>g.replace(NEW,m=>m+"if(typeof __A==='object'&&__A)__A.violations.push({kind:'injected violation'});"));
 r=check('5',g3);
 assert.notEqual(r.status,0,'3: injected violation must fail section 5');
 assert(/FAIL in section 5 \(legality\)/.test(r.stderr),'3: section named: '+r.stderr.slice(0,300));
 assert(/AssertionError \[ERR_ASSERTION\]: 5: pve novice:novice violations \{"injected violation":\d+\}/.test(r.stderr),'3: assertion message kept: '+r.stderr.slice(0,300));
 done.push('in-process failure: section and assertion message');
 done.push('passing run writes no diagnostics');
 console.log(`PASS: check-ai-attestation diagnostics (${done.join('; ')})`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
