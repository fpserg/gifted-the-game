#!/usr/bin/env node
// GIFTED-INSPECTOR-CI (#51): independent browser measurement of AI decision time for the Inspector.
// Runs the code of an exact commit inside a headless Chrome page (offline, about:blank) and measures each
// planning call of the chosen strategy against the Novice, with CDP CPU throttling (default 1x, 4x, 6x).
// Methodology of #46 (same as scripts/measure-tactician-browser.py): games alternate the seat (p, e),
// heroes cycle eng/ast/kee, game g uses the LCG seed g+11. An emulation, NOT a smartphone measurement.
//
// Usage:
//   node scripts/inspector-browser-measure.cjs --target=DIR --expect-sha=SHA [--chrome=/usr/bin/google-chrome]
//     [--strategy=strategist] [--games=60] [--rates=1,4,6] [--out=inspector-browser-out] [--timeout-min=60]
//
// The target is only read as text (git, game.js, tutorial.js) and executed in the browser page, never in Node.
// Exit 0 only when every requested measurement is complete. Any error, a SHA mismatch, a dirty target,
// a missing browser or a missing measurement exits 1 and writes error.json. The tool reports and never
// judges the result: the Inspector evaluates it.
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),{spawn,execFileSync}=require('child_process');

const TOOL_VERSION='inspector-browser-1';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--([a-z-]+)=(.*)$/s.exec(a);if(!m)throw new Error(`bad argument: ${a}`);return [m[1],m[2]];}));
const P={
 target:args.target,expectSha:args['expect-sha'],chrome:args.chrome||'/usr/bin/google-chrome',strategy:args.strategy||'strategist',
 games:Number(args.games||60),rates:(args.rates||'1,4,6').split(',').map(Number),out:args.out||'inspector-browser-out',timeoutMin:Number(args['timeout-min']||60),
};
const OPPONENT='novice',TURNS=6,HEROES=['eng','ast','kee'];
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const started=new Date().toISOString();
let chromeProc=null,userDir=null;

function fail(msg,extra={}){
 try{fs.mkdirSync(P.out,{recursive:true});fs.writeFileSync(path.join(P.out,'error.json'),JSON.stringify({ok:false,error:msg,...extra,params:P,started,failed:new Date().toISOString()},null,1));}catch{}
 console.error(`FAIL: ${msg}`);cleanup();process.exit(1);
}
function cleanup(){try{chromeProc&&chromeProc.kill('SIGKILL');}catch{}try{userDir&&fs.rmSync(userDir,{recursive:true,force:true});}catch{}}

// ---- parameters and target verification ----
function checkParams(){
 if(!P.target)fail('--target is required');
 if(!/^[0-9a-f]{40}$/.test(P.expectSha||''))fail('--expect-sha must be a full 40-character lowercase commit SHA');
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(P.strategy))fail('--strategy must be an identifier');
 if(!Number.isInteger(P.games)||P.games<2||P.games%2||P.games>600)fail('--games must be an even integer from 2 to 600 (both seats equally)');
 if(!P.rates.length||P.rates.some(r=>!Number.isFinite(r)||r<1||r>20))fail('--rates must be numbers from 1 to 20');
 if(!(P.timeoutMin>0))fail('--timeout-min must be positive');
}
function git(dir,...a){return execFileSync('git',['-C',dir,...a],{encoding:'utf8'}).trim();}
function verifyTarget(){
 let head,dirty;
 try{head=git(P.target,'rev-parse','HEAD');dirty=git(P.target,'status','--porcelain','--untracked-files=no');}catch(e){fail(`target is not a git checkout: ${e.message}`);}
 if(head!==P.expectSha)fail(`SHA mismatch: target HEAD ${head}, expected ${P.expectSha}`,{targetHead:head});
 if(dirty)fail('target checkout has local modifications',{dirty});
 const read=f=>{const p=path.join(P.target,f);if(!fs.existsSync(p))fail(`target file missing: ${f}`);return fs.readFileSync(p);};
 const tut=read('tutorial.js'),game=read('game.js');
 return {sha:head,files:{'tutorial.js':sha256(tut),'game.js':sha256(game)},src:tut.toString('utf8')+'\n'+game.toString('utf8')};
}
function toolInfo(){
 const self=fs.readFileSync(__filename),dir=path.dirname(__filename);let commit=null,dirty=null;
 try{commit=git(dir,'rev-parse','HEAD');dirty=git(dir,'status','--porcelain','--',path.basename(__filename))?(git(dir,'ls-files','--',path.basename(__filename))?'modified':'untracked'):false;}catch{}
 return {version:TOOL_VERSION,commit,scriptModified:dirty,scriptSha256:sha256(self),node:process.version};
}

// ---- Chrome and CDP ----
function launchChrome(){
 if(!fs.existsSync(P.chrome))fail(`browser not found: ${P.chrome}`);
 userDir=fs.mkdtempSync(path.join(os.tmpdir(),'inspector-chrome-'));
 // --no-sandbox: Chrome's sandbox needs unprivileged user namespaces, often blocked on CI runners. The page
 // is about:blank with all network blocked, on an ephemeral VM without secrets.
 const flags=['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--disable-background-networking','--disable-component-update','--disable-sync','--host-resolver-rules=MAP * ~NOTFOUND',
  `--user-data-dir=${userDir}`,'--remote-debugging-port=0','about:blank'];
 return new Promise((res,rej)=>{
  try{chromeProc=spawn(P.chrome,flags,{stdio:['ignore','ignore','pipe']});}catch(e){return rej(new Error(`browser failed to start: ${e.message}`));}
  let buf='';const t=setTimeout(()=>rej(new Error('browser did not expose DevTools within 30 s')),30000);
  chromeProc.on('error',e=>{clearTimeout(t);rej(new Error(`browser failed to start: ${e.message}`));});
  chromeProc.on('exit',c=>{clearTimeout(t);rej(new Error(`browser exited early with code ${c}: ${buf.slice(-500)}`));});
  chromeProc.stderr.on('data',d=>{buf+=d;const m=/DevTools listening on (ws:\/\/\S+)/.exec(buf);if(m){clearTimeout(t);res(m[1]);}});
 });
}
function cdpConnect(url){
 return new Promise((res,rej)=>{
  const ws=new WebSocket(url);let id=0;const pending=new Map(),listeners=[];
  ws.onerror=()=>rej(new Error('CDP connection failed'));
  ws.onclose=()=>{for(const p of pending.values())p.rej(new Error('CDP connection closed'));pending.clear();};
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);
   if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(`CDP ${p.method}: ${m.error.message}`)):p.res(m.result);}
   else if(m.method)for(const l of listeners)l(m);};
  ws.onopen=()=>res({
   send(method,params={},sessionId){return new Promise((r,j)=>{const i=++id;pending.set(i,{res:r,rej:j,method});ws.send(JSON.stringify({id:i,method,params,...(sessionId?{sessionId}:{})}));});},
   on(f){listeners.push(f);},close(){ws.close();},
  });
 });
}

// ---- in-page measurement (the only place where target code runs) ----
const PAGE_FN=`async (src,n,strategy,opponent,turns,heroes)=>{
 const ev=new Function('document',src+'\\n;return (code)=>eval(code);')(undefined);
 if(!ev('typeof AI_STRATEGIES==="object"&&!!AI_STRATEGIES['+JSON.stringify(strategy)+']'))throw new Error('strategy not registered in target: '+strategy);
 let x=1;const rnd=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);const real=Math.random;
 ev('globalThis.__t=[];globalThis.__g=0;const __s=AI_STRATEGIES['+JSON.stringify(strategy)+'],__p=__s.plan;AI_STRATEGIES['+JSON.stringify(strategy)+']=Object.freeze({...__s,plan(c){const s=performance.now();__p(c);__t.push({ms:performance.now()-s,side:c.side,turn:G.turn,game:__g});}});FAST=true;');
 try{for(let g=0;g<n;g++){x=g+11;Math.random=rnd;const seat=g%2?'e':'p';
  ev('__g='+g+";setAiStrategy('p','"+opponent+"');setAiStrategy('e','"+opponent+"');setAiStrategy('"+seat+"','"+strategy+"');newGame('"+heroes[g%3]+"')");
  for(let i=0;i<turns;i++)await ev("(async()=>{aiPlan('p');await endTurn()})()");}}
 finally{Math.random=real;}
 return {calls:ev('__t'),ua:navigator.userAgent};
}`;

function stats(ms){
 const t=[...ms].sort((a,b)=>a-b),n=t.length,r=v=>Math.round(v*10)/10;
 // Nearest rank (floor), as in scripts/measure-tactician-browser.py.
 const q=p=>r(t[Math.min(n-1,Math.floor(n*p))]);
 return {n,mean:r(t.reduce((a,b)=>a+b,0)/n),p50:q(.5),p95:q(.95),p99:q(.99),max:r(t[n-1]),over1s:t.filter(v=>v>1000).length};
}

async function main(){
 checkParams();
 const target=verifyTarget(),tool=toolInfo();
 let wsUrl;try{wsUrl=await launchChrome();}catch(e){fail(e.message);}
 const cdp=await cdpConnect(wsUrl).catch(e=>fail(e.message));
 const version=await cdp.send('Browser.getVersion').catch(e=>fail(e.message));
 const errors=[];cdp.on(m=>{if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 const results={},raw={};
 for(const rate of P.rates){
  const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
  const s=(m,p)=>cdp.send(m,p,sessionId);
  await s('Runtime.enable');await s('Network.enable');
  await s('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await s('Emulation.setCPUThrottlingRate',{rate});
  const expr=`(${PAGE_FN})(${JSON.stringify(target.src)},${P.games},${JSON.stringify(P.strategy)},${JSON.stringify(OPPONENT)},${TURNS},${JSON.stringify(HEROES)})`;
  const t0=Date.now();
  let tid;const timer=new Promise((_,j)=>{tid=setTimeout(()=>j(new Error(`measurement at ${rate}x exceeded ${P.timeoutMin} min`)),P.timeoutMin*60000);});
  let r;try{r=await Promise.race([s('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}),timer]);}catch(e){fail(e.message,{rate});}finally{clearTimeout(tid);}
  if(r.exceptionDetails)fail(`page error at ${rate}x: ${r.exceptionDetails.exception?.description||r.exceptionDetails.text}`,{rate});
  const calls=r.result.value.calls;
  const expected=P.games*TURNS,perSide=expected/2;
  const bySide={p:calls.filter(c=>c.side==='p'),e:calls.filter(c=>c.side==='e')};
  if(calls.length!==expected||bySide.p.length!==perSide||bySide.e.length!==perSide)
   fail(`missing measurements at ${rate}x: ${calls.length} calls (p ${bySide.p.length}, e ${bySide.e.length}), expected ${expected} (${perSide} per side)`,{rate});
  if(calls.some(c=>!Number.isFinite(c.ms)||c.ms<0))fail(`invalid timing at ${rate}x`,{rate});
  results[rate]={all:stats(calls.map(c=>c.ms)),p:stats(bySide.p.map(c=>c.ms)),e:stats(bySide.e.map(c=>c.ms)),wallSeconds:Math.round((Date.now()-t0)/100)/10};
  raw[rate]=calls.map(c=>[c.game,c.side,c.turn,Math.round(c.ms*1000)/1000]);
  await cdp.send('Target.closeTarget',{targetId});
  if(!results.userAgent)results.userAgent=r.result.value.ua;
 }
 if(errors.length)fail(`uncaught page exceptions: ${errors.slice(0,5).join(' | ')}`,{errors});
 const ua=results.userAgent;delete results.userAgent;
 const env=k=>process.env[k]||null;
 const meta={
  ok:true,tool,target:{sha:target.sha,files:target.files},
  browser:{path:P.chrome,product:version.product,revision:version.revision,jsVersion:version.jsVersion,protocol:version.protocolVersion,userAgent:ua},
  environment:{os:`${os.type()} ${os.release()}`,arch:os.arch(),cpus:os.cpus().length,cpuModel:os.cpus()[0]?.model||null,memGiB:Math.round(os.totalmem()/2**30*10)/10,
   runner:{os:env('RUNNER_OS'),arch:env('RUNNER_ARCH'),imageOS:env('ImageOS'),imageVersion:env('ImageVersion'),runId:env('GITHUB_RUN_ID'),runAttempt:env('GITHUB_RUN_ATTEMPT'),actor:env('GITHUB_ACTOR'),workflowRef:env('GITHUB_WORKFLOW_REF')}},
  params:{strategy:P.strategy,opponent:OPPONENT,games:P.games,turns:TURNS,rates:P.rates,seeds:'game g: LCG seed g+11',seats:'alternating p,e',heroes:HEROES,percentile:'nearest rank (floor)'},
  results,started,finished:new Date().toISOString(),
 };
 fs.mkdirSync(P.out,{recursive:true});
 fs.writeFileSync(path.join(P.out,'measurement.json'),JSON.stringify(meta,null,1));
 fs.writeFileSync(path.join(P.out,'raw-timings.json'),JSON.stringify({columns:['game','side','turn','ms'],byRate:raw}));
 const row=(rate,k,x)=>`| ${rate}× | ${k} | ${x.n} | ${x.p50} | ${x.p95} | ${x.p99} | ${x.max} | ${x.over1s} |`;
 const md=[`## Inspector browser measurement — ${P.strategy} vs ${OPPONENT}`,'',
  `- Target SHA: \`${target.sha}\` (verified); game.js SHA-256 \`${target.files['game.js']}\``,
  `- Tool: ${TOOL_VERSION}, commit \`${tool.commit}\`, script SHA-256 \`${tool.scriptSha256}\`, Node ${process.version}`,
  `- Browser: ${version.product} (${ua})`,
  `- Environment: ${meta.environment.os}, ${meta.environment.cpus}× ${meta.environment.cpuModel}, image ${env('ImageOS')||'-'} ${env('ImageVersion')||''}`,
  `- Games: ${P.games} (seats alternate), ${TURNS} decisions per game, CPU throttling ${P.rates.join('×, ')}×`,'',
  '| CPU | Side | Decisions | p50 ms | p95 ms | p99 ms | Max ms | >1 s |','|---|---|---|---|---|---|---|---|',
  ...P.rates.flatMap(rate=>['all','p','e'].map(k=>row(rate,k,results[rate][k]))),'',
  'Emulation in headless Chrome, not a smartphone measurement. The tool reports; the Inspector evaluates.'].join('\n');
 fs.writeFileSync(path.join(P.out,'summary.md'),md+'\n');
 console.log(md);
 cdp.close();cleanup();process.exit(0);
}
main().catch(e=>fail(e.stack||String(e)));
