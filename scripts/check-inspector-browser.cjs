#!/usr/bin/env node
// GIFTED-INSPECTOR-CI (#51): positive and attack scenarios of scripts/inspector-browser-measure.cjs.
// Usage: node scripts/check-inspector-browser.cjs [--chrome=/usr/bin/google-chrome] [--mode=local|isolated|outside]
//  local    — developer machine: page-level scenarios with --isolation=local (adds --no-sandbox only as root);
//  isolated — inside the workflow barrier (network namespace, non-root, clean environment, read-only measurer):
//             every scenario with --isolation=strict, plus "dirty environment" and "writable measurer";
//  outside  — outside the barrier: a strict run must refuse (network not isolated).
// Targets are this checkout's own game.js and tutorial.js, patched per scenario, in temporary git repositories.
// Every attack must make the measurer exit non-zero with the expected error; the positive run must report
// complete, verified data.
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),assert=require('assert'),{spawn,execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..'),TOOL=path.join(__dirname,'inspector-browser-measure.cjs');
const A=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--([a-z]+)=(.*)$/.exec(a);if(!m)throw new Error('bad argument '+a);return [m[1],m[2]];}));
const CHROME=A.chrome||'/usr/bin/google-chrome',MODE=A.mode||'local';
if(!['local','isolated','outside'].includes(MODE))throw new Error('bad mode');
const ISO=MODE==='local'?['--isolation=local',...(process.getuid()===0?['--allow-no-sandbox']:[])]:['--isolation=strict'];
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'inspector-check-'));
const gitEnv={PATH:process.env.PATH,HOME:process.env.HOME||tmp,GIT_AUTHOR_NAME:'check',GIT_AUTHOR_EMAIL:'check@example.invalid',GIT_COMMITTER_NAME:'check',GIT_COMMITTER_EMAIL:'check@example.invalid',GIT_CONFIG_NOSYSTEM:'1'};
const lock=d=>{execFileSync('chmod',['-R','a-w',d]);};
const unlock=d=>{try{execFileSync('chmod',['-R','u+w',d]);}catch{}};
function repo(name,patch=null){
 const d=path.join(tmp,name);fs.mkdirSync(d);
 fs.copyFileSync(path.join(ROOT,'tutorial.js'),path.join(d,'tutorial.js'));
 const g=fs.readFileSync(path.join(ROOT,'game.js'),'utf8'),pg=patch?patch(g):g;
 if(patch&&pg===g)throw new Error(`patch for ${name} did not apply`);
 fs.writeFileSync(path.join(d,'game.js'),pg);
 const git=(...a)=>execFileSync('git',['-C',d,...a],{env:gitEnv,encoding:'utf8'}).trim();
 git('init','-q');git('add','.');git('commit','-q','-m',name);
 lock(d);return {dir:d,sha:git('rev-parse','HEAD')};
}
// Patches: `at(fn, code)` inserts code at the start of a function body of the target.
const at=(sig,code)=>s=>s.replace(sig,m=>m+code);
const NEWGAME=/function newGame\([^)]*\)\{/,AIPLAN=/function aiPlan\(o\)\{/,ENDTURN=/async function endTurn\(\)\{/;
function run(target,sha,extra=[],env=null,tool=TOOL){
 const out=path.join(tmp,'out-'+Math.random().toString(36).slice(2));
 return new Promise(res=>{
  const c=spawn(process.execPath,[tool,`--target=${target}`,`--expect-sha=${sha}`,`--chrome=${CHROME}`,'--strategy=tactician','--games=2','--rates=1,4',`--out=${out}`,'--timeout-min=5',...ISO,...extra],{env:env||process.env});
  let stderr='';c.stderr.on('data',d=>stderr+=d);c.stdout.resume();
  const t=setTimeout(()=>c.kill('SIGKILL'),600000);
  c.on('close',status=>{clearTimeout(t);const read=f=>fs.existsSync(path.join(out,f))?JSON.parse(fs.readFileSync(path.join(out,f),'utf8')):null;
   res({status,stderr,ok:read('measurement.json'),err:read('error.json'),raw:read('raw-timings.json')});});
 });
}
const done=[];
function expectFail(name,r,re){
 assert.notEqual(r.status,0,`${name}: must exit non-zero (stderr: ${r.stderr.slice(-300)})`);
 assert(r.err&&re.test(r.err.error),`${name}: expected error ${re}, got ${r.err&&r.err.error} / ${r.stderr.slice(-300)}`);
 assert(!r.ok,`${name}: no measurement.json on failure`);done.push(name);console.log(`  ok  ${name}: ${r.err.error.slice(0,140)}`);
}
(async()=>{try{
 const good=repo('good');
 if(MODE==='outside'){
  // Outside the barrier a strict run refuses before starting the browser.
  const r=await run(good.dir,good.sha,[],{PATH:process.env.PATH,HOME:process.env.HOME||tmp});
  expectFail('strict run outside the isolation barrier',r,/isolation: network not isolated|isolation: running as root/);
  console.log(`PASS: inspector browser measurer, outside mode (${done.join(', ')})`);return;
 }
 // Positive: complete, externally confirmed data for every rate and both sides.
 {const r=await run(good.dir,good.sha);
  assert.equal(r.status,0,`positive run failed: ${r.err&&r.err.error} ${r.stderr.slice(-500)}`);
  assert.equal(r.ok.target.sha,good.sha);assert.deepEqual(r.ok.target.strategy,{id:'tactician',version:r.ok.target.strategy.version});assert(r.ok.browser.product&&r.ok.tool.scriptSha256&&r.ok.environment.cpus>0);
  if(MODE==='isolated'){assert.equal(r.ok.isolation.mode,'strict');{const b=r.ok.isolation.rendererSandbox;assert(b.adequate&&b.seccompBpf&&b.networkNamespaces&&b.pidNamespaces,'renderers sandboxed');}
   assert.deepEqual(r.ok.isolation.interfaces,['lo']);assert.notEqual(r.ok.isolation.uid,0);}
  for(const rate of ['1','4']){const x=r.ok.results[rate];
   assert.equal(x.all.n,12);assert.equal(x.p.n,6);assert.equal(x.e.n,6);
   for(const k of ['p50','p95','p99','max','over1s'])assert(Number.isFinite(x.all[k]),`${k} reported`);
   assert.equal(r.raw.byRate[rate].length,12,'raw timings kept');
   assert(r.raw.segments.byRate[rate].every(s=>s[2]===s[3]),'every decision confirmed externally');
   assert.equal(r.raw.segments.byRate[rate].length,14,'7 segments per game');}
  done.push('positive');}
 // Novice vs Novice: both seats call one plan function; only the measured seat is timed, both are confirmed.
 {const r=await run(good.dir,good.sha,['--strategy=novice']);
  assert.equal(r.status,0,`novice positive run failed: ${r.err&&r.err.error} ${r.stderr.slice(-500)}`);
  assert.equal(r.ok.target.strategy.id,'novice');assert.equal(r.ok.verification.opponentDecisionsConfirmed,12);
  for(const rate of ['1','4']){const x=r.ok.results[rate],seg=r.raw.segments.byRate[rate];
   assert.equal(x.all.n,12);assert.equal(x.p.n,6);assert.equal(x.e.n,6);
   assert.equal(r.raw.byRate[rate].length,12,'novice: only the measured seat timed');
   assert(seg.every(s=>s[2]===s[3]),'novice: every call (both seats) confirmed externally');
   assert.equal(seg.reduce((a,s)=>a+s[6],0),12,'novice: 6 measured calls per game');assert.equal(seg.reduce((a,s)=>a+s[7],0),12,'novice: 6 opponent calls per game');
   for(let g=0;g<2;g++){const t=r.raw.byRate[rate].filter(c=>c[0]===g);assert.deepEqual(t.map(c=>c[2]),[1,2,3,4,5,6]);assert(t.every(c=>c[1]===(g%2?'e':'p')),'novice: measured seat only');}}
  done.push('novice positive (both seats confirmed, measured seat timed)');}
 const nov=async(name,patch,re)=>{const t=repo(name,patch);expectFail(name,await run(t.dir,t.sha,['--strategy=novice']),re);};
 await nov('novice: opponent decision skipped',at(AIPLAN,"if(aiSides.p===aiSides.e&&G.turn===3&&o==='e')return;"),/decision count mismatch/);
 await nov('novice: extra plan call per turn',at(AIPLAN,"{const s=aiStrategy(o);if(s.legacy&&G.turn===2)s.plan(o);}"),/decision count mismatch/);
 await nov('novice: plan called with the other side',s=>s.replace('if(s.legacy)return s.plan(o);',"if(s.legacy)return s.plan(o==='p'?'e':'p');"),/side of a call differs/);
 await nov('novice: plan called around the wrapper',s=>at(AIPLAN,"if(aiStrategy(o).legacy&&globalThis.__orig&&G.turn===4)return globalThis.__orig(o);")(s)+"\nglobalThis.__orig=AI_STRATEGIES.novice.plan;\n",/outside the trusted wrapper|decision count mismatch/);
 // Forged results and skipped execution.
 expectFail('forged log, strategy never executed',await run(...Object.values(repo('forged-log',s=>at(NEWGAME,"globalThis.__t=Array.from({length:12},(_,i)=>({ms:0,side:i%2?'e':'p',turn:1+(i%6),game:0}));")(at(AIPLAN,'return;')(s))))),/decision count mismatch/);
 expectFail('decision skipped on turn 6',await run(...Object.values(repo('skip-turn6',at(AIPLAN,"if(G.turn===6&&o==='e')return;")))),/decision count mismatch/);
 expectFail('extra decision per turn',await run(...Object.values(repo('extra-call',at(AIPLAN,"{const s=aiStrategy(o);if(!s.legacy)s.plan(aiContext(o));}")))),/decision count mismatch/);
 expectFail('strategy called around the measured wrapper',await run(...Object.values(repo('bypass',s=>at(AIPLAN,"if(!aiStrategy(o).legacy&&globalThis.__orig)return globalThis.__orig(aiContext(o));")(s)+"\nglobalThis.__orig=AI_STRATEGIES.tactician.plan;\n"))),/outside the trusted wrapper|decision count mismatch/);
 expectFail('plan replaced by a function outside the target',await run(...Object.values(repo('native-plan',s=>s+"\nAI_STRATEGIES.tactician=Object.freeze({...AI_STRATEGIES.tactician,plan:Math.max});\n"))),/not defined by the target|function location unavailable/);
 expectFail('asynchronous plan (deferred work)',await run(...Object.values(repo('async-plan',s=>s.replace('function tacticianPlan(ctx){','async function tacticianPlan(ctx){')))),/returned an object|decision count mismatch/);
 // Forged timers and builtins: the trusted clock is unaffected, the tampering itself fails the run.
 expectFail('forged performance.now',await run(...Object.values(repo('fake-clock',s=>"performance.now=()=>0;Performance.prototype.now=function(){return 0};Date.now=()=>0;\n"+s))),/builtins tampered/);
 expectFail('forged Reflect.apply / Function.prototype.call',await run(...Object.values(repo('fake-apply',s=>"{const a=Reflect.apply;Reflect.apply=(f,t,x)=>a(f,t,x);Function.prototype.call=function(){};}\n"+s))),/builtins tampered/);
 expectFail('debugger statement in the target',await run(...Object.values(repo('debugger',at(ENDTURN,'debugger;')))),/unexpected pause/);
 // Additional browser contexts.
 expectFail('iframe (fresh realm)',await run(...Object.values(repo('iframe',at(NEWGAME,"{const d=globalThis.document;d.documentElement.appendChild(d.createElement('iframe'));}")))),/additional frame/);
 expectFail('dedicated worker',await run(...Object.values(repo('worker',at(NEWGAME,"new Worker(URL.createObjectURL(new Blob(['postMessage(1)'],{type:'text/javascript'})));")))),/additional worker|page exception|page error/);
 expectFail('shared worker',await run(...Object.values(repo('shared-worker',at(NEWGAME,"new SharedWorker(URL.createObjectURL(new Blob(['onconnect=()=>{}'],{type:'text/javascript'})));")))),/additional (shared_worker|worker)|page exception|page error/);
 {const r=await run(...Object.values(repo('popup',at(NEWGAME,"if(globalThis.open('about:blank'))throw new Error('popup opened');"))));
  if(r.status!==0)assert(r.err&&/additional page|popup opened|page error|page exception/.test(r.err.error),`popup: unexpected error ${r.err&&r.err.error}`);
  done.push(r.status===0?'popup blocked by the browser':'popup detected');}
 // Network: the page is offline and a local server receives nothing (strict mode: no network at all).
 {let hits=0;const srv=http.createServer((q,r)=>{hits++;r.end('ok');});await new Promise(r=>srv.listen(0,'127.0.0.1',r).on('error',()=>r()));
  const port=srv.address()&&srv.address().port||9;
  const r=await run(...Object.values(repo('network',s=>`if(navigator.onLine)throw new Error('page is online');fetch('http://127.0.0.1:${port}/leak').then(()=>{throw new Error('network reachable')},()=>{});new Image().src='http://127.0.0.1:${port}/img';\n`+s)));srv.close();
  assert.equal(r.status,0,`isolation run failed: ${r.err&&r.err.error}`);assert.equal(hits,0,'target code reached the network');done.push('network blocked');}
 // Input and environment failures.
 const bad=good.sha.replace(/^./,c=>c==='a'?'b':'a');
 expectFail('wrong SHA',await run(good.dir,bad),/SHA mismatch/);
 expectFail('abbreviated SHA',await run(good.dir,good.sha.slice(0,12)),/full 40-character/);
 expectFail('missing browser',await run(good.dir,good.sha,['--chrome=/nonexistent/chrome']),/browser not found/);
 expectFail('browser that does not start',await run(good.dir,good.sha,['--chrome=/bin/false']),/browser exited|DevTools pipe|failed to start/);
 expectFail('strategy missing in target',await run(good.dir,good.sha,['--strategy=nosuchstrategy']),/strategy not registered/);
 expectFail('page error',await run(...Object.values(repo('page-error',at(ENDTURN,"if(G.turn===3)throw new Error('injected');")))),/page error|uncaught page exception/);
 expectFail('measurement timeout',await run(...Object.values(repo('slow',at(ENDTURN,'if(G.turn===2){const t=Date.now();while(Date.now()-t<60000);}'))),['--timeout-min=0.1']),/exceeded/);
 if(MODE==='isolated'){
  expectFail('dirty environment',await run(good.dir,good.sha,[],{...process.env,GITHUB_TOKEN:'x'}),/environment not clean/);
  const copy=path.join(tmp,'tool-copy');fs.mkdirSync(copy);fs.copyFileSync(TOOL,path.join(copy,'inspector-browser-measure.cjs'));
  expectFail('writable measurer',await run(good.dir,good.sha,[],null,path.join(copy,'inspector-browser-measure.cjs')),/is writable by the measuring user/);
  // A browser started without its sandbox (wrapper adding --no-sandbox) must be refused in strict mode.
  const wrap=path.join(tmp,'chrome-no-sandbox');fs.writeFileSync(wrap,`#!/bin/sh\nexec ${JSON.stringify(CHROME)} --no-sandbox "$@"\n`);fs.chmodSync(wrap,0o555);
  expectFail('browser without sandbox',await run(good.dir,good.sha,[`--chrome=${wrap}`]),/renderer sandbox not active/);
  expectFail('no-sandbox flag in strict mode',await run(good.dir,good.sha,['--allow-no-sandbox']),/not allowed with --isolation=strict/);
  const w=repo('writable-target');unlock(w.dir);
  expectFail('writable target',await run(w.dir,w.sha),/is writable by the measuring user/);
 }
 unlock(good.dir);fs.appendFileSync(path.join(good.dir,'game.js'),'\n// local change\n');lock(good.dir);
 expectFail('modified target',await run(good.dir,good.sha),/local modifications/);
 console.log(`PASS: inspector browser measurer, ${MODE} mode (${done.length}: ${done.join(', ')})`);
}finally{unlock(tmp);fs.rmSync(tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exit(1);});
